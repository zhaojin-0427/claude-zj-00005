"""Domain constants and exercise library (single source of truth)."""

# ---- roles ----
ROLE_ADMIN = "admin"
ROLE_COACH = "coach"
ROLE_MEMBER = "member"

# ---- venues ----
VENUE_AREA = "area"   # 器械区
VENUE_ROOM = "room"   # 团课教室
VENUE_KINDS = {VENUE_AREA: "器械区", VENUE_ROOM: "团课教室"}

# ---- slot status ----
SLOT_OPEN = "open"
SLOT_BOOKED = "booked"
SLOT_COMPLETED = "completed"
SLOT_NO_SHOW = "no_show"
SLOT_CANCELED = "canceled"
SLOT_BLOCKED = "blocked"
SLOT_UTILIZED = {SLOT_COMPLETED}               # 计入课时利用(爽约不算利用)
SLOT_OCCUPIED = {SLOT_BOOKED, SLOT_COMPLETED, SLOT_NO_SHOW}  # 已被会员占用, 不可再约

# ---- booking status ----
BK_BOOKED = "booked"
BK_COMPLETED = "completed"
BK_NO_SHOW = "no_show"
BK_CANCELED = "canceled"

# ---- training goals ----
GOALS = {
    "fat_loss": "减脂减重",
    "muscle_gain": "增肌增重",
    "shaping": "塑形紧致",
    "strength": "力量提升",
    "conditioning": "体能耐力",
    "rehab": "康复调整",
}

# ---- focus body parts ----
PARTS = {
    "chest": "胸部",
    "back": "背部",
    "legs": "腿部",
    "glutes": "臀部",
    "shoulder": "肩部",
    "arms": "手臂",
    "core": "核心",
    "fullbody": "全身",
}

# ---- goal metrics ----
METRICS = {
    "weight": {"label": "体重(kg)", "good": "down"},
    "body_fat_pct": {"label": "体脂率(%)", "good": "down"},
    "muscle_mass": {"label": "肌肉量(kg)", "good": "up"},
    "waist": {"label": "腰围(cm)", "good": "down"},
    "strength": {"label": "力量指标(kg)", "good": "up"},
    "habit": {"label": "习惯打卡", "good": "up"},
}

# ---- exercise library, keyed by body part ----
EXERCISE_LIBRARY = {
    "chest": [
        ("杠铃卧推", "平板", 40), ("哑铃卧推", "上斜", 16), ("双杠臂屈伸", "自重", 0),
        ("器械夹胸", "蝴蝶机", 30), ("俯卧撑", "自重", 0),
    ],
    "back": [
        ("引体向上", "自重", 0), ("高位下拉", "宽握", 45), ("杠铃划船", "俯身", 40),
        ("坐姿划船", "V把", 40), ("硬拉", "传统", 60),
    ],
    "legs": [
        ("杠铃深蹲", "颈后", 50), ("腿举", "45度", 120), ("保加利亚分腿蹲", "哑铃", 12),
        ("腿屈伸", "器械", 35), ("腿弯举", "俯卧", 30),
    ],
    "glutes": [
        ("臀推", "杠铃", 50), ("罗马尼亚硬拉", "哑铃", 20), ("髋外展", "器械", 30),
        ("壶铃摇摆", "壶铃", 16),
    ],
    "shoulder": [
        ("哑铃推举", "坐姿", 12), ("杠铃推举", "站姿", 30), ("哑铃侧平举", "轻重量", 6),
        ("面拉", "绳索", 20), ("俯身飞鸟", "哑铃", 6),
    ],
    "arms": [
        ("杠铃弯举", "直杆", 20), ("哑铃锤式弯举", "交替", 10), ("绳索下压", "三头", 25),
        ("窄距卧推", "杠铃", 30),
    ],
    "core": [
        ("平板支撑", "计时", 0), ("卷腹", "自重", 0), ("悬垂举腿", "自重", 0),
        ("俄罗斯转体", "药球", 4), ("死虫式", "自重", 0),
    ],
    "fullbody": [
        ("波比跳", "自重", 0), ("壶铃高翻", "壶铃", 12), ("战绳", "间歇", 0),
        ("划船机", "有氧", 0),
    ],
}

RPE_LABELS = {
    1: "极其轻松", 2: "很轻松", 3: "轻松", 4: "中等偏轻", 5: "中等",
    6: "稍费力", 7: "费力", 8: "很费力", 9: "非常费力", 10: "极限",
}
