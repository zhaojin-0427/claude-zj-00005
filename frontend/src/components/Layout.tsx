import { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { User } from '../types'

interface NavDef { to: string; label: string; icon: string; roles: string[] }

const NAV: { group: string; items: NavDef[] }[] = [
  {
    group: '会员服务',
    items: [
      { to: '/booking', label: '会员约课台', icon: '📅', roles: ['member'] },
      { to: '/my-sessions', label: '我的训练档案', icon: '📒', roles: ['member'] },
      { to: '/my-body', label: '我的体测追踪', icon: '📈', roles: ['member'] },
    ],
  },
  {
    group: '教练工作台',
    items: [
      { to: '/coach', label: '教练工作台', icon: '🏋️', roles: ['coach', 'admin'] },
      { to: '/members', label: '会员健康档案', icon: '🗂️', roles: ['coach', 'admin'] },
    ],
  },
  {
    group: '运营复盘',
    items: [
      { to: '/stats', label: '数据统计复盘', icon: '📊', roles: ['coach', 'admin'] },
      { to: '/ops', label: '场地·时段·模板维护', icon: '🛠️', roles: ['coach', 'admin'] },
    ],
  },
]

const ROLE_LABEL: Record<string, string> = {
  admin: '前台管理员', coach: '私人教练', member: '会员',
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const loc = useLocation()
  if (!user) return null
  const titleMap: Record<string, string> = {
    '/booking': '会员约课台',
    '/my-sessions': '我的训练档案',
    '/my-body': '体测追踪 · 目标管理',
    '/coach': '教练工作台',
    '/members': '会员健康档案',
    '/stats': '数据统计复盘',
    '/ops': '场地 · 私教时段 · 训练模板维护',
  }
  const title = titleMap[loc.pathname] ?? 'FitTrack'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-mark">F</div>
          <div>
            <div className="logo-name">FitTrack</div>
            <div className="logo-sub">私教预约 · 训练档案</div>
          </div>
        </div>

        {NAV.map((g) => {
          const items = g.items.filter((i) => i.roles.includes(user.role))
          if (!items.length) return null
          return (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <span className="nav-ico">{i.icon}</span>
                  {i.label}
                </NavLink>
              ))}
            </div>
          )
        })}

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{user.full_name.slice(0, 1)}</div>
            <div className="user-meta">
              <b>{user.full_name}</b>
              <span>{ROLE_LABEL[user.role]}</span>
            </div>
            <button className="btn btn-ghost btn-sm" title="退出登录" onClick={logout}>退出</button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <h1>{title}</h1>
          <div className="flex gap6">
            {user.role === 'member' && (
              <span className="tag tag-amber">剩余课时 {user.package_remaining ?? 0} 节</span>
            )}
            <span className="tag tag-blue">{ROLE_LABEL[user.role]}</span>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
