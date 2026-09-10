import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { errText } from '../api'

export default function Login() {
  const { login, register } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setErr(''); setBusy(true)
    try {
      if (mode === 'login') {
        await login(username, password)
      } else {
        if (!fullName.trim()) throw new Error('请填写姓名')
        await register({ username, password, full_name: fullName, phone, goal_focus: 'fat_loss' })
      }
      nav('/')
    } catch (e: any) {
      setErr(e.message ? e.message : errText(e))
    } finally {
      setBusy(false)
    }
  }

  const quick = (u: string, p: string) => { setUsername(u); setPassword(p); setMode('login') }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="login-hero">
          <div className="logo-mark">F</div>
          <h2>FitTrack 私教服务平台</h2>
          <p>健康建档 → 约课 → 训练记录 → 周期性复盘，一站式闭环</p>
        </div>

        <div className="tabs">
          <div className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>登录</div>
          <div className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>会员注册</div>
        </div>

        {mode === 'register' && (
          <>
            <label className="fld"><span>姓名</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="请输入真实姓名" />
            </label>
            <label className="fld"><span>手机号</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="选填" />
            </label>
          </>
        )}
        <label className="fld"><span>用户名</span>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="用户名" />
        </label>
        <label className="fld"><span>密码</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="密码" onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>

        {err && <div className="alert alert-warn mb12">⚠️ {err}</div>}

        <button className="btn btn-primary btn-block" disabled={busy} onClick={submit}>
          {busy ? '请稍候…' : mode === 'login' ? '登 录' : '注册并领取体验课'}
        </button>

        {mode === 'register' && <p className="faint mt12" style={{ fontSize: 12 }}>注册即赠送 1 节私教体验课，可在会员约课台直接预约。</p>}

        <div className="demo-accounts">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>演示账号（点击自动填充）</div>
          会员 <code onClick={() => quick('zhangwei', 'member123')}>zhangwei / member123</code><br />
          教练 <code onClick={() => quick('coach_liu', 'coach123')}>coach_liu / coach123</code><br />
          管理员 <code onClick={() => quick('admin', 'admin123')}>admin / admin123</code>
        </div>
      </div>
    </div>
  )
}
