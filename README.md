# FitTrack · 健身房私教课程预约与训练档案追踪系统

围绕 **健康建档 → 约课 → 训练记录 → 周期性复盘** 的私教服务闭环构建。

## 技术栈

- **后端**：FastAPI + SQLAlchemy 2.0 + SQLite + JWT（python-jose）+ bcrypt
- **前端**：React 18 + TypeScript + Vite + React Router + Recharts + Axios
- 数据库首次启动自动建表并灌入约 10 周的演示数据（教练 4 名、会员 8 名、历史课程/体测/目标/模板齐全，含 4 份会员 8 周周期计划：已完课/已约/未安排/逾期/爽约单元与执行偏差快照）

## 快速启动

```bash
# 后端（端口 8000）
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端（端口 5173，/api 已代理到 8000）
cd frontend
npm install
npm run dev
# 打开 http://localhost:5173
```

重置演示数据：删除 `backend/gym.db` 后重启后端即可重新生成。

## 演示账号

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 会员（张伟，减脂中） | `zhangwei` | `member123` |
| 教练（刘教练） | `coach_liu` | `coach123` |
| 管理员（前台，可办课包） | `admin` | `admin123` |

另含 7 名会员（lina / wangqiang / chenjing / zhaolei / sunli / zhoubo / wuyun）与 3 名教练（coach_yang / coach_he / coach_tang），密码同上。新会员可在登录页自助注册（赠送 1 节体验课）。

## 功能与页面

### 会员端
- **会员约课台** `/booking`：目标达成/课时不足/上次重点/**周期单元逾期**提醒；按日期与教练浏览器械区/团课教室时段；约课时选择训练目标、重点部位（多选）、体能限制；可一键套用训练计划模板，**也可关联本人尚未安排的周期训练单元（计划动作自动带入，自动校验归属教练）**；取消预约
- **我的训练档案** `/my-sessions`：全部约课记录时间线；展开查看每节课的动作清单（组数×次数×负重）、RPE 主观疲劳度、课堂小结、承接遗留、下次重点；**「周期日历」标签：周期计划列表与按周状态、计划值与实际值（动作完成率/训练量）逐动作对比**
- **我的体测追踪** `/my-body`：体重/体脂/肌肉量双轴曲线、首测→最近的阶段对比差值、量化目标进度条与达成周期、体测明细录入、目标设定（达标自动提醒）
- **我的周期计划** `/my-plans`：教练发布的 4~12 周周期计划卡片（执行率/动作完成率/训练量）+ **月历视图**，点击单元查看计划内容或完课后的执行快照与偏差复盘

### 教练 / 管理员端
- **教练工作台** `/coach`：今日 & 未来 7 天课程、本月完成课时、**逾期未安排单元与低完成率（<60%）周期计划提醒**
  - *课前简报*：会员健康档案与伤病限制、**本次约课填写的临时伤病限制**、套用模板、**周期单元应执行动作清单**、阶段体测差值、历史训练动作/负重/RPE、**上次遗留问题**（自动承接上节课的"下次重点"）、进行中目标
  - *课后登记*：**关联周期单元时自动带入单元计划动作**（其次套用模板/按部位预填），实时估算动作完成率与训练量；含热身、RPE、承接遗留、课堂小结、下次重点；保存即完结并**冻结执行快照、计算动作完成率与总训练量**；可标记爽约（关联单元记爽约、实际训练量为 0）
- **会员健康档案** `/members`：会员检索、目标/限制/伤病/剩余课时/续约状态总览；点入查看健康档案编辑、课包办理（管理员）、完整训练记录、体测与目标、**周期计划汇总（可直接进入新建/复盘）**
- **周期训练计划** `/plans`：
  - 基于训练模板为会员创建并发布 **4~12 周**计划；按周编排**计划日期、训练目标、重点部位、动作组次/次数/负重、备注**（支持按周首练日与每周 1~3 练自动生成）；可存草稿/发布/归档
  - 计划详情含**月历视图、按周单元、执行率/动作完成率/训练量 KPI**；未安排单元可编辑，已约课/已完课单元计划锁定；会员约课关联后自动联动状态
  - **完课执行快照不受计划与模板后续修改影响**，逐动作对比计划值 vs 实际值（组×次×负重、训练量、缺失/增补动作）
- **场地·时段·模板维护** `/ops`：
  - 私教时段：教练批量发布自己的时段（按日期+钟点+单节时长，自动避开冲突与过去时间）、删除空闲时段；管理员可代任意教练发布
  - 场地：管理员新增器械区/团课教室
  - 训练模板：新建/查看模板（目标、主练部位、难度、完整动作清单），约课时一键套用
- **数据统计复盘** `/stats`（30/90/180 天窗口）：
  - **周期计划完成率（已完课/到期单元）、周期计划爽约率、实际 vs 计划总训练量及按日趋势**
  - **私教课时利用率 = 已完成时段 / 有效排课时段**（爽约计入排课与课耗但**不计入利用**，卡片单独披露爽约/闲置节数）及按日趋势
  - **会员续约率**（二次购课会员占比）与新购/续约课包数
  - **目标平均达成周期**（天）及已达成/进行中目标数
  - **各部位训练频次分布**（动作次数 + 覆盖课次双柱图）
  - 预约状态构成环形图、课后 RPE 走势、平均训练强度

## 业务规则

- **课时占用**：预约成功即从最早有余量的课包**占用 1 课时**（"待上课"立即反映到剩余课时，杜绝剩余 5 节却有 6 节待上课）；取消预约时**返还**；课后完结/爽约不再重复扣减
- 预约占用时段（open → booked）；取消释放时段（booked → open）；完结 completed；爽约为独立的 no_show 时段状态
- 时间校验（以后端收到的浏览器本地墙钟时间 `X-Client-Time` 为准）：已开课/已结束不可约、已开课不可取消、未开课不可提前登记完结或标记爽约
- 再次购买课包自动计为续约（`renewal_count+1`）
- 每次录入体测后自动评估该会员全部进行中目标，达标即推送达成提醒并记录达成周期
- **周期计划**：教练/管理员可创建发布 4~12 周计划；会员约课时可关联本人「未安排/逾期」单元，须与该计划归属教练一致，同一单元不可重复关联；取消预约自动释放单元（已过计划日期转为逾期未安排）；完课冻结执行快照（计划动作列表副本 + 实际动作 + 动作完成率 + 计划/实际训练量），之后计划与模板修改均不影响历史快照；爽约按计划消耗、实际训练量为 0
- **动作完成率** = 实际完成的计划动作数 / 计划动作数（按动作名归一化匹配）；**总训练量(kg)** = Σ 组数 × 次数（区间取均值）× 负重；自重动作负重记 0
- 角色权限：会员仅能操作本人数据，且时段列表不暴露其他预约会员姓名；教练只能管理本人课程（课前简报与本人发布的周期计划除外，管理员可代操作）；场地/课包仅管理员，时段/模板/周期计划教练与管理员可维护

## API 概览（前缀 /api）

```
POST   auth/login | auth/register        GET auth/me
GET    content                            # 目标/部位/指标/动作库/RPE 字典
GET    coaches | venues                   # 场地与教练
GET/POST/DELETE slots (+slots/bulk)       # 私教时段（教练/管理员维护）
GET/POST bookings                         # 约课（可带 plan_unit_id 关联周期单元）
POST   bookings/{id}/cancel | no-show
GET    bookings/{id}/brief                # 课前简报（聚合）
POST   bookings/{id}/session              # 课后训练登记
GET/POST members                         PUT members/{id}/profile
POST   members/{id}/packages              # 办课包/续约（管理员）
GET/POST members/{id}/measurements (+compare)
GET/POST members/{id}/goals               POST goals/{id}/deactivate
GET    templates                          # 训练计划模板
GET    plans | POST plans                 # 周期计划（列表/创建，会员只见本人）
GET    plans/units/upcoming               # 本人尚未安排的训练单元（约课关联）
GET    plans/{id}                         # 计划详情：日历单元 + 执行快照与逐动作对比
POST   plans/{id}/publish | archive       # 发布草稿 / 归档
PUT    plans/units/{id}                   # 编辑未安排单元（已约课/已完课锁定）
GET    coaches/{id}/workbench             # 教练工作台（含逾期与低完成率提醒）
GET    stats/dashboard?days=90            # 统计复盘（含周期完成率/爽约率/训练量趋势）
```

交互式文档：启动后端后访问 `http://localhost:8000/docs`。

## 目录结构

```
backend/
  app/
    main.py            # FastAPI 入口（建表 + 自动种子）
    database.py models.py schemas.py security.py deps.py
    content.py         # 目标/部位/指标/RPE/动作库领域常量
    services.py        # 目标达成评估、提醒、统计聚合、教练工作台
    plansvc.py         # 周期计划：动作匹配、完成率/训练量、执行快照、提醒与统计
    serializers.py seed.py
    routers/           # auth/members/resources/bookings/templates/plans/measurements/stats/content
frontend/
  src/
    api.ts auth.tsx types.ts utils.ts toast.tsx
    components/         # Layout / Modal / BodyTracking（体测曲线+目标）/ MemberCycleArchive（周期日历）
    pages/             # Login / BookingDesk / MySessions / MyBody
                       # CoachDesk / Members / MemberArchive / Stats / Ops
                       # CyclePlans / PlanEditor / PlanDetail（周期计划与执行复盘）
```
