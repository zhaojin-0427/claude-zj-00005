"""Venues (器械区/团课教室) and coach time slots (私教时段)."""
from datetime import datetime, timedelta, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Venue, Slot, Booking
from ..deps import get_current_user, require_roles
from ..timeutil import client_now
from ..schemas import VenueIn, SlotIn, SlotBulkIn
from ..serializers import venue_dict, slot_dict, coach_dict
from .. import content

router = APIRouter(prefix="/api", tags=["resources"])


# ---------------- venues ----------------
@router.get("/venues")
def list_venues(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return [venue_dict(v) for v in db.scalars(select(Venue).order_by(Venue.kind, Venue.id)).all()]


@router.post("/venues")
def create_venue(body: VenueIn, db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin"))):
    if body.kind not in content.VENUE_KINDS:
        raise HTTPException(status_code=400, detail="场地类型非法")
    v = Venue(**body.model_dump())
    db.add(v)
    db.commit()
    return venue_dict(v)


# ---------------- coaches ----------------
@router.get("/coaches")
def list_coaches(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    users = db.scalars(select(User).where(User.role == "coach").order_by(User.id)).all()
    return [coach_dict(u) for u in users]


# ---------------- slots ----------------
def _active_booking(slot_id: int, db: Session) -> Booking | None:
    """该时段当前生效的预约（不含已取消）。"""
    return db.scalar(
        select(Booking)
        .where(Booking.slot_id == slot_id,
               Booking.status.in_([content.BK_BOOKED, content.BK_COMPLETED, content.BK_NO_SHOW]))
        .order_by(Booking.id.desc())
    )


def _visible_slot(s: Slot, db: Session, viewer: User) -> dict:
    coach = db.get(User, s.coach_id)
    d = slot_dict(s, booking=None)
    d["coach"] = {"id": s.coach_id, "full_name": coach.full_name} if coach else None
    b = _active_booking(s.id, db)
    if b and viewer.role in ("admin", "coach"):
        # 会员姓名仅对员工可见
        d["booking"] = {"id": b.id, "member_id": b.member_id,
                        "member_name": db.get(User, b.member_id).full_name,
                        "status": b.status}
    return d


@router.get("/slots")
def list_slots(
    coach_id: int | None = None,
    venue_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Slot)
    if coach_id:
        stmt = stmt.where(Slot.coach_id == coach_id)
    if venue_id:
        stmt = stmt.where(Slot.venue_id == venue_id)
    if date_from:
        stmt = stmt.where(Slot.start_time >= date_from)
    if date_to:
        stmt = stmt.where(Slot.start_time <= date_to)
    if status:
        stmt = stmt.where(Slot.status == status)
    slots = db.scalars(stmt.order_by(Slot.start_time)).all()
    return [_visible_slot(s, db, user) for s in slots]


@router.post("/slots")
def create_slot(body: SlotIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "coach")),
                now: datetime = Depends(client_now)):
    if user.role == "coach" and body.coach_id != user.id:
        raise HTTPException(status_code=403, detail="教练只能发布自己的时段")
    if body.end_time <= body.start_time:
        raise HTTPException(status_code=400, detail="时段结束时间必须晚于开始时间")
    if body.start_time <= now:
        raise HTTPException(status_code=400, detail="不能发布已过去的时段")
    s = Slot(**body.model_dump(), status=content.SLOT_OPEN)
    db.add(s)
    db.commit()
    return slot_dict(s)


@router.post("/slots/bulk")
def bulk_slots(body: SlotBulkIn, db: Session = Depends(get_db),
               user: User = Depends(require_roles("admin", "coach")),
               now: datetime = Depends(client_now)):
    if user.role == "coach" and body.coach_id != user.id:
        raise HTTPException(status_code=403, detail="教练只能发布自己的时段")
    if not db.get(Venue, body.venue_id):
        raise HTTPException(status_code=404, detail="场地不存在")
    created = 0
    for d in body.dates:
        t = datetime(d.year, d.month, d.day, body.start_hour)
        end_limit = datetime(d.year, d.month, d.day, body.end_hour)
        while t + timedelta(minutes=body.duration_min) <= end_limit:
            start, end = t, t + timedelta(minutes=body.duration_min)
            clash = db.scalar(select(Slot).where(
                Slot.coach_id == body.coach_id,
                Slot.start_time < end, Slot.end_time > start))
            if not clash and start > now:
                db.add(Slot(coach_id=body.coach_id, venue_id=body.venue_id,
                            start_time=start, end_time=end, status=content.SLOT_OPEN))
                created += 1
            t = end + timedelta(minutes=body.gap_min)
    db.commit()
    return {"created": created}


@router.delete("/slots/{slot_id}")
def delete_slot(slot_id: int, db: Session = Depends(get_db),
                user: User = Depends(require_roles("admin", "coach"))):
    s = db.get(Slot, slot_id)
    if not s:
        raise HTTPException(status_code=404, detail="时段不存在")
    if user.role == "coach" and s.coach_id != user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if _active_booking(slot_id, db):
        raise HTTPException(status_code=400, detail="已有预约的时段不能删除，请先取消预约")
    db.delete(s)
    db.commit()
    return {"ok": True}
