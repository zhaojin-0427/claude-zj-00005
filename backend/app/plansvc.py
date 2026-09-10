"""周期训练计划领域服务。

包含: 动作解析/匹配、动作完成率与训练量(volume = 组数×次数×负重)计算、
完课执行快照冻结/取消释放/爽约标记的状态流转、计划聚合汇总、
教练工作台逾期与低完成率提醒、统计页周期计划指标聚合。
"""
import json
from collections import Counter, defaultdict
from datetime import datetime, timedelta, date
from sqlalchemy import select
from . import models as M
from . import content


# ---------------------------------------------------------------- 基础计算
def parse_exercises(raw: str | None) -> list[dict]:
    try:
        items = json.loads(raw or "[]")
        return items if isinstance(items, list) else []
    except (ValueError, TypeError):
        return []


def norm_name(name: str) -> str:
    """动作名归一化, 用于计划值与实际值的模糊匹配（去空白/大小写/标点）。"""
    return "".join(ch for ch in (name or "").lower() if ch.strip() and ch not in "（）()/-—·:：")


def reps_count(reps) -> float:
    """把 '8-10' / '12' / '30秒' 之类的次数描述折算为代表次数（取区间均值）。"""
    if isinstance(reps, (int, float)):
        return float(reps)
    import re
    nums = re.findall(r"\d+(?:\.\d+)?", str(reps or ""))
    if not nums:
        return 0.0
    vals = [float(x) for x in nums]
    return sum(vals) / len(vals)


def exercise_volume(ex: dict) -> float:
    """单动作训练量(kg): 组数 × 次数 × 负重; 自重动作负重为 0 时训练量记 0。"""
    try:
        return round(float(ex.get("sets") or 0) * reps_count(ex.get("reps")) * float(ex.get("weight") or 0), 1)
    except (TypeError, ValueError):
        return 0.0


def compute_comparison(planned: list[dict], actual: list[dict]) -> dict:
    """按动作名匹配计划与实际, 产出逐动作偏差、动作完成率和双方总训练量。"""
    # 用队列处理同名动作（计划里两个同名动作也能依次匹配）
    plan_queues: dict[str, list[int]] = defaultdict(list)
    for i, ex in enumerate(planned):
        plan_queues[norm_name(ex.get("name", ""))].append(i)

    rows = [{
        "name": ex.get("name", ""), "part": ex.get("part", ""),
        "planned_sets": ex.get("sets", 0), "planned_reps": str(ex.get("reps", "")),
        "planned_weight": float(ex.get("weight") or 0),
        "planned_volume": exercise_volume(ex),
        "actual_sets": None, "actual_reps": None, "actual_weight": None,
        "actual_volume": None, "done": False,
    } for ex in planned]
    extras: list[dict] = []

    for ex in actual:
        key = norm_name(ex.get("name", ""))
        if plan_queues.get(key):
            idx = plan_queues[key].pop(0)
            row = rows[idx]
            row["actual_sets"] = ex.get("sets", 0)
            row["actual_reps"] = str(ex.get("reps", ""))
            row["actual_weight"] = float(ex.get("weight") or 0)
            row["actual_volume"] = exercise_volume(ex)
            row["done"] = True
        else:
            extras.append({
                "name": ex.get("name", ""), "part": ex.get("part", ""),
                "sets": ex.get("sets", 0), "reps": str(ex.get("reps", "")),
                "weight": float(ex.get("weight") or 0), "volume": exercise_volume(ex),
            })

    matched = sum(1 for r in rows if r["done"])
    completion = round(100 * matched / len(rows), 1) if rows else 100.0
    planned_volume = round(sum(r["planned_volume"] for r in rows), 1)
    actual_volume = round(sum((r["actual_volume"] or 0) for r in rows)
                          + sum(e["volume"] for e in extras), 1)
    return {
        "rows": rows, "extras": extras,
        "completion_rate": completion,
        "planned_count": len(rows), "matched_count": matched,
        "planned_volume": planned_volume, "actual_volume": actual_volume,
    }


# ---------------------------------------------------------------- 状态流转
def snapshot_completed_unit(unit: "M.PlanUnit", session: "M.TrainingSession",
                            snap_time: datetime | None = None) -> dict:
    """完课: 冻结计划/实际快照, 计算动作完成率与总训练量。

    snap_time 默认为当前时刻; 回填历史课程时应传实际完课时间。
    """
    planned = parse_exercises(unit.planned_exercises_json)
    actual = parse_exercises(session.exercises_json)
    cmp_ = compute_comparison(planned, actual)
    unit.status = content.UNIT_COMPLETED
    unit.snapshot_at = snap_time or datetime.now()
    unit.actual_exercises_json = session.exercises_json
    unit.actual_rpe = session.rpe
    unit.completion_rate = cmp_["completion_rate"]
    unit.planned_volume = cmp_["planned_volume"]
    unit.actual_volume = cmp_["actual_volume"]
    return cmp_


def release_unit(unit: "M.PlanUnit", now: datetime | None = None):
    """取消预约: 释放训练单元; 已过计划日期的记为逾期未安排, 清空执行快照。"""
    today = (now or datetime.now()).date()
    unit.booking_id = None
    unit.status = content.UNIT_MISSED if unit.scheduled_date < today else content.UNIT_UNSCHEDULED
    unit.snapshot_at = None
    unit.actual_exercises_json = None
    unit.actual_rpe = None
    unit.completion_rate = None
    unit.planned_volume = None
    unit.actual_volume = None


def mark_unit_no_show(unit: "M.PlanUnit", now: datetime | None = None):
    """爽约: 计入计划消耗, 实际完成率/训练量为 0, 但保留计划量快照。"""
    planned = parse_exercises(unit.planned_exercises_json)
    unit.status = content.UNIT_NO_SHOW
    unit.snapshot_at = now or datetime.now()
    unit.actual_exercises_json = "[]"
    unit.actual_rpe = None
    unit.completion_rate = 0.0
    unit.planned_volume = round(sum(exercise_volume(e) for e in planned), 1)
    unit.actual_volume = 0.0


# ---------------------------------------------------------------- 计划汇总
def plan_summary(plan: "M.CyclePlan", now: datetime | None = None) -> dict:
    now = now or datetime.now()
    today = now.date()
    units = plan.units
    total = len(units)
    counts = Counter(u.status for u in units)
    done = counts.get(content.UNIT_COMPLETED, 0)
    no_show = counts.get(content.UNIT_NO_SHOW, 0)
    missed = counts.get(content.UNIT_MISSED, 0)
    booked = counts.get(content.UNIT_BOOKED, 0)
    # 逾期: 计划日期已过但仍未完成（含 missed 与尚未补约的 unscheduled）
    overdue = sum(1 for u in units
                  if u.status in (content.UNIT_UNSCHEDULED, content.UNIT_MISSED)
                  and u.scheduled_date < today)

    # 到期执行率: 分母为「截至今天应执行」的单元（计划日期<=今天，含已完课/爽约/逾期/今日待上），
    # 不含未来才到期的单元，避免未来未安排单元稀释执行率。
    due_units = [u for u in units if u.scheduled_date <= today]
    due_count = len(due_units)
    completion_rate = round(100 * done / due_count, 1) if due_count else None

    if plan.status == content.PLAN_DRAFT:
        state, state_cls = "draft", "草稿"
    elif plan.status == content.PLAN_ARCHIVED:
        state, state_cls = "archived", "已归档"
    elif done == 0 and booked == 0:
        state, state_cls = "not_started", "未开始"
    elif total > 0 and done == total:
        state, state_cls = "finished", "已完成"
    else:
        state, state_cls = "in_progress", "进行中"

    completed_units = [u for u in units if u.status == content.UNIT_COMPLETED]
    avg_completion = round(
        sum(u.completion_rate for u in completed_units if u.completion_rate is not None)
        / len(completed_units), 1) if completed_units else None
    planned_vol = round(sum(u.planned_volume or 0 for u in completed_units), 1)
    actual_vol = round(sum(u.actual_volume or 0 for u in completed_units), 1)

    cur_week = None
    if plan.start_date and plan.weeks:
        cur_week = max(1, min(plan.weeks, ((today - plan.start_date).days // 7) + 1))

    return {
        "total_units": total,
        "due_units": due_count,
        "completed_units": done,
        "booked_units": booked,
        "unscheduled_units": counts.get(content.UNIT_UNSCHEDULED, 0),
        "no_show_units": no_show,
        "missed_units": missed,
        "overdue_units": overdue,
        "completion_rate": completion_rate,
        "avg_exercise_completion": avg_completion,
        "planned_volume": planned_vol,
        "actual_volume": actual_vol,
        "current_week": cur_week,
        "state": state, "state_label": state_cls,
    }


# ---------------------------------------------------------------- 教练提醒
def coach_plan_alerts(coach_id: int, db, now: datetime | None = None) -> dict:
    """逾期未安排单元 + 低完成率周期计划提醒。"""
    now = now or datetime.now()
    today = now.date()
    plans = [p for p in db.scalars(
        select(M.CyclePlan).where(M.CyclePlan.coach_id == coach_id,
                                  M.CyclePlan.status == content.PLAN_PUBLISHED)
    ).all()]

    overdue = []
    for p in plans:
        member = db.get(M.User, p.member_id)
        for u in p.units:
            if u.status in (content.UNIT_UNSCHEDULED, content.UNIT_MISSED) and u.scheduled_date < today:
                overdue.append({
                    "plan_id": p.id, "unit_id": u.id, "member_id": p.member_id,
                    "member_name": member.full_name if member else "—",
                    "plan_name": p.name, "unit_title": u.title or f"第{u.week_no}周训练",
                    "scheduled_date": u.scheduled_date,
                    "days_overdue": (today - u.scheduled_date).days,
                })
    overdue.sort(key=lambda x: x["scheduled_date"])

    low_rate = []
    for p in plans:
        s = plan_summary(p, now)
        due_count = s["due_units"]
        rate = s["completion_rate"]
        # 至少有 3 个应执行单元且到期执行率低于阈值才提醒（未来单元不计入分母）
        if due_count >= 3 and rate is not None and rate < content.LOW_COMPLETION_THRESHOLD:
            member = db.get(M.User, p.member_id)
            low_rate.append({
                "plan_id": p.id, "member_id": p.member_id,
                "member_name": member.full_name if member else "—",
                "plan_name": p.name, "weeks": p.weeks,
                "completion_rate": rate,
                "completed_units": s["completed_units"],
                "due_units": due_count,
                "total_units": s["total_units"],
                "avg_exercise_completion": s["avg_exercise_completion"],
            })
    low_rate.sort(key=lambda x: x["completion_rate"])
    return {"overdue_units": overdue, "low_completion_plans": low_rate}


# ---------------------------------------------------------------- 统计页
def plan_dashboard_stats(db, days: int | None = 90, now: datetime | None = None) -> dict:
    """周期计划完成率 / 爽约率 / 训练量趋势（与 30/90/180 天窗口联动）。"""
    now = now or datetime.now()
    today = now.date()
    start = (now - timedelta(days=days)).date() if days else None

    plans = db.scalars(
        select(M.CyclePlan).where(M.CyclePlan.status == content.PLAN_PUBLISHED)
    ).all()
    units = [u for p in plans for u in p.units]

    def in_window(d: date | None) -> bool:
        return start is None or (d and d >= start)

    # 窗口内到期（计划日期落在窗口且不晚于今天）的单元
    due = [u for u in units if in_window(u.scheduled_date) and u.scheduled_date <= today]
    completed = [u for u in due if u.status == content.UNIT_COMPLETED]
    no_shows = [u for u in due if u.status == content.UNIT_NO_SHOW]
    missed = [u for u in due if u.status == content.UNIT_MISSED]
    completion_rate = round(100 * len(completed) / len(due), 1) if due else 0.0

    # 周期计划爽约率: 窗口内已开课（完课+爽约）的关联预约中爽约占比, 以实际开课日为准
    linked = [u for u in units if u.booking_id and u.booking
              and u.booking.slot and in_window(u.booking.slot.start_time.date())
              and u.booking.slot.start_time <= now
              and u.booking.status in (content.BK_COMPLETED, content.BK_NO_SHOW)]
    linked_ns = [u for u in linked if u.booking.status == content.BK_NO_SHOW]
    no_show_rate = round(100 * len(linked_ns) / len(linked), 1) if linked else 0.0

    # 训练量趋势: 按实际上课日汇总完课单元的实际总训练量(kg)
    vol_map: dict[str, float] = defaultdict(float)
    plan_vol_map: dict[str, float] = defaultdict(float)
    for u in completed:
        key = u.booking.slot.start_time.strftime("%m-%d")
        vol_map[key] += u.actual_volume or 0
        plan_vol_map[key] += u.planned_volume or 0
    volume_trend = [
        {"date": k, "actual_volume": round(vol_map[k], 1),
         "planned_volume": round(plan_vol_map[k], 1)}
        for k in sorted(vol_map.keys())
    ]
    total_actual_volume = round(sum(u.actual_volume or 0 for u in completed), 1)
    total_planned_volume = round(sum(u.planned_volume or 0 for u in completed), 1)

    return {
        "cycle_plan_count": len(plans),
        "due_units": len(due),
        "completed_plan_units": len(completed),
        "no_show_plan_units": len(no_shows),
        "missed_plan_units": len(missed),
        "plan_completion_rate": completion_rate,
        "plan_no_show_rate": no_show_rate,
        "plan_planned_volume": total_planned_volume,
        "plan_actual_volume": total_actual_volume,
        "plan_volume_trend": volume_trend,
    }


def member_overdue_alert(member_id: int, db, now: datetime | None = None) -> dict | None:
    """会员侧提醒: 有逾期未安排的周期训练单元。"""
    now = now or datetime.now()
    today = now.date()
    plans = db.scalars(
        select(M.CyclePlan).where(M.CyclePlan.member_id == member_id,
                                  M.CyclePlan.status == content.PLAN_PUBLISHED)
    ).all()
    overdue = [u for p in plans for u in p.units
               if u.status in (content.UNIT_UNSCHEDULED, content.UNIT_MISSED)
               and u.scheduled_date < today]
    upcoming = [u for p in plans for u in p.units
                if u.status == content.UNIT_UNSCHEDULED and u.scheduled_date >= today]
    if not overdue:
        return None
    return {
        "type": "plan_overdue",
        "count": len(overdue),
        "upcoming_count": len(upcoming),
        "message": f"周期训练计划有 {len(overdue)} 个训练单元已逾期未约课，请尽快在约课台关联安排",
    }
