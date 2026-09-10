"""Body measurements (体测曲线/阶段对比) and training goals (目标达成提醒)."""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, BodyMeasurement, Goal
from ..deps import get_current_user
from ..schemas import MeasurementIn, GoalIn
from ..serializers import measurement_dict, goal_dict
from ..services import latest_value, evaluate_goals
from .. import content

router = APIRouter(prefix="/api", tags=["measurements"])


def _check_member(member_id: int, user: User):
    if user.role == "member" and user.id != member_id:
        raise HTTPException(status_code=403, detail="只能查看自己的体测记录")
    if user.role not in ("admin", "coach", "member"):
        raise HTTPException(status_code=403, detail="无权限")


# ---------------- measurements ----------------
@router.get("/members/{member_id}/measurements")
def list_measurements(member_id: int, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)):
    _check_member(member_id, user)
    rows = db.scalars(
        select(BodyMeasurement).where(BodyMeasurement.member_id == member_id)
        .order_by(BodyMeasurement.measured_at)
    ).all()
    return [measurement_dict(m) for m in rows]


@router.post("/members/{member_id}/measurements")
def add_measurement(member_id: int, body: MeasurementIn, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    if user.role == "member" and user.id != member_id:
        raise HTTPException(status_code=403, detail="无权限")
    m = BodyMeasurement(
        member_id=member_id,
        measured_at=body.measured_at or datetime.now(),
        weight=body.weight, body_fat_pct=body.body_fat_pct,
        muscle_mass=body.muscle_mass, resting_hr=body.resting_hr,
        systolic=body.systolic, diastolic=body.diastolic,
        waist=body.waist, hip=body.hip, note=body.note,
    )
    db.add(m)
    db.commit()
    reminders = evaluate_goals(member_id, db)
    return {"measurement": measurement_dict(m), "reminders": reminders}


@router.get("/members/{member_id}/measurements/compare")
def compare_measurements(member_id: int, db: Session = Depends(get_db),
                         user: User = Depends(get_current_user)):
    """阶段性体测对比: 首次 / 最近 / 阶段差值 / 变化方向。"""
    _check_member(member_id, user)
    rows = db.scalars(
        select(BodyMeasurement).where(BodyMeasurement.member_id == member_id)
        .order_by(BodyMeasurement.measured_at)
    ).all()
    if not rows:
        return {"points": [], "compare": []}
    keys = ["weight", "body_fat_pct", "muscle_mass", "waist", "hip", "resting_hr"]
    first, latest = rows[0], rows[-1]
    mid = rows[len(rows) // 2] if len(rows) >= 3 else None
    compare = []
    for k in keys:
        a, z = getattr(first, k), getattr(latest, k)
        if a is None and z is None:
            continue
        delta = round(z - a, 2) if (a is not None and z is not None) else None
        compare.append({
            "metric": k, "label": content.METRICS.get(k, {}).get("label", k),
            "first": a, "middle": getattr(mid, k) if mid else None, "latest": z,
            "delta": delta,
        })
    return {
        "points": [measurement_dict(m) for m in rows],
        "first_at": first.measured_at, "latest_at": latest.measured_at,
        "compare": compare,
    }


# ---------------- goals ----------------
@router.get("/members/{member_id}/goals")
def list_goals(member_id: int, db: Session = Depends(get_db),
               user: User = Depends(get_current_user)):
    _check_member(member_id, user)
    rows = db.scalars(
        select(Goal).where(Goal.member_id == member_id).order_by(Goal.id.desc())
    ).all()
    return [goal_dict(g, current_value=latest_value(member_id, g.metric, db)) for g in rows]


@router.post("/members/{member_id}/goals")
def create_goal(member_id: int, body: GoalIn, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)):
    if user.role == "member" and user.id != member_id:
        raise HTTPException(status_code=403, detail="无权限")
    if body.metric not in content.METRICS:
        raise HTTPException(status_code=400, detail="体测指标非法")
    suggested_dir = content.METRICS[body.metric]["good"]
    g = Goal(
        member_id=member_id, title=body.title, metric=body.metric,
        target_value=body.target_value,
        direction=body.direction if body.direction else suggested_dir,
        start_value=body.start_value if body.start_value is not None
        else latest_value(member_id, body.metric, db),
    )
    db.add(g)
    db.commit()
    reminders = evaluate_goals(member_id, db)
    return {"goal": goal_dict(g), "reminders": reminders}


@router.post("/goals/{goal_id}/deactivate")
def deactivate_goal(goal_id: int, db: Session = Depends(get_db),
                    user: User = Depends(get_current_user)):
    g = db.get(Goal, goal_id)
    if not g:
        raise HTTPException(status_code=404, detail="目标不存在")
    if user.role == "member" and user.id != g.member_id:
        raise HTTPException(status_code=403, detail="无权限")
    g.active = False
    db.commit()
    return {"ok": True}
