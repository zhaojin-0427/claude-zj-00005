"""Deterministic demo data: members, coaches, venues, ~10 weeks of history."""
import json
import random
from collections import defaultdict
from datetime import datetime, timedelta, date, time
from sqlalchemy import select, func
from .database import Base, engine
from . import models as M
from . import content, plansvc
from .security import hash_password

rng = random.Random(20260910)

# 以服务器当前墙钟时间为锚点, 保证"今日/明日"演示数据与真实时间对齐
NOW = datetime.now().replace(minute=0, second=0, microsecond=0)
TODAY = NOW.date()

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
        # 课包在全部预约生成后按实际占用创建(见文件末尾), 保证 剩余=课包-已占用
        renewed_members = {0, 1, 2, 4, 6}
        if idx in renewed_members:
            profile.renewal_count = 1
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

    # 每位会员被占用的课时(已完成+爽约+待上课); 取消不占用
    occupied: dict[int, int] = defaultdict(int)
    # 周期计划种子用: 每位会员的完课记录 (booking, slot, actual_exs, part)
    completed_by_member: dict[int, list] = defaultdict(list)
    # 周期计划种子用: 爽约记录 (booking, slot, goal, parts)
    noshow_by_member: dict[int, list] = defaultdict(list)

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
                occupied[u.id] += 1
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
                completed_by_member[u.id].append((b, slot, exs, part))
                session_seq += 1
            elif roll < 0.82:  # 爽约(计入排课与课耗, 但不计入课时利用)
                u, goal, parts, _, _ = member_users[rng.randrange(len(member_users))]
                occupied[u.id] += 1
                slot.status = content.SLOT_NO_SHOW
                b = M.Booking(member_id=u.id, coach_id=coach.id, slot_id=slot.id,
                                 status=content.BK_NO_SHOW, goal=goal,
                                 focus_parts=",".join(parts[:2]),
                                 limitations=LIMITATIONS_BANK[u.username],
                                 created_at=slot.start_time - timedelta(hours=5))
                db.add(b)
                db.flush()
                noshow_by_member[u.id].append((b, slot, goal, parts))
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
                occupied[u.id] += 1
                slot.status = content.SLOT_BOOKED
                b = M.Booking(member_id=u.id, coach_id=coach.id, slot_id=slot.id,
                              status=content.BK_BOOKED, goal=goal,
                              focus_parts=",".join(parts[:2]),
                              limitations=LIMITATIONS_BANK[u.username],
                              template_id=tmpl_by_goal.get(goal).id if tmpl_by_goal.get(goal) else None,
                              created_at=NOW - timedelta(hours=rng.randint(1, 30)))
                db.add(b)
                future_bookings.append(b)

    # 给前6个会员各安排一节"今天"的课(固定演示钟点),
    # 开课后的时段可演示课后登记/爽约, 未来时段可演示约课/取消/课前简报
    demo_hours = [9, 10, 11, 14, 16, 19]
    for i, ((u, goal, parts, _, _)) in enumerate(member_users[:6]):
        occupied[u.id] += 1
        coach = coach_users[i % 4]
        venue = venues[i % 3]
        start = datetime.combine(TODAY, time(demo_hours[i], 0))
        slot = M.Slot(coach_id=coach.id, venue_id=venue.id, start_time=start,
                      end_time=start + timedelta(hours=1), status=content.SLOT_BOOKED)
        db.add(slot)
        db.flush()
        db.add(M.Booking(member_id=u.id, coach_id=coach.id, slot_id=slot.id,
                         status=content.BK_BOOKED, goal=goal,
                         focus_parts=",".join(parts[:2]),
                         limitations=LIMITATIONS_BANK[u.username],
                         template_id=tmpl_by_goal.get(goal).id if tmpl_by_goal.get(goal) else None,
                         created_at=min(NOW - timedelta(hours=2), start - timedelta(hours=2))))

    # ---- 课包: 按实际占用(已完成+爽约+待上课)生成, 恒等: 课包总量-占用=剩余 ----
    for (u, _goal, _parts, _, _) in member_users:
        used = occupied.get(u.id, 0)
        buffer = rng.randint(2, 7)  # 占用之外的可用余量
        if u.member_profile.renewal_count > 0:
            # 二次购课: 24节续约包, 其中 (24-buffer) 节已在历史中消耗
            renew_consumed = 24 - buffer
            first_total = max(0, used - renew_consumed)  # 首包全部消耗完
            if first_total > 0:
                db.add(M.Package(member_id=u.id, total_sessions=first_total, remaining=0,
                                 price=300 * first_total, purchased_at=NOW - timedelta(days=78)))
            db.add(M.Package(member_id=u.id, total_sessions=24, remaining=buffer,
                             price=6480, purchased_at=NOW - timedelta(days=rng.randint(10, 35))))
        else:
            # 仅首包: 总量=占用+余量, 剩余=buffer
            total_first = used + buffer
            db.add(M.Package(member_id=u.id, total_sessions=total_first, remaining=buffer,
                             price=300 * total_first, purchased_at=NOW - timedelta(days=78)))

    # ---- 周期训练计划: 4 名会员各一份 8 周计划 ----
    _seed_cycle_plans(db, member_users, templates, tmpl_by_goal, coach_users,
                      completed_by_member, noshow_by_member, venues)

    db.commit()


def _seed_cycle_plans(db, member_users, templates, tmpl_by_goal, coach_users,
                      completed_by_member, noshow_by_member, venues):
    """为 4 名演示会员生成 8 周周期计划并挂载已完课/爽约/未安排单元。"""
    def tpl_exercises(tpl):
        try:
            return json.loads(tpl.exercises_json or "[]")
        except ValueError:
            return []

    def planned_from(actual_exs, goal, parts):
        """根据实际动作构造计划动作（负重略低, 演示训练量差值）。"""
        planned = [{
            "name": e["name"], "part": e["part"],
            "sets": e["sets"], "reps": e["reps"],
            "weight": round(max(0, e["weight"] - rng.choice([0, 2.5, 5])), 1),
            "note": e.get("note", ""),
        } for e in actual_exs]
        return planned

    def planned_with_gap(actual_exs, goal, parts):
        """在实际动作基础上补一个实际未完成的计划动作, 制造完成率 <100% 的偏差。"""
        planned = planned_from(actual_exs, goal, parts)
        done_names = {plansvc.norm_name(e["name"]) for e in actual_exs}
        gap_part = rng.choice(parts)
        for name2, variant, base_w in content.EXERCISE_LIBRARY.get(gap_part, []):
            if plansvc.norm_name(name2) not in done_names:
                planned.append({"name": name2, "part": gap_part, "sets": 3,
                                "reps": "10-12", "weight": base_w,
                                "note": f"{variant}（计划补充，当次未完成）"})
                break
        return planned

    # username -> (计划名, 未来已约单元数, 未来未安排单元数, 纯逾期未安排数)
    # 张伟按到期口径 10/13≈76.9%（不误报低完成率）；陈静漏训较多用于演示低完成率提醒
    plan_specs = {
        "zhangwei": ("减脂周期训练计划（8周）", 2, 2, 2),
        "wangqiang": ("增肌周期训练计划（8周）", 1, 2, 1),
        "lina": ("翘臀塑形周期计划（8周）", 1, 1, 1),
        "chenjing": ("下肢燃脂周期计划（8周）", 0, 2, 6),
    }
    weeks = 8
    start_date = TODAY - timedelta(days=int(TODAY.weekday()) + 7 * (weeks - 3))

    for (u, goal, parts, _, _) in member_users:
        spec = plan_specs.get(u.username)
        if not spec:
            continue
        plan_name, future_booked_n, future_unsched_n, missed_n = spec
        tpl = tmpl_by_goal.get(goal) or templates[0]
        coach_id = None
        done = sorted(completed_by_member.get(u.id, []), key=lambda x: x[1].start_time)
        if done:
            coach_id = done[-1][0].coach_id
        else:
            ns = noshow_by_member.get(u.id, [])
            coach_id = ns[-1][0].coach_id if ns else coach_users[hash(u.username) % 4].id

        end_date = start_date + timedelta(days=weeks * 7 - 1)
        plan = M.CyclePlan(
            member_id=u.id, coach_id=coach_id, template_id=tpl.id,
            name=plan_name, goal=goal, weeks=weeks,
            start_date=start_date, end_date=end_date,
            note="周期内按周编排训练单元，完课后自动保存执行快照并复盘动作完成率与训练量。",
            status=content.PLAN_PUBLISHED, published_at=NOW - timedelta(days=35),
            created_at=NOW - timedelta(days=36),
        )
        db.add(plan)
        db.flush()

        def make_unit(week_no, day, title, unit_goal, fparts, planned, note=""):
            return M.PlanUnit(
                plan_id=plan.id, week_no=week_no, weekday=day.weekday(),
                scheduled_date=day, title=title, goal=unit_goal,
                focus_parts=",".join(fparts),
                planned_exercises_json=json.dumps(planned, ensure_ascii=False),
                planned_note=note, status=content.UNIT_UNSCHEDULED,
            )

        # 1) 已完课单元: 挂载计划周期内的完课记录
        # 陈静只挂前 7 节、留较多逾期未排, 用于演示低完成率提醒; 其余会员挂全部在周期内的完课
        in_range = [row for row in done if start_date <= row[1].start_time.date() <= TODAY]
        target_done = 7 if u.username == "chenjing" else len(in_range)
        picked_done = in_range[:target_done]
        used_dates = set()
        for idx, (bk, sl, actual_exs, part) in enumerate(picked_done):
            day = sl.start_time.date()
            used_dates.add(day)
            # 部分单元多安排一个当次未执行的动作, 制造动作完成率 <100% 的偏差演示
            if idx % 3 == 1:
                planned = planned_with_gap(actual_exs, goal, parts)
            else:
                planned = planned_from(actual_exs, goal, parts)
            wn = max(1, min(weeks, (day - start_date).days // 7 + 1))
            unit = make_unit(wn, day, f"第{wn}周·{content.PARTS.get(part, '训练')}",
                             goal, [part], planned,
                             note=rng.choice(["控制离心节奏", "组间休息90秒", "注意核心收紧", ""]))
            db.add(unit)
            db.flush()
            unit.booking_id = bk.id
            # 快照时间使用实际完课时间，回填的历史课程不会显示为"今天冻结"
            plansvc.snapshot_completed_unit(unit, bk.session, snap_time=sl.start_time)
            # 个别单元写教练复盘备注
            if idx % 2 == 0:
                unit.coach_note = "完成质量良好，下次可小幅递增负重"

        # 2) 爽约单元: 选周期内该会员的爽约记录挂载
        ns_pick = [row for row in noshow_by_member.get(u.id, [])
                   if start_date <= row[1].start_time.date() <= TODAY and row[1].start_time.date() not in used_dates][:1]
        for bk, sl, ns_goal, ns_parts in ns_pick:
            day = sl.start_time.date()
            used_dates.add(day)
            wn = max(1, min(weeks, (day - start_date).days // 7 + 1))
            planned = tpl_exercises(tpl)
            unit = make_unit(wn, day, f"第{wn}周·爽约", ns_goal, ns_parts[:2] or parts[:2], planned)
            db.add(unit)
            db.flush()
            unit.booking_id = bk.id
            plansvc.mark_unit_no_show(unit, now=sl.start_time)

        # 3) 逾期未安排单元
        miss_candidates = [start_date + timedelta(days=d)
                           for d in range((TODAY - start_date).days)
                           if (start_date + timedelta(days=d)) not in used_dates
                           and (start_date + timedelta(days=d)).weekday() < 5]
        for i, day in enumerate(miss_candidates[:missed_n]):
            used_dates.add(day)
            wn = max(1, min(weeks, (day - start_date).days // 7 + 1))
            unit = make_unit(wn, day, f"第{wn}周·补练单元", goal, parts[:2], tpl_exercises(tpl),
                             note="逾期未约课，请尽快安排")
            # 一半演示 missed(已确认漏训), 一半保留 unscheduled(仍可补约), 都计入逾期提醒
            if i % 2 == 0:
                unit.status = content.UNIT_MISSED
            db.add(unit)

        # 4) 未来已约单元: 新开可约时段并由会员预约关联
        future_days_pool = [TODAY + timedelta(days=d) for d in range(1, 14)
                            if (TODAY + timedelta(days=d)).weekday() < 5]
        future_idx = 0
        for _ in range(future_booked_n):
            while future_idx < len(future_days_pool):
                day = future_days_pool[future_idx]; future_idx += 1
                if day in used_dates:
                    continue
                # 找一个不冲突的钟点
                for hour in (10, 15, 19, 11, 16):
                    st = datetime.combine(day, time(hour, 0))
                    clash = db.scalar(select(M.Slot).where(
                        M.Slot.coach_id == coach_id,
                        M.Slot.start_time < st + timedelta(hours=1),
                        M.Slot.start_time >= st - timedelta(minutes=30)))
                    if clash:
                        continue
                    slot = M.Slot(coach_id=coach_id, venue_id=venues[0].id,
                                  start_time=st, end_time=st + timedelta(hours=1),
                                  status=content.SLOT_BOOKED)
                    db.add(slot); db.flush()
                    bk = M.Booking(member_id=u.id, coach_id=coach_id, slot_id=slot.id,
                                   status=content.BK_BOOKED, goal=goal,
                                   focus_parts=",".join(parts[:2]),
                                   limitations=LIMITATIONS_BANK[u.username],
                                   template_id=tpl.id, created_at=NOW)
                    db.add(bk); db.flush()
                    wn = max(1, min(weeks, (day - start_date).days // 7 + 1))
                    unit = make_unit(wn, day, f"第{wn}周·{content.PARTS.get(parts[0], '训练')}",
                                     goal, parts[:2], tpl_exercises(tpl))
                    db.add(unit); db.flush()
                    unit.booking_id = bk.id
                    unit.status = content.UNIT_BOOKED
                    used_dates.add(day)
                    break
                if day in used_dates:
                    break

        # 5) 未来未安排单元（会员约课台可关联）
        for day in future_days_pool:
            if day > end_date or day in used_dates:
                continue
            used_dates.add(day)
            wn = max(1, min(weeks, (day - start_date).days // 7 + 1))
            db.add(make_unit(wn, day, f"第{wn}周·待安排", goal, parts[:2], tpl_exercises(tpl)))
            future_unsched_n -= 1
            if future_unsched_n <= 0:
                break
