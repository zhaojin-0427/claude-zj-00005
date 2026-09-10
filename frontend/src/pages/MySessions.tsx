import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'
import { Loading } from '../components/ui'
import { Booking, ContentBundle } from '../types'
import { fmtDateTime, parseExercises, STATUS_CLS, STATUS_LABEL, weekdayLabel } from '../utils'

export function SessionDetail({ b, content }: { b: Booking; content: ContentBundle | null }) {
  const s = b.session
  const exs = s ? parseExercises(s.exercises_json) : []
  if (!s) return <span className="faint">教练课后将在此填写训练记录</span>
  return (
    <div className="card soft mt12">
      <div className="flex flex-wrap gap6 mb12">
        <span className="tag tag-purple">RPE {s.rpe ?? '-'} {s.rpe_label && `· ${s.rpe_label}`}</span>
        <span className="tag tag-blue">时长 {s.duration_min} 分钟</span>
        {s.warmup && <span className="tag tag-gray">热身：{s.warmup}</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>动作</th><th>部位</th><th>组数×次数</th><th>负重</th><th>备注</th></tr></thead>
          <tbody>
            {exs.map((e: any, i: number) => (
              <tr key={i}>
                <td><b>{e.name}</b></td>
                <td>{content?.parts.find((p) => p.key === e.part)?.label ?? e.part}</td>
                <td>{e.sets} × {e.reps}</td>
                <td>{e.weight > 0 ? `${e.weight} kg` : '自重'}</td>
                <td className="faint">{e.note || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {s.summary && <div className="mt12"><span className="muted">📝 课堂小结：</span>{s.summary}</div>}
      {s.leftover && <div className="mt8"><span className="muted">🔁 承接遗留：</span>{s.leftover}</div>}
      {s.next_focus && (
        <div className="alert alert-info mt12">📌 下次重点：{s.next_focus}</div>
      )}
    </div>
  )
}

export default function MySessions() {
  const { user } = useAuth()
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [content, setContent] = useState<ContentBundle | null>(null)
  const [tab, setTab] = useState<'all' | 'booked' | 'completed' | 'canceled'>('all')
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    api.get('/bookings').then((r) => setBookings(r.data))
    api.get('/content').then((r) => setContent(r.data))
  }, [])

  const filtered = useMemo(() => (bookings ?? []).filter((b) => {
    if (tab === 'all') return true
    if (tab === 'canceled') return b.status === 'canceled' || b.status === 'no_show'
    return b.status === tab
  }), [bookings, tab])
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: bookings?.length ?? 0 }
    bookings?.forEach((b) => { c[b.status] = (c[b.status] ?? 0) + 1 })
    return c
  }, [bookings])

  if (!bookings || !user) return <Loading />

  return (
    <div>
      <div className="grid grid-4 mb20">
        <div className="card stat"><span className="ico">✅</span><div className="label">累计完成课时</div>
          <div className="value">{counts.completed ?? 0}<small> 节</small></div></div>
        <div className="card stat blue"><span className="ico">📅</span><div className="label">待上课</div>
          <div className="value">{counts.booked ?? 0}<small> 节</small></div></div>
        <div className="card stat amber"><span className="ico">⏳</span><div className="label">剩余课时</div>
          <div className="value">{user.package_remaining ?? 0}<small> 节</small></div></div>
        <div className="card stat purple"><span className="ico">🎯</span><div className="label">当前训练目标</div>
          <div className="value" style={{ fontSize: 17, paddingTop: 8 }}>{user.member_profile?.goal_label}</div></div>
      </div>

      <div className="card">
        <div className="tabs">
          {[['all', '全部'], ['booked', '待上课'], ['completed', '已完成'], ['canceled', '已取消/爽约']].map(([k, l]) => (
            <div key={k} className={`tab ${tab === k ? 'active' : ''}`}
              onClick={() => setTab(k as any)}>
              {l} ({k === 'all' ? counts.all : (k === 'canceled'
                ? (counts.canceled ?? 0) + (counts.no_show ?? 0)
                : counts[k] ?? 0)})
            </div>
          ))}
        </div>

        {filtered.length === 0 ? <div className="empty">暂无训练记录</div> : (
          <div className="timeline">
            {filtered.map((b) => {
              const open = openId === b.id || (openId === null && b.status === 'completed')
              return (
                <div key={b.id} className="tl-item">
                  <div className="tl-head">
                    <div className="flex gap6 flex-wrap">
                      <b>{fmtDateTime(b.slot?.start_time)}</b>
                      <span className="faint">{weekdayLabel(b.slot?.start_time ?? '')} · {b.coach?.full_name} · {b.slot?.venue?.name}</span>
                    </div>
                    <span className={STATUS_CLS[b.status]}>{STATUS_LABEL[b.status]}</span>
                  </div>
                  <div className="muted mt8" style={{ fontSize: 13 }}>
                    {b.goal_label} · {b.focus_parts_labels.join(' / ') || '全身'}
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 10, padding: '2px 10px' }}
                      onClick={() => setOpenId(open ? -1 : b.id)}>
                      {open ? '收起记录' : '展开记录'}
                    </button>
                  </div>
                  {open && <SessionDetail b={b} content={content} />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
