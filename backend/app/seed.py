"""Deterministic demo data: members, coaches, venues, ~10 weeks of history."""
import json
import random
from datetime import datetime, timedelta, date, time
from sqlalchemy import select, func
from .database import Base, engine
from . import models as M
from .security import hash_password
from . import content

rng = random.Random(20260910)

TODAY = date(2026, 9, 10)
NOW = datetime.combine(TODAY, time(10, 0))

MEMBER_PLANS = [
    # username, name, gender, goal, parts, weight curve(start, end), fat curve
    ("zhangwei", "张伟", "M", "fat_loss", ["fullbody", "core"], (88.0, 80.6), (30.0, 25.8)),
    ("lina", "李娜", "F", "shaping", ["glutes", "core", "legs"], (62.5, 58.2), (28.0, 24.1)),
    ("wangqiang", "王强", "M", "muscle_gain", ["chest", "back", "arms"], (70.0, 76.4), (18.0, 15.5)),
    ("chenjing", "陈静", "F", "fat_loss", ["legs", "core"], (71.0, 67.8), (31.5, 28.6)),
    ("zhaolei", "赵磊", "M", "strength", ["back", "legs", "shoulder"], (82.0, 84.5), (20.0, 17.2)),
    ("sunli", "孙丽", "F", "conditioning", ["fullbody", "core"], (58.0, 55.8), (24.0, 21.5)),
    ("zhoubo", "周博", "M", "muscle_gain", ["chest", "shoulder", "arms"], (65.0, 69.2), (16.0, 13.8)),
    ("wuyun", "吴芸", "F", "rehab", ["back", "core"], (60.0, 58.5), (26.0, 24.5)),
]

COACHES = [
    ("coach_liu", "刘教练", "资深力量教练", "力量举/增肌", 8),
    ("coach_yang", "杨教练", "减脂塑形专家", "减脂/团课编排", 6),
    ("coach_he", "何教练", "功能性训练师", "体能/康复训练", 5),
    ("coach_tang", "唐教练", "健美教练", "健美/形体管理", 7),
]

NEXT_FOCUS_BANK = [
    "下次重点强化离心控制，卧推下放节奏3秒",
    "臀推尝试加5kg测试组，注意核心收紧",
    "增加核心抗旋转训练，死虫式每组15次",
    "深蹲注意膝盖轨迹，下次先做弹力带热身",
    "有氧延长到25分钟，心率维持在130-145区间",
    "划船加强背部挤压感，顶峰停留1秒",
    "下次评估肩屈活动度，如改善再上推举重量",
    "硬拉重量维持，先打磨臀位与启动张力",
    "加入单腿训练，弥补左右侧力量差",
    "注意蛋白质摄入，下次课反馈饮食记录",
]

LIMITATIONS_BANK = {
    "zhangwei": "右膝旧伤，避免深蹲低于水平；有氧以低冲击为主",
    "lina": "腰椎轻度不适，避免负重躬身动作",
    "wangqiang": "无明显限制",
    "chenjing": "脚踝活动度受限，深蹲需垫高脚跟",
    "zhaolei": "左肩有弹响，推举前需充分热身",
    "sunli": "哮喘史，高强度间歇注意呼吸节奏",
    "zhoubo": "手腕旧伤，大重量推举使用护腕",
    "wuyun": "腰突恢复期，禁止脊柱负重屈曲，以稳定训练为主",
}


def seed_if_empty(db):
    if db.scalar(select(func.count(M.User.id))) > 0:
        return

    # ---- users ----
    admin = M.User(username="admin", full_name="前台管理员", role="admin",
                   phone="13800000000", password_hash=hash_password("admin123"))
    db.add(admin)

    coach_users = []
    for uname, name, title, spec, yrs in COACHES:
        u = M.User(username=uname, full_name=name, role="coach",
                   phone=f"139{len(coach_users)}000{len(coach_users)}11",
                   password_hash=hash_password("coach123"))
        db.add(u)
        db.flush()
        db.add(M.Coach(user_id=u.id, title=title, specialty=spec,
                       years_exp=yrs, rating=round(rng.uniform(4.5, 5.0), 1)))
        coach_users.append(u)

    member_users = []
    for idx, (uname, name, gender, goal, parts, w_curve, f_curve) in enumerate(MEMBER_PLANS):
        u = M.User(username=uname, full_name=name, role="member",
                   phone=f"137{idx:02d}22{idx:02d}334",
                   password_hash=hash_password("member123"))
        db.add(u)
        db.flush()
        birth = date(1988 + idx * 2, (idx % 12) + 1, (idx % 27) + 1)
        profile = M.MemberProfile(
            user_id=u.id, gender=gender, birth_date=birth,
            height_cm=178 if gender == "M" else 165,
            goal_focus=goal, limitations=LIMITATIONS_BANK[uname],
            injuries="右膝旧伤" if uname == "zhangwei" else ("腰突恢复期" if uname == "wuyun" else ""),
            preferred_parts=",".join(parts),
            joined_at=NOW - timedelta(days=80),
        )
        db.add(profile)
        db.flush()
        db.refresh(u)
        # 课包: 首单 + 部分会员续约
        db.add(M.Package(member_id=u.id, total_sessions=12, remaining=0,
                         price=3600, purchased_at=NOW - timedelta(days=78)))
        renewed_remaining = {0: 6, 1: 9, 2: 11, 4: 4, 6: 2}
        if idx in renewed_remaining:
            profile.renewal_count = 1
            db.add(M.Package(member_id=u.id, total_sessions=24,
                             remaining=renewed_remaining[idx],
                             price=6480, purchased_at=NOW - timedelta(days=20 - idx)))
        else:
            # 未续约会员补一点剩余课时用于约课
            db.add(M.Package(member_id=u.id, total_sessions=10, remaining=5,
                             price=3000, purchased_at=NOW - timedelta(days=40)))
        member_users.append((u, goal, parts, w_curve, f_curve))
    db.flush()

    # ---- venues ----
    venues = [
        M.Venue(name="自由重量区", kind="area", capacity=8, note="深蹲架/卧推架"),
        M.Venue(name="固定器械区", kind="area", capacity=12, note="单功能力量器械"),
        M.Venue(name="功能性训练区", kind="area", capacity=6, note="壶铃/战绳/雪橇"),
        M.Venue(name="一号团课教室", kind="room", capacity=20, note="瑜伽/普拉提"),
        M.Venue(name="体测室", kind="room", capacity=2, note="体脂仪/体态评估"),
    ]
    db.add_all(venues)
    db.flush()

    # ---- plan templates ----
    for i, (tname, goal, part) in enumerate([
        ("减脂全身循环A计划", "fat_loss", "fullbody"),
        ("胸背增肌分化模板", "muscle_gain", "chest"),
        ("翘臀塑形模板", "shaping", "glutes"),
        ("下肢力量进阶模板", "strength", "legs"),
        ("核心康复稳定模板", "rehab", "core"),
        ("体能间歇燃脂模板", "conditioning", "fullbody"),
    ]):
        exs = []
        for name2, variant, base_w in content.EXERCISE_LIBRARY[part][:4]:
            exs.append({"name": name2, "part": part, "sets": 3 + i % 2,
                        "reps": rng.choice(["8-10", "10-12", "12-15"]),
                        "weight": base_w, "note": variant})
        db.add(M.PlanTemplate(
            name=tname, goal=goal, primary_part=part,
            level=["beginner", "intermediate", "advanced"][i % 3],
            description=f"面向{content.GOALS[goal]}人群的{content.PARTS[part]}训练模板，约课时可一键套用。",
            exercises_json=json.dumps(exs, ensure_ascii=False), created_by=coach_users[i % 4].id,
        ))
    db.flush()

    # ---- measurements (9 weeks of weekly measurements) ----
    member_goals = {}
    for (u, goal, parts, (w0, w1), (f0, f1)) in member_users:
        points = 9
        for k in range(points):
            frac = k / (points - 1)
            noise = rng.uniform(-0.3, 0.3)
            weight = round(w0 + (w1 - w0) * frac + noise, 1)
            fat = round(f0 + (f1 - f0) * frac + rng.uniform(-0.25, 0.25), 1)
            mm = round(max(35, weight * (0.42 if u.member_profile.gender == "M" else 0.32))
                       + (rng.uniform(0.2, 0.9) if "gain" in goal or goal == "strength" else 0) * k / 2, 1)
            measured = NOW - timedelta(days=(points - 1 - k) * 7)
            db.add(M.BodyMeasurement(
                member_id=u.id, measured_at=measured,
                weight=weight, body_fat_pct=fat, muscle_mass=mm,
                resting_hr=70 - int(k * (0.8 if goal == "conditioning" else 0.3)) + rng.choice([-1, 0, 1]),
                systolic=118 + rng.choice([-2, 0, 2]), diastolic=76 + rng.choice([-2, 0, 2]),
                waist=round(weight * 0.82 - k * 0.3, 1), hip=round(weight * 0.95 - k * 0.15, 1),
                note=("阶段体测" if k in (0, 4, 8) else ""),
            ))
        db.flush()

        # ---- goals ----
        goals = []
        if goal in ("fat_loss", "shaping", "conditioning"):
            goals.append(M.Goal(member_id=u.id, title=f"体重降至 {w1:.0f}kg",
                                metric="weight", target_value=w1, direction="down",
                                start_value=w0, start_at=NOW - timedelta(days=56)))
            goals.append(M.Goal(member_id=u.id, title=f"体脂率降到 {f1:.0f}%",
                                metric="body_fat_pct", target_value=f1, direction="down",
                                start_value=f0, start_at=NOW - timedelta(days=56)))
        elif goal == "rehab":
            goals.append(M.Goal(member_id=u.id, title="腰围减到 80cm",
                                metric="waist", target_value=round(w1 * 0.82, 1), direction="down",
                                start_value=round(w0 * 0.82, 1), start_at=NOW - timedelta(days=56)))
        else:
            goals.append(M.Goal(member_id=u.id, title=f"体重增至 {w1:.0f}kg",
                                metric="weight", target_value=w1, direction="up",
                                start_value=w0, start_at=NOW - timedelta(days=56)))
            goals.append(M.Goal(member_id=u.id, title=f"肌肉量提升至 {round(w1*0.42,1)}kg",
                                metric="muscle_mass",
                                target_value=round(w1 * (0.42 if u.member_profile.gender == "M" else 0.32), 1),
                                direction="up", start_value=round(w0 * 0.42, 1),
                                start_at=NOW - timedelta(days=56)))
        # 一半目标已达成(在前几个会员上), 其余进行中
        for gi, g in enumerate(goals):
            if (u.id % 2 == 0) or gi == 1 and u.id % 3 == 0:
                g.achieved = True
                g.achieved_at = NOW - timedelta(days=rng.randint(3, 18))
        member_goals[u.id] = goals
        db.add_all(goals)
    db.flush()

    # ---- slots + bookings over history & future ----
    templates = db.scalars(select(M.PlanTemplate)).all()
    tmpl_by_goal = {}
    for t in templates:
        tmpl_by_goal.setdefault(t.goal, t)

    def make_slot(coach, day, hour, venue):
        start = datetime.combine(day, time(hour, 0))
        return M.Slot(coach_id=coach.id, venue_id=venue.id, start_time=start,
                      end_time=start + timedelta(hours=1), status=content.SLOT_OPEN)

    hist_days = [TODAY - timedelta(days=d) for d in range(1, 64)]
    future_days = [TODAY + timedelta(days=d) for d in range(0, 14)]

    session_seq = 0
    for day in hist_days:
        if day.weekday() == 6:  # 周日休息
            continue
        # 每天 4-7 个历史时段
        hours = rng.sample([9, 10, 11, 14, 15, 16, 18, 19, 20], k=rng.randint(4, 7))
        for hour in sorted(hours):
            coach = coach_users[rng.randrange(len(coach_users))]
            venue = venues[rng.randrange(3)]  # 历史课都在器械/功能区
            slot = make_slot(coach, day, hour, venue)
            db.add(slot)
            db.flush()
            roll = rng.random()
            if roll < 0.72:  # 完成
                u, goal, parts, _, _ = member_users[rng.randrange(len(member_users))]
                slot.status = content.SLOT_COMPLETED
                b = M.Booking(member_id=u.id, coach_id=coach.id, slot_id=slot.id,
                              status=content.BK_COMPLETED, goal=goal,
                              focus_parts=",".join(parts[:2]),
                              limitations=LIMITATIONS_BANK[u.username],
                              template_id=tmpl_by_goal.get(goal).id if tmpl_by_goal.get(goal) else None,
                              created_at=slot.start_time - timedelta(days=1))
                db.add(b)
                db.flush()
                # exercises with progressive load over sessions
                exs = []
                part = rng.choice(parts)
                for name2, variant, base_w in content.EXERCISE_LIBRARY[part]:
                    progress = session_seq * 0.35 + rng.uniform(-1.5, 2.5)
                    exs.append({
                        "name": name2, "part": part, "sets": rng.choice([3, 3, 4]),
                        "reps": rng.choice(["8-10", "10-12", "12", "6-8"]),
                        "weight": round(max(0, base_w + progress), 1), "note": variant,
                    })
                prev_focus = NEXT_FOCUS_BANK[(session_seq - 1) % len(NEXT_FOCUS_BANK)] if session_seq else ""
                db.add(M.TrainingSession(
                    booking_id=b.id, duration_min=60,
                    warmup=rng.choice(["跑步机5分钟+动态拉伸", "划船机400米+肩袖激活",
                                       "椭圆机6分钟+髋部灵活性激活"]),
                    exercises_json=json.dumps(exs, ensure_ascii=False),
                    rpe=rng.choice([6, 7, 7, 8, 8, 9]),
                    summary=rng.choice([
                        "动作完成质量高，核心稳定性有进步", "后半程力量下降明显，注意碳水补充",
                        "负荷适应良好，下次可递增", "左侧仍偏弱，已加单腿辅助组"]),
                    leftover=prev_focus,
                    next_focus=NEXT_FOCUS_BANK[session_seq % len(NEXT_FOCUS_BANK)],
                    created_at=slot.start_time,
                ))
                session_seq += 1
            elif roll < 0.82:  # 爽约
                u, goal, parts, _, _ = member_users[rng.randrange(len(member_users))]
                slot.status = content.SLOT_COMPLETED
                db.add(M.Booking(member_id=u.id, coach_id=coach.id, slot_id=slot.id,
                                 status=content.BK_NO_SHOW, goal=goal,
                                 focus_parts=",".join(parts[:2]),
                                 limitations=LIMITATIONS_BANK[u.username],
                                 created_at=slot.start_time - timedelta(hours=5)))
            elif roll < 0.90:  # 取消 -> 时段释放后无人再约
                slot.status = content.SLOT_OPEN
                u, goal, parts, _, _ = member_users[rng.randrange(len(member_users))]
                db.add(M.Booking(member_id=u.id, coach_id=coach.id, slot_id=slot.id,
                                 status=content.BK_CANCELED, goal=goal,
                                 focus_parts=",".join(parts[:2]),
                                 canceled_at=slot.start_time - timedelta(hours=8),
                                 created_at=slot.start_time - timedelta(days=2)))
                db.flush()
                # canceled booking's slot stays open in reality
                slot.status = content.SLOT_OPEN
            else:
                slot.status = content.SLOT_OPEN  # 闲置时段

    # ---- future slots: some open, some already booked ----
    future_bookings = []
    for day in future_days:
        if day.weekday() == 6:
            continue
        hours = rng.sample([9, 10, 11, 14, 15, 16, 18, 19], k=rng.randint(4, 6))
        for hour in sorted(hours):
            coach = coach_users[rng.randrange(len(coach_users))]
            venue = venues[rng.randrange(4)]
            slot = make_slot(coach, day, hour, venue)
            db.add(slot)
            db.flush()
            if rng.random() < 0.45:
                u, goal, parts, _, _ = member_users[rng.randrange(len(member_users))]
                slot.status = content.SLOT_BOOKED
                b = M.Booking(member_id=u.id, coach_id=coach.id, slot_id=slot.id,
                              status=content.BK_BOOKED, goal=goal,
                              focus_parts=",".join(parts[:2]),
                              limitations=LIMITATIONS_BANK[u.username],
                              template_id=tmpl_by_goal.get(goal).id if tmpl_by_goal.get(goal) else None,
                              created_at=NOW - timedelta(hours=rng.randint(1, 30)))
                db.add(b)
                future_bookings.append(b)

    # 给每个会员安排一节"今天"的待上课, 方便演示工作台/课前简报
    today_booked_slot_ids = set()
    for i, ((u, goal, parts, _, _)) in enumerate(member_users[:6]):
        coach = coach_users[i % 4]
        venue = venues[i % 3]
        hour = [9, 10, 11, 14, 16, 19][i]
        start = datetime.combine(TODAY, time(hour, 0))
        slot = M.Slot(coach_id=coach.id, venue_id=venue.id, start_time=start,
                      end_time=start + timedelta(hours=1), status=content.SLOT_BOOKED)
        db.add(slot)
        db.flush()
        db.add(M.Booking(member_id=u.id, coach_id=coach.id, slot_id=slot.id,
                         status=content.BK_BOOKED, goal=goal,
                         focus_parts=",".join(parts[:2]),
                         limitations=LIMITATIONS_BANK[u.username],
                         template_id=tmpl_by_goal.get(goal).id if tmpl_by_goal.get(goal) else None,
                         created_at=NOW - timedelta(hours=2)))

    db.commit()
