import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, errText } from '../api'
import { useToast } from '../toast'
import { Loading } from '../components/ui'
import { ContentBundle, CyclePlanInput, ExerciseItem, MemberSummary, PlanTemplate, PlanUnitInput } from '../types'
import { fmtDate, parseEx } from '../utils'

const DAY_MS = 86400000
function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export default function PlanEditor() {
  const nav = useNavigate()
  const toast = useToast()
  const [sp] = useSearchParams()
  const [members, setMembers] = useState<MemberSummary[]>([])
  const [templates, setTemplates] = useState<PlanTemplate[]>([])
  const [content, setContent] = useState<ContentBundle | null>(null)

  const [memberId, setMemberId] = useState<number>(Number(sp.get('member_id')) || 0)
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('fat_loss')
  const [weeks, setWeeks] = useState(8)
  const [startDate, setStartDate] = useState(isoDate(new Date(Date.now() + 2 * DAY_MS)))
  const [templateId, setTemplateId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [units, setUnits] = useState<PlanUnitInput[]>([])
  const [autoWeekday, setAutoWeekday] = useState(1)   // 周一
  const [unitsPerWeek, setUnitsPerWeek] = useState(2)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      api.get<MemberSummary[]>('/members'),
      api.get<PlanTemplate[]>('/templates'),
      api.get<ContentBundle>('/content'),
    ]).then(([m, t, c]) => {
      setMembers(m.data); setTemplates(t.data); setContent(c.data)
      const firstTpl = t.data[0]
      if (firstTpl) { setTemplateId(firstTpl.id); setGoal(firstTpl.goal); setName(`周期训练计划（${weeks}周）`) }
    })
  }, [])

  const endDate = useMemo(() => {
    const d = new Date(startDate + 'T00:00:00')
    d.setDate(d.getDate() + weeks * 7 - 1)
    return isoDate(d)
  }, [startDate, weeks])

  const template = templates.find((t) => t.id === templateId) || null

  // 自动生成：首练日 = 开始日期当天或之后的第一个「选定星期」，之后每周同日推进、
  // 同周按间隔排布（日期单调递增、不早于开始日、超出结束日的单元自动舍弃）。
  const autofill = () => {
    if (!template) { toast('请先选择基础模板', 'err'); return }
    const exs = parseEx(template.exercises_json) as ExerciseItem[]
    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T00:00:00')
    const startWeekday = (start.getDay() + 6) % 7
    const delta0 = (autoWeekday - startWeekday + 7) % 7   // 距首个选定星期的天数
    const first = new Date(start); first.setDate(start.getDate() + delta0)
    const gaps = unitsPerWeek >= 3 ? [0, 2, 4] : unitsPerWeek === 2 ? [0, 3] : [0]
    const candidates: Date[] = []
    for (let w = 0; w < weeks; w++) {
      gaps.slice(0, unitsPerWeek).forEach((g) => {
        const d = new Date(first); d.setDate(first.getDate() + w * 7 + g)
        if (d >= start && d <= end) candidates.push(d)
      })
    }
    candidates.sort((a, b) => a.getTime() - b.getTime())
    const next: PlanUnitInput[] = []
    const seen = new Set<string>()
    for (const d of candidates) {
      const key = isoDate(d)
      if (seen.has(key)) continue
      seen.add(key)
      const weekNo = Math.max(1, Math.min(weeks, Math.floor((d.getTime() - start.getTime()) / 604800000) + 1))
      next.push({
        week_no: weekNo,
        scheduled_date: key,
        title: `第${weekNo}周·${template.primary_part_label}`,
        goal: template.goal,
        focus_parts: [template.primary_part],
        exercises: exs.map((e) => ({ ...e })),
        note: '',
      })
    }
    setUnits(next)
    toast(`已生成 ${next.length} 个训练单元，可逐单元微调`)
  }


  const patchUnit = (i: number, k: keyof PlanUnitInput, v: any) =>
    setUnits((arr) => arr.map((u, j) => j === i ? { ...u, [k]: v } : u))
  const patchEx = (ui: number, ei: number, k: keyof ExerciseItem, v: any) =>
    setUnits((arr) => arr.map((u, j) => j === ui
      ? { ...u, exercises: u.exercises.map((e, x) => x === ei ? { ...e, [k]: v } : e) } : u))
  const removeEx = (ui: number, ei: number) =>
    setUnits((arr) => arr.map((u, j) => j === ui
      ? { ...u, exercises: u.exercises.filter((_, x) => x !== ei) } : u))
  const addEx = (ui: number) =>
    setUnits((arr) => arr.map((u, j) => j === ui
      ? { ...u, exercises: [...u.exercises, {
          name: '', part: u.focus_parts[0] || (template?.primary_part ?? 'fullbody'),
          sets: 3, reps: '10', weight: 0, note: '',
        }] } : u))
  const addExFromLibrary = (ui: number, part: string) => {
    const lib = content?.exercise_library[part] ?? []
    setUnits((arr) => arr.map((u, j) => {
      if (j !== ui) return u
      const added: ExerciseItem[] = lib.map(([n, nt, w]) => ({ name: n, part, sets: 3, reps: '10', weight: w, note: nt }))
      return { ...u, exercises: [...u.exercises, ...added] }
    }))
  }
  const removeUnit = (i: number) => setUnits((arr) => arr.filter((_, j) => j !== i))
  const addUnit = () => {
    const d = new Date(startDate + 'T00:00:00')
    d.setDate(d.getDate() + units.length * 3)
    setUnits((a) => [...a, {
      week_no: Math.min(weeks, Math.floor(a.length / Math.max(1, unitsPerWeek)) + 1),
      scheduled_date: isoDate(d) > endDate ? endDate : isoDate(d), title: '自定义单元', goal,
      focus_parts: template ? [template.primary_part] : [],
      exercises: [], note: '',
    }])
  }

  const submit = async (asDraft: boolean) => {
    if (!memberId) { toast('请选择会员', 'err'); return }
    if (!name.trim()) { toast('请填写计划名称', 'err'); return }
    if (!asDraft && units.length === 0) { toast('请至少编排 1 个训练单元（可使用自动生成）', 'err'); return }
    if (units.some((u) => u.scheduled_date < startDate || u.scheduled_date > endDate)) {
      toast('存在超出计划周期日期的单元', 'err'); return
    }
    if (units.some((u) => u.week_no < 1 || u.week_no > weeks)) {
      toast('存在周次超出 1~' + weeks + ' 的单元', 'err'); return
    }
    if (!asDraft && units.some((u) => u.exercises.some((e) => !e.name.trim()))) {
      toast('存在未填写名称的动作，请补全或删除', 'err'); return
    }
    setBusy(true)
    const payload: CyclePlanInput = {
      member_id: memberId, template_id: templateId, name: name.trim(), goal,
      weeks, start_date: startDate, note, status: asDraft ? 'draft' : 'published',
      units: units.map((u) => ({ ...u, exercises: u.exercises.map((e) => ({ ...e, name: e.name.trim() })) })),
    }
    try {
      const { data } = await api.post('/plans', payload)
      toast(asDraft ? '草稿已保存' : '周期计划已发布，会员约课时即可关联')
      nav(`/plans/${data.id}`)
    } catch (e) { toast(errText(e), 'err') } finally { setBusy(false) }
  }

  if (!content) return <Loading />

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb16" onClick={() => nav('/plans')}>← 返回计划列表</button>

      <div className="card mb20">
        <div className="card-title">📋 计划基础信息 <span className="sub">基于训练模板复制动作清单，之后模板修改不影响本计划</span></div>
        <div className="row">
          <label className="fld"><span>会员 *</span>
            <select value={memberId} onChange={(e) => setMemberId(Number(e.target.value))}>
              <option value={0}>请选择会员</option>
              {members.map((m) => <option key={m.id} value={m.id}>
                {m.full_name} · 剩余 {m.package_remaining ?? 0} 节
              </option>)}
            </select></label>
          <label className="fld"><span>计划名称 *</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：张伟减脂8周周期计划" /></label>
        </div>
        <div className="row">
          <label className="fld"><span>训练目标</span>
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              {content.goals.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select></label>
          <label className="fld"><span>基础模板（复制动作）</span>
            <select value={templateId ?? ''} onChange={(e) => {
              const id = e.target.value ? Number(e.target.value) : null
              setTemplateId(id)
              const t = templates.find((x) => x.id === id)
              if (t) { setGoal(t.goal); if (!name) setName(t.name) }
            }}>
              <option value="">不使用模板（手动编排）</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.primary_part_label}</option>)}
            </select></label>
        </div>
        <div className="row">
          <label className="fld"><span>周期周数（4~12 周）</span>
            <div className="chk-row">
              {[4, 6, 8, 10, 12].map((w) => (
                <span key={w} className={`chip ${weeks === w ? 'on' : ''}`}
                  onClick={() => { setWeeks(w); if (name.endsWith('周）')) setName(name.replace(/\d+周/, `${w}周`)) }}>{w}周</span>
              ))}
            </div></label>
          <label className="fld"><span>开始日期</span>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label className="fld"><span>结束日期（自动）</span>
            <input value={fmtDate(endDate)} disabled /></label>
        </div>
        <label className="fld"><span>计划整体备注</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="周期目标、负荷递进思路、饮食配合…" /></label>
      </div>

      <div className="card mb20">
        <div className="card-title">🗓️ 按周自动编排
          <button className="btn btn-primary btn-sm" onClick={autofill}>按以下规则生成单元</button>
        </div>
        <div className="row">
          <label className="fld"><span>每周首个训练日</span>
            <select value={autoWeekday} onChange={(e) => setAutoWeekday(Number(e.target.value))}>
              {['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map((d, i) =>
                <option key={d} value={i}>{d}</option>)}
            </select></label>
          <label className="fld"><span>每周训练频次</span>
            <select value={unitsPerWeek} onChange={(e) => setUnitsPerWeek(Number(e.target.value))}>
              <option value={1}>每周 1 练</option><option value={2}>每周 2 练</option><option value={3}>每周 3 练</option>
            </select></label>
          <div className="fld"><span className="faint" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>生成数量</span>
            <b>{weeks * unitsPerWeek} 个单元（{weeks} 周 × {unitsPerWeek} 练）</b></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">🧩 训练单元（{units.length}）
          <div className="flex gap6">
            <button className="btn btn-ghost btn-sm" onClick={addUnit}>+ 手动添加单元</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setUnits([])}>清空</button>
          </div>
        </div>
        {units.length === 0 ? <div className="empty">尚未编排单元，点击上方「按以下规则生成单元」快速生成</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>周次</th><th>日期</th><th>单元标题 / 目标 / 部位</th><th>动作（组×次 × 负重）</th><th>备注</th><th></th></tr></thead>
              <tbody>
                {units.map((u, i) => (
                  <tr key={i}>
                    <td style={{ width: 56 }}>
                      <input type="number" min={1} max={12} value={u.week_no}
                        onChange={(e) => patchUnit(i, 'week_no', Number(e.target.value))} />
                    </td>
                    <td style={{ width: 140 }}>
                      <input type="date" value={u.scheduled_date} min={startDate} max={endDate}
                        onChange={(e) => patchUnit(i, 'scheduled_date', e.target.value)} />
                    </td>
                    <td style={{ minWidth: 190 }}>
                      <input value={u.title} onChange={(e) => patchUnit(i, 'title', e.target.value)} className="mb8" />
                      <div className="flex gap6">
                        <select value={u.goal} onChange={(e) => patchUnit(i, 'goal', e.target.value)}>
                          {content.goals.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                        </select>
                        <select value={u.focus_parts[0] ?? ''}
                          onChange={(e) => patchUnit(i, 'focus_parts', e.target.value ? [e.target.value] : [])}>
                          <option value="">部位</option>
                          {content.parts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={{ minWidth: 360 }}>
                      {u.exercises.length === 0 && (
                        <div className="faint mb8" style={{ fontSize: 12 }}>尚无动作，请手动添加或从动作库按部位预填</div>
                      )}
                      {u.exercises.map((ex, ei) => (
                        <div key={ei} className="flex gap6 mb8" style={{ alignItems: 'center' }}>
                          <input style={{ flex: 1, minWidth: 110 }} value={ex.name} placeholder="动作名称"
                            onChange={(e) => patchEx(i, ei, 'name', e.target.value)} title="动作名称" />
                          <select style={{ width: 74 }} value={ex.part}
                            onChange={(e) => patchEx(i, ei, 'part', e.target.value)} title="部位">
                            {content.parts.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                          </select>
                          <input style={{ width: 52 }} type="number" value={ex.sets}
                            onChange={(e) => patchEx(i, ei, 'sets', Number(e.target.value))} title="组数" />
                          <input style={{ width: 62 }} value={ex.reps}
                            onChange={(e) => patchEx(i, ei, 'reps', e.target.value)} title="次数" />
                          <input style={{ width: 62 }} type="number" step="0.5" value={ex.weight}
                            onChange={(e) => patchEx(i, ei, 'weight', Number(e.target.value))} title="负重kg" />
                          <button className="btn btn-danger btn-sm" style={{ padding: '6px 9px' }}
                            onClick={() => removeEx(i, ei)} title="删除动作">×</button>
                        </div>
                      ))}
                      <div className="flex gap6">
                        <button className="btn btn-ghost btn-sm" onClick={() => addEx(i)}>+ 自定义动作</button>
                        <select value="" style={{ width: 'auto', flex: 'none' }}
                          onChange={(e) => { if (e.target.value) addExFromLibrary(i, e.target.value); e.target.value = '' }}>
                          <option value="">从动作库添加…</option>
                          {content.parts.map((p) => <option key={p.key} value={p.key}>＋ {p.label}</option>)}
                        </select>
                      </div>
                    </td>
                    <td style={{ minWidth: 120 }}>
                      <input value={u.note} onChange={(e) => patchUnit(i, 'note', e.target.value)} placeholder="单元备注" />
                    </td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeUnit(i)}>删</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex mt16" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={() => nav('/plans')}>取消</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => submit(true)}>存为草稿</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => submit(false)}>
            {busy ? '发布中…' : `发布周期计划（${units.length} 单元）`}
          </button>
        </div>
      </div>
    </div>
  )
}
