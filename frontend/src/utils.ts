export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return '-'
  const d = new Date(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '-'
  const d = new Date(s)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export function weekdayLabel(s: string): string {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(s).getDay()]
}

export function deltaText(v: number | null | undefined, unit = '', goodDown = false): { text: string; cls: string } {
  if (v === null || v === undefined) return { text: '-', cls: '' }
  if (Math.abs(v) < 0.05) return { text: `持平`, cls: 'delta-flat' }
  const sign = v > 0 ? '+' : ''
  const cls = goodDown ? (v < 0 ? 'delta-good' : 'delta-bad') : (v > 0 ? 'delta-good' : 'delta-bad')
  return { text: `${sign}${v}${unit}`, cls }
}

export function parseExercises(json: string): any[] {
  try { return JSON.parse(json || '[]') } catch { return [] }
}

export const STATUS_LABEL: Record<string, string> = {
  booked: '待上课', completed: '已完成', no_show: '爽约', canceled: '已取消',
}
export const STATUS_CLS: Record<string, string> = {
  booked: 'tag tag-blue', completed: 'tag tag-green', no_show: 'tag tag-red', canceled: 'tag tag-gray',
}

// ---------- 周期训练计划 ----------
export const UNIT_LABEL: Record<string, string> = {
  unscheduled: '未安排', booked: '已约课', completed: '已完课',
  missed: '逾期未安排', no_show: '爽约',
}
export const UNIT_CLS: Record<string, string> = {
  unscheduled: 'tag tag-gray', booked: 'tag tag-blue', completed: 'tag tag-green',
  missed: 'tag tag-amber', no_show: 'tag tag-red',
}
export const PLAN_STATE_LABEL: Record<string, string> = {
  draft: '草稿', not_started: '未开始', in_progress: '进行中',
  finished: '已完成', archived: '已归档',
}
export const PLAN_STATE_CLS: Record<string, string> = {
  draft: 'tag tag-gray', not_started: 'tag tag-gray', in_progress: 'tag tag-blue',
  finished: 'tag tag-green', archived: 'tag tag-gray',
}

/** 把 '8-10' / '12' 之类的次数描述折算为代表次数（区间取均值）。 */
export function repsCount(reps: string | number | null | undefined): number {
  if (typeof reps === 'number') return reps
  const nums = String(reps ?? '').match(/\d+(\.\d+)?/g)
  if (!nums || !nums.length) return 0
  const v = nums.map(Number)
  return v.reduce((a, b) => a + b, 0) / v.length
}

/** 单动作训练量(kg) = 组数 × 次数 × 负重。 */
export function exerciseVolume(e: { sets?: number; reps?: string | number; weight?: number }): number {
  return Math.round(((e.sets ?? 0) * repsCount(e.reps) * (e.weight ?? 0)) * 10) / 10
}

/** 总训练量(kg)，自重动作负重 0 不计。 */
export function totalVolume(exs: any[]): number {
  return Math.round(exs.reduce((s, e) => s + exerciseVolume(e), 0) * 10) / 10
}

export function fmtVolume(v: number | null | undefined): string {
  if (v === null || v === undefined) return '-'
  return v >= 10000 ? `${(v / 1000).toFixed(1)}t` : `${Math.round(v)}kg`
}

export function parseEx(json: string | null | undefined): any[] {
  return parseExercises(json || '[]')
}

/** 单元标题：优先用编排时填写的标题（其本身可能已含「第N周」），为空时回退到「第N周训练」。 */
export function unitTitle(u: { title?: string | null; week_no?: number | null }): string {
  return u.title || `第${u.week_no ?? '?'}周训练`
}
