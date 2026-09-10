import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Loading } from '../components/ui'
import { MemberSummary } from '../types'
import { fmtDate } from '../utils'

export default function Members() {
  const nav = useNavigate()
  const [rows, setRows] = useState<MemberSummary[] | null>(null)
  const [q, setQ] = useState('')

  useEffect(() => { api.get<MemberSummary[]>('/members').then((r) => setRows(r.data)) }, [])

  const filtered = (rows ?? []).filter((m) =>
    !q || m.full_name.includes(q) || m.username.includes(q) || m.phone.includes(q))

  if (!rows) return <Loading />

  return (
    <div className="card">
      <div className="card-title">
        会员健康档案总览
        <input style={{ width: 240 }} placeholder="搜索姓名 / 用户名 / 手机号"
          value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>会员</th><th>核心目标</th><th>重点部位</th><th>体能限制 / 伤病</th>
            <th>最近体重 / 体脂</th><th>剩余课时</th><th>续约</th><th>入会时间</th><th></th>
          </tr></thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/members/${m.id}`)}>
                <td>
                  <div className="flex gap6">
                    <div className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{m.full_name.slice(0, 1)}</div>
                    <div><b>{m.full_name}</b><div className="faint" style={{ fontSize: 12 }}>{m.phone || '未留电话'}</div></div>
                  </div>
                </td>
                <td><span className="tag tag-green">{m.member_profile?.goal_label}</span></td>
                <td className="muted">{m.member_profile?.preferred_parts_list.map((p) =>
                  ({ chest: '胸', back: '背', legs: '腿', glutes: '臀', shoulder: '肩', arms: '手臂', core: '核心', fullbody: '全身' }[p])).join(' / ')}</td>
                <td style={{ maxWidth: 260 }}>
                  <span className="tag tag-amber">{m.member_profile?.limitations || '无限制'}</span>
                  {m.member_profile?.injuries && <div className="tag tag-red mt8" style={{ display: 'inline-block' }}>伤病：{m.member_profile.injuries}</div>}
                </td>
                <td>
                  {m.latest_measurement
                    ? <>{m.latest_measurement.weight ?? '-'} kg / {m.latest_measurement.body_fat_pct ?? '-'}%</>
                    : <span className="faint">未体测</span>}
                </td>
                <td>
                  <span className={`tag ${(m.package_remaining ?? 0) <= 3 ? 'tag-red' : 'tag-blue'}`}>
                    {m.package_remaining ?? 0} 节
                  </span>
                </td>
                <td>{(m.member_profile?.renewal_count ?? 0) > 0
                  ? <span className="tag tag-purple">已续约 ×{m.member_profile?.renewal_count}</span>
                  : <span className="tag tag-gray">未续约</span>}</td>
                <td className="faint">{fmtDate(m.member_profile?.joined_at)}</td>
                <td className="right"><button className="btn btn-ghost btn-sm">查看档案 →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
