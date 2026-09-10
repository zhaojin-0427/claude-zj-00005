"""周期训练计划: 创建/发布/编辑/归档、训练单元查询与修改。"""
import json
from datetime import timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, CyclePlan, PlanUnit, PlanTemplate
from ..deps import get_current_user, require_roles
from ..timeutil import client_now
from ..schemas import CyclePlanIn, PlanUnitPatch
from ..serializers import plan_dict, plan_detail_dict, plan_unit_dict
from .. import content

router = APIRouter(prefix="/api/plans", tags=["cycle-plans"])


def _load_plan(plan_id: int, db: Session) -> CyclePlan:
    p = db.get(CyclePlan, plan_id)
    if not p:
        raise HTTPException(status_code=404, detail="周期计划不存在")
    return p


def _can_view(user: User, p: CyclePlan):
    if user.role == "member" and p.member_id != user.id:
        raise HTTPException(status_code=403, detail="只能查看自己的周期计划")
    if user.role == "coach" and p.coach_id != user.id:
        raise HTTPException(status_code=403, detail="只能查看自己发布的周期计划")


def _can_edit(user: User, p: CyclePlan):
    if user.role == "admin":
        return
    if user.role == "coach" and p.coach_id != user.id:
        raise HTTPException(status_code=403, detail="只能修改自己发布的周期计划")
    if user.role == "member":
        raise HTTPException(status_code=403, detail="无权限修改周期计划")


@router.get("")
def list_plans(member_id: int | None = None,
               status: str | None = None,
               db: Session = Depends(get_db),
               user: User = Depends(get_current_user),
               now: datetime = Depends(client_now)):
    stmt = select(CyclePlan)
    if user.role == "member":
        stmt = stmt.where(CyclePlan.member_id == user.id)
    elif user.role == "coach":
        stmt = stmt.where(CyclePlan.coach_id == user.id)
    elif member_id:
        stmt = stmt.where(CyclePlan.member_id == member_id)
    if status:
        stmt = stmt.where(CyclePlan.status == status)
    plans = db.scalars(stmt.order_by(CyclePlan.start_date.desc(), CyclePlan.id.desc())).all()
    member_cache, coach_cache, tpl_cache = {}, {}, {}

    def get_member(uid):
        if uid not in member_cache:
            member_cache[uid] = db.get(User, uid)
        return member_cache[uid]

    out = []
    for p in plans:
        coach = coach_cache.setdefault(p.coach_id, db.get(User, p.coach_id))
        tpl = tpl_cache.setdefault(p.template_id, db.get(PlanTemplate, p.template_id)) if p.template_id else None
        d = plan_dict(p, member=get_member(p.member_id), coach=coach, template=tpl, now=now)
        out.append(d)
    return out


@router.post("")
def create_plan(body: CyclePlanIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "coach")),
                now: datetime = Depends(client_now)):
    member = db.get(User, body.member_id)
    if not member or member.role != "member":
        raise HTTPException(status_code=404, detail="会员不存在")

    coach_id = body.coach_id if (user.role == "admin" and body.coach_id) else user.id
    coach = db.get(User, coach_id)
    if not coach or coach.role != "coach":
        raise HTTPException(status_code=400, detail="授课教练无效")
    if body.goal and body.goal not in content.GOALS:
        raise HTTPException(status_code=400, detail="训练目标非法")
    if body.status not in (content.PLAN_PUBLISHED, content.PLAN_DRAFT):
        raise HTTPException(status_code=400, detail="计划状态非法")

    template = db.get(PlanTemplate, body.template_id) if body.template_id else None
    if body.template_id and not template:
        raise HTTPException(status_code=404, detail="训练模板不存在")

    end_date = body.start_date + timedelta(days=body.weeks * 7 - 1)
    plan = CyclePlan(
        member_id=member.id, coach_id=coach_id, template_id=body.template_id,
        name=body.name, goal=body.goal or (template.goal if template else ""),
        weeks=body.weeks, start_date=body.start_date, end_date=end_date,
        note=body.note, status=body.status,
        published_at=now if body.status == content.PLAN_PUBLISHED else None,
    )
    db.add(plan)
    db.flush()

    if body.units:
        for ui, u in enumerate(body.units):
            if not (body.start_date <= u.scheduled_date <= end_date):
                raise HTTPException(status_code=400,
                                    detail=f"第{ui + 1}个单元日期 {u.scheduled_date} 超出计划周期")
            if u.goal and u.goal not in content.GOALS:
                raise HTTPException(status_code=400, detail=f"单元「{u.title or ui + 1}」训练目标非法")
            db.add(PlanUnit(
                plan_id=plan.id, week_no=u.week_no,
                weekday=u.scheduled_date.weekday(),
                scheduled_date=u.scheduled_date, title=u.title,
                goal=u.goal, focus_parts=",".join(u.focus_parts),
                planned_exercises_json=json.dumps([e.model_dump() for e in u.exercises],
                                                  ensure_ascii=False),
                planned_note=u.note, status=content.UNIT_UNSCHEDULED,
            ))
    db.commit()
    db.refresh(plan)
    return plan_detail_dict(plan, member=member, coach=coach, template=template, now=now)


@router.get("/units/upcoming")
def my_upcoming_units(db: Session = Depends(get_db),
                      user: User = Depends(get_current_user),
                      now: datetime = Depends(client_now)):
    """会员约课台: 本人尚未安排（未约课/逾期未安排）的训练单元。"""
    plans = db.scalars(
        select(CyclePlan).where(CyclePlan.member_id == user.id,
                                CyclePlan.status == content.PLAN_PUBLISHED)
    ).all()
    units = []
    for p in plans:
        coach = db.get(User, p.coach_id)
        for u in p.units:
            if u.status in (content.UNIT_UNSCHEDULED, content.UNIT_MISSED):
                d = plan_unit_dict(u)
                d["plan_name"] = p.name
                d["coach_id"] = p.coach_id
                d["coach_name"] = coach.full_name if coach else ""
                units.append(d)
    units.sort(key=lambda x: x["scheduled_date"])
    return units


@router.get("/{plan_id}")
def get_plan(plan_id: int, db: Session = Depends(get_db),
             user: User = Depends(get_current_user),
             now: datetime = Depends(client_now)):
    p = _load_plan(plan_id, db)
    _can_view(user, p)
    return plan_detail_dict(
        p, member=db.get(User, p.member_id), coach=db.get(User, p.coach_id),
        template=db.get(PlanTemplate, p.template_id) if p.template_id else None, now=now)


@router.post("/{plan_id}/publish")
def publish_plan(plan_id: int, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin", "coach")),
                 now: datetime = Depends(client_now)):
    p = _load_plan(plan_id, db)
    _can_edit(user, p)
    if p.status != content.PLAN_DRAFT:
        raise HTTPException(status_code=400, detail="只有草稿状态的计划可以发布")
    if not p.units:
        raise HTTPException(status_code=400, detail="请至少编排 1 个训练单元后再发布")
    p.status = content.PLAN_PUBLISHED
    p.published_at = now
    db.commit()
    return {"ok": True}


@router.post("/{plan_id}/archive")
def archive_plan(plan_id: int, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin", "coach"))):
    p = _load_plan(plan_id, db)
    _can_edit(user, p)
    p.status = content.PLAN_ARCHIVED
    db.commit()
    return {"ok": True}


@router.put("/units/{unit_id}")
def update_unit(unit_id: int, body: PlanUnitPatch, db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "coach")),
                now: datetime = Depends(client_now)):
    u = db.get(PlanUnit, unit_id)
    if not u:
        raise HTTPException(status_code=404, detail="训练单元不存在")
    p = _load_plan(u.plan_id, db)
    _can_edit(user, p)
    # 已约课/已完课/爽约的单元不允许直接改计划内容（快照隔离）
    if u.status not in (content.UNIT_UNSCHEDULED, content.UNIT_MISSED):
        raise HTTPException(status_code=400,
                            detail="该单元已关联预约或已完课，计划内容已锁定，不可修改")
    if body.title is not None:
        u.title = body.title
    if body.goal is not None:
        if body.goal and body.goal not in content.GOALS:
            raise HTTPException(status_code=400, detail="训练目标非法")
        u.goal = body.goal
    if body.focus_parts is not None:
        u.focus_parts = ",".join(body.focus_parts)
    if body.exercises is not None:
        u.planned_exercises_json = json.dumps(
            [e.model_dump() for e in body.exercises], ensure_ascii=False)
    if body.note is not None:
        u.planned_note = body.note
    if body.scheduled_date is not None:
        if not (p.start_date <= body.scheduled_date <= p.end_date):
            raise HTTPException(status_code=400, detail="调整日期超出计划周期")
        u.scheduled_date = body.scheduled_date
        u.week_no = max(1, min(p.weeks, ((body.scheduled_date - p.start_date).days // 7) + 1))
        u.weekday = body.scheduled_date.weekday()
    db.commit()
    return plan_unit_dict(u, detail=True)
