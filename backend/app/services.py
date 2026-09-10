"""Domain services: goal achievement evaluation, reminders and dashboard stats."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from sqlalchemy import select, func
from . import models as M
from . import content


# ---------------------------------------------------------------- goals
def latest_value(member_id: int, metric: str, db) -> float | None:
    m = db.scalar(
        select(M.BodyMeasurement)
        .where(M.BodyMeasurement.member_id == member_id)
        .order_by(M.BodyMeasurement.measured_at.desc())
    )
    if not m:
        return None
    return getattr(m, metric, None)


def evaluate_goals(member_id: int, db) -> list[dict]:
    """Mark achieved goals; return reminder dicts for newly achieved ones."""
    reminders = []
    goals = db.scalars(select(M.Goal).where(M.Goal.member_id == member_id, M.Goal.active == True)).all()  # noqa: E712
    for g in goals:
        value = latest_value(member_id, g.metric, db)
        if value is None:
            continue
        hit = value <= g.target_value if g.direction == "down" else value >= g.target_value
        if hit and not g.achieved:
            g.achieved = True
            g.achieved_at = datetime.utcnow()
            cycle = (g.achieved_at - g.start_at).days
            reminders.append({
                "type": "goal_achieved",
                "goal_id": g.id,
                "title": g.title,
                "metric": g.metric,
                "target_value": g.target_value,
                "current_value": value,
                "cycle_days": cycle,
                "message": f"🎉 目标「{g.title}」达成！用时 {cycle} 天，当前值 {value}，目标值 {g.target_value}",
            })
    db.commit()
    return reminders


def member_alerts(member_id: int, db) -> list[dict]:
    """目标达成提醒 + 课时不足提醒 + 遗留问题提醒。"""
    alerts = evaluate_goals(member_id, db)

    remaining = db.scalar(
        select(func.coalesce(func.sum(M.Package.remaining), 0)).where(M.Package.member_id == member_id)
    )
    if remaining is not None and remaining <= 3:
        alerts.append({
            "type": "low_sessions",
            "remaining": int(remaining),
            "message": f"私教课时仅剩 {remaining} 节，建议及时续约课包",
        })

    last_session = db.scalar(
        select(M.TrainingSession)
        .join(M.Booking, M.TrainingSession.booking_id == M.Booking.id)
        .where(M.Booking.member_id == member_id, M.Booking.status == content.BK_COMPLETED)
        .order_by(M.TrainingSession.created_at.desc())
    )
    if last_session and last_session.next_focus:
        alerts.append({
            "type": "next_focus",
            "message": f"上次课教练布置的下次重点：{last_session.next_focus}",
        })
    return alerts


# ---------------------------------------------------------------- stats
def _window_start(days: int | None):
    return datetime.utcnow() - timedelta(days=days) if days else None


def dashboard_stats(db, days: int | None = 90) -> dict:
    start = _window_start(days)

    slot_q = select(M.Slot)
    if start:
        slot_q = slot_q.where(M.Slot.start_time >= start)
    slots = db.scalars(slot_q).all()
    past_slots = [s for s in slots if s.end_time <= datetime.utcnow()]
    scheduled = [s for s in past_slots if s.status != content.SLOT_CANCELED and s.status != content.SLOT_BLOCKED]
    utilized = [s for s in scheduled if s.status == content.SLOT_COMPLETED]
    utilization = round(100 * len(utilized) / len(scheduled), 1) if scheduled else 0.0

    # 每日利用率趋势
    trend_map = defaultdict(lambda: {"scheduled": 0, "used": 0})
    for s in scheduled:
        key = s.start_time.strftime("%m-%d")
        trend_map[key]["scheduled"] += 1
        if s.status == content.SLOT_COMPLETED:
            trend_map[key]["used"] += 1
    utilization_trend = [
        {"date": k, **v, "rate": round(100 * v["used"] / v["scheduled"], 1) if v["scheduled"] else 0}
        for k, v in sorted(trend_map.items())
    ]

    # 预约构成
    bk_q = select(M.Booking)
    if start:
        bk_q = bk_q.where(M.Booking.created_at >= start)
    bookings = db.scalars(bk_q).all()
    status_counter = Counter(b.status for b in bookings)
    booking_status = [
        {"key": k, "label": {"completed": "已完成", "booked": "待上课", "no_show": "爽约", "canceled": "已取消"}[k],
         "count": status_counter.get(k, 0)}
        for k in ("completed", "booked", "no_show", "canceled")
    ]

    # 续约率: 有课包的会员中, renewal_count>0 的比例; 同时给出购买/续约课包数
    members = db.scalars(
        select(M.User).join(M.MemberProfile, M.MemberProfile.user_id == M.User.id)
    ).all()
    paying = [m for m in members if m.member_profile]
    renewed = [m for m in paying if m.member_profile.renewal_count > 0]
    renewal_rate = round(100 * len(renewed) / len(paying), 1) if paying else 0.0

    pkg_q = select(M.Package)
    if start:
        pkg_q = pkg_q.where(M.Package.purchased_at >= start)
    packages = db.scalars(pkg_q).all()
    renewal_pkg = sum(1 for p in packages
                      if db.scalar(select(func.count(M.Package.id)).where(
                          M.Package.member_id == p.member_id,
                          M.Package.purchased_at < p.purchased_at)) > 0)
    new_pkg = len(packages) - renewal_pkg

    # 目标达成周期
    achieved_goals = db.scalars(
        select(M.Goal).where(M.Goal.achieved == True)  # noqa: E712
    ).all()
    if start:
        achieved_goals = [g for g in achieved_goals if g.achieved_at and g.achieved_at >= start]
    cycles = [(g.achieved_at - g.start_at).days for g in achieved_goals if g.achieved_at]
    avg_cycle = round(sum(cycles) / len(cycles), 1) if cycles else None
    active_goals = db.scalars(
        select(M.Goal).where(M.Goal.active == True, M.Goal.achieved == False)  # noqa: E712
    ).all()

    # 部位训练频次 (取已完成课次的动作清单)
    part_counter = Counter()
    part_sessions = defaultdict(set)
    sessions_q = (
        select(M.TrainingSession, M.Booking)
        .join(M.Booking, M.TrainingSession.booking_id == M.Booking.id)
        .where(M.Booking.status == content.BK_COMPLETED)
    )
    if start:
        sessions_q = sessions_q.where(M.TrainingSession.created_at >= start)
    import json
    for sess, bk in db.execute(sessions_q).all():
        try:
            items = json.loads(sess.exercises_json or "[]")
        except ValueError:
            items = []
        for it in items:
            part = it.get("part") or "fullbody"
            part_counter[part] += 1
            part_sessions[part].add(bk.id)
    part_frequency = [
        {"part": p, "label": content.PARTS.get(p, p),
         "exercise_count": part_counter.get(p, 0),
         "session_count": len(part_sessions.get(p, set()))}
        for p in content.PARTS
    ]

    # RPE 趋势 (按时间)
    rpe_rows = db.execute(
        select(M.TrainingSession.rpe, M.TrainingSession.created_at, M.Booking.member_id)
        .join(M.Booking, M.TrainingSession.booking_id == M.Booking.id)
        .where(M.TrainingSession.rpe.isnot(None))
        .order_by(M.TrainingSession.created_at)
    ).all()
    if start:
        rpe_rows = [r for r in rpe_rows if r[1] >= start]
    rpe_trend = [
        {"date": r[1].strftime("%m-%d"), "rpe": r[0], "member_id": r[2]} for r in rpe_rows
    ]
    avg_rpe = round(sum(r[0] for r in rpe_rows) / len(rpe_rows), 1) if rpe_rows else None

    return {
        "window_days": days,
        "total_scheduled_slots": len(scheduled),
        "utilized_slots": len(utilized),
        "utilization_rate": utilization,
        "utilization_trend": utilization_trend,
        "booking_status": booking_status,
        "total_members": len(paying),
        "renewed_members": len(renewed),
        "renewal_rate": renewal_rate,
        "new_packages": new_pkg,
        "renewal_packages": renewal_pkg,
        "achieved_goal_count": len(achieved_goals),
        "avg_goal_cycle_days": avg_cycle,
        "active_goal_count": len(active_goals),
        "part_frequency": part_frequency,
        "avg_rpe": avg_rpe,
        "rpe_trend": rpe_trend,
    }


def coach_workbench(coach_id: int, db) -> dict:
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_end = now + timedelta(days=7)

    today_bookings = db.scalars(
        select(M.Booking)
        .join(M.Slot, M.Booking.slot_id == M.Slot.id)
        .where(M.Booking.coach_id == coach_id, M.Booking.status == content.BK_BOOKED,
               M.Slot.start_time >= today_start, M.Slot.start_time < today_start + timedelta(days=1))
        .order_by(M.Slot.start_time)
    ).all()
    upcoming = db.scalars(
        select(M.Booking)
        .join(M.Slot, M.Booking.slot_id == M.Slot.id)
        .where(M.Booking.coach_id == coach_id, M.Booking.status == content.BK_BOOKED,
               M.Slot.start_time >= now, M.Slot.start_time <= week_end)
        .order_by(M.Slot.start_time)
    ).all()

    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_done = db.scalar(
        select(func.count(M.Booking.id)).where(
            M.Booking.coach_id == coach_id, M.Booking.status == content.BK_COMPLETED,
            M.Booking.created_at >= month_start)
    )

    from .serializers import booking_dict, member_dict
    def enrich(b):
        member = db.get(M.User, b.member_id)
        d = booking_dict(b, member=member,
                         profile=member.member_profile if member and member.member_profile else None)
        return d

    return {
        "today": [enrich(b) for b in today_bookings],
        "upcoming": [enrich(b) for b in upcoming],
        "month_completed": month_done,
        "today_count": len(today_bookings),
        "week_count": len(upcoming),
    }
