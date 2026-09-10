import { useEffect, useState } from 'react'
import { api, errText } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../toast'
import { Modal, Loading } from '../components/ui'
import { Brief, ContentBundle, ExerciseItem, Goal, PlanTemplate, TrainingSession, Workbench } from '../types'
import { fmtDateTime, parseExercises, STATUS_CLS, weekdayLabel, totalVolume, fmtVolume, unitTitle } from '../utils'

export default function CoachDesk() {
  const { user } = useAuth()
  const [data, setData] = useState<Workbench | null>(null)
  const [tab, setTab] = useState<'today' | 'week'>('today')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [sessionTarget, setSessionTarget] = useState<Brief | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const toast = useToast()

  const load = async () => {
    if (!user) return
    const { data } = await api.get<Workbench>(`/coaches/${user.id}/workbench`)
    setData(data)
  }
  useEffect(() => { load() }, [user])

  const openBrief = async (bookingId: number) => {
    const { data } = await api.get<Brief>(`/bookings/${bookingId}/brief`)
    setBrief(data)
  }

  const noShow = async (id: number) => {
    if (!confirm('确认标记会员爽约？按课耗规则将扣除 1 课时。')) return
    setBusyId(id)
    try { await api.post(`/bookings/${id}/no-show`); toast('已标记爽约'); load() }
    catch (e) { toast(errText(e), 'err') } finally { setBusyId(null) }
  }

  if (!data) return <Loading />
  const list = tab === 'today' ? data.today : data.upcoming
  const overdue = data.plan_alerts?.overdue_units ?? []
  const lowRate = data.plan_alerts?.low_completion_plans ?? []

  return (
    <div>
      {(overdue.length > 0 || lowRate.length > 0) && (
        <div className="grid mb20" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="card" style={{ borderColor: 'rgba(245,158,11,0.4)' }}>
            <div className="card-title">⚠️ 周期单元逾期提醒 <span className="sub">{overdue.length} 个未安排单元已过计划日期</span></div>
            {overdue.length === 0 ? <div className="empty" style={{ padding: '14px' }}>暂无逾期单元</div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>会员</th><th>周期计划 / 单元</th><th>计划日期</th><th>逾期</th></tr></thead>
                  <tbody>
                    {overdue.slice(0, 6).map((o) => (
                      <tr key={o.unit_id}>
                        <td><b>{o.member_name}</b></td>
                        <td style={{ fontSize: 12.5 }}>{o.plan_name}<div className="faint">{o.unit_title}</div></td>
                        <td>{o.scheduled_date}</td>
                        <td><span className="tag tag-amber">{o.days_overdue} 天</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="card" style={{ borderColor: 'rgba(248,113,113,0.4)' }}>
            <div className="card-title">📉 低完成率计划提醒 <span className="sub">单元执行率低于 60%</span></div>
            {lowRate.length === 0 ? <div className="empty" style={{ padding: '14px' }}>暂无低完成率计划</div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>会员</th><th>周期计划</th><th>完成</th><th>执行率</th></tr></thead>
                  <tbody>
                    {lowRate.slice(0, 6).map((o) => (
                      <tr key={o.plan_id}>
                        <td><b>{o.member_name}</b></td>
                        <td style={{ fontSize: 12.5 }}>{o.plan_name}<div className="faint">{o.weeks} 周周期</div></td>
                        <td>{o.completed_units}/{o.due_units} 应执行</td>
                        <td><span className="tag tag-red">{o.completion_rate}%</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-4 mb20">
        <div className="card stat"><span className="ico">📅</span><div className="label">今日课程</div>
          <div className="value">{data.today_count}<small> 节</small></div>
          <div className="foot">待签到与课后登记</div></div>
        <div className="card stat blue"><span className="ico">🗓️</span><div className="label">未来7天预约</div>
          <div className="value">{data.week_count}<small> 节</small></div>
          <div className="foot">含今日待上课</div></div>
        <div className="card stat amber"><span className="ico">✅</span><div className="label">本月已完成</div>
          <div className="value">{data.month_completed}<small> 节</small></div>
          <div className="foot">按自然月统计</div></div>
        <div className="card stat purple"><span className="ico">🔁</span><div className="label">服务闭环</div>
          <div className="value" style={{ fontSize: 20, paddingTop: 6 }}>课前简报 → 课后登记</div>
          <div className="foot">课前查看历史与遗留问题</div></div>
      </div>

      <div className="card">
        <div className="tabs">
          <div className={`tab ${tab === 'today' ? 'active' : ''}`} onClick={() => setTab('today')}>今日课程 ({data.today_count})</div>
          <div className={`tab ${tab === 'week' ? 'active' : ''}`} onClick={() => setTab('week')}>未来7天 ({data.week_count})</div>
        </div>

        {list.length === 0 ? <div className="empty">当前时段没有待上课程</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>时间</th><th>会员</th><th>目标 / 部位</th><th>体能限制</th><th>场地</th><th>操作</th></tr></thead>
              <tbody>
                {list.map((b) => {
                  const started = new Date(b.slot?.start_time ?? 0).getTime() <= Date.now()
                  return (
                  <tr key={b.id}>
                    <td><b>{fmtDateTime(b.slot?.start_time)}</b><div className="faint">{weekdayLabel(b.slot?.start_time ?? '')}</div></td>
                    <td>
                      <div className="flex gap6">
                        <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>{b.member?.full_name.slice(0, 1)}</div>
                        <div><b>{b.member?.full_name}</b><div className="faint" style={{ fontSize: 12 }}>📞 {b.member?.phone || '未填'}</div></div>
                      </div>
                    </td>
                    <td>{b.goal_label}<div className="faint">{b.focus_parts_labels.join(' / ') || '全身'}</div>
                      {b.plan_unit && <div className="tag tag-purple mt8" style={{ width: 'fit-content' }}>
                        🔁 {unitTitle(b.plan_unit)}
                      </div>}
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <span className="tag tag-amber">{b.limitations || b.member?.profile?.limitations || '无限制'}</span>
                    </td>
                    <td>{b.slot?.venue?.name}</td>
                    <td>
                      <div className="flex gap6" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => openBrief(b.id)}>📋 课前简报</button>
                        <button className={started ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                          disabled={!started} title={started ? '' : '开课后才能登记训练记录'}
                          onClick={async () => { await openBrief(b.id); setSessionTarget(null) }}>
                          {started ? '登记训练' : '未开课'}
                        </button>
                        <button className="btn btn-danger btn-sm" disabled={busyId === b.id || !started}
                          title={started ? '' : '开课后才能标记爽约'}
                          onClick={() => noShow(b.id)}>爽约</button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {brief && !sessionTarget && (
        <BriefModal brief={brief} onClose={() => setBrief(null)}
          onRegister={() => { setSessionTarget(brief) }} />
      )}
      {brief && sessionTarget && (
        <SessionRegisterModal
          brief={brief}
          onClose={() => { setSessionTarget(null); setBrief(null); load() }}
          onDone={(reminders) => {
            setSessionTarget(null); setBrief(null); load()
            reminders.forEach((r: any) => toast(r.message))
          }}
        />
      )}
    </div>
  )
}

/* ---------------- 课前简报 ---------------- */
function BriefModal({ brief, onClose, onRegister }: {
  brief: Brief
  onClose: () => void
  onRegister: () => void
}) {
  const { booking: b, profile, measurement_diff: diff, history, goals, leftover_question, plan_unit, plan_info } = brief
  return (
    <Modal title={`课前简报 · ${b.member?.full_name}`} onClose={onClose} wide>
      <div className="grid grid-2">
        <div className="card soft">
          <div className="card-title">🩺 健康档案</div>
          <div className="kv"><span>训练目标</span><b>{profile?.goal_label}</b></div>
          <div className="kv"><span>偏好部位</span><b>{profile?.preferred_parts_list.join(' / ')}</b></div>
          <div className="kv"><span>身高</span><b>{profile?.height_cm ?? '-'} cm</b></div>
          <div className="kv"><span>体能限制</span><b className="tag tag-amber">{profile?.limitations || '无'}</b></div>
          <div className="kv"><span>既往伤病</span><b>{profile?.injuries || '无'}</b></div>
        </div>
        <div className="card soft">
          <div className="card-title">📌 本次预约 & 上次遗留</div>
          <div className="kv"><span>时间</span><b>{fmtDateTime(b.slot?.start_time)}</b></div>
          <div className="kv"><span>目标</span><b>{b.goal_label}</b></div>
          <div className="kv"><span>部位</span><b>{b.focus_parts_labels.join(' / ')}</b></div>
          <div className="kv"><span>套用模板</span><b>{brief.template?.name ?? '现场安排'}</b></div>
          <div className="alert alert-warn mt12">
            <span>🩹</span>
            <div>
              <b>本次预约临时伤病限制（以会员约课时填写为准）：</b><br />
              {b.limitations || '会员本次未填写临时限制'}
            </div>
          </div>
          {leftover_question && (
            <div className="alert alert-info mt12">📝 上次遗留 / 下次重点：{leftover_question}</div>
          )}
        </div>
      </div>

      {plan_unit && (
        <div className="card soft mt16" style={{ borderColor: 'rgba(34,211,167,0.4)' }}>
          <div className="card-title">🔁 周期计划单元 · 本次应执行内容
            <span className="tag tag-purple">{plan_info?.name} · 第{plan_info?.week_no}周</span>
          </div>
          <div className="flex gap6 flex-wrap mb12">
            <span className="tag tag-green">{plan_unit.goal_label}</span>
            {plan_unit.focus_parts_labels.map((p) => <span key={p} className="tag tag-blue">{p}</span>)}
            <span className="tag tag-gray">计划日期 {plan_unit.scheduled_date}</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>计划动作</th><th>组×次</th><th>计划负重</th><th>备注</th></tr></thead>
              <tbody>
                {parseExercises(plan_unit.planned_exercises_json).map((e: any, i: number) => (
                  <tr key={i}>
                    <td><b>{e.name}</b></td>
                    <td>{e.sets} × {e.reps}</td>
                    <td>{e.weight > 0 ? `${e.weight} kg` : '自重'}</td>
                    <td className="faint">{e.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {plan_unit.planned_note && <div className="muted mt8" style={{ fontSize: 12.5 }}>📝 {plan_unit.planned_note}</div>}
          <div className="muted mt8" style={{ fontSize: 12 }}>完课后将自动保存执行快照（不受计划/模板后续修改影响），并计算动作完成率与训练量偏差。</div>
        </div>
      )}

      <div className="card soft mt16">
        <div className="card-title">📈 阶段体测变化（首测 → 最近）</div>
        {Object.keys(diff).length === 0 ? <div className="empty">暂无题测数据</div> : (
          <div className="grid grid-4">
            {([['weight', '体重', 'kg', true], ['body_fat_pct', '体脂率', '%', true],
              ['muscle_mass', '肌肉量', 'kg', false], ['waist', '腰围', 'cm', true]] as const)
              .filter(([k]) => diff[k] !== undefined)
              .map(([k, label, unit, goodDown]) => (
                <div key={k as string}>
                  <div className="faint" style={{ fontSize: 12 }}>{label}</div>
                  <div className={diff[k as string] > 0 ? (goodDown ? 'delta-bad' : 'delta-good') : (goodDown ? 'delta-good' : 'delta-bad')}
                    style={{ fontSize: 18, fontWeight: 800 }}>
                    {diff[k as string] > 0 ? '+' : ''}{diff[k as string]}{unit}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      <div className="card soft mt16">
        <div className="card-title">🎯 进行中的目标</div>
        {goals.filter((g) => !g.achieved).length === 0 ? <div className="empty">暂无进行中的目标</div> : (
          goals.filter((g) => !g.achieved).map((g: Goal) => (
            <div key={g.id} className="mb12">
              <div className="flex-between">
                <b>{g.title}</b>
                <span className="muted" style={{ fontSize: 12 }}>
                  当前 {g.current_value ?? '-'} / 目标 {g.target_value} {g.metric_label.includes('%') ? '' : ''}
                </span>
              </div>
              <div className="progress"><div style={{ width: `${Math.round((g.progress ?? 0) * 100)}%` }} /></div>
            </div>
          ))
        )}
      </div>

      <div className="card soft mt16">
        <div className="card-title">📚 历史训练记录（近 {history.length} 节）</div>
        {history.length === 0 ? <div className="empty">这是会员的第一节私教课</div> : (
          <div className="timeline mt12">
            {history.slice(0, 6).map((h) => {
              const s = h.session
              const exs = s ? parseExercises(s.exercises_json) : []
              return (
                <div key={h.id} className="tl-item">
                  <div className="tl-head">
                    <b>{fmtDateTime(h.slot?.start_time)} · {h.goal_label}</b>
                    {s?.rpe && <span className="tag tag-purple">RPE {s.rpe}</span>}
                  </div>
                  <div className="mt8">
                    {exs.map((e, i) => (
                      <span key={i} className="exercise-pill">{e.name}
                        <b>{e.sets}×{e.reps}</b>{e.weight > 0 && <span className="faint">{e.weight}kg</span>}
                      </span>
                    ))}
                  </div>
                  {s?.next_focus && <div className="muted mt8" style={{ fontSize: 12.5 }}>📝 下次重点：{s.next_focus}</div>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex mt16" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>关闭</button>
        <button className="btn btn-primary" onClick={onRegister}>✍️ 进入课后登记</button>
      </div>
    </Modal>
  )
}

/* ---------------- 课后登记 ---------------- */
function SessionRegisterModal({ brief, onClose, onDone }: {
  brief: Brief
  onClose: () => void
  onDone: (reminders: any[]) => void
}) {
  const toast = useToast()
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [duration, setDuration] = useState(60)
  const [warmup, setWarmup] = useState('')
  const [rpe, setRpe] = useState(7)
  const [summary, setSummary] = useState('')
  const [leftover, setLeftover] = useState(brief.leftover_question)
  const [nextFocus, setNextFocus] = useState('')
  const [exs, setExs] = useState<ExerciseItem[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/content').then((r) => {
      setContent(r.data)
      // 优先带入周期计划单元的计划动作(组次/负重/备注), 其次约课模板, 最后按部位从动作库预填
      let applied = false
      if (brief.plan_unit) {
        try {
          const planExs = JSON.parse(brief.plan_unit.planned_exercises_json) as ExerciseItem[]
          if (planExs.length) { setExs(planExs.map((e) => ({ ...e }))); applied = true }
        } catch { /* 解析失败则退回模板 */ }
      }
      if (!applied && brief.template) {
        try {
          const tplExs = JSON.parse(brief.template.exercises_json) as ExerciseItem[]
          if (tplExs.length) { setExs(tplExs); applied = true }
        } catch { /* 模板解析失败则退回动作库 */ }
      }
      if (applied) return
      // 无计划/模板: 按本次重点部位从动作库预填前3个
      const prefill: ExerciseItem[] = []
      const part = brief.booking.focus_parts_list[0]
      if (part && r.data.exercise_library[part]) {
        ;(r.data.exercise_library[part] as [string, string, number][]).slice(0, 3)
          .forEach(([name, note, weight]) =>
            prefill.push({ name, part, sets: 3, reps: '10', weight, note }))
      }
      setExs(prefill)
    })
  }, [])

  const addExercise = () => setExs((a) => [...a, { name: '', part: brief.booking.focus_parts_list[0] || 'fullbody', sets: 3, reps: '10', weight: 0, note: '' }])
  const patch = (i: number, k: keyof ExerciseItem, v: any) =>
    setExs((a) => a.map((e, j) => j === i ? { ...e, [k]: v } : e))
  const remove = (i: number) => setExs((a) => a.filter((_, j) => j !== i))

  // 周期单元: 实时估算动作完成率与训练量偏差
  const plannedExs: ExerciseItem[] = brief.plan_unit ? parseExercises(brief.plan_unit.planned_exercises_json) : []
  const norm = (n: string) => (n || '').replace(/[\s（）()/\-—·:：]/g, '').toLowerCase()
  const liveMatched = plannedExs.length
    ? plannedExs.filter((p) => exs.some((e) => norm(e.name) === norm(p.name))).length : 0
  const liveRate = plannedExs.length ? Math.round(100 * liveMatched / plannedExs.length) : null
  const plannedVol = totalVolume(plannedExs)
  const actualVol = totalVolume(exs)

  const submit = async () => {
    if (!exs.length) { toast('至少登记一个训练动作', 'err'); return }
    if (exs.some((e) => !e.name)) { toast('动作名称不能为空', 'err'); return }
    setBusy(true)
    try {
      const { data } = await api.post(`/bookings/${brief.booking.id}/session`, {
        duration_min: duration, warmup, rpe, summary, leftover,
        next_focus: nextFocus, exercises: exs,
      })
      if (data.plan_comparison) {
        const pc = data.plan_comparison
        toast(`已保存执行快照：动作完成率 ${pc.completion_rate}%，实际训练量 ${fmtVolume(pc.actual_volume)} / 计划 ${fmtVolume(pc.planned_volume)}`)
      } else {
        toast('训练记录已保存，课时已扣减并完结课程')
      }
      onDone(data.reminders ?? [])
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  return (
    <Modal title={`课后训练登记 · ${brief.booking.member?.full_name}`} onClose={onClose} wide>
      <div className="row">
        <label className="fld"><span>课程时长(分钟)</span>
          <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
        <label className="fld"><span>主观疲劳度 RPE（1-10）</span>
          <select value={rpe} onChange={(e) => setRpe(Number(e.target.value))}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n} · {content?.rpe_labels[n - 1]?.label ?? ''}</option>
            ))}
          </select></label>
      </div>
      <label className="fld"><span>热身安排</span>
        <input value={warmup} onChange={(e) => setWarmup(e.target.value)} placeholder="如：跑步机5分钟+动态拉伸" /></label>

      {brief.plan_unit && (
        <div className="alert alert-info mb12">
          <span>🔁</span>
          <div>
            关联周期计划「{brief.plan_info?.name}」第{brief.plan_info?.week_no}周单元，下方已带入计划动作；
            完课后将冻结执行快照。
            <div className="flex gap6 mt8 flex-wrap">
              <span className="tag tag-green">预计动作完成率 {liveRate}%（{liveMatched}/{plannedExs.length}）</span>
              <span className="tag tag-blue">实际训练量 {fmtVolume(actualVol)}</span>
              <span className="tag tag-gray">计划训练量 {fmtVolume(plannedVol)}</span>
            </div>
          </div>
        </div>
      )}

      <div className="card-title mt12">动作清单与负重数据
        <button className="btn btn-ghost btn-sm" onClick={addExercise}>+ 添加动作</button>
      </div>
      <div className="table-wrap mb16">
        <table>
          <thead><tr><th>动作</th><th>部位</th><th>组数</th><th>次数</th><th>负重kg</th><th>备注</th><th></th></tr></thead>
          <tbody>
            {exs.map((e, i) => (
              <tr key={i}>
                <td><input value={e.name} onChange={(ev) => patch(i, 'name', ev.target.value)} /></td>
                <td>
                  <select value={e.part} onChange={(ev) => patch(i, 'part', ev.target.value)}>
                    {content?.parts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </td>
                <td style={{ width: 70 }}><input type="number" value={e.sets} onChange={(ev) => patch(i, 'sets', Number(ev.target.value))} /></td>
                <td style={{ width: 80 }}><input value={e.reps} onChange={(ev) => patch(i, 'reps', ev.target.value)} /></td>
                <td style={{ width: 90 }}><input type="number" step="0.5" value={e.weight} onChange={(ev) => patch(i, 'weight', Number(ev.target.value))} /></td>
                <td><input value={e.note} onChange={(ev) => patch(i, 'note', ev.target.value)} placeholder="握法/节奏" /></td>
                <td><button className="btn btn-danger btn-sm" onClick={() => remove(i)}>删</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <label className="fld"><span>承接的上次遗留问题</span>
        <textarea value={leftover} onChange={(e) => setLeftover(e.target.value)} /></label>
      <label className="fld"><span>课堂小结</span>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="动作质量、负荷适应、状态评估…" /></label>
      <label className="fld"><span>下次课重点（将自动出现在下一节的课前简报）</span>
        <textarea value={nextFocus} onChange={(e) => setNextFocus(e.target.value)} placeholder="如：下次测试深蹲1RM、加强离心控制…" /></label>

      <div className="flex" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? '保存中…' : '保存记录并完结课程'}</button>
      </div>
    </Modal>
  )
}
