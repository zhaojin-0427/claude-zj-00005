export type Role = 'admin' | 'coach' | 'member'

export interface User {
  id: number
  username: string
  full_name: string
  role: Role
  phone: string
  created_at: string
  member_profile?: MemberProfile
  coach_profile?: CoachProfile
  package_remaining?: number
  alerts?: AlertItem[]
}

export interface MemberProfile {
  gender: string
  birth_date: string | null
  height_cm: number | null
  goal_focus: string
  goal_label: string
  limitations: string
  injuries: string
  preferred_parts: string
  preferred_parts_list: string[]
  joined_at: string
  status: string
  renewal_count: number
}

export interface CoachProfile {
  title: string
  specialty: string
  years_exp: number
  rating: number
}

export interface AlertItem {
  type: 'goal_achieved' | 'low_sessions' | 'next_focus' | 'plan_overdue'
  message: string
  cycle_days?: number
  title?: string
  count?: number
  upcoming_count?: number
}

export interface Option { key: string; label: string }

export interface ContentBundle {
  goals: Option[]
  parts: Option[]
  venue_kinds: Option[]
  metrics: { key: string; label: string; good: 'up' | 'down' }[]
  rpe_labels: { value: number; label: string }[]
  exercise_library: Record<string, [string, string, number][]>
}

export interface Venue {
  id: number
  name: string
  kind: string
  kind_label: string
  capacity: number
  note: string
}

export interface Coach {
  id: number
  full_name: string
  phone: string
  title: string
  specialty: string
  years_exp: number
  rating: number
}

export interface SlotBookingBrief {
  id: number
  member_id: number
  member_name: string
}

export interface Slot {
  id: number
  coach_id: number
  venue_id: number
  start_time: string
  end_time: string
  status: 'open' | 'booked' | 'completed' | 'canceled' | 'blocked'
  venue: Venue | null
  coach?: { id: number; full_name: string } | null
  booking?: SlotBookingBrief
}

export interface ExerciseItem {
  name: string
  part: string
  sets: number
  reps: string
  weight: number
  note: string
}

export interface TrainingSession {
  id: number
  booking_id: number
  duration_min: number
  exercises_json: string
  rpe: number | null
  rpe_label: string
  summary: string
  leftover: string
  next_focus: string
  warmup: string
  created_at: string
  exercises?: ExerciseItem[]
}

export interface Booking {
  id: number
  member_id: number
  coach_id: number
  slot_id: number
  status: 'booked' | 'completed' | 'no_show' | 'canceled'
  goal: string
  goal_label: string
  focus_parts: string
  focus_parts_list: string[]
  focus_parts_labels: string[]
  limitations: string
  template_id: number | null
  plan_unit_id: number | null
  created_at: string
  canceled_at: string | null
  slot: { id: number; start_time: string; end_time: string; venue: Venue | null } | null
  member?: { id: number; full_name: string; phone: string; profile?: MemberProfile } | null
  coach?: { id: number; full_name: string } | null
  has_session: boolean
  session: TrainingSession | null
  plan_unit?: PlanUnitBrief | null
}

export interface Measurement {
  id: number
  member_id: number
  measured_at: string
  weight: number | null
  body_fat_pct: number | null
  muscle_mass: number | null
  resting_hr: number | null
  systolic: number | null
  diastolic: number | null
  waist: number | null
  hip: number | null
  note: string
}

export interface Goal {
  id: number
  member_id: number
  title: string
  metric: string
  metric_label: string
  target_value: number
  direction: 'up' | 'down'
  start_value: number | null
  start_at: string
  achieved: boolean
  achieved_at: string | null
  active: boolean
  current_value: number | null
  progress: number | null
  cycle_days: number | null
}

export interface PlanTemplate {
  id: number
  name: string
  goal: string
  goal_label: string
  primary_part: string
  primary_part_label: string
  level: string
  description: string
  exercises_json: string
}

export interface MemberSummary {
  id: number
  username: string
  full_name: string
  phone: string
  member_profile: MemberProfile | null
  package_remaining?: number
  latest_measurement?: { measured_at: string; weight: number | null; body_fat_pct: number | null } | null
}

export interface MemberDetail extends MemberSummary {
  total_sessions_bought: number
  completed_sessions: number
  packages: Package[]
}

export interface Package {
  id: number
  member_id: number
  total_sessions: number
  remaining: number
  price: number
  purchased_at: string
  expires_at: string | null
}

export interface Brief {
  booking: Booking
  template: PlanTemplate | null
  plan_unit: PlanUnitBrief | null
  plan_info: PlanInfoBrief | null
  profile: MemberProfile | null
  measurements: Measurement[]
  measurement_diff: Record<string, number>
  history: Booking[]
  prev_session: TrainingSession | null
  leftover_question: string
  goals: Goal[]
}

export interface PlanInfoBrief {
  id: number
  name: string
  weeks: number
  week_no: number
  scheduled_date: string
  unit_title: string
}

export type UnitStatus = 'unscheduled' | 'booked' | 'completed' | 'missed' | 'no_show'

export interface PlanUnitBrief {
  id: number
  plan_id: number
  week_no: number
  scheduled_date: string
  title: string
  goal: string
  goal_label: string
  focus_parts: string
  focus_parts_list: string[]
  focus_parts_labels: string[]
  planned_exercises_json: string
  planned_note: string
  status: UnitStatus
  status_label: string
  booking_id: number | null
  completion_rate: number | null
  planned_volume: number | null
  actual_volume: number | null
  plan_name?: string
  coach_id?: number
  coach_name?: string
  booking?: { id: number; start_time: string; status: string }
}

export interface ComparisonRow {
  name: string
  part: string
  planned_sets: number
  planned_reps: string
  planned_weight: number
  planned_volume: number
  actual_sets: number | null
  actual_reps: string | null
  actual_weight: number | null
  actual_volume: number | null
  done: boolean
}

export interface PlanUnit extends PlanUnitBrief {
  weekday: number
  snapshot_at: string | null
  actual_exercises_json: string | null
  actual_rpe: number | null
  coach_note: string
  comparison?: {
    rows: ComparisonRow[]
    extras: { name: string; part: string; sets: number; reps: string; weight: number; volume: number }[]
    completion_rate: number
    planned_count: number
    matched_count: number
    planned_volume: number
    actual_volume: number
  }
}

export interface PlanSummary {
  total_units: number
  due_units: number
  completed_units: number
  booked_units: number
  unscheduled_units: number
  no_show_units: number
  missed_units: number
  overdue_units: number
  completion_rate: number | null
  avg_exercise_completion: number | null
  planned_volume: number
  actual_volume: number
  current_week: number | null
  state: 'draft' | 'not_started' | 'in_progress' | 'finished' | 'archived'
  state_label: string
}

export interface CyclePlan {
  id: number
  member_id: number
  coach_id: number
  template_id: number | null
  name: string
  goal: string
  goal_label: string
  weeks: number
  start_date: string
  end_date: string
  note: string
  status: 'draft' | 'published' | 'archived'
  status_label: string
  created_at: string
  published_at: string | null
  member?: { id: number; full_name: string; phone: string; role: string } | null
  coach?: { id: number; full_name: string } | null
  template_name: string | null
  summary: PlanSummary
  units?: PlanUnit[]
}

export interface PlanUnitInput {
  week_no: number
  scheduled_date: string
  title: string
  goal: string
  focus_parts: string[]
  exercises: ExerciseItem[]
  note: string
}

export interface CyclePlanInput {
  member_id: number
  coach_id?: number
  template_id?: number | null
  name: string
  goal: string
  weeks: number
  start_date: string
  note?: string
  status: 'published' | 'draft'
  units: PlanUnitInput[]
}

export interface OverdueUnitAlert {
  plan_id: number
  unit_id: number
  member_id: number
  member_name: string
  plan_name: string
  unit_title: string
  scheduled_date: string
  days_overdue: number
}

export interface LowCompletionAlert {
  plan_id: number
  member_id: number
  member_name: string
  plan_name: string
  weeks: number
  completion_rate: number
  completed_units: number
  due_units: number
  total_units: number
  avg_exercise_completion: number | null
}

export interface DashboardStats {
  window_days: number
  total_scheduled_slots: number
  utilized_slots: number
  utilization_rate: number
  no_show_slots?: number
  idle_slots?: number
  utilization_trend: { date: string; scheduled: number; used: number; rate: number }[]
  booking_status: { key: string; label: string; count: number }[]
  total_members: number
  renewed_members: number
  renewal_rate: number
  new_packages: number
  renewal_packages: number
  achieved_goal_count: number
  avg_goal_cycle_days: number | null
  active_goal_count: number
  part_frequency: { part: string; label: string; exercise_count: number; session_count: number }[]
  avg_rpe: number | null
  rpe_trend: { date: string; rpe: number; member_id: number }[]
  // 周期计划复盘
  cycle_plan_count?: number
  due_units?: number
  completed_plan_units?: number
  no_show_plan_units?: number
  missed_plan_units?: number
  plan_completion_rate?: number
  plan_no_show_rate?: number
  plan_planned_volume?: number
  plan_actual_volume?: number
  plan_volume_trend?: { date: string; actual_volume: number; planned_volume: number }[]
}

export interface Workbench {
  today: Booking[]
  upcoming: Booking[]
  month_completed: number
  today_count: number
  week_count: number
  plan_alerts?: {
    overdue_units: OverdueUnitAlert[]
    low_completion_plans: LowCompletionAlert[]
  }
}
