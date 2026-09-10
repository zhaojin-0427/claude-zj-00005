import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api, errText } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../toast'
import { Loading, Modal } from '../components/ui'
import { ContentBundle, CyclePlan, ExerciseItem, PlanUnit } from '../types'
import {
  fmtDate, fmtDateTime, fmtVolume, parseEx, PLAN_STATE_CLS, PLAN_STATE_LABEL,
  UNIT_CLS, UNIT_LABEL, unitTitle,
} from '../utils'

const WEEK_HEAD = ['一', '二', '三', '四', '五', '六', '日']

export default function PlanDetail() {
  const { id } = useParams()
  const planId = Number(id)
  const nav = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const isStaff = user?.role === 'coach' || user?.role === 'admin'
  const base = isStaff ? '/plans' : '/my-plans'
  const [plan, setPlan] = useState<CyclePlan | null>(null)
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [tab, setTab] = useState<'calendar' | 'weeks'>('calendar')
  const [openUnit, setOpenUnit] = useState<PlanUnit | null>(null)
  const [editUnit, setEditUnit] = useState<PlanUnit | null>(null)
  const [calMonth, setCalMonth] = useState<Date | null>(null)

  const load = () => api.get<CyclePlan>(`/plans/${planId}`).then((r) => {
    setPlan(r.data)
    setCalMonth((cur) => cur ?? new Date(r.data.start_date + 'T00:00:00'))
  })
  useEffect(() => { load(); api.get('/content').then((r) => setContent(r.data)) }, [planId])

  const unitByDate = useMemo(() => {
    const m = new Map<string, PlanUnit[]>()
    plan?.units?.forEach((u) => {
      const k = u.scheduled_date
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(u)
    })
    return m
  }, [plan])

  const weeksGroup = useMemo(() => {
    const g: PlanUnit[][] = Array.from({ length: plan?.weeks ?? 0 }, () => [])
    plan?.units?.forEach((u) => { if (u.week_no >= 1 && u.week_no <= (plan?.weeks ?? 0)) g[u.week_no - 1].push(u) })
    g.forEach((arr) => arr.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)))
    return g
  }, [plan])

  const archive = async () => {
    if (!confirm('确定归档该周期计划？归档后不再出现在约课关联与提醒中')) return
    try { await api.post(`/plans/${planId}/archive`); toast('已归档'); nav('/plans') }
    catch (e) { toast(errText(e), 'err') }
  }
  const publish = async () => {
    try { await api.post(`/plans/${planId}/publish`); toast('计划已发布'); load() }
    catch (e) { toast(errText(e), 'err') }
  }

  if (!plan || !content) return <Loading />
  const s = plan.summary

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb16" onClick={() => nav(base)}>← 返回计划列表</button>

      {/* 头部 */}
      <div className="card mb20">
        <div className="flex-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="flex gap6 flex-wrap mb8">
              <h2 style={{ fontSize: 21 }}>{plan.name}</h2>
              <span className={PLAN_STATE_CLS[s.state]}>{PLAN_STATE_LABEL[s.state]}</span>
              <span className="tag tag-green">{plan.goal_label}</span>
              <span className="tag tag-blue">{plan.weeks} 周周期</span>
              {s.state === 'in_progress' && s.current_week != null && (
                <span className="tag tag-amber">进行到第 {s.current_week} 周</span>
              )}
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              {isStaff ? <>👤 {plan.member?.full_name} · 🏋️ {plan.coach?.full_name} · </> : <>🏋️ {plan.coach?.full_name} · </>}
              {fmtDate(plan.start_date)} ~ {fmtDate(plan.end_date)}
              {plan.template_name && <> · 源自模板「{plan.template_name}」（已独立快照）</>}
            </div>
            {plan.note && <div className="muted mt8" style={{ fontSize: 13 }}>📝 {plan.note}</div>}
          </div>
          {isStaff && (
            <div className="flex gap6">
              {plan.status === 'draft' && <button className="btn btn-primary" onClick={publish}>发布计划</button>}
              {plan.status === 'published' && <button className="btn btn-danger btn-sm" onClick={archive}>归档</button>}
            </div>
          )}
        </div>

        <div className="grid grid-4 mt16">
          <div className="plan-kpi-card">
            <div className="faint" style={{ fontSize: 12 }}>到期执行率</div>
            <div className="value" style={{ fontSize: 24, fontWeight: 800 }}>{s.completion_rate ?? '-'}<small>%</small></div>
            <div className="progress mt8"><div style={{ width: `${s.completion_rate ?? 0}%` }} /></div>
            <div className="faint mt8" style={{ fontSize: 12 }}>
              已完课 {s.completed_units} / 已到期 {s.due_units} 单元
              {s.total_units - s.due_units > 0 && `（另有 ${s.total_units - s.due_units} 个未来单元）`}
            </div>
          </div>
          <div className="plan-kpi-card">
            <div className="faint" style={{ fontSize: 12 }}>动作完成率（均值）</div>
            <div className="value" style={{ fontSize: 24, fontWeight: 800, color: 'var(--brand)' }}>
              {s.avg_exercise_completion ?? '-'}<small>%</small>
            </div>
            <div className="faint mt8" style={{ fontSize: 12 }}>计划动作实际执行占比</div>
          </div>
          <div className="plan-kpi-card">
            <div className="faint" style={{ fontSize: 12 }}>总训练量（实际 / 计划）</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtVolume(s.actual_volume)} <span className="faint" style={{ fontSize: 13 }}>/ {fmtVolume(s.planned_volume)}</span></div>
            <div className="faint mt8" style={{ fontSize: 12 }}>组数×次数×负重(kg)</div>
          </div>
          <div className="plan-kpi-card">
            <div className="faint" style={{ fontSize: 12 }}>执行状态分布</div>
            <div className="flex gap6 flex-wrap mt8">
              <span className="tag tag-blue">已约 {s.booked_units}</span>
              <span className="tag tag-gray">未排 {s.unscheduled_units}</span>
              <span className="tag tag-red">爽约 {s.no_show_units}</span>
              <span className="tag tag-amber">逾期 {s.overdue_units}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'calendar' ? 'active' : ''}`} onClick={() => setTab('calendar')}>📅 周期日历</div>
        <div className={`tab ${tab === 'weeks' ? 'active' : ''}`} onClick={() => setTab('weeks')}>🗓️ 按周编排（{plan.units?.length ?? 0}）</div>
      </div>

      {tab === 'calendar' && calMonth && (
        <div className="card">
          <div className="card-title">
            <div className="flex gap6">
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const d = new Date(calMonth); d.setMonth(d.getMonth() - 1); setCalMonth(d)
              }}>←</button>
              <b style={{ minWidth: 96, textAlign: 'center' }}>{calMonth.getFullYear()}年{calMonth.getMonth() + 1}月</b>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const d = new Date(calMonth); d.setMonth(d.getMonth() + 1); setCalMonth(d)
              }}>→</button>
            </div>
            <span className="sub">点击有训练单元的日期查看执行复盘</span>
          </div>
          <CalendarGrid month={calMonth} plan={plan} unitByDate={unitByDate}
            onPick={(u) => setOpenUnit(u)} />
        </div>
      )}

      {tab === 'weeks' && (
        <div className="grid grid-2">
          {weeksGroup.map((arr, wi) => (
            <div key={wi} className="card">
              <div className="card-title">第 {wi + 1} 周 <span className="sub">{arr.length} 个单元</span></div>
              {arr.length === 0 ? <div className="empty" style={{ padding: '16px' }}>本周未编排单元</div> : arr.map((u) => (
                <UnitRow key={u.id} u={u} isStaff={isStaff}
                  onOpen={() => setOpenUnit(u)} onEdit={() => setEditUnit(u)}
                  onBook={() => nav('/booking')} />
              ))}
            </div>
          ))}
        </div>
      )}

      {openUnit && (
        <UnitDetailModal unit={openUnit} isStaff={isStaff} content={content}
          onClose={() => setOpenUnit(null)}
          onBook={() => { setOpenUnit(null); nav('/booking') }}
          onEdit={() => { setEditUnit(openUnit); setOpenUnit(null) }} />
      )}
      {editUnit && (
        <UnitEditModal unit={editUnit} content={content}
          onClose={() => setEditUnit(null)}
          onSaved={() => { setEditUnit(null); load(); toast('单元已更新') }} />
      )}
    </div>
  )
}

/* ---------------- 日历 ---------------- */
function CalendarGrid({ month, plan, unitByDate, onPick }: {
  month: Date
  plan: CyclePlan
  unitByDate: Map<string, PlanUnit[]>
  onPick: (u: PlanUnit) => void
}) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const lead = (first.getDay() + 6) % 7
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d))

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const pStart = new Date(plan.start_date + 'T00:00:00')
  const pEnd = new Date(plan.end_date + 'T00:00:00')

  return (
    <div>
      <div className="cal-grid cal-head">
        {WEEK_HEAD.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="cal-cell out" />
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          const us = unitByDate.get(key) ?? []
          const inPlan = d >= pStart && d <= pEnd
          const isToday = d.getTime() === today.getTime()
          return (
            <div key={i} className={`cal-cell ${inPlan ? 'in-plan' : ''} ${isToday ? 'today' : ''}`}>
              <div className={`cal-date ${isToday ? 'cal-today' : ''}`}>{d.getDate()}</div>
              <div className="cal-units">
                {us.map((u) => (
                  <div key={u.id} className={`cal-dot cal-${u.status}`} title={`${u.title} · ${UNIT_LABEL[u.status]}`}
                    onClick={() => onPick(u)}>
                    <span className="cal-dot-mark" />
                    {unitTitle(u)}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap6 mt12 flex-wrap muted" style={{ fontSize: 12 }}>
        <span><i className="cal-legend cal-completed" />已完课</span>
        <span><i className="cal-legend cal-booked" />已约课</span>
        <span><i className="cal-legend cal-unscheduled" />未安排</span>
        <span><i className="cal-legend cal-missed" />逾期未安排</span>
        <span><i className="cal-legend cal-no_show" />爽约</span>
      </div>
    </div>
  )
}

/* ---------------- 单元行 ---------------- */
function UnitRow({ u, isStaff, onOpen, onEdit, onBook }: {
  u: PlanUnit
  isStaff: boolean
  onOpen: () => void
  onEdit: () => void
  onBook: () => void
}) {
  const exs = parseEx(u.planned_exercises_json)
  const editable = u.status === 'unscheduled' || u.status === 'missed'
  return (
    <div className="unit-row" onClick={onOpen}>
      <div className="flex-between">
        <div>
          <b style={{ fontSize: 13.5 }}>{unitTitle(u)}</b>
          <div className="faint" style={{ fontSize: 12 }}>{fmtDate(u.scheduled_date)} · {u.focus_parts_labels.join('/') || '全身'}</div>
        </div>
        <span className={UNIT_CLS[u.status]}>{UNIT_LABEL[u.status]}</span>
      </div>
      <div className="mt8">
        {exs.slice(0, 4).map((e, i) => (
          <span key={i} className="exercise-pill" style={{ padding: '3px 9px' }}>
            {e.name} <b>{e.sets}×{e.reps}</b>{e.weight > 0 && <span className="faint">{e.weight}kg</span>}
          </span>
        ))}
        {exs.length > 4 && <span className="faint">等 {exs.length} 个动作</span>}
      </div>
      {u.status === 'completed' && (
        <div className="flex gap6 mt8" style={{ fontSize: 12.5 }}>
          <span className="tag tag-green">动作完成率 {u.completion_rate}%</span>
          <span className="tag tag-blue">{fmtVolume(u.actual_volume)} / 计划 {fmtVolume(u.planned_volume)}</span>
        </div>
      )}
      <div className="flex gap6 mt8" style={{ justifyContent: 'flex-end' }} onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost btn-sm" onClick={onOpen}>详情/复盘</button>
        {editable && isStaff && <button className="btn btn-ghost btn-sm" onClick={onEdit}>编辑单元</button>}
        {editable && !isStaff && <button className="btn btn-primary btn-sm" onClick={onBook}>去约课关联</button>}
      </div>
    </div>
  )
}

/* ---------------- 单元详情（执行复盘） ---------------- */
function UnitDetailModal({ unit, isStaff, content, onClose, onBook, onEdit }: {
  unit: PlanUnit
  isStaff: boolean
  content: ContentBundle
  onClose: () => void
  onBook: () => void
  onEdit: () => void
}) {
  const planned = parseEx(unit.planned_exercises_json)
  const actual = parseEx(unit.actual_exercises_json)
  const editable = unit.status === 'unscheduled' || unit.status === 'missed'
  const cmp = unit.comparison
  const completed = unit.status === 'completed'

  return (
    <Modal title={`${unit.title || '训练单元'} · ${fmtDate(unit.scheduled_date)}`} onClose={onClose} wide>
      <div className="flex gap6 flex-wrap mb12">
        <span className={UNIT_CLS[unit.status]}>{UNIT_LABEL[unit.status]}</span>
        <span className="tag tag-green">{unit.goal_label}</span>
        {unit.focus_parts_labels.map((p) => <span key={p} className="tag tag-blue">{p}</span>)}
        {unit.booking && <span className="tag tag-gray">预约 {fmtDateTime(unit.booking.start_time)}</span>}
      </div>
      {unit.planned_note && <div className="alert alert-info mb12">📝 单元备注：{unit.planned_note}</div>}

      {!completed && unit.status !== 'no_show' && (
        <>
          <div className="card-title">计划动作清单</div>
          <ExerciseTable exs={planned} content={content} />
          <div className="flex mt16" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>关闭</button>
            {editable && (isStaff
              ? <button className="btn btn-primary" onClick={onEdit}>编辑单元</button>
              : <button className="btn btn-primary" onClick={onBook}>去约课台关联此时段</button>)}
          </div>
        </>
      )}

      {unit.status === 'no_show' && (
        <div className="alert alert-warn">该单元关联课程已标记爽约，按计划消耗课时，实际训练量为 0。</div>
      )}

      {completed && cmp && (
        <>
          <div className="alert alert-goal mb12" style={{ background: 'rgba(34,211,167,0.08)', border: '1px solid rgba(34,211,167,0.35)' }}>
            <span>📸</span>
            <div>
              执行快照已于 {fmtDateTime(unit.snapshot_at)} 冻结，后续修改计划或模板均不影响本记录。
              {unit.actual_rpe != null && <> · 实际 RPE <b>{unit.actual_rpe}</b></>}
            </div>
          </div>
          <div className="grid grid-3 mb16">
            <div className="plan-kpi-card"><div className="faint" style={{ fontSize: 12 }}>动作完成率</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{unit.completion_rate}%</div>
              <div className="faint" style={{ fontSize: 12 }}>{cmp.matched_count}/{cmp.planned_count} 个计划动作完成</div></div>
            <div className="plan-kpi-card"><div className="faint" style={{ fontSize: 12 }}>计划总训练量</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtVolume(cmp.planned_volume)}</div></div>
            <div className="plan-kpi-card"><div className="faint" style={{ fontSize: 12 }}>实际总训练量</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtVolume(cmp.actual_volume)}</div>
              <div className="faint" style={{ fontSize: 12 }}>
                偏差 {cmp.actual_volume >= cmp.planned_volume ? '+' : ''}
                {Math.round(cmp.actual_volume - cmp.planned_volume)}kg
              </div></div>
          </div>

          <div className="card-title">计划值 vs 实际值（逐动作）</div>
          <div className="table-wrap mb12">
            <table>
              <thead><tr><th>动作</th><th>计划 组×次×负重</th><th>计划量</th><th>实际 组×次×负重</th><th>实际量</th><th>状态</th></tr></thead>
              <tbody>
                {cmp.rows.map((r, i) => (
                  <tr key={i}>
                    <td><b>{r.name}</b></td>
                    <td>{r.planned_sets}×{r.planned_reps} × {r.planned_weight || '自重'}{r.planned_weight ? 'kg' : ''}</td>
                    <td>{fmtVolume(r.planned_volume)}</td>
                    <td>{r.done
                      ? <>{r.actual_sets}×{r.actual_reps} × {r.actual_weight || '自重'}{r.actual_weight ? 'kg' : ''}</>
                      : <span className="tag tag-red">未完成</span>}</td>
                    <td>{r.actual_volume != null ? fmtVolume(r.actual_volume) : '—'}</td>
                    <td>{r.done ? <span className="tag tag-green">已完成</span> : <span className="tag tag-red">缺失</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cmp.extras.length > 0 && (
            <div className="mb12">
              <div className="muted mb8" style={{ fontSize: 13 }}>➕ 计划外增补动作：</div>
              {cmp.extras.map((e, i) => (
                <span key={i} className="exercise-pill">{e.name} <b>{e.sets}×{e.reps}</b>
                  {e.weight > 0 && <span className="faint">{e.weight}kg</span>}</span>
              ))}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12.5 }}>
            实际登记动作清单：
            {actual.map((e: ExerciseItem, i: number) => ` ${e.name}(${e.sets}×${e.reps})`).join('，')}
          </div>
          {unit.coach_note && <div className="alert alert-info mt12">教练复盘：{unit.coach_note}</div>}
        </>
      )}
    </Modal>
  )
}

function ExerciseTable({ exs, content }: { exs: ExerciseItem[]; content: ContentBundle }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>动作</th><th>部位</th><th>组×次</th><th>负重</th><th>备注</th></tr></thead>
        <tbody>
          {exs.map((e, i) => (
            <tr key={i}>
              <td><b>{e.name}</b></td>
              <td>{content.parts.find((p) => p.key === e.part)?.label ?? e.part}</td>
              <td>{e.sets} × {e.reps}</td>
              <td>{e.weight > 0 ? `${e.weight}kg` : '自重'}</td>
              <td className="faint">{e.note || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ---------------- 单元编辑 ---------------- */
function UnitEditModal({ unit, content, onClose, onSaved }: {
  unit: PlanUnit
  content: ContentBundle
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [title, setTitle] = useState(unit.title)
  const [goal, setGoal] = useState(unit.goal)
  const [parts, setParts] = useState<string[]>(unit.focus_parts_list)
  const [date, setDate] = useState(unit.scheduled_date.slice(0, 10))
  const [note, setNote] = useState(unit.planned_note)
  const [exs, setExs] = useState<ExerciseItem[]>(parseEx(unit.planned_exercises_json))
  const [busy, setBusy] = useState(false)

  const patch = (i: number, k: keyof ExerciseItem, v: any) =>
    setExs((a) => a.map((e, j) => j === i ? { ...e, [k]: v } : e))
  const addFromLibrary = (p: string) => {
    content.exercise_library[p]?.forEach(([n, nt, w]) =>
      setExs((a) => [...a, { name: n, part: p, sets: 3, reps: '10', weight: w, note: nt }]))
  }

  const save = async () => {
    if (!exs.length) { toast('至少保留一个计划动作', 'err'); return }
    setBusy(true)
    try {
      await api.put(`/plans/units/${unit.id}`, {
        title, goal, focus_parts: parts, scheduled_date: date, note, exercises: exs,
      })
      onSaved()
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title={`编辑训练单元 · ${unit.title}`} onClose={onClose} wide>
      <div className="row">
        <label className="fld"><span>单元标题</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="fld"><span>计划日期</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      </div>
      <div className="row">
        <label className="fld"><span>训练目标</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            {content.goals.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select></label>
        <label className="fld"><span>重点部位</span>
          <select value={parts[0] ?? ''} onChange={(e) => setParts(e.target.value ? [e.target.value] : [])}>
            <option value="">请选择</option>
            {content.parts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select></label>
      </div>
      <div className="card-title">计划动作
        <select value="" onChange={(e) => { if (e.target.value) addFromLibrary(e.target.value); e.target.value = '' }}>
          <option value="">从动作库添加…</option>
          {content.parts.map((p) => <option key={p.key} value={p.key}>＋ {p.label}</option>)}
        </select>
      </div>
      <div className="table-wrap mb12">
        <table>
          <thead><tr><th>动作</th><th>部位</th><th>组</th><th>次</th><th>负重kg</th><th>备注</th><th></th></tr></thead>
          <tbody>
            {exs.map((e, i) => (
              <tr key={i}>
                <td><input value={e.name} onChange={(ev) => patch(i, 'name', ev.target.value)} /></td>
                <td><select value={e.part} onChange={(ev) => patch(i, 'part', ev.target.value)}>
                  {content.parts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select></td>
                <td style={{ width: 60 }}><input type="number" value={e.sets} onChange={(ev) => patch(i, 'sets', Number(ev.target.value))} /></td>
                <td style={{ width: 74 }}><input value={e.reps} onChange={(ev) => patch(i, 'reps', ev.target.value)} /></td>
                <td style={{ width: 80 }}><input type="number" step="0.5" value={e.weight} onChange={(ev) => patch(i, 'weight', Number(ev.target.value))} /></td>
                <td><input value={e.note} onChange={(ev) => patch(i, 'note', ev.target.value)} /></td>
                <td><button className="btn btn-danger btn-sm" onClick={() => setExs((a) => a.filter((_, j) => j !== i))}>删</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="fld"><span>单元备注</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存单元'}</button>
      </div>
    </Modal>
  )
}
