"""Booking lifecycle: 约课 -> 课前简报 -> 课后登记 -> 完成/爽约/取消。"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (User, Slot, Booking, Package, TrainingSession,
                      MemberProfile, BodyMeasurement, Goal, PlanTemplate,
                      CyclePlan, PlanUnit)
from ..deps import get_current_user
from ..timeutil import client_now
from ..schemas import BookingCreate, SessionIn
from ..serializers import booking_dict, session_dict, goal_dict, member_profile_dict, template_dict
from ..services import evaluate_goals
from .. import content, plansvc

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


def _load_related(db, bookings):
    out = []
    for b in bookings:
        member = db.get(User, b.member_id)
        coach = db.get(User, b.coach_id)
        d = booking_dict(b, member=member, coach=coach)
        if member and member.member_profile:
            d["member"]["profile"] = member_profile_dict(member.member_profile)
        out.append(d)
    return out


def _order_by_time(stmt, asc: bool):
    col = Slot.start_time
    stmt = stmt.join(Slot, Booking.slot_id == Slot.id)
    return stmt.order_by(col.asc() if asc else col.desc())


@router.get("")
def list_bookings(
    status: str | None = None,
    member_id: int | None = None,
    coach_id: int | None = None,
    scope: str = "all",
    asc: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Booking)
    if user.role == "member":
        stmt = stmt.where(Booking.member_id == user.id)
    elif user.role == "coach" and scope != "all":
        stmt = stmt.where(Booking.coach_id == user.id)
    elif coach_id:
        stmt = stmt.where(Booking.coach_id == coach_id)
    if member_id:
        stmt = stmt.where(Booking.member_id == member_id)
    if status:
        stmt = stmt.where(Booking.status == status)
    stmt = _order_by_time(stmt, asc)
    bookings = db.scalars(stmt).all()
    return _load_related(db, bookings)


@router.post("")
def create_booking(body: BookingCreate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user),
                   now: datetime = Depends(client_now)):
    if user.role != "member":
        raise HTTPException(status_code=403, detail="只有会员可以发起约课")
    slot = db.get(Slot, body.slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="时段不存在")
    if slot.status != content.SLOT_OPEN:
        raise HTTPException(status_code=400, detail="该时段已被预约或不可约")
    if slot.start_time <= now:
        raise HTTPException(status_code=400, detail="课程已开始或已结束，无法预约（请选择未来时段）")
    # 双重保险: 旧的已取消预约不占名额, 但要确认没有生效中的预约
    active = db.scalar(
        select(Booking).where(
            Booking.slot_id == slot.id,
            Booking.status.in_([content.BK_BOOKED, content.BK_COMPLETED, content.BK_NO_SHOW]))
    )
    if active:
        raise HTTPException(status_code=400, detail="该时段已有生效预约")
    # 同一会员同一时间不能重复约课
    clash = db.scalar(
        select(Booking).join(Slot, Booking.slot_id == Slot.id).where(
            Booking.member_id == user.id,
            Booking.status == content.BK_BOOKED,
            Slot.start_time < slot.end_time, Slot.end_time > slot.start_time)
    )
    if clash:
        raise HTTPException(status_code=400, detail="你在该时段已有另一节私教课，时间冲突")
    remaining = db.scalar(
        select(func.coalesce(func.sum(Package.remaining), 0))
        .where(Package.member_id == user.id)
    )
    if not remaining or int(remaining) <= 0:
        raise HTTPException(status_code=400, detail="私教课时不足，请联系前台续约课包")

    # 关联周期计划训练单元: 校验归属/可安排状态, 并用单元计划内容预填约课信息
    unit = None
    prefill_goal = body.goal
    prefill_parts = body.focus_parts
    if body.plan_unit_id:
        unit = db.get(PlanUnit, body.plan_unit_id)
        if not unit:
            raise HTTPException(status_code=404, detail="训练单元不存在")
        plan = db.get(CyclePlan, unit.plan_id)
        if not plan or plan.member_id != user.id or plan.status != content.PLAN_PUBLISHED:
            raise HTTPException(status_code=403, detail="训练单元不可用")
        if unit.booking_id is not None or unit.status not in (
                content.UNIT_UNSCHEDULED, content.UNIT_MISSED):
            raise HTTPException(status_code=400, detail="该训练单元已安排或已完课，无法重复关联")
        if slot.coach_id != plan.coach_id:
            coach_name = db.get(User, plan.coach_id).full_name
            raise HTTPException(status_code=400,
                                detail=f"该单元属于 {coach_name} 教练的周期计划，请选择该教练的时段")
        if not body.goal:
            prefill_goal = unit.goal or plan.goal
        if not prefill_parts:
            prefill_parts = [p for p in (unit.focus_parts or "").split(",") if p]

    slot.status = content.SLOT_BOOKED
    b = Booking(
        member_id=user.id, coach_id=slot.coach_id, slot_id=slot.id,
        goal=prefill_goal, focus_parts=",".join(prefill_parts),
        limitations=body.limitations, template_id=body.template_id,
    )
    db.add(b)
    db.flush()
    if unit:
        unit.booking_id = b.id
        unit.status = content.UNIT_BOOKED
    # 预约即占用 1 课时（待上课计入占用），取消时返还
    _consume_session(user.id, db)
    db.commit()
    return booking_dict(b, member=user, coach=db.get(User, slot.coach_id))


@router.get("/{booking_id}")
def booking_detail(booking_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    b = db.get(Booking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="预约不存在")
    if user.role == "member" and b.member_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if user.role == "coach" and b.coach_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    member, coach = db.get(User, b.member_id), db.get(User, b.coach_id)
    d = booking_dict(b, member=member, coach=coach)
    if member and member.member_profile:
        d["member"]["profile"] = member_profile_dict(member.member_profile)
    return d


@router.post("/{booking_id}/cancel")
def cancel_booking(booking_id: int, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user),
                   now: datetime = Depends(client_now)):
    b = db.get(Booking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="预约不存在")
    if user.role == "member" and b.member_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if user.role == "coach" and b.coach_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if b.status != content.BK_BOOKED:
        raise HTTPException(status_code=400, detail="只有待上课的预约可以取消")
    if b.slot.start_time <= now:
        raise HTTPException(status_code=400, detail="课程已开始或已结束，无法在线取消，请联系教练处理")
    b.status = content.BK_CANCELED
    b.canceled_at = now
    b.slot.status = content.SLOT_OPEN
    if b.plan_unit:
        plansvc.release_unit(b.plan_unit, now=now)
    _refund_session(b.member_id, db)  # 取消返还预约时占用的课时
    db.commit()
    return {"ok": True}


@router.get("/{booking_id}/brief")
def pre_class_brief(booking_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    """教练课前简报: 健康档案/限制 + 历史训练 + 体测曲线 + 上次遗留问题 + 目标。"""
    b = db.get(Booking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="预约不存在")
    if user.role == "member" and b.member_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    member = db.get(User, b.member_id)

    history = db.scalars(
        select(Booking).join(Slot, Booking.slot_id == Slot.id).where(
            Booking.member_id == b.member_id,
            Booking.status == content.BK_COMPLETED,
            Booking.id != b.id,
        ).order_by(Slot.start_time.desc()).limit(20)
    ).all()
    history_data = [booking_dict(x, member=None, coach=db.get(User, x.coach_id)) for x in history]

    measurements = db.scalars(
        select(BodyMeasurement).where(BodyMeasurement.member_id == b.member_id)
        .order_by(BodyMeasurement.measured_at)
    ).all()
    first, last = (measurements[0], measurements[-1]) if measurements else (None, None)
    diff = {}
    if first and last:
        for key in ("weight", "body_fat_pct", "muscle_mass", "waist", "resting_hr"):
            a, z = getattr(first, key), getattr(last, key)
            if a is not None and z is not None:
                diff[key] = round(z - a, 2)

    prev_session = history_data[0]["session"] if history_data else None
    goals = db.scalars(select(Goal).where(
        Goal.member_id == b.member_id, Goal.active == True)).all()  # noqa: E712
    goal_data = []
    for g in goals:
        value = None
        m = db.scalar(select(BodyMeasurement).where(
            BodyMeasurement.member_id == b.member_id).order_by(BodyMeasurement.measured_at.desc()))
        if m:
            value = getattr(m, g.metric, None)
        goal_data.append(goal_dict(g, current_value=value))

    template = None
    if b.template_id:
        tpl = db.get(PlanTemplate, b.template_id)
        if tpl:
            template = template_dict(tpl)

    # 周期计划单元: 计划动作/目标/备注（快照随计划本身, 完课后前端只读展示）
    plan_unit = None
    plan_info = None
    if b.plan_unit:
        from ..serializers import plan_unit_dict
        pu = b.plan_unit
        plan_unit = plan_unit_dict(pu)
        pl = db.get(CyclePlan, pu.plan_id)
        if pl:
            plan_info = {
                "id": pl.id, "name": pl.name, "weeks": pl.weeks,
                "week_no": pu.week_no, "scheduled_date": pu.scheduled_date,
                "unit_title": pu.title or f"第{pu.week_no}周训练",
            }

    return {
        "booking": booking_dict(b, member=member, coach=db.get(User, b.coach_id)),
        "template": template,
        "plan_unit": plan_unit,
        "plan_info": plan_info,
        "profile": member_profile_dict(member.member_profile) if member and member.member_profile else None,
        "measurements": [
            {"measured_at": m.measured_at, "weight": m.weight, "body_fat_pct": m.body_fat_pct,
             "muscle_mass": m.muscle_mass, "waist": m.waist, "resting_hr": m.resting_hr}
            for m in measurements
        ],
        "measurement_diff": diff,
        "history": history_data,
        "prev_session": prev_session,
        "leftover_question": prev_session.get("next_focus") if prev_session else "",
        "goals": goal_data,
    }


def _consume_session(member_id: int, db: Session):
    """预约即占用 1 课时: 从最早的有余量课包扣减。"""
    pkg = db.scalar(
        select(Package).where(Package.member_id == member_id, Package.remaining > 0)
        .order_by(Package.purchased_at)
    )
    if not pkg:
        raise HTTPException(status_code=400, detail="会员课时包已无剩余课时")
    pkg.remaining -= 1


def _refund_session(member_id: int, db: Session):
    """取消预约: 返还 1 课时到最近的未满课包(没有则并入最早课包)。"""
    pkg = db.scalar(
        select(Package).where(
            Package.member_id == member_id, Package.remaining < Package.total_sessions)
        .order_by(Package.purchased_at.desc())
    )
    if not pkg:
        pkg = db.scalar(
            select(Package).where(Package.member_id == member_id)
            .order_by(Package.purchased_at))
    if pkg:
        pkg.remaining += 1


@router.post("/{booking_id}/session")
def register_session(booking_id: int, body: SessionIn, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user),
                     now: datetime = Depends(client_now)):
    """课后登记动作清单/负重/RPE/下次重点并完结课程。"""
    b = db.get(Booking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="预约不存在")
    if user.role == "member" or (user.role == "coach" and b.coach_id != user.id):
        raise HTTPException(status_code=403, detail="仅授课教练可登记训练记录")
    if b.status not in (content.BK_BOOKED, content.BK_COMPLETED):
        raise HTTPException(status_code=400, detail="该预约状态不允许登记")
    if b.status == content.BK_BOOKED and b.slot.start_time > now:
        raise HTTPException(status_code=400, detail="课程尚未开始，不能提前登记（可在开课后补录）")

    exercises = [e.model_dump() for e in body.exercises]
    first_time = b.session is None
    if first_time:
        sess = TrainingSession(booking_id=b.id)
        db.add(sess)
    else:
        sess = b.session
    sess.duration_min = body.duration_min
    sess.warmup = body.warmup
    sess.exercises_json = json.dumps(exercises, ensure_ascii=False)
    sess.rpe = body.rpe
    sess.summary = body.summary
    sess.leftover = body.leftover
    sess.next_focus = body.next_focus

    if first_time:
        b.status = content.BK_COMPLETED
        b.slot.status = content.SLOT_COMPLETED
        # 课时已在预约时占用, 完结时不再重复扣减

    db.commit()
    db.refresh(b)
    # 关联周期计划单元: 冻结不受计划/模板后续修改影响的执行快照, 计算完成率与训练量
    comparison = None
    if b.plan_unit:
        # 首次完课后单元状态即 completed, planned 内容已锁定, 重算仅更新实际值;
        # 快照时间取实际上课时间（支持开课后补录历史课程）
        comparison = plansvc.snapshot_completed_unit(
            b.plan_unit, sess, snap_time=b.slot.start_time)
        db.commit()
    # 登记完后自动评估目标达成
    reminders = evaluate_goals(b.member_id, db)
    return {"session": session_dict(sess), "reminders": reminders,
            "plan_comparison": comparison}


@router.post("/{booking_id}/no-show")
def mark_no_show(booking_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user),
                 now: datetime = Depends(client_now)):
    b = db.get(Booking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="预约不存在")
    if user.role == "member":
        raise HTTPException(status_code=403, detail="仅教练可标记爽约")
    if user.role == "coach" and b.coach_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if b.status != content.BK_BOOKED:
        raise HTTPException(status_code=400, detail="只有待上课的预约可以标记爽约")
    if b.slot.start_time > now:
        raise HTTPException(status_code=400, detail="课程尚未开始，不能提前标记爽约")
    b.status = content.BK_NO_SHOW
    b.slot.status = content.SLOT_NO_SHOW
    # 爽约按课耗: 预约时占用的课时不返还
    if b.plan_unit:
        plansvc.mark_unit_no_show(b.plan_unit, now=now)
    db.commit()
    return {"ok": True}
