import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth.js'

export default function RequireAuth({ children }) {
  const { isAuthed } = useAuth()
  if (!isAuthed) return <Navigate to="/admin/login" replace />
  return children
}
