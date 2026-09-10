"""Pydantic request/response schemas."""
from datetime import datetime, date
from pydantic import BaseModel, ConfigDict, Field


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- auth / users ----------
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserOut"


class Login(BaseModel):
    username: str
    password: str


class RegisterIn(BaseModel):
    username: str
    password: str = Field(min_length=4)
    full_name: str
    phone: str = ""
    gender: str = ""
    birth_date: date | None = None
    height_cm: float | None = None
    goal_focus: str = "fat_loss"
    limitations: str = ""
    injuries: str = ""
    preferred_parts: list[str] = []


class UserOut(ORMModel):
    id: int
    username: str
    full_name: str
    role: str
    phone: str
    created_at: datetime


class MemberProfileIn(BaseModel):
    gender: str | None = None
    birth_date: date | None = None
    height_cm: float | None = None
    goal_focus: str | None = None
    limitations: str | None = None
    injuries: str | None = None
    preferred_parts: list[str] | None = None
    status: str | None = None


class MemberProfileOut(ORMModel):
    gender: str
    birth_date: date | None
    height_cm: float | None
    goal_focus: str
    limitations: str
    injuries: str
    preferred_parts: str
    joined_at: datetime
    status: str
    renewal_count: int


class MemberOut(ORMModel):
    id: int
    username: str
    full_name: str
    phone: str
    role: str
    created_at: datetime
    member_profile: MemberProfileOut | None = None


class CoachProfileOut(ORMModel):
    title: str
    specialty: str
    years_exp: int
    rating: float


class CoachOut(ORMModel):
    id: int
    username: str
    full_name: str
    phone: str
    coach_profile: CoachProfileOut | None = None


# ---------- packages ----------
class PackageIn(BaseModel):
    member_id: int
    total_sessions: int = Field(gt=0)
    price: float = 0
    expires_at: datetime | None = None


class PackageOut(ORMModel):
    id: int
    member_id: int
    total_sessions: int
    remaining: int
    price: float
    purchased_at: datetime
    expires_at: datetime | None


# ---------- venues / slots ----------
class VenueIn(BaseModel):
    name: str
    kind: str
    capacity: int = 1
    note: str = ""


class VenueOut(ORMModel):
    id: int
    name: str
    kind: str
    capacity: int
    note: str


class SlotIn(BaseModel):
    coach_id: int
    venue_id: int
    start_time: datetime
    end_time: datetime


class SlotBulkIn(BaseModel):
    coach_id: int
    venue_id: int
    dates: list[date]
    start_hour: int = 9
    end_hour: int = 21
    duration_min: int = 60
    gap_min: int = 0


class SlotOut(ORMModel):
    id: int
    coach_id: int
    venue_id: int
    start_time: datetime
    end_time: datetime
    status: str
    venue: VenueOut | None = None


# ---------- bookings ----------
class ExerciseItem(BaseModel):
    name: str
    part: str = ""
    sets: int = 3
    reps: str = "10"
    weight: float = 0
    note: str = ""


class BookingCreate(BaseModel):
    slot_id: int
    goal: str
    focus_parts: list[str] = []
    limitations: str = ""
    template_id: int | None = None


class BookingOut(ORMModel):
    id: int
    member_id: int
    coach_id: int
    slot_id: int
    status: str
    goal: str
    focus_parts: str
    limitations: str
    template_id: int | None
    created_at: datetime
    canceled_at: datetime | None
    slot: SlotOut | None = None


# ---------- training sessions ----------
class SessionIn(BaseModel):
    duration_min: int = 60
    warmup: str = ""
    exercises: list[ExerciseItem] = []
    rpe: int | None = Field(default=None, ge=1, le=10)
    summary: str = ""
    leftover: str = ""
    next_focus: str = ""


class SessionOut(ORMModel):
    id: int
    booking_id: int
    duration_min: int
    exercises_json: str
    rpe: int | None
    summary: str
    leftover: str
    next_focus: str
    warmup: str
    created_at: datetime


# ---------- measurements ----------
class MeasurementIn(BaseModel):
    measured_at: datetime | None = None
    weight: float | None = None
    body_fat_pct: float | None = None
    muscle_mass: float | None = None
    resting_hr: int | None = None
    systolic: int | None = None
    diastolic: int | None = None
    waist: float | None = None
    hip: float | None = None
    note: str = ""


class MeasurementOut(ORMModel):
    id: int
    member_id: int
    measured_at: datetime
    weight: float | None
    body_fat_pct: float | None
    muscle_mass: float | None
    resting_hr: int | None
    systolic: int | None
    diastolic: int | None
    waist: float | None
    hip: float | None
    note: str


# ---------- goals ----------
class GoalIn(BaseModel):
    title: str
    metric: str
    target_value: float
    direction: str = Field(pattern="^(up|down)$")
    start_value: float | None = None


class GoalOut(ORMModel):
    id: int
    member_id: int
    title: str
    metric: str
    target_value: float
    direction: str
    start_value: float | None
    start_at: datetime
    achieved: bool
    achieved_at: datetime | None
    active: bool


# ---------- templates ----------
class TemplateIn(BaseModel):
    name: str
    goal: str
    primary_part: str
    level: str = "intermediate"
    description: str = ""
    exercises: list[ExerciseItem] = []


class TemplateOut(ORMModel):
    id: int
    name: str
    goal: str
    primary_part: str
    level: str
    description: str
    exercises_json: str
    created_by: int | None
    created_at: datetime


MemberOut.model_rebuild()
Token.model_rebuild()
