"""Lightweight dict serializers (joins are easier than deep ORM nests here)."""
import json
from datetime import datetime
from . import content
from . import plansvc


def venue_dict(v):
    return {
        "id": v.id, "name": v.name, "kind": v.kind,
        "kind_label": content.VENUE_KINDS.get(v.kind, v.kind),
        "capacity": v.capacity, "note": v.note,
    }


def slot_dict(s, booking=None):
    d = {
        "id": s.id, "coach_id": s.coach_id, "venue_id": s.venue_id,
        "start_time": s.start_time, "end_time": s.end_time,
        "status": s.status, "venue": venue_dict(s.venue) if s.venue else None,
    }
    if booking is not None:
        d["booking"] = booking
    return d


def _user_brief(u):
    if not u:
        return None
    return {"id": u.id, "full_name": u.full_name, "phone": u.phone, "role": u.role}


def booking_dict(b, slot=None, member=None, coach=None, session=None, profile=None):
    parts = [p for p in (b.focus_parts or "").split(",") if p]
    d = {
        "id": b.id, "member_id": b.member_id, "coach_id": b.coach_id,
        "slot_id": b.slot_id, "status": b.status,
        "goal": b.goal, "goal_label": content.GOALS.get(b.goal, b.goal),
        "focus_parts": b.focus_parts, "focus_parts_list": parts,
        "focus_parts_labels": [content.PARTS.get(p, p) for p in parts],
        "limitations": b.limitations, "template_id": b.template_id,
        "plan_unit_id": b.plan_unit.id if b.plan_unit else None,
        "created_at": b.created_at, "canceled_at": b.canceled_at,
        "slot": slot_dict(slot or b.slot) if (slot or b.slot) else None,
        "member": _user_brief(member) if member else _user_brief(getattr(b, "_member", None)),
        "coach": _user_brief(coach) if coach else None,
        "has_session": session is not None or b.session is not None,
        "session": None,
        "plan_unit": plan_unit_brief(b.plan_unit) if b.plan_unit else None,
    }
    s = session or b.session
    if s:
        d["session"] = session_dict(s)
    if profile is not None:
        d["member"]["profile"] = profile if isinstance(profile, dict) else member_profile_dict(profile)
    return d


def session_dict(s):
    return {
        "id": s.id, "booking_id": s.booking_id,
        "duration_min": s.duration_min, "exercises_json": s.exercises_json,
        "rpe": s.rpe, "rpe_label": content.RPE_LABELS.get(s.rpe, "") if s.rpe else "",
        "summary": s.summary, "leftover": s.leftover,
        "next_focus": s.next_focus, "warmup": s.warmup,
        "created_at": s.created_at,
    }


def member_profile_dict(p):
    return {
        "gender": p.gender, "birth_date": p.birth_date, "height_cm": p.height_cm,
        "goal_focus": p.goal_focus,
        "goal_label": content.GOALS.get(p.goal_focus, p.goal_focus),
        "limitations": p.limitations, "injuries": p.injuries,
        "preferred_parts": p.preferred_parts,
        "preferred_parts_list": [x for x in (p.preferred_parts or "").split(",") if x],
        "joined_at": p.joined_at, "status": p.status, "renewal_count": p.renewal_count,
    }


def member_dict(u, package_remaining=None, latest_measurement=None):
    d = {
        "id": u.id, "username": u.username, "full_name": u.full_name,
        "phone": u.phone, "role": u.role, "created_at": u.created_at,
        "member_profile": member_profile_dict(u.member_profile) if u.member_profile else None,
    }
    if package_remaining is not None:
        d["package_remaining"] = package_remaining
    if latest_measurement is not None:
        m = latest_measurement
        d["latest_measurement"] = None if m is None else {
            "measured_at": m.measured_at, "weight": m.weight,
            "body_fat_pct": m.body_fat_pct, "muscle_mass": m.muscle_mass,
            "waist": m.waist,
        }
    return d


def measurement_dict(m):
    return {
        "id": m.id, "member_id": m.member_id, "measured_at": m.measured_at,
        "weight": m.weight, "body_fat_pct": m.body_fat_pct,
        "muscle_mass": m.muscle_mass, "resting_hr": m.resting_hr,
        "systolic": m.systolic, "diastolic": m.diastolic,
        "waist": m.waist, "hip": m.hip, "note": m.note,
    }


def goal_dict(g, current_value=None):
    achieved = g.achieved
    progress = None
    if current_value is not None and g.start_value is not None:
        total = abs(g.target_value - g.start_value)
        done = abs(current_value - g.start_value)
        if total > 0:
            progress = max(0.0, min(1.0, done / total))
    return {
        "id": g.id, "member_id": g.member_id, "title": g.title,
        "metric": g.metric,
        "metric_label": content.METRICS.get(g.metric, {}).get("label", g.metric),
        "target_value": g.target_value, "direction": g.direction,
        "start_value": g.start_value, "start_at": g.start_at,
        "achieved": achieved, "achieved_at": g.achieved_at, "active": g.active,
        "current_value": current_value, "progress": progress,
        "cycle_days": (g.achieved_at - g.start_at).days if achieved and g.achieved_at else None,
    }


def template_dict(t):
    return {
        "id": t.id, "name": t.name, "goal": t.goal,
        "goal_label": content.GOALS.get(t.goal, t.goal),
        "primary_part": t.primary_part,
        "primary_part_label": content.PARTS.get(t.primary_part, t.primary_part),
        "level": t.level, "description": t.description,
        "exercises_json": t.exercises_json,
        "created_by": t.created_by, "created_at": t.created_at,
    }


def package_dict(p):
    return {
        "id": p.id, "member_id": p.member_id, "total_sessions": p.total_sessions,
        "remaining": p.remaining, "price": p.price,
        "purchased_at": p.purchased_at, "expires_at": p.expires_at,
    }


def coach_dict(u):
    cp = u.coach_profile
    return {
        "id": u.id, "full_name": u.full_name, "phone": u.phone,
        "title": cp.title if cp else "私人教练",
        "specialty": cp.specialty if cp else "",
        "years_exp": cp.years_exp if cp else 1,
        "rating": cp.rating if cp else 4.8,
    }


# ---------------------------------------------------------------- cycle plans
def plan_unit_brief(u, with_booking: bool = False) -> dict:
    """约课/简报场景使用的单元精简信息。"""
    d = {
        "id": u.id, "plan_id": u.plan_id, "week_no": u.week_no,
        "scheduled_date": u.scheduled_date, "title": u.title,
        "goal": u.goal, "goal_label": content.GOALS.get(u.goal, u.goal) if u.goal else "",
        "focus_parts": u.focus_parts,
        "focus_parts_list": [p for p in (u.focus_parts or "").split(",") if p],
        "focus_parts_labels": [content.PARTS.get(p, p)
                               for p in (u.focus_parts or "").split(",") if p],
        "planned_exercises_json": u.planned_exercises_json,
        "planned_note": u.planned_note,
        "status": u.status, "status_label": content.UNIT_STATUS.get(u.status, u.status),
        "booking_id": u.booking_id,
        "completion_rate": u.completion_rate,
        "planned_volume": u.planned_volume,
        "actual_volume": u.actual_volume,
    }
    if with_booking and u.booking and u.booking.slot:
        d["booking"] = {
            "id": u.booking.id,
            "start_time": u.booking.slot.start_time,
            "status": u.booking.status,
        }
    return d


def plan_unit_dict(u, detail: bool = False) -> dict:
    """日历/详情使用的完整单元信息（含执行快照与逐动作对比）。"""
    d = plan_unit_brief(u, with_booking=True)
    d["weekday"] = u.weekday
    d["snapshot_at"] = u.snapshot_at
    d["actual_exercises_json"] = u.actual_exercises_json
    d["actual_rpe"] = u.actual_rpe
    d["coach_note"] = u.coach_note
    if detail and u.status == content.UNIT_COMPLETED:
        cmp_ = plansvc.compute_comparison(
            plansvc.parse_exercises(u.planned_exercises_json),
            plansvc.parse_exercises(u.actual_exercises_json))
        d["comparison"] = cmp_
    return d


def plan_dict(p, member=None, coach=None, template=None, now=None) -> dict:
    d = {
        "id": p.id, "member_id": p.member_id, "coach_id": p.coach_id,
        "template_id": p.template_id,
        "name": p.name, "goal": p.goal,
        "goal_label": content.GOALS.get(p.goal, p.goal) if p.goal else "",
        "weeks": p.weeks, "start_date": p.start_date, "end_date": p.end_date,
        "note": p.note, "status": p.status,
        "status_label": content.PLAN_STATUS.get(p.status, p.status),
        "created_at": p.created_at, "published_at": p.published_at,
        "member": _user_brief(member) if member else None,
        "coach": _user_brief(coach) if coach else None,
        "template_name": template.name if template else None,
        "summary": plansvc.plan_summary(p, now=now),
    }
    return d


def plan_detail_dict(p, member=None, coach=None, template=None, now=None) -> dict:
    d = plan_dict(p, member=member, coach=coach, template=template, now=now)
    d["units"] = [plan_unit_dict(u, detail=True) for u in p.units]
    return d
