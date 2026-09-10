"""Auth: login, member self-registration, current user + alerts."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, MemberProfile, Package
from ..security import verify_password, create_access_token
from ..deps import get_current_user
from ..schemas import RegisterIn
from ..serializers import member_profile_dict
from ..services import member_alerts

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _user_out(u: User) -> dict:
    return {"id": u.id, "username": u.username, "full_name": u.full_name,
            "role": u.role, "phone": u.phone, "created_at": u.created_at}


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == form.username))
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token(user.id, user.role)
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}


@router.post("/register")
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(status_code=400, detail="用户名已被注册")
    from ..security import hash_password
    user = User(
        username=body.username, password_hash=hash_password(body.password),
        full_name=body.full_name, phone=body.phone, role="member",
    )
    db.add(user)
    db.flush()
    profile = MemberProfile(
        user_id=user.id, gender=body.gender, birth_date=body.birth_date,
        height_cm=body.height_cm, goal_focus=body.goal_focus,
        limitations=body.limitations, injuries=body.injuries,
        preferred_parts=",".join(body.preferred_parts),
    )
    db.add(profile)
    # 新会员赠送一节体验课
    db.add(Package(member_id=user.id, total_sessions=1, remaining=1, price=0))
    db.commit()
    token = create_access_token(user.id, user.role)
    return {"access_token": token, "token_type": "bearer", "user": _user_out(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = _user_out(user)
    if user.role == "member" and user.member_profile:
        data["member_profile"] = member_profile_dict(user.member_profile)
        remaining = db.scalar(
            select(func.coalesce(func.sum(Package.remaining), 0))
            .where(Package.member_id == user.id)
        )
        data["package_remaining"] = int(remaining or 0)
        data["alerts"] = member_alerts(user.id, db)
    elif user.role == "coach" and user.coach_profile:
        data["coach_profile"] = {
            "title": user.coach_profile.title,
            "specialty": user.coach_profile.specialty,
            "years_exp": user.coach_profile.years_exp,
            "rating": user.coach_profile.rating,
        }
    return data
