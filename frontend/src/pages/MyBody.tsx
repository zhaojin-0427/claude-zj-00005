import BodyTracking from '../components/BodyTracking'
import { useAuth } from '../auth'

export default function MyBody() {
  const { user } = useAuth()
  if (!user) return null
  return <BodyTracking memberId={user.id} canEdit />
}
