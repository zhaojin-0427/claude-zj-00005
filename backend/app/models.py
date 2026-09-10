"""SQLAlchemy ORM models for the PT booking & training-archive domain."""
from datetime import datetime
from sqlalchemy import String, Integer, Float, DateTime, Date, Text, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(50))
    role: Mapped[str] = mapped_column(String(20), index=True)  # admin / coach / member
    phone: Mapped[str] = mapped_column(String(20), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    coach_profile: Mapped["Coach"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    member_profile: Mapped["MemberProfile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


class Coach(Base):
    __tablename__ = "coaches"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    title: Mapped[str] = mapped_column(String(50), default="私人教练")
    specialty: Mapped[str] = mapped_column(String(200), default="")
    years_exp: Mapped[int] = mapped_column(Integer, default=1)
    rating: Mapped[float] = mapped_column(Float, default=4.8)

    user: Mapped[User] = relationship(back_populates="coach_profile")


class MemberProfile(Base):
    __tablename__ = "member_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    gender: Mapped[str] = mapped_column(String(10), default="")
    birth_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal_focus: Mapped[str] = mapped_column(String(30), default="fat_loss")
    limitations: Mapped[str] = mapped_column(Text, default="")     # 体能限制 / 伤病
    injuries: Mapped[str] = mapped_column(Text, default="")
    preferred_parts: Mapped[str] = mapped_column(String(200), default="")  # csv of part keys
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active / frozen / churned
    renewal_count: Mapped[int] = mapped_column(Integer, default=0)

    user: Mapped[User] = relationship(back_populates="member_profile")


class Package(Base):
    """会员私教课包: 购买后产生, 剩余课时 remaining。"""
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    total_sessions: Mapped[int] = mapped_column(Integer)
    remaining: Mapped[int] = mapped_column(Integer)
    price: Mapped[float] = mapped_column(Float, default=0)
    purchased_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Venue(Base):
    __tablename__ = "venues"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    kind: Mapped[str] = mapped_column(String(10))  # area / room
    capacity: Mapped[int] = mapped_column(Integer, default=1)
    note: Mapped[str] = mapped_column(String(200), default="")


class Slot(Base):
    """教练私教时段 (绑定场地)。"""
    __tablename__ = "slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    coach_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    venue_id: Mapped[int] = mapped_column(ForeignKey("venues.id"))
    start_time: Mapped[datetime] = mapped_column(DateTime, index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(12), default="open", index=True)
    # open / booked / completed / canceled / blocked

    venue: Mapped[Venue] = relationship()


class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    coach_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("slots.id"), unique=True)
    status: Mapped[str] = mapped_column(String(12), default="booked", index=True)
    # booked / completed / no_show / canceled
    goal: Mapped[str] = mapped_column(String(30), default="")
    focus_parts: Mapped[str] = mapped_column(String(200), default="")  # csv
    limitations: Mapped[str] = mapped_column(Text, default="")
    template_id: Mapped[int | None] = mapped_column(ForeignKey("plan_templates.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    canceled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    slot: Mapped[Slot] = relationship()
    session: Mapped["TrainingSession"] = relationship(back_populates="booking", uselist=False, cascade="all, delete-orphan")


class TrainingSession(Base):
    """课后训练登记: 动作清单(JSON)、负重、RPE、下次重点。"""
    __tablename__ = "training_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), unique=True)
    duration_min: Mapped[int] = mapped_column(Integer, default=60)
    # exercises: [{name, part, sets, reps, weight, note}]
    exercises_json: Mapped[str] = mapped_column(Text, default="[]")
    rpe: Mapped[int | None] = mapped_column(Integer, nullable=True)          # 主观疲劳度 1-10
    summary: Mapped[str] = mapped_column(Text, default="")                   # 课堂小结
    leftover: Mapped[str] = mapped_column(Text, default="")                  # 上次遗留问题(开课前承接)
    next_focus: Mapped[str] = mapped_column(Text, default="")                # 下次重点
    warmup: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    booking: Mapped[Booking] = relationship(back_populates="session")


class BodyMeasurement(Base):
    """阶段性体测记录。"""
    __tablename__ = "body_measurements"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    measured_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    body_fat_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    muscle_mass: Mapped[float | None] = mapped_column(Float, nullable=True)
    resting_hr: Mapped[int | None] = mapped_column(Integer, nullable=True)
    systolic: Mapped[int | None] = mapped_column(Integer, nullable=True)
    diastolic: Mapped[int | None] = mapped_column(Integer, nullable=True)
    waist: Mapped[float | None] = mapped_column(Float, nullable=True)
    hip: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")


class Goal(Base):
    """会员训练目标, achieved 后驱动目标达成提醒。"""
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(100))
    metric: Mapped[str] = mapped_column(String(30))       # weight / body_fat_pct / muscle_mass / ...
    target_value: Mapped[float] = mapped_column(Float)
    direction: Mapped[str] = mapped_column(String(4))     # down / up
    start_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    achieved: Mapped[bool] = mapped_column(Boolean, default=False)
    achieved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class PlanTemplate(Base):
    """训练计划模板, 可在约课时一键套用。"""
    __tablename__ = "plan_templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    goal: Mapped[str] = mapped_column(String(30))
    primary_part: Mapped[str] = mapped_column(String(30))
    level: Mapped[str] = mapped_column(String(20), default="intermediate")
    description: Mapped[str] = mapped_column(Text, default="")
    # exercises: [{name, part, sets, reps, weight, note}]
    exercises_json: Mapped[str] = mapped_column(Text, default="[]")
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
