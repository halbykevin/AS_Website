import { useState } from 'react'
import { auth, adminLogin } from '../lib/api.js'

// Admin authentication backed by a JWT token stored in localStorage.
export function useAuth() {
  const [authed, setAuthed] = useState(auth.isAuthed())

  return {
    isAuthed: authed,
    admin: authed ? { email: auth.email() } : null,
    login: async (email, password) => {
      await adminLogin(email, password)
      setAuthed(true)
    },
    logout: () => {
      auth.clear()
      setAuthed(false)
    },
  }
}
