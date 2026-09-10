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
