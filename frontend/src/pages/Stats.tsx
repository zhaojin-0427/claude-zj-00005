import { useEffect, useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts'
import { api } from '../api'
import { Loading } from '../components/ui'
import { DashboardStats } from '../types'
import { fmtVolume } from '../utils'

const PIE_COLORS = ['#22d3a7', '#60a5fa', '#f59e0b', '#a78bfa', '#f87171', '#34d399', '#f472b6', '#94a3bf']

export default function Stats() {
  const [days, setDays] = useState(90)
  const [data, setData] = useState<DashboardStats | null>(null)

  useEffect(() => {
    setData(null)
    api.get<DashboardStats>(`/stats/dashboard?days=${days}`).then((r) => setData(r.data))
  }, [days])

  const partData = useMemo(() => (data?.part_frequency ?? [])
    .map((p) => ({ name: p.label, 动作次数: p.exercise_count, 覆盖课次: p.session_count }))
    .filter((p) => p.动作次数 > 0)
    .sort((a, b) => b.动作次数 - a.动作次数), [data])

  if (!data) return <Loading />

  const statusPie = data.booking_status.filter((s) => s.count > 0).map((s) => ({ name: s.label, value: s.count }))

  return (
    <div>
      <div className="flex-between mb20">
        <div className="muted">服务闭环复盘：周期计划完成率/爽约率/训练量 · 课时利用率 · 续约率 · 目标达成 · 部位频次</div>
        <div className="chk-row">
          {[30, 90, 180].map((d) => (
            <span key={d} className={`chip ${days === d ? 'on' : ''}`} onClick={() => setDays(d)}>近{d}天</span>
          ))}
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-4 mb20">
        <div className="card stat">
          <span className="ico">🏋️</span>
          <div className="label">私教课时利用率</div>
          <div className="value">{data.utilization_rate}<small>%</small></div>
          <div className="foot">已完成 {data.utilized_slots} / 有效排课 {data.total_scheduled_slots}
            （爽约 {data.no_show_slots ?? 0} 节不计入利用）</div>
          <div className="progress mt8"><div style={{ width: `${data.utilization_rate}%` }} /></div>
        </div>
        <div className="card stat blue">
          <span className="ico">🤝</span>
          <div className="label">会员续约率</div>
          <div className="value">{data.renewal_rate}<small>%</small></div>
          <div className="foot">续约会员 {data.renewed_members} / 在册 {data.total_members}</div>
          <div className="progress mt8"><div style={{ width: `${data.renewal_rate}%`, background: 'linear-gradient(90deg,#60a5fa,#3b82f6)' }} /></div>
        </div>
        <div className="card stat amber">
          <span className="ico">🎯</span>
          <div className="label">目标平均达成周期</div>
          <div className="value">{data.avg_goal_cycle_days ?? '-'}<small> 天</small></div>
          <div className="foot">已达成 {data.achieved_goal_count} 个 · 进行中 {data.active_goal_count} 个</div>
        </div>
        <div className="card stat purple">
          <span className="ico">🔥</span>
          <div className="label">平均训练强度 RPE</div>
          <div className="value">{data.avg_rpe ?? '-'}<small> /10</small></div>
          <div className="foot">新购 {data.new_packages} 课包 · 续约 {data.renewal_packages} 课包</div>
        </div>
      </div>

      {/* 周期计划 KPI */}
      <div className="grid grid-4 mb20">
        <div className="card stat">
          <span className="ico">🔁</span>
          <div className="label">周期计划完成率</div>
          <div className="value">{data.plan_completion_rate ?? 0}<small>%</small></div>
          <div className="foot">已完课 {data.completed_plan_units ?? 0} / 到期单元 {data.due_units ?? 0}（共 {data.cycle_plan_count ?? 0} 份计划）</div>
          <div className="progress mt8"><div style={{ width: `${data.plan_completion_rate ?? 0}%` }} /></div>
        </div>
        <div className="card stat blue">
          <span className="ico">🚫</span>
          <div className="label">周期计划爽约率</div>
          <div className="value">{data.plan_no_show_rate ?? 0}<small>%</small></div>
          <div className="foot">爽约 {data.no_show_plan_units ?? 0} 单元 · 逾期未排 {data.missed_plan_units ?? 0} 单元</div>
        </div>
        <div className="card stat amber">
          <span className="ico">🏋️</span>
          <div className="label">实际总训练量</div>
          <div className="value" style={{ fontSize: 24, paddingTop: 4 }}>
            {fmtVolume(data.plan_actual_volume ?? 0)}
          </div>
          <div className="foot">计划量 {fmtVolume(data.plan_planned_volume ?? 0)} · 周期单元累计</div>
        </div>
        <div className="card stat purple">
          <span className="ico">📦</span>
          <div className="label">活跃周期计划</div>
          <div className="value">{data.cycle_plan_count ?? 0}<small> 份</small></div>
          <div className="foot">近{days}天到期 {data.due_units ?? 0} 个训练单元</div>
        </div>
      </div>

      {/* 周期计划训练量趋势 */}
      <div className="card mb20">
        <div className="card-title">📊 周期计划训练量趋势 <span className="sub">按实际上课日 · 计划值 vs 实际值（kg）</span></div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={data.plan_volume_trend ?? []} margin={{ top: 8, right: 20, left: -6 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" interval={Math.max(0, Math.floor((data.plan_volume_trend ?? []).length / 14))} />
              <YAxis />
              <Tooltip formatter={(v: any) => `${Math.round(v)} kg`} />
              <Legend />
              <Line type="monotone" dataKey="planned_volume" name="计划训练量" stroke="#60a5fa" strokeWidth={2}
                strokeDasharray="5 4" dot={false} />
              <Line type="monotone" dataKey="actual_volume" name="实际训练量" stroke="#22d3a7" strokeWidth={2.5}
                dot={{ r: 2.5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-2 mb20">
        {/* 利用率趋势 */}
        <div className="card">
          <div className="card-title">📈 课时利用率趋势 <span className="sub">按日</span></div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={data.utilization_trend.slice(-30)} margin={{ top: 8, right: 16, left: -18 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" interval={4} />
                <YAxis unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v: any) => [`${v}%`, '利用率']} />
                <Line type="monotone" dataKey="rate" stroke="#22d3a7" strokeWidth={2.5}
                  dot={false} name="利用率" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 预约构成 */}
        <div className="card">
          <div className="card-title">🥧 预约状态构成</div>
          <div style={{ height: 280 }} className="flex" >
            <ResponsiveContainer>
              <PieChart>
                <Pie data={statusPie} dataKey="value" nameKey="name"
                  innerRadius={62} outerRadius={96} paddingAngle={3}
                  label={(e: any) => `${e.name} ${e.value}`}>
                  {statusPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 部位频次 */}
      <div className="card mb20">
        <div className="card-title">💪 各部位训练频次分布 <span className="sub">基于已完成课程的动作清单</span></div>
        <div style={{ height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={partData} margin={{ top: 8, right: 20, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="动作次数" fill="#22d3a7" radius={[6, 6, 0, 0]} />
              <Bar dataKey="覆盖课次" fill="#60a5fa" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* RPE 趋势 */}
      <div className="card">
        <div className="card-title">😮‍💨 主观疲劳度 RPE 走势 <span className="sub">课后登记（1-10）</span></div>
        <div style={{ height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={data.rpe_trend} margin={{ top: 8, right: 20, left: -22 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" interval={Math.max(1, Math.floor(data.rpe_trend.length / 12))} />
              <YAxis domain={[1, 10]} />
              <Tooltip />
              <Line type="monotone" dataKey="rpe" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }} name="RPE" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
