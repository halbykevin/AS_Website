// Server wrapper: the sign-in button's branding lives in settings, so it's
// loaded here and handed to the client form — that way the button renders with
// the right logo and wording from the very first paint, no flash of the default.
import { loadSettings } from '@/lib/site'
import LoginForm from './LoginForm.jsx'

export const metadata = { title: 'Sign in' }

export default async function LoginPage() {
  const settings = await loadSettings()
  return <LoginForm loginButton={settings.loginButton} />
}
