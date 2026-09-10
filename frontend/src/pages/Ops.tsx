import { useEffect, useState } from 'react'
import { api, errText } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../toast'
import { Modal } from '../components/ui'
import { ContentBundle, PlanTemplate, Slot, Venue } from '../types'
import { fmtDateTime } from '../utils'

type Tab = 'venue' | 'slot' | 'template'

export default function Ops() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('slot')
  return (
    <div>
      <div className="tabs">
        <div className={`tab ${tab === 'slot' ? 'active' : ''}`} onClick={() => setTab('slot')}>⏰ 私教时段维护</div>
        <div className={`tab ${tab === 'venue' ? 'active' : ''}`} onClick={() => setTab('venue')}>🏟️ 器械区 / 团课教室</div>
        <div className={`tab ${tab === 'template' ? 'active' : ''}`} onClick={() => setTab('template')}>📋 训练计划模板</div>
      </div>
      {tab === 'slot' && <SlotTab />}
      {tab === 'venue' && <VenueTab isAdmin={user?.role === 'admin'} />}
      {tab === 'template' && <TemplateTab isAdmin={user?.role === 'admin'} />}
    </div>
  )
}

/* ---------------- 场地 ---------------- */
function VenueTab({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast()
  const [venues, setVenues] = useState<Venue[]>([])
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [form, setForm] = useState({ name: '', kind: 'area', capacity: 1, note: '' })

  const load = () => api.get<Venue[]>('/venues').then((r) => setVenues(r.data))
  useEffect(() => { load(); api.get('/content').then((r) => setContent(r.data)) }, [])

  const create = async () => {
    if (!form.name.trim()) { toast('请填写场地名称', 'err'); return }
    try {
      await api.post('/venues', form)
      setForm({ name: '', kind: 'area', capacity: 1, note: '' }); load(); toast('场地已创建')
    } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="card-title">场地列表（器械区 / 团课教室）</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>名称</th><th>类型</th><th>容量</th><th>备注</th></tr></thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id}>
                  <td><b>{v.name}</b></td>
                  <td><span className="tag tag-blue">{v.kind_label}</span></td>
                  <td>{v.capacity} 人</td>
                  <td className="faint">{v.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {isAdmin && (
        <div className="card">
          <div className="card-title">新增场地</div>
          <label className="fld"><span>场地名称</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：拉伸放松区" /></label>
          <label className="fld"><span>场地类型</span>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {content?.venue_kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select></label>
          <label className="fld"><span>容量（人）</span>
            <input type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} /></label>
          <label className="fld"><span>备注</span>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <button className="btn btn-primary" onClick={create}>创建场地</button>
        </div>
      )}
    </div>
  )
}

/* ---------------- 时段 ---------------- */
function SlotTab() {
  const { user } = useAuth()
  const toast = useToast()
  const [slots, setSlots] = useState<Slot[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [coaches, setCoaches] = useState<{ id: number; full_name: string }[]>([])
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [coachId, setCoachId] = useState<number>(user?.role === 'coach' ? (user?.id ?? 0) : 0)
  const [venueId, setVenueId] = useState<number>(0)
  const [dates, setDates] = useState('')
  const [startHour, setStartHour] = useState(9)
  const [endHour, setEndHour] = useState(21)
  const [duration, setDuration] = useState(60)
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const [s, v, c] = await Promise.all([
      api.get<Slot[]>(`/slots?${user?.role === 'coach' ? `coach_id=${user.id}&` : ''}`),
      api.get<Venue[]>('/venues'),
      user?.role === 'admin'
        ? api.get<{ id: number; full_name: string }[]>('/coaches')
        : Promise.resolve({ data: [] }),
    ])
    setSlots(s.data); setVenues(v.data); setCoaches(c.data)
    if (!venueId && v.data.length) setVenueId(v.data[0].id)
    if (!coachId && c.data.length) setCoachId(c.data[0].id)
  }
  useEffect(() => { load() }, [])

  const publish = async () => {
    const dateList = dates.split(/[,，\s]+/).filter(Boolean)
    if (!dateList.length) { toast('请填写至少一个日期(YYYY-MM-DD)', 'err'); return }
    setBusy(true)
    try {
      const { data } = await api.post('/slots/bulk', {
        coach_id: coachId, venue_id: venueId, dates: dateList,
        start_hour: startHour, end_hour: endHour, duration_min: duration,
      })
      toast(`已发布 ${data.created} 个时段`)
      load()
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  const remove = async (s: Slot) => {
    if (!confirm(`删除 ${fmtDateTime(s.start_time)} 时段？`)) return
    try { await api.delete(`/slots/${s.id}`); load(); toast('时段已删除') }
    catch (e) { toast(errText(e), 'err') }
  }

  const statusTag: Record<string, string> = {
    open: 'tag tag-green', booked: 'tag tag-blue',
    completed: 'tag tag-gray', no_show: 'tag tag-red',
  }
  const statusLabel: Record<string, string> = {
    open: '可约', booked: '已预约', completed: '已完结', no_show: '爽约',
  }
  const upcoming = slots
    .filter((s) => new Date(s.end_time).getTime() > Date.now())
    .sort((a, b) => a.start_time.localeCompare(b.start_time))

  return (
    <div className="grid" style={{ gridTemplateColumns: '380px 1fr' }}>
      <div className="card">
        <div className="card-title">批量发布私教时段</div>
        {user?.role === 'admin' && (
          <label className="fld"><span>授课教练</span>
            <select value={coachId} onChange={(e) => setCoachId(Number(e.target.value))}>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select></label>
        )}
        {user?.role === 'coach' && <div className="alert alert-info">将发布到你（{user.full_name}）的时段表</div>}
        <label className="fld"><span>场地</span>
          <select value={venueId} onChange={(e) => setVenueId(Number(e.target.value))}>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}（{v.kind_label}）</option>)}
          </select></label>
        <label className="fld"><span>日期（多个用逗号分隔，YYYY-MM-DD）</span>
          <textarea value={dates} onChange={(e) => setDates(e.target.value)} placeholder="2026-09-11,2026-09-12" /></label>
        <div className="row">
          <label className="fld"><span>开始钟点</span>
            <input type="number" value={startHour} min={6} max={22} onChange={(e) => setStartHour(Number(e.target.value))} /></label>
          <label className="fld"><span>结束钟点</span>
            <input type="number" value={endHour} min={7} max={23} onChange={(e) => setEndHour(Number(e.target.value))} /></label>
          <label className="fld"><span>单节(分)</span>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[30, 45, 60, 90].map((m) => <option key={m} value={m}>{m}</option>)}
            </select></label>
        </div>
        <button className="btn btn-primary btn-block" disabled={busy} onClick={publish}>
          {busy ? '发布中…' : '批量生成时段'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">未来时段（{upcoming.length}）<span className="sub">已被预约的时段不可删除</span></div>
        {upcoming.length === 0 ? <div className="empty">暂无未来时段</div> : (
          <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>开始时间</th><th>时长</th><th>场地</th><th>状态</th><th></th></tr></thead>
              <tbody>
                {upcoming.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDateTime(s.start_time)}</td>
                    <td>{Math.round((new Date(s.end_time).getTime() - new Date(s.start_time).getTime()) / 60000)} 分钟</td>
                    <td>{s.venue?.name}</td>
                    <td><span className={statusTag[s.status] ?? 'tag tag-gray'}>{statusLabel[s.status] ?? s.status}</span></td>
                    <td className="right">
                      <button className="btn btn-danger btn-sm" disabled={s.status !== 'open'}
                        onClick={() => remove(s)}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- 训练模板 ---------------- */
function TemplateTab({ isAdmin }: { isAdmin: boolean }) {
  const toast = useToast()
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [editing, setEditing] = useState<PlanTemplate | null>(null)
  const [creating, setCreating] = useState(false)

  const load = async () => {
    const [t, c] = await Promise.all([api.get<PlanTemplate[]>('/templates'), api.get('/content')])
    setTemplates(t.data); setContent(c.data)
  }
  useEffect(() => { load() }, [])

  return (
    <div>
      <div className="flex-between mb16">
        <div className="muted">模板可在会员约课时一键套用，教练课后登记会自动带入模板的完整动作清单与组次负重</div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>+ 新建模板</button>
      </div>
      <div className="grid grid-3">
        {templates.map((t) => {
          let exs: any[] = []
          try { exs = JSON.parse(t.exercises_json) } catch { /* ignore */ }
          return (
            <div key={t.id} className="card">
              <div className="flex-between mb8">
                <b>{t.name}</b>
                <span className="tag tag-purple">{t.level}</span>
              </div>
              <div className="flex gap6 mb8 flex-wrap">
                <span className="tag tag-green">{t.goal_label}</span>
                <span className="tag tag-blue">主练 {t.primary_part_label}</span>
              </div>
              <div className="muted" style={{ fontSize: 12.5 }}>{t.description}</div>
              <div className="mt12">
                {exs.map((e: any, i: number) => (
                  <span key={i} className="exercise-pill">{e.name} <b>{e.sets}×{e.reps}</b>
                    {e.weight > 0 && <span className="faint">{e.weight}kg</span>}</span>
                ))}
              </div>
              <button className="btn btn-ghost btn-sm mt12" onClick={() => setEditing(t)}>查看详情</button>
            </div>
          )
        })}
      </div>

      {(creating || editing) && content && (
        <TemplateEditor
          template={editing}
          content={content}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={() => { setCreating(false); setEditing(null); load(); toast('模板已保存') }}
        />
      )}
    </div>
  )
}

function TemplateEditor({ template, content, onClose, onSaved }: {
  template: PlanTemplate | null
  content: ContentBundle
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const parsed = template ? (() => { try { return JSON.parse(template.exercises_json) } catch { return [] } })() : []
  const [name, setName] = useState(template?.name ?? '')
  const [goal, setGoal] = useState(template?.goal ?? content.goals[0].key)
  const [part, setPart] = useState(template?.primary_part ?? content.parts[0].key)
  const [level, setLevel] = useState(template?.level ?? 'intermediate')
  const [desc, setDesc] = useState(template?.description ?? '')
  const [exs, setExs] = useState<any[]>(parsed)

  const addFromLibrary = (p: string) => {
    const lib = content.exercise_library[p] ?? []
    lib.forEach(([n, note, w]) =>
      setExs((a) => [...a, { name: n, part: p, sets: 3, reps: '10', weight: w, note }]))
  }
  const patch = (i: number, k: string, v: any) => setExs((a) => a.map((e, j) => j === i ? { ...e, [k]: v } : e))
  const remove = (i: number) => setExs((a) => a.filter((_, j) => j !== i))

  const save = async () => {
    if (!name.trim()) { toast('请填写模板名称', 'err'); return }
    if (!exs.length) { toast('至少添加一个动作', 'err'); return }
    try {
      await api.post('/templates', {
        name, goal, primary_part: part, level, description: desc, exercises: exs,
      })
      onSaved()
    } catch (e) { toast(errText(e), 'err') }
  }

  return (
    <Modal title={template ? `模板详情 · ${template.name}` : '新建训练计划模板'} onClose={onClose} wide>
      <div className="alert alert-info mb12">当前版本仅支持新建模板；保存后会员约课即可套用。</div>
      <label className="fld"><span>模板名称</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：上肢推拉进阶模板" /></label>
      <div className="row">
        <label className="fld"><span>训练目标</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            {content.goals.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
          </select></label>
        <label className="fld"><span>主练部位</span>
          <select value={part} onChange={(e) => setPart(e.target.value)}>
            {content.parts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select></label>
        <label className="fld"><span>难度</span>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="beginner">入门</option>
            <option value="intermediate">进阶</option>
            <option value="advanced">高阶</option>
          </select></label>
      </div>
      <label className="fld"><span>说明</span>
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} /></label>

      <div className="card-title mt12">动作清单
        <div className="flex gap6">
          <select value="" onChange={(e) => { if (e.target.value) addFromLibrary(e.target.value); e.target.value = '' }}>
            <option value="">从动作库按部位添加…</option>
            {content.parts.map((p) => <option key={p.key} value={p.key}>＋ {p.label}</option>)}
          </select>
          <button className="btn btn-ghost btn-sm"
            onClick={() => setExs((a) => [...a, { name: '', part, sets: 3, reps: '10', weight: 0, note: '' }])}>+ 自定义</button>
        </div>
      </div>
      <div className="table-wrap mb16">
        <table>
          <thead><tr><th>动作</th><th>部位</th><th>组</th><th>次</th><th>负重kg</th><th>备注</th><th></th></tr></thead>
          <tbody>
            {exs.map((e, i) => (
              <tr key={i}>
                <td><input value={e.name} onChange={(ev) => patch(i, 'name', ev.target.value)} /></td>
                <td>
                  <select value={e.part} onChange={(ev) => patch(i, 'part', ev.target.value)}>
                    {content.parts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </td>
                <td style={{ width: 64 }}><input type="number" value={e.sets} onChange={(ev) => patch(i, 'sets', Number(ev.target.value))} /></td>
                <td style={{ width: 80 }}><input value={e.reps} onChange={(ev) => patch(i, 'reps', ev.target.value)} /></td>
                <td style={{ width: 84 }}><input type="number" step="0.5" value={e.weight} onChange={(ev) => patch(i, 'weight', Number(ev.target.value))} /></td>
                <td><input value={e.note} onChange={(ev) => patch(i, 'note', ev.target.value)} /></td>
                <td><button className="btn btn-danger btn-sm" onClick={() => remove(i)}>删</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={save}>保存模板</button>
      </div>
    </Modal>
  )
}
