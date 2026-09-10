import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Loading } from '../components/ui'
import { CyclePlan, MemberSummary } from '../types'
import { fmtDate, fmtVolume, PLAN_STATE_CLS, PLAN_STATE_LABEL } from '../utils'
import { useAuth } from '../auth'

export default function CyclePlans({ viewer }: { viewer: 'staff' | 'member' }) {
  const nav = useNavigate()
  const { user } = useAuth()
  const [plans, setPlans] = useState<CyclePlan[] | null>(null)
  const [members, setMembers] = useState<MemberSummary[]>([])
  const [memberId, setMemberId] = useState<number | ''>('')
  const [state, setState] = useState<'all' | 'in_progress' | 'finished'>('all')

  const load = () => {
    const q = viewer === 'staff' && memberId ? `?member_id=${memberId}` : ''
    api.get<CyclePlan[]>(`/plans${q}`).then((r) => setPlans(r.data))
  }
  useEffect(() => { load() }, [memberId])
  useEffect(() => {
    if (viewer === 'staff') api.get<MemberSummary[]>('/members').then((r) => setMembers(r.data))
  }, [])

  const filtered = useMemo(() => (plans ?? []).filter((p) => {
    if (state === 'all') return true
    if (state === 'finished') return p.summary.state === 'finished'
    return p.summary.state === 'in_progress' || p.summary.state === 'not_started'
  }), [plans, state])

  if (!plans) return <Loading />
  const base = viewer === 'member' ? '/my-plans' : '/plans'

  return (
    <div>
      <div className="flex-between mb20">
        <div className="muted">
          {viewer === 'member'
            ? '教练为你编排的 4~12 周周期训练计划，约课时可直接关联待安排的训练单元'
            : '基于训练模板为会员编排 4~12 周周期计划，按周跟踪单元完成率与训练量偏差'}
        </div>
        <div className="flex gap6">
          {viewer === 'staff' && (
            <select value={memberId} onChange={(e) => setMemberId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">全部会员</option>
              {members.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
            </select>
          )}
          <div className="chk-row">
            {[['all', '全部'], ['in_progress', '进行中'], ['finished', '已完成']].map(([k, l]) => (
              <span key={k} className={`chip ${state === k ? 'on' : ''}`} onClick={() => setState(k as any)}>{l}</span>
            ))}
          </div>
          {viewer === 'staff' && user?.role === 'coach' && (
            <button className="btn btn-primary" onClick={() => nav('/plans/new')}>+ 编排周期计划</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? <div className="card"><div className="empty">暂无周期计划</div></div> : (
        <div className="grid grid-3">
          {filtered.map((p) => {
            const s = p.summary
            return (
              <div key={p.id} className="card plan-card" onClick={() => nav(`${base}/${p.id}`)}>
                <div className="flex-between mb8">
                  <b style={{ fontSize: 15 }}>{p.name}</b>
                  <span className={PLAN_STATE_CLS[s.state]}>{PLAN_STATE_LABEL[s.state]}</span>
                </div>
                <div className="flex gap6 flex-wrap mb8">
                  {viewer === 'staff' && <span className="tag tag-purple">👤 {p.member?.full_name}</span>}
                  <span className="tag tag-green">{p.goal_label || '—'}</span>
                  <span className="tag tag-blue">{p.weeks} 周</span>
                  {s.current_week != null && s.state === 'in_progress' && (
                    <span className="tag tag-amber">第 {s.current_week} 周</span>
                  )}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {fmtDate(p.start_date)} ~ {fmtDate(p.end_date)}
                  {p.template_name && <> · 源自「{p.template_name}」</>}
                </div>

                <div className="mt12">
                  <div className="flex-between" style={{ fontSize: 12.5 }}>
                    <span className="muted">单元执行率</span>
                    <b>{s.completed_units}/{s.total_units} · {s.completion_rate}%</b>
                  </div>
                  <div className="progress"><div style={{ width: `${s.completion_rate}%` }} /></div>
                </div>
                <div className="grid mt12" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className="plan-kpi">
                    <span className="faint">动作完成率</span>
                    <b>{s.avg_exercise_completion ?? '-'}%</b>
                  </div>
                  <div className="plan-kpi">
                    <span className="faint">实际/计划训练量</span>
                    <b style={{ fontSize: 13 }}>{fmtVolume(s.actual_volume)} / {fmtVolume(s.planned_volume)}</b>
                  </div>
                </div>
                {(s.overdue_units > 0 || s.no_show_units > 0) && (
                  <div className="flex gap6 mt12 flex-wrap">
                    {s.overdue_units > 0 && <span className="tag tag-amber">⚠️ 逾期 {s.overdue_units} 单元</span>}
                    {s.no_show_units > 0 && <span className="tag tag-red">爽约 {s.no_show_units} 次</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
