import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { api, errText } from '../api'
import { useAuth } from '../auth'
import { useToast } from '../toast'
import { Loading, Modal } from '../components/ui'
import BodyTracking from '../components/BodyTracking'
import { Booking, ContentBundle, CyclePlan, MemberDetail } from '../types'
import { SessionDetail } from './MySessions'
import { fmtDate, fmtDateTime, STATUS_CLS, STATUS_LABEL, fmtVolume, PLAN_STATE_CLS, PLAN_STATE_LABEL } from '../utils'

export default function MemberArchive() {
  const { id } = useParams()
  const memberId = Number(id)
  const nav = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const [member, setMember] = useState<MemberDetail | null>(null)
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [tab, setTab] = useState<'profile' | 'sessions' | 'body' | 'plans'>('profile')
  const [grant, setGrant] = useState(false)
  const [plans, setPlans] = useState<CyclePlan[]>([])

  const load = async () => {
    const [m, b, c, pl] = await Promise.all([
      api.get<MemberDetail>(`/members/${memberId}`),
      api.get<Booking[]>(`/bookings?member_id=${memberId}`),
      api.get<ContentBundle>('/content'),
      api.get<CyclePlan[]>(`/plans?member_id=${memberId}`),
    ])
    setMember(m.data); setBookings(b.data); setContent(c.data); setPlans(pl.data)
  }
  useEffect(() => { load() }, [memberId])

  if (!member || !bookings) return <Loading />
  const p = member.member_profile
  const completed = bookings.filter((b) => b.status === 'completed')

  return (
    <div>
      <button className="btn btn-ghost btn-sm mb16" onClick={() => nav('/members')}>← 返回会员列表</button>

      <div className="card mb20">
        <div className="flex" style={{ alignItems: 'flex-start', gap: 18 }}>
          <div className="avatar lg">{member.full_name.slice(0, 1)}</div>
          <div style={{ flex: 1 }}>
            <div className="flex gap6 flex-wrap">
              <h2 style={{ fontSize: 22 }}>{member.full_name}</h2>
              <span className="tag tag-green">{p?.goal_label}</span>
              {p?.status === 'active'
                ? <span className="tag tag-blue">在册会员</span>
                : <span className="tag tag-gray">{p?.status}</span>}
              {(p?.renewal_count ?? 0) > 0 && <span className="tag tag-purple">续约 ×{p?.renewal_count}</span>}
            </div>
            <div className="muted mt8" style={{ fontSize: 13 }}>
              📞 {member.phone || '未填'} · 入会 {fmtDate(p?.joined_at)} ·
              已完成 {member.completed_sessions} 节 / 累计购买 {member.total_sessions_bought} 节 ·
              <b style={{ color: 'var(--brand)' }}> 剩余 {member.package_remaining} 节</b>
            </div>
          </div>
          {user?.role === 'admin' && (
            <button className="btn btn-primary" onClick={() => setGrant(true)}>+ 办理课包/续约</button>
          )}
        </div>
      </div>

      <div className="tabs">
        <div className={`tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>🩺 健康档案</div>
        <div className={`tab ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>
          📒 训练记录 ({completed.length})
        </div>
        <div className={`tab ${tab === 'plans' ? 'active' : ''}`} onClick={() => setTab('plans')}>
          🔁 周期计划 ({plans.length})
        </div>
        <div className={`tab ${tab === 'body' ? 'active' : ''}`} onClick={() => setTab('body')}>📈 体测与目标</div>
      </div>

      {tab === 'profile' && <ProfileTab member={member} onSaved={() => { load(); toast('档案已更新') }} />}
      {tab === 'sessions' && (
        <div className="card">
          {completed.length === 0 ? <div className="empty">还没有已完成的训练记录</div> : (
            <div className="timeline">
              {completed.map((b) => (
                <div key={b.id} className="tl-item">
                  <div className="tl-head">
                    <b>{fmtDateTime(b.slot?.start_time)} · {b.goal_label}</b>
                    <span className={STATUS_CLS[b.status]}>{STATUS_LABEL[b.status]}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {b.focus_parts_labels.join(' / ')} · {b.slot?.venue?.name}
                  </div>
                  <SessionDetail b={b} content={content} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {tab === 'body' && <BodyTracking memberId={memberId} canEdit />}
      {tab === 'plans' && (
        <div className="card">
          <div className="flex-between mb16">
            <div className="muted">为该会员编排 4~12 周周期计划，完课后自动保存执行快照与完成率/训练量复盘</div>
            {user?.role === 'coach' && (
              <Link className="btn btn-primary btn-sm" to={`/plans/new?member_id=${memberId}`}>+ 新建周期计划</Link>
            )}
          </div>
          {plans.length === 0 ? <div className="empty">该会员暂无周期计划</div> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>计划</th><th>周期</th><th>状态</th><th>到期执行率</th><th>动作完成率</th><th>实际/计划训练量</th><th></th></tr></thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id}>
                      <td><b>{p.name}</b><div className="faint" style={{ fontSize: 12 }}>{p.goal_label}</div></td>
                      <td style={{ fontSize: 12.5 }}>{fmtDate(p.start_date)}<br />~ {fmtDate(p.end_date)}</td>
                      <td><span className={PLAN_STATE_CLS[p.summary.state]}>{PLAN_STATE_LABEL[p.summary.state]}</span></td>
                      <td>{p.summary.completion_rate ?? '-'}%<div className="faint" style={{ fontSize: 12 }}>{p.summary.completed_units}/{p.summary.due_units} 已到期</div></td>
                      <td>{p.summary.avg_exercise_completion ?? '-'}%</td>
                      <td style={{ fontSize: 12.5 }}>{fmtVolume(p.summary.actual_volume)}<br /><span className="faint">/ {fmtVolume(p.summary.planned_volume)}</span></td>
                      <td className="right"><Link className="btn btn-ghost btn-sm" to={`/plans/${p.id}`}>查看复盘</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {grant && <GrantModal memberId={memberId} onClose={() => setGrant(false)}
        onDone={async (payload) => {
          try {
            await api.post(`/members/${memberId}/packages`, payload)
            setGrant(false); load(); toast('课包办理成功')
          } catch (e) { toast(errText(e), 'err') }
        }} />}
    </div>
  )
}

function ProfileTab({ member, onSaved }: { member: MemberDetail; onSaved: () => void }) {
  const p = member.member_profile
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({
    gender: p?.gender ?? '', height_cm: p?.height_cm ?? '', goal_focus: p?.goal_focus ?? 'fat_loss',
    limitations: p?.limitations ?? '', injuries: p?.injuries ?? '',
    preferred_parts: p?.preferred_parts_list ?? [],
  })
  const toast = useToast()

  const PARTS: [string, string][] = [['chest', '胸'], ['back', '背'], ['legs', '腿'], ['glutes', '臀'],
    ['shoulder', '肩'], ['arms', '手臂'], ['core', '核心'], ['fullbody', '全身']]
  const GOALS: [string, string][] = [['fat_loss', '减脂减重'], ['muscle_gain', '增肌增重'], ['shaping', '塑形紧致'],
    ['strength', '力量提升'], ['conditioning', '体能耐力'], ['rehab', '康复调整']]

  const save = async () => {
    try {
      await api.put(`/members/${member.id}/profile`, {
        ...f, height_cm: f.height_cm === '' ? null : Number(f.height_cm),
      })
      setEdit(false); onSaved()
    } catch (e) { toast(errText(e), 'err') }
  }

  if (!edit) {
    return (
      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">基础信息
            <button className="btn btn-ghost btn-sm" onClick={() => setEdit(true)}>编辑档案</button>
          </div>
          <div className="kv"><span>性别</span><b>{p?.gender === 'M' ? '男' : p?.gender === 'F' ? '女' : '-'}</b></div>
          <div className="kv"><span>出生日期</span><b>{fmtDate(p?.birth_date)}</b></div>
          <div className="kv"><span>身高</span><b>{p?.height_cm ? `${p.height_cm} cm` : '-'}</b></div>
          <div className="kv"><span>核心目标</span><b>{p?.goal_label}</b></div>
          <div className="kv"><span>偏好部位</span><b>{p?.preferred_parts_list.map((x) =>
            Object.fromEntries(PARTS)[x]).join(' / ')}</b></div>
        </div>
        <div className="card">
          <div className="card-title">健康风险与限制</div>
          <div className="kv"><span>体能限制</span><b style={{ maxWidth: 260 }} className="tag tag-amber">{p?.limitations || '无'}</b></div>
          <div className="kv"><span>既往伤病</span><b className="tag tag-red">{p?.injuries || '无'}</b></div>
          <div className="card-title mt16">课包记录</div>
          {member.packages.map((pk) => (
            <div key={pk.id} className="kv">
              <span>{fmtDate(pk.purchased_at)} · {pk.total_sessions}节课包（¥{pk.price}）</span>
              <b className={pk.remaining > 0 ? 'delta-good' : 'faint'}>剩 {pk.remaining} 节</b>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <div className="row">
        <label className="fld"><span>性别</span>
          <select value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value })}>
            <option value="">未填</option><option value="M">男</option><option value="F">女</option>
          </select></label>
        <label className="fld"><span>身高 cm</span>
          <input type="number" value={f.height_cm} onChange={(e) => setF({ ...f, height_cm: e.target.value as any })} /></label>
      </div>
      <label className="fld"><span>核心目标</span>
        <select value={f.goal_focus} onChange={(e) => setF({ ...f, goal_focus: e.target.value })}>
          {GOALS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select></label>
      <label className="fld"><span>重点部位</span>
        <div className="chk-row">
          {PARTS.map(([k, l]) => (
            <span key={k} className={`chip ${f.preferred_parts.includes(k) ? 'on' : ''}`}
              onClick={() => setF({ ...f, preferred_parts: f.preferred_parts.includes(k)
                ? f.preferred_parts.filter((x) => x !== k) : [...f.preferred_parts, k] })}>{l}</span>
          ))}
        </div></label>
      <label className="fld"><span>体能限制</span>
        <textarea value={f.limitations} onChange={(e) => setF({ ...f, limitations: e.target.value })} /></label>
      <label className="fld"><span>既往伤病</span>
        <textarea value={f.injuries} onChange={(e) => setF({ ...f, injuries: e.target.value })} /></label>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={() => setEdit(false)}>取消</button>
        <button className="btn btn-primary" onClick={save}>保存</button>
      </div>
    </div>
  )
}

function GrantModal({ memberId, onClose, onDone }: { memberId: number; onClose: () => void; onDone: (p: any) => void }) {
  const [total, setTotal] = useState(12)
  const [price, setPrice] = useState(3600)
  return (
    <Modal title="办理课包 / 续约" onClose={onClose}>
      <div className="alert alert-info">系统将自动识别该会员是否为再次购课，二次及以上购课计入「续约」统计。</div>
      <label className="fld"><span>课包节数</span>
        <div className="chk-row mb8">
          {[1, 12, 24, 48].map((n) => (
            <span key={n} className={`chip ${total === n ? 'on' : ''}`} onClick={() => { setTotal(n); setPrice(n * 300) }}>
              {n === 1 ? '体验课 1 节' : `${n} 节`}
            </span>
          ))}
        </div>
        <input type="number" value={total} onChange={(e) => setTotal(Number(e.target.value))} />
      </label>
      <label className="fld"><span>课包价格（元）</span>
        <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} /></label>
      <div className="flex" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onClose}>取消</button>
        <button className="btn btn-primary" onClick={() => onDone({ member_id: memberId, total_sessions: total, price })}>
          确认办理
        </button>
      </div>
    </Modal>
  )
}
