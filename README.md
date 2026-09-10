# FitTrack · 健身房私教课程预约与训练档案追踪系统

围绕 **健康建档 → 约课 → 训练记录 → 周期性复盘** 的私教服务闭环构建。

## 技术栈

- **后端**：FastAPI + SQLAlchemy 2.0 + SQLite + JWT（python-jose）+ bcrypt
- **前端**：React 18 + TypeScript + Vite + React Router + Recharts + Axios
- 数据库首次启动自动建表并灌入约 10 周的演示数据（教练 4 名、会员 8 名、历史课程/体测/目标/模板齐全）

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
- **会员约课台** `/booking`：目标达成/课时不足/上次重点提醒；按日期与教练浏览器械区/团课教室时段；约课时选择训练目标、重点部位（多选）、体能限制；可一键套用训练计划模板；取消预约
- **我的训练档案** `/my-sessions`：全部约课记录时间线；展开查看每节课的动作清单（组数×次数×负重）、RPE 主观疲劳度、课堂小结、承接遗留、下次重点
- **我的体测追踪** `/my-body`：体重/体脂/肌肉量双轴曲线、首测→最近的阶段对比差值、量化目标进度条与达成周期、体测明细录入、目标设定（达标自动提醒）

### 教练 / 管理员端
- **教练工作台** `/coach`：今日 & 未来 7 天课程、本月完成课时
  - *课前简报*：会员健康档案与伤病限制、阶段体测差值、历史训练动作/负重/RPE、**上次遗留问题**（自动承接上节课的"下次重点"）、进行中目标
  - *课后登记*：动作清单（按部位自动预填动作库）、负重、组数次数、RPE（1–10 中文描述）、热身、承接遗留、课堂小结、下次重点；保存即扣课时并完结；可标记爽约
- **会员健康档案** `/members`：会员检索、目标/限制/伤病/剩余课时/续约状态总览；点入查看健康档案编辑、课包办理（管理员）、完整训练记录、体测与目标
- **数据统计复盘** `/stats`（30/90/180 天窗口）：
  - **私教课时利用率**（已完成/已排时段）及按日趋势
  - **会员续约率**（二次购课会员占比）与新购/续约课包数
  - **目标平均达成周期**（天）及已达成/进行中目标数
  - **各部位训练频次分布**（动作次数 + 覆盖课次双柱图）
  - 预约状态构成环形图、课后 RPE 走势、平均训练强度

## 业务规则

- 课时扣减发生在课程完结（课后登记）或爽约标记时；课时为 0 时无法约课
- 预约占用时段（open → booked）；取消释放时段（booked → open）；完结为 completed
- 再次购买课包自动计为续约（`renewal_count+1`）
- 每次录入体测后自动评估该会员全部进行中目标，达标即推送达成提醒并记录达成周期
- 角色权限：会员仅能操作本人数据；教练只能管理本人课程；课包办理仅管理员

## API 概览（前缀 /api）

```
POST   auth/login | auth/register        GET auth/me
GET    content                            # 目标/部位/指标/动作库/RPE 字典
GET    coaches | venues                   # 场地与教练
GET/POST/DELETE slots (+slots/bulk)       # 私教时段（教练/管理员维护）
GET/POST bookings                         # 约课
POST   bookings/{id}/cancel | no-show
GET    bookings/{id}/brief                # 课前简报（聚合）
POST   bookings/{id}/session              # 课后训练登记
GET/POST members                         PUT members/{id}/profile
POST   members/{id}/packages              # 办课包/续约（管理员）
GET/POST members/{id}/measurements (+compare)
GET/POST members/{id}/goals               POST goals/{id}/deactivate
GET    templates                          # 训练计划模板
GET    coaches/{id}/workbench             # 教练工作台
GET    stats/dashboard?days=90            # 统计复盘
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
    serializers.py seed.py
    routers/           # auth/members/resources/bookings/templates/measurements/stats/content
frontend/
  src/
    api.ts auth.tsx types.ts utils.ts toast.tsx
    components/         # Layout / Modal / BodyTracking（体测曲线+目标）
    pages/             # Login / BookingDesk / MySessions / MyBody
                       # CoachDesk / Members / MemberArchive / Stats
```
