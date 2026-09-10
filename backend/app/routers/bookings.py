"""Booking lifecycle: 约课 -> 课前简报 -> 课后登记 -> 完成/爽约/取消。"""
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import (User, Slot, Booking, Package, TrainingSession,
                      MemberProfile, BodyMeasurement, Goal, PlanTemplate)
from ..deps import get_current_user
from ..schemas import BookingCreate, SessionIn
from ..serializers import booking_dict, session_dict, goal_dict, member_profile_dict
from ..services import evaluate_goals
from .. import content

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


@router.get("")
def list_bookings(
    status: str | None = None,
    member_id: int | None = None,
    coach_id: int | None = None,
    scope: str = "all",
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
    bookings = db.scalars(stmt.order_by(Booking.id.desc())).all()
    return _load_related(db, bookings)


@router.post("")
def create_booking(body: BookingCreate, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    if user.role != "member":
        raise HTTPException(status_code=403, detail="只有会员可以发起约课")
    slot = db.get(Slot, body.slot_id)
    if not slot:
        raise HTTPException(status_code=404, detail="时段不存在")
    if slot.status != content.SLOT_OPEN:
        raise HTTPException(status_code=400, detail="该时段已被预约或不可约")
    remaining = db.scalar(
        select(func.coalesce(func.sum(Package.remaining), 0))
        .where(Package.member_id == user.id)
    )
    if not remaining or int(remaining) <= 0:
        raise HTTPException(status_code=400, detail="私教课时不足，请联系前台续约课包")

    slot.status = content.SLOT_BOOKED
    b = Booking(
        member_id=user.id, coach_id=slot.coach_id, slot_id=slot.id,
        goal=body.goal, focus_parts=",".join(body.focus_parts),
        limitations=body.limitations, template_id=body.template_id,
    )
    db.add(b)
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
                   user: User = Depends(get_current_user)):
    b = db.get(Booking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="预约不存在")
    if user.role == "member" and b.member_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if user.role == "coach" and b.coach_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if b.status != content.BK_BOOKED:
        raise HTTPException(status_code=400, detail="只有待上课的预约可以取消")
    b.status = content.BK_CANCELED
    b.canceled_at = datetime.utcnow()
    b.slot.status = content.SLOT_OPEN
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
        select(Booking).where(
            Booking.member_id == b.member_id,
            Booking.status == content.BK_COMPLETED,
            Booking.id != b.id,
        ).order_by(Booking.id.desc()).limit(20)
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

    return {
        "booking": booking_dict(b, member=member, coach=db.get(User, b.coach_id)),
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


def _deduct_session(member_id: int, db: Session):
    pkg = db.scalar(
        select(Package).where(Package.member_id == member_id, Package.remaining > 0)
        .order_by(Package.purchased_at)
    )
    if not pkg:
        raise HTTPException(status_code=400, detail="会员课时包已无剩余课时")
    pkg.remaining -= 1


@router.post("/{booking_id}/session")
def register_session(booking_id: int, body: SessionIn, db: Session = Depends(get_db),
                     user: User = Depends(get_current_user)):
    """课后登记动作清单/负重/RPE/下次重点并完结课程。"""
    b = db.get(Booking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="预约不存在")
    if user.role == "member" or (user.role == "coach" and b.coach_id != user.id):
        raise HTTPException(status_code=403, detail="仅授课教练可登记训练记录")
    if b.status not in (content.BK_BOOKED, content.BK_COMPLETED):
        raise HTTPException(status_code=400, detail="该预约状态不允许登记")

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
        _deduct_session(b.member_id, db)

    db.commit()
    db.refresh(b)
    # 登记完后自动评估目标达成
    reminders = evaluate_goals(b.member_id, db)
    return {"session": session_dict(sess), "reminders": reminders}


@router.post("/{booking_id}/no-show")
def mark_no_show(booking_id: int, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    b = db.get(Booking, booking_id)
    if not b:
        raise HTTPException(status_code=404, detail="预约不存在")
    if user.role == "member":
        raise HTTPException(status_code=403, detail="仅教练可标记爽约")
    if user.role == "coach" and b.coach_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if b.status != content.BK_BOOKED:
        raise HTTPException(status_code=400, detail="只有待上课的预约可以标记爽约")
    b.status = content.BK_NO_SHOW
    b.slot.status = content.SLOT_COMPLETED
    _deduct_session(b.member_id, db)  # 爽约按课耗扣除
    db.commit()
    return {"ok": True}
