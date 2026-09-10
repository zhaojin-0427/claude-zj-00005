import { useEffect, useState } from 'react'
import { api } from '../api'
import { Loading, Modal } from './ui'
import { CyclePlan, PlanUnit } from '../types'
import { fmtDate, fmtDateTime, fmtVolume, parseEx, PLAN_STATE_CLS, PLAN_STATE_LABEL, UNIT_CLS, UNIT_LABEL } from '../utils'

/** 会员训练档案内的周期日历 + 计划状态 + 计划值/实际值对比。 */
export default function MemberCycleArchive() {
  const [plans, setPlans] = useState<CyclePlan[] | null>(null)
  const [planId, setPlanId] = useState<number | null>(null)
  const [openUnit, setOpenUnit] = useState<PlanUnit | null>(null)

  const loadList = () => api.get<CyclePlan[]>('/plans').then((r) => {
    setPlans(r.data)
    setPlanId((cur) => cur ?? (r.data[0]?.id ?? null))
  })
  useEffect(() => { loadList() }, [])

  const plan = plans?.find((p) => p.id === planId) ?? null

  if (!plans) return <Loading />
  if (plans.length === 0) {
    return <div className="card"><div className="empty">教练还没有为你发布周期训练计划</div></div>
  }

  return (
    <div>
      <div className="chk-row mb16">
        {plans.map((p) => (
          <span key={p.id} className={`chip ${planId === p.id ? 'on' : ''}`} onClick={() => setPlanId(p.id)}>
            {p.name} · {p.weeks}周
          </span>
        ))}
      </div>
      {plan && <PlanBody plan={plan} onPick={setOpenUnit} />}
      {openUnit && plan && (
        <UnitCompareModal unit={openUnit} onClose={() => setOpenUnit(null)} />
      )}
    </div>
  )
}

function PlanBody({ plan, onPick }: { plan: CyclePlan; onPick: (u: PlanUnit) => void }) {
  const s = plan.summary
  const groups: PlanUnit[][] = Array.from({ length: plan.weeks }, () => [])
  plan.units?.forEach((u) => { if (u.week_no >= 1 && u.week_no <= plan.weeks) groups[u.week_no - 1].push(u) })
  groups.forEach((a) => a.sort((x, y) => x.scheduled_date.localeCompare(y.scheduled_date)))

  return (
    <div>
      <div className="card mb20">
        <div className="flex-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="flex gap6 flex-wrap mb8">
              <b style={{ fontSize: 16 }}>{plan.name}</b>
              <span className={PLAN_STATE_CLS[s.state]}>{PLAN_STATE_LABEL[s.state]}</span>
              {s.current_week != null && s.state === 'in_progress' && (
                <span className="tag tag-amber">第 {s.current_week} 周</span>
              )}
            </div>
            <div className="faint" style={{ fontSize: 12.5 }}>
              {fmtDate(plan.start_date)} ~ {fmtDate(plan.end_date)} · 教练 {plan.coach?.full_name}
            </div>
          </div>
        </div>
        <div className="grid grid-4 mt16">
          <div className="plan-kpi-card">
            <div className="faint" style={{ fontSize: 12 }}>到期执行率</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{s.completion_rate ?? '-'}%</div>
            <div className="progress mt8"><div style={{ width: `${s.completion_rate ?? 0}%` }} /></div>
            <div className="faint mt8" style={{ fontSize: 12 }}>{s.completed_units}/{s.due_units} 已到期（共 {s.total_units}）</div>
          </div>
          <div className="plan-kpi-card">
            <div className="faint" style={{ fontSize: 12 }}>动作完成率</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{s.avg_exercise_completion ?? '-'}%</div>
          </div>
          <div className="plan-kpi-card">
            <div className="faint" style={{ fontSize: 12 }}>实际/计划训练量</div>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{fmtVolume(s.actual_volume)}<span className="faint" style={{ fontSize: 12 }}> / {fmtVolume(s.planned_volume)}</span></div>
          </div>
          <div className="plan-kpi-card">
            <div className="faint" style={{ fontSize: 12 }}>状态分布</div>
            <div className="flex gap6 flex-wrap mt8">
              <span className="tag tag-blue">已约 {s.booked_units}</span>
              <span className="tag tag-gray">未排 {s.unscheduled_units}</span>
              <span className="tag tag-red">爽约 {s.no_show_units}</span>
              <span className="tag tag-amber">逾期 {s.overdue_units}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        {groups.map((arr, wi) => (
          <div key={wi} className="card">
            <div className="card-title">第 {wi + 1} 周 <span className="sub">{arr.length} 个单元</span></div>
            {arr.length === 0 ? <div className="empty" style={{ padding: '14px' }}>—</div> : arr.map((u) => (
              <div key={u.id} className="unit-row" onClick={() => onPick(u)}>
                <div className="flex-between">
                  <b style={{ fontSize: 13.5 }}>{u.title || '训练单元'}</b>
                  <span className={UNIT_CLS[u.status]}>{UNIT_LABEL[u.status]}</span>
                </div>
                <div className="faint mt8" style={{ fontSize: 12 }}>{fmtDate(u.scheduled_date)} · {u.focus_parts_labels.join('/') || '全身'}</div>
                {u.status === 'completed' && (
                  <div className="flex gap6 mt8" style={{ fontSize: 12.5 }}>
                    <span className="tag tag-green">完成率 {u.completion_rate}%</span>
                    <span className="tag tag-blue">{fmtVolume(u.actual_volume)}/{fmtVolume(u.planned_volume)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function UnitCompareModal({ unit, onClose }: { unit: PlanUnit; onClose: () => void }) {
  const planned = parseEx(unit.planned_exercises_json)
  const cmp = unit.comparison
  return (
    <Modal title={`${unit.title || '训练单元'} · ${fmtDate(unit.scheduled_date)}`} onClose={onClose} wide>
      <div className="flex gap6 flex-wrap mb12">
        <span className={UNIT_CLS[unit.status]}>{UNIT_LABEL[unit.status]}</span>
        {unit.focus_parts_labels.map((p) => <span key={p} className="tag tag-blue">{p}</span>)}
        {unit.booking && <span className="tag tag-gray">{fmtDateTime(unit.booking.start_time)}</span>}
      </div>

      {unit.status !== 'completed' && (
        <>
          <div className="card-title">计划动作</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>动作</th><th>组×次</th><th>负重</th></tr></thead>
              <tbody>
                {planned.map((e: any, i: number) => (
                  <tr key={i}><td><b>{e.name}</b></td><td>{e.sets}×{e.reps}</td>
                    <td>{e.weight > 0 ? `${e.weight}kg` : '自重'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {unit.planned_note && <div className="alert alert-info mt12">📝 {unit.planned_note}</div>}
        </>
      )}

      {unit.status === 'completed' && cmp && (
        <>
          <div className="grid grid-3 mb16">
            <div className="plan-kpi-card"><div className="faint" style={{ fontSize: 12 }}>动作完成率</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand)' }}>{unit.completion_rate}%</div>
              <div className="faint" style={{ fontSize: 12 }}>{cmp.matched_count}/{cmp.planned_count}</div></div>
            <div className="plan-kpi-card"><div className="faint" style={{ fontSize: 12 }}>计划训练量</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtVolume(cmp.planned_volume)}</div></div>
            <div className="plan-kpi-card"><div className="faint" style={{ fontSize: 12 }}>实际训练量</div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>{fmtVolume(cmp.actual_volume)}</div></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>动作</th><th>计划</th><th>实际</th><th>状态</th></tr></thead>
              <tbody>
                {cmp.rows.map((r, i) => (
                  <tr key={i}>
                    <td><b>{r.name}</b></td>
                    <td>{r.planned_sets}×{r.planned_reps} × {r.planned_weight || '自重'}{r.planned_weight ? 'kg' : ''}</td>
                    <td>{r.done
                      ? `${r.actual_sets}×${r.actual_reps} × ${r.actual_weight || '自重'}${r.actual_weight ? 'kg' : ''}`
                      : <span className="tag tag-red">未完成</span>}</td>
                    <td>{r.done ? <span className="tag tag-green">完成</span> : <span className="tag tag-red">缺失</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {unit.status === 'no_show' && <div className="alert alert-warn">该单元爽约，实际未训练。</div>}
    </Modal>
  )
}
