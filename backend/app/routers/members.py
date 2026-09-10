"""Member directory, health-profile (健康档案) view/edit, packages."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, MemberProfile, Package, Booking, BodyMeasurement
from ..deps import get_current_user, require_roles
from ..schemas import MemberProfileIn, PackageIn
from ..serializers import member_dict, member_profile_dict, package_dict
from .. import content

router = APIRouter(prefix="/api/members", tags=["members"])


@router.get("")
def list_members(q: str = "", db: Session = Depends(get_db),
                 user: User = Depends(require_roles("admin", "coach"))):
    stmt = select(User).where(User.role == "member")
    if q:
        stmt = stmt.where(User.full_name.contains(q) | User.username.contains(q) | User.phone.contains(q))
    users = db.scalars(stmt.order_by(User.id)).all()

    rem_rows = dict(db.execute(
        select(Package.member_id, func.coalesce(func.sum(Package.remaining), 0))
        .group_by(Package.member_id)
    ).all())
    latest_rows = {}
    for m in db.scalars(select(BodyMeasurement).order_by(BodyMeasurement.measured_at.desc())).all():
        latest_rows.setdefault(m.member_id, m)

    return [member_dict(u, package_remaining=int(rem_rows.get(u.id, 0)),
                        latest_measurement=latest_rows.get(u.id)) for u in users]


def _get_member(member_id: int, db: Session) -> User:
    u = db.get(User, member_id)
    if not u or u.role != "member":
        raise HTTPException(status_code=404, detail="会员不存在")
    return u


@router.get("/{member_id}")
def member_detail(member_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    if user.role == "member" and user.id != member_id:
        raise HTTPException(status_code=403, detail="只能查看自己的档案")
    member = _get_member(member_id, db)
    remaining = db.scalar(
        select(func.coalesce(func.sum(Package.remaining), 0)).where(Package.member_id == member_id)
    )
    total_bought = db.scalar(
        select(func.coalesce(func.sum(Package.total_sessions), 0)).where(Package.member_id == member_id)
    )
    done = db.scalar(
        select(func.count(Booking.id)).where(
            Booking.member_id == member_id, Booking.status == content.BK_COMPLETED)
    )
    d = member_dict(member, package_remaining=int(remaining or 0))
    d["total_sessions_bought"] = int(total_bought or 0)
    d["completed_sessions"] = int(done or 0)
    d["packages"] = [package_dict(p) for p in
                     db.scalars(select(Package).where(Package.member_id == member_id)
                                .order_by(Package.purchased_at.desc())).all()]
    return d


@router.put("/{member_id}/profile")
def update_profile(member_id: int, body: MemberProfileIn, db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)):
    if user.role == "member" and user.id != member_id:
        raise HTTPException(status_code=403, detail="只能编辑自己的档案")
    member = _get_member(member_id, db)
    p = member.member_profile
    if not p:
        p = MemberProfile(user_id=member_id)
        db.add(p)
        db.flush()
    data = body.model_dump(exclude_none=True)
    if "preferred_parts" in data:
        p.preferred_parts = ",".join(data.pop("preferred_parts"))
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    return member_profile_dict(p)


@router.post("/{member_id}/packages")
def grant_package(member_id: int, body: PackageIn, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("admin"))):
    member = _get_member(member_id, db)
    had_pkg = db.scalar(select(func.count(Package.id)).where(Package.member_id == member_id)) > 0
    pkg = Package(
        member_id=member_id, total_sessions=body.total_sessions,
        remaining=body.total_sessions, price=body.price, expires_at=body.expires_at,
    )
    db.add(pkg)
    if had_pkg:
        # 再次购课视为续约
        if member.member_profile:
            member.member_profile.renewal_count += 1
    db.commit()
    return package_dict(pkg)


@router.get("/{member_id}/packages")
def list_packages(member_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    if user.role == "member" and user.id != member_id:
        raise HTTPException(status_code=403, detail="无权限")
    _get_member(member_id, db)
    rows = db.scalars(select(Package).where(Package.member_id == member_id)
                      .order_by(Package.purchased_at.desc())).all()
    return [package_dict(p) for p in rows]
