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
  type: 'goal_achieved' | 'low_sessions' | 'next_focus'
  message: string
  cycle_days?: number
  title?: string
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
  created_at: string
  canceled_at: string | null
  slot: { id: number; start_time: string; end_time: string; venue: Venue | null } | null
  member?: { id: number; full_name: string; phone: string; profile?: MemberProfile } | null
  coach?: { id: number; full_name: string } | null
  has_session: boolean
  session: TrainingSession | null
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
  profile: MemberProfile | null
  measurements: Measurement[]
  measurement_diff: Record<string, number>
  history: Booking[]
  prev_session: TrainingSession | null
  leftover_question: string
  goals: Goal[]
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
}

export interface Workbench {
  today: Booking[]
  upcoming: Booking[]
  month_completed: number
  today_count: number
  week_count: number
}
