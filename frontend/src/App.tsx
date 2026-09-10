import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import { ToastProvider } from './toast'
import Layout from './components/Layout'
import Login from './pages/Login'
import BookingDesk from './pages/BookingDesk'
import MySessions from './pages/MySessions'
import MyBody from './pages/MyBody'
import CoachDesk from './pages/CoachDesk'
import Members from './pages/Members'
import MemberArchive from './pages/MemberArchive'
import Stats from './pages/Stats'
import Ops from './pages/Ops'
import CyclePlans from './pages/CyclePlans'
import PlanEditor from './pages/PlanEditor'
import PlanDetail from './pages/PlanDetail'

function Protected({ roles, children }: { roles?: string[]; children: JSX.Element }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="empty">⏳ 加载中…</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return <Layout>{children}</Layout>
}

function Home() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'member') return <Navigate to="/booking" replace />
  return <Navigate to="/coach" replace />
}

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Home />} />
        <Route path="/booking" element={<Protected roles={['member']}><BookingDesk /></Protected>} />
        <Route path="/my-sessions" element={<Protected roles={['member']}><MySessions /></Protected>} />
        <Route path="/my-body" element={<Protected roles={['member']}><MyBody /></Protected>} />
        <Route path="/my-plans" element={<Protected roles={['member']}><CyclePlans viewer="member" /></Protected>} />
        <Route path="/my-plans/:id" element={<Protected roles={['member']}><PlanDetail /></Protected>} />
        <Route path="/coach" element={<Protected roles={['coach', 'admin']}><CoachDesk /></Protected>} />
        <Route path="/members" element={<Protected roles={['coach', 'admin']}><Members /></Protected>} />
        <Route path="/members/:id" element={<Protected roles={['coach', 'admin']}><MemberArchive /></Protected>} />
        <Route path="/plans" element={<Protected roles={['coach', 'admin']}><CyclePlans viewer="staff" /></Protected>} />
        <Route path="/plans/new" element={<Protected roles={['coach', 'admin']}><PlanEditor /></Protected>} />
        <Route path="/plans/:id" element={<Protected roles={['coach', 'admin']}><PlanDetail /></Protected>} />
        <Route path="/stats" element={<Protected roles={['coach', 'admin']}><Stats /></Protected>} />
        <Route path="/ops" element={<Protected roles={['coach', 'admin']}><Ops /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  )
}
