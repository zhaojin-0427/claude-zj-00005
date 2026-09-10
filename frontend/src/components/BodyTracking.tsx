import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend,
} from 'recharts'
import { api, errText } from '../api'
import { useToast } from '../toast'
import { ContentBundle, Goal, Measurement } from '../types'
import { fmtDate } from '../utils'

export default function BodyTracking({ memberId, canEdit = true }: { memberId: number; canEdit?: boolean }) {
  const toast = useToast()
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [rows, setRows] = useState<Measurement[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [showMeasure, setShowMeasure] = useState(false)
  const [showGoal, setShowGoal] = useState(false)

  const load = async () => {
    const [m, g, c] = await Promise.all([
      api.get<Measurement[]>(`/members/${memberId}/measurements`),
      api.get<Goal[]>(`/members/${memberId}/goals`),
      api.get<ContentBundle>('/content'),
    ])
    setRows(m.data); setGoals(g.data); setContent(c.data)
  }
  useEffect(() => { load() }, [memberId])

  const chartData = rows.map((m) => ({
    date: fmtDate(m.measured_at).slice(5),
    weight: m.weight, muscle: m.muscle_mass,
    fat: m.body_fat_pct, waist: m.waist,
  }))

  const first = rows[0]; const last = rows[rows.length - 1]
  const diff = (k: keyof Measurement): number | null => {
    if (!first || !last) return null
    const a = first[k] as unknown as number; const z = last[k] as unknown as number
    if (typeof a !== 'number' || typeof z !== 'number') return null
    return Math.round((z - a) * 10) / 10
  }

  const metricCards: [keyof Measurement, string, string, boolean][] = [
    ['weight', '体重', 'kg', true], ['body_fat_pct', '体脂率', '%', true],
    ['muscle_mass', '肌肉量', 'kg', false], ['waist', '腰围', 'cm', true],
  ]

  return (
    <div>
      {/* 阶段体测对比 */}
      <div className="card mb20">
        <div className="card-title">
          🔬 阶段性体测对比
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setShowMeasure(true)}>+ 录入体测</button>}
        </div>
        {rows.length === 0 ? <div className="empty">还没有体测记录，先录入第一次体测建立基线</div> : (
          <>
            <div className="grid grid-4 mb16">
              {metricCards.map(([k, label, unit, goodDown]) => {
                const d = diff(k)
                const cls = d === null ? '' : d === 0 ? 'delta-flat' : (d < 0 === goodDown ? 'delta-good' : 'delta-bad')
                return (
                  <div key={k} className="card soft" style={{ padding: 16 }}>
                    <div className="faint" style={{ fontSize: 12 }}>{label}</div>
                    <div className="flex" style={{ alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 26, fontWeight: 800 }}>{(last[k] as number) ?? '-'}</span>
                      <span className="faint">{unit}</span>
                    </div>
                    <div className={cls} style={{ fontSize: 12.5 }}>
                      较首测 {d === null ? '-' : `${d > 0 ? '+' : ''}${d}${unit}`}
                      <span className="faint"> · {fmtDate(first.measured_at)} 起</span>
                    </div>
                  </div>
                )
              })}
            </div>
            <div style={{ width: '100%', height: 280 }}>
              <ResponsiveContainer>
                <LineChart data={chartData} margin={{ top: 8, right: 20, bottom: 0, left: -12 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis yAxisId="kg" domain={['auto', 'auto']} />
                  <YAxis yAxisId="pct" orientation="right" domain={['auto', 'auto']} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="kg" type="monotone" dataKey="weight" name="体重 kg" stroke="#22d3a7" strokeWidth={2.5}
                    dot={{ r: 3 }} connectNulls />
                  <Line yAxisId="kg" type="monotone" dataKey="muscle" name="肌肉量 kg" stroke="#60a5fa" strokeWidth={2}
                    dot={{ r: 3 }} connectNulls />
                  <Line yAxisId="pct" type="monotone" dataKey="fat" name="体脂率 %" stroke="#f59e0b" strokeWidth={2}
                    strokeDasharray="5 3" dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>

      {/* 目标与达成周期 */}
      <div className="card mb20">
        <div className="card-title">
          🎯 训练目标与达成周期
          {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setShowGoal(true)}>+ 设定目标</button>}
        </div>
        {goals.length === 0 ? <div className="empty">还没有设定量化目标</div> : (
          <div className="grid grid-2">
            {goals.map((g) => (
              <div key={g.id} className="card soft" style={{ padding: 16 }}>
                <div className="flex-between">
                  <b>{g.title}</b>
                  {g.achieved
                    ? <span className="tag tag-green">🎉 已达成 · {g.cycle_days} 天</span>
                    : g.active ? <span className="tag tag-blue">进行中</span>
                      : <span className="tag tag-gray">已停用</span>}
                </div>
                <div className="flex mt8" style={{ justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span className="muted">起始 {g.start_value ?? '-'} → 目标 {g.target_value} {g.metric_label.replace(/\(.*\)/, '')}</span>
                  <span className="muted">当前 {g.current_value ?? '-'}</span>
                </div>
                <div className="progress"><div style={{ width: `${Math.round((g.progress ?? 0) * 100)}%` }} /></div>
                <div className="faint mt8" style={{ fontSize: 12 }}>
                  起始日期 {fmtDate(g.start_at)}{g.achieved && g.achieved_at ? ` · 达成于 ${fmtDate(g.achieved_at)}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 历史体测表 */}
      <div className="card">
        <div className="card-title">体测记录明细</div>
        {rows.length === 0 ? <div className="empty">暂无数据</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>日期</th><th>体重</th><th>体脂率</th><th>肌肉量</th><th>腰围</th><th>静息心率</th><th>血压</th><th>备注</th></tr></thead>
              <tbody>
                {[...rows].reverse().map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.measured_at)}</td>
                    <td>{m.weight ?? '-'}</td>
                    <td>{m.body_fat_pct != null ? `${m.body_fat_pct}%` : '-'}</td>
                    <td>{m.muscle_mass ?? '-'}</td>
                    <td>{m.waist ?? '-'}</td>
                    <td>{m.resting_hr ?? '-'}</td>
                    <td>{m.systolic ? `${m.systolic}/${m.diastolic}` : '-'}</td>
                    <td className="faint">{m.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showMeasure && content && (
        <MeasureModal onClose={() => setShowMeasure(false)}
          onDone={async (payload) => {
            try {
              const { data } = await api.post(`/members/${memberId}/measurements`, payload)
              setShowMeasure(false); await load()
              ;(data.reminders ?? []).forEach((r: any) => toast(r.message))
              if (!data.reminders?.length) toast('体测已录入')
            } catch (e) { toast(errText(e), 'err') }
          }} />
      )}
      {showGoal && content && (
        <GoalModal content={content} onClose={() => setShowGoal(false)}
          onDone={async (payload) => {
            try {
              const { data } = await api.post(`/members/${memberId}/goals`, payload)
              setShowGoal(false); await load()
              ;(data.reminders ?? []).forEach((r: any) => toast(r.message))
              toast('目标已设定')
            } catch (e) { toast(errText(e), 'err') }
          }} />
      )}
    </div>
  )
}

function MeasureModal({ onClose, onDone }: { onClose: () => void; onDone: (p: any) => void }) {
  const [f, setF] = useState<any>({ weight: '', body_fat_pct: '', muscle_mass: '', waist: '', hip: '', resting_hr: '', systolic: '', diastolic: '', note: '' })
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v === '' ? null : v }))
  const submit = () => {
    const payload: any = { note: f.note }
    ;['weight', 'body_fat_pct', 'muscle_mass', 'waist', 'hip', 'resting_hr', 'systolic', 'diastolic']
      .forEach((k) => { if (f[k] !== null && f[k] !== '') payload[k] = Number(f[k]) })
    onDone(payload)
  }
  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h3>录入阶段体测</h3>
        <div className="row">
          <label className="fld"><span>体重 kg</span><input type="number" step="0.1" onChange={(e) => set('weight', e.target.value)} /></label>
          <label className="fld"><span>体脂率 %</span><input type="number" step="0.1" onChange={(e) => set('body_fat_pct', e.target.value)} /></label>
        </div>
        <div className="row">
          <label className="fld"><span>肌肉量 kg</span><input type="number" step="0.1" onChange={(e) => set('muscle_mass', e.target.value)} /></label>
          <label className="fld"><span>腰围 cm</span><input type="number" step="0.1" onChange={(e) => set('waist', e.target.value)} /></label>
        </div>
        <div className="row">
          <label className="fld"><span>臀围 cm</span><input type="number" step="0.1" onChange={(e) => set('hip', e.target.value)} /></label>
          <label className="fld"><span>静息心率</span><input type="number" onChange={(e) => set('resting_hr', e.target.value)} /></label>
        </div>
        <div className="row">
          <label className="fld"><span>收缩压</span><input type="number" onChange={(e) => set('systolic', e.target.value)} /></label>
          <label className="fld"><span>舒张压</span><input type="number" onChange={(e) => set('diastolic', e.target.value)} /></label>
        </div>
        <label className="fld"><span>备注</span><input onChange={(e) => set('note', e.target.value)} placeholder="如：月度复测/状态备注" /></label>
        <div className="flex" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit}>保存体测</button>
        </div>
      </div>
    </div>
  )
}

function GoalModal({ content, onClose, onDone }: { content: ContentBundle; onClose: () => void; onDone: (p: any) => void }) {
  const [metric, setMetric] = useState(content.metrics[0].key)
  const [direction, setDirection] = useState<'up' | 'down'>(content.metrics[0].good)
  const [target, setTarget] = useState('')
  const [title, setTitle] = useState('')
  const pickMetric = (k: string) => {
    setMetric(k)
    setDirection(content.metrics.find((m) => m.key === k)?.good ?? 'down')
  }
  const submit = () => {
    if (!target) return
    onDone({
      metric, direction, target_value: Number(target),
      title: title || `目标：${content.metrics.find((m) => m.key === metric)?.label} ${direction === 'down' ? '降至' : '达到'} ${target}`,
    })
  }
  return (
    <div className="modal-mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <h3>设定量化训练目标</h3>
        <label className="fld"><span>目标名称</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="留空则自动生成" /></label>
        <label className="fld"><span>体测指标</span>
          <select value={metric} onChange={(e) => pickMetric(e.target.value)}>
            {content.metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select></label>
        <label className="fld"><span>变化方向</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as 'up' | 'down')}>
            <option value="down">降低（↓）</option>
            <option value="up">提升（↑）</option>
          </select></label>
        <label className="fld"><span>目标值</span>
          <input type="number" step="0.1" value={target} onChange={(e) => setTarget(e.target.value)} /></label>
        <div className="flex" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={submit}>设定目标</button>
        </div>
      </div>
    </div>
  )
}
