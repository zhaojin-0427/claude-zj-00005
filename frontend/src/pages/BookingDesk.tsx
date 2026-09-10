import { useEffect, useMemo, useState } from 'react'
import { api, errText, localNowIso } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../toast'
import { Modal } from '../components/ui'
import { Booking, ContentBundle, PlanTemplate, Slot } from '../types'
import { fmtDateTime, STATUS_CLS, STATUS_LABEL, weekdayLabel } from '../utils'

const DAY_MS = 86400000

export default function BookingDesk() {
  const { user, refresh } = useAuth()
  const toast = useToast()
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [mine, setMine] = useState<Booking[]>([])
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [dayOffset, setDayOffset] = useState(0)
  const [coachFilter, setCoachFilter] = useState('')
  const [coaches, setCoaches] = useState<{ id: number; full_name: string }[]>([])
  const [target, setTarget] = useState<Slot | null>(null)

  const load = async () => {
    const base = new Date(); base.setHours(0, 0, 0, 0)
    const d0 = new Date(base.getTime() + dayOffset * DAY_MS)
    const d1 = new Date(d0.getTime() + DAY_MS - 1000)
    // 用本地时区的 naive ISO 串, 与后端墙钟时间口径一致（避免 toISOString 的 UTC 偏移）
    const params: any = { date_from: localNowIso(d0), date_to: localNowIso(d1) }
    if (coachFilter) params.coach_id = coachFilter
    const q = new URLSearchParams(params).toString()
    const [s, m, t, c] = await Promise.all([
      api.get<Slot[]>(`/slots?${q}`),
      api.get<Booking[]>('/bookings?status=booked&asc=true'),
      api.get<PlanTemplate[]>('/templates'),
      api.get<{ id: number; full_name: string }[]>('/coaches'),
    ])
    setSlots(s.data); setMine(m.data); setTemplates(t.data); setCoaches(c.data)
  }

  useEffect(() => { api.get('/content').then((r) => setContent(r.data)) }, [])
  useEffect(() => { load() }, [dayOffset, coachFilter])

  const dayLabel = useMemo(() => {
    const d = new Date(new Date().setHours(0, 0, 0, 0) + dayOffset * DAY_MS)
    return dayOffset === 0 ? '今天' : dayOffset === 1 ? '明天' : weekdayLabel(d.toISOString())
  }, [dayOffset])

  const cancel = async (id: number) => {
    if (!confirm('确定取消这节预约吗？')) return
    try {
      await api.post(`/bookings/${id}/cancel`)
      toast('预约已取消')
      load(); refresh()
    } catch (e) { toast(errText(e), 'err') }
  }

  const alerts = user?.alerts ?? []

  return (
    <div>
      {alerts.length > 0 && (
        <div className="mb20">
          {alerts.map((a, i) => (
            <div key={i} className={`alert ${a.type === 'goal_achieved' ? 'alert-goal' : a.type === 'low_sessions' ? 'alert-warn' : 'alert-info'}`}>
              <span>{a.type === 'goal_achieved' ? '🎉' : a.type === 'low_sessions' ? '⏳' : '📌'}</span>
              <div>{a.message}</div>
            </div>
          ))}
        </div>
      )}

      {/* 我的待上课 */}
      <div className="card mb20">
        <div className="card-title">
          我的待上课
          <span className="sub">共 {mine.length} 节待上课</span>
        </div>
        {mine.length === 0 ? <div className="empty">近期还没有预约，从下方时段表选择一节吧</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>时间</th><th>教练</th><th>场地</th><th>目标 / 部位</th><th>状态</th><th></th></tr></thead>
              <tbody>
                {mine.map((b) => (
                  <tr key={b.id}>
                    <td>{fmtDateTime(b.slot?.start_time)} · {weekdayLabel(b.slot?.start_time ?? '')}</td>
                    <td>{b.coach?.full_name ?? '—'}</td>
                    <td>{b.slot?.venue?.name} <span className="faint">({b.slot?.venue?.kind_label})</span></td>
                    <td>{b.goal_label} · {b.focus_parts_labels.join('/') || '全身'}</td>
                    <td><span className={STATUS_CLS[b.status]}>{STATUS_LABEL[b.status]}</span></td>
                    <td className="right">
                      {new Date(b.slot?.start_time ?? 0).getTime() <= Date.now()
                        ? <span className="tag tag-gray" title="开课后不可在线取消">已开课</span>
                        : <button className="btn btn-danger btn-sm" onClick={() => cancel(b.id)}>取消预约</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 时段表 */}
      <div className="card">
        <div className="card-title">
          可预约私教时段
          <div className="flex gap6">
            <select value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)}>
              <option value="">全部教练</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => setDayOffset((d) => d - 1)}>← 前一天</button>
            <span className="tag tag-blue">{dayLabel} · D+{dayOffset}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setDayOffset((d) => d + 1)}>后一天 →</button>
          </div>
        </div>
        {slots.length === 0 ? <div className="empty">当天暂无可约时段，换一天看看</div> : (
          <div className="slot-grid">
            {slots.map((s) => {
              const t = new Date(s.start_time)
              const endT = new Date(s.end_time)
              const hh = (n: number) => String(n).padStart(2, '0')
              const booked = s.status !== 'open'
              const started = endT.getTime() <= Date.now()
              const ongoing = !started && t.getTime() <= Date.now()
              return (
                <div key={s.id} className={`slot-card ${booked || started ? 'booked' : ''}`}>
                  <div className="slot-time">{hh(t.getHours())}:{hh(t.getMinutes())} - {hh(endT.getHours())}:{hh(endT.getMinutes())}</div>
                  <div className="slot-meta">
                    <span>🏃 {s.coach?.full_name ?? '待定教练'}</span>
                    <span>🏟️ {s.venue?.name} · {s.venue?.kind_label}</span>
                    <span>
                      {started
                        ? <span className="tag tag-gray">已结束</span>
                        : ongoing
                          ? <span className="tag tag-amber">进行中</span>
                          : s.status === 'open'
                            ? <span className="tag tag-green">可预约</span>
                            : <span className="tag tag-gray">已被预约</span>}
                    </span>
                  </div>
                  {started || ongoing
                    ? <button className="btn btn-ghost btn-sm btn-block" disabled>{started ? '已结束' : '课程进行中'}</button>
                    : s.status === 'open'
                      ? <button className="btn btn-primary btn-sm btn-block" onClick={() => setTarget(s)}>预约此时段</button>
                      : <button className="btn btn-ghost btn-sm btn-block" disabled>已被预约</button>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {target && content && (
        <BookingModal
          slot={target}
          content={content}
          templates={templates}
          defaultLimitations={user?.member_profile?.limitations ?? ''}
          onClose={() => setTarget(null)}
          onDone={() => { setTarget(null); load(); refresh(); toast('预约成功！可在「我的训练档案」查看') }}
        />
      )}
    </div>
  )
}

function BookingModal({ slot, content, templates, defaultLimitations, onClose, onDone }: {
  slot: Slot
  content: ContentBundle
  templates: PlanTemplate[]
  defaultLimitations: string
  onClose: () => void
  onDone: () => void
}) {
  const [goal, setGoal] = useState(content.goals[0]?.key ?? 'fat_loss')
  const [parts, setParts] = useState<string[]>([])
  const [limitations, setLimitations] = useState(defaultLimitations)
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  const togglePart = (p: string) =>
    setParts((arr) => arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p])

  const applyTemplate = (id: string) => {
    setTemplateId(id ? Number(id) : null)
    const t = templates.find((x) => x.id === Number(id))
    if (t) {
      setGoal(t.goal)
      // 仅在用户尚未选择部位时, 用模板主练部位预填, 不覆盖已选
      setParts((cur) => cur.length ? cur : [t.primary_part])
    }
  }

  const submit = async () => {
    if (!parts.length) { toast('请至少选择一个重点部位', 'err'); return }
    setBusy(true)
    try {
      await api.post('/bookings', {
        slot_id: slot.id, goal, focus_parts: parts,
        limitations, template_id: templateId,
      })
      onDone()
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  const matchedTemplates = templates.filter((t) => !goal || t.goal === goal)
  const selectedTpl = templates.find((t) => t.id === templateId)
  let tplExs: any[] = []
  if (selectedTpl) { try { tplExs = JSON.parse(selectedTpl.exercises_json) } catch { /* ignore */ } }

  return (
    <Modal title={`预约私教课 · ${fmtDateTime(slot.start_time)}`} onClose={onClose} wide>
      <div className="kv"><span>授课教练</span><b>{slot.coach?.full_name ?? '系统安排'}</b></div>
      <div className="kv"><span>训练场地</span><b>{slot.venue?.name}（{slot.venue?.kind_label}）</b></div>

      <label className="fld mt12"><span>一键套用训练计划模板</span>
        <select value={templateId ?? ''} onChange={(e) => applyTemplate(e.target.value)}>
          <option value="">不使用模板（由教练现场安排）</option>
          {matchedTemplates.map((t) => (
            <option key={t.id} value={t.id}>{t.name} · {t.primary_part_label} · {t.level}</option>
          ))}
        </select>
      </label>
      {selectedTpl && (
        <div className="card soft mb16" style={{ padding: 14 }}>
          <div className="muted mb8" style={{ fontSize: 12.5 }}>
            📋 已套用「{selectedTpl.name}」· {selectedTpl.description || '教练课后登记将自动带入以下动作'}
          </div>
          {tplExs.map((e: any, i: number) => (
            <span key={i} className="exercise-pill">{e.name}
              <b>{e.sets}×{e.reps}</b>{e.weight > 0 && <span className="faint">{e.weight}kg</span>}
            </span>
          ))}
        </div>
      )}

      <label className="fld"><span>训练目标 *</span></label>
      <div className="chk-row mb16">
        {content.goals.map((g) => (
          <span key={g.key} className={`chip ${goal === g.key ? 'on' : ''}`} onClick={() => setGoal(g.key)}>{g.label}</span>
        ))}
      </div>

      <label className="fld"><span>重点训练部位 *（可多选）</span></label>
      <div className="chk-row mb16">
        {content.parts.map((p) => (
          <span key={p.key} className={`chip ${parts.includes(p.key) ? 'on' : ''}`} onClick={() => togglePart(p.key)}>{p.label}</span>
        ))}
      </div>

      <label className="fld"><span>体能限制 / 伤病提醒（教练将在课前重点查看）</span>
        <textarea value={limitations} onChange={(e) => setLimitations(e.target.value)}
          placeholder="如：右膝旧伤、腰椎不适、哮喘史…" />
      </label>

      <div className="flex mt16" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>再想想</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? '提交中…' : '确认预约（消耗1课时）'}</button>
      </div>
    </Modal>
  )
}
