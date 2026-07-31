// Shared helpers for the admin customer directory. Pure — importable anywhere.

// How an account was created / how a customer signs in. The hue for each method
// is fixed and never cycled, and every badge ships with an icon + label so the
// method is legible without relying on color.
//
// 'unknown' is not a real method: it marks accounts that predate sign-in
// tracking, whose history was never recorded. It is never assigned to new rows.
export const SIGNUP_METHODS = [
  { value: 'google', label: 'Google', short: 'Google', tone: 'red', icon: 'globe' },
  { value: 'whatsapp', label: 'WhatsApp code', short: 'WhatsApp', tone: 'green', icon: 'whatsapp' },
  { value: 'email', label: 'Email code', short: 'Email', tone: 'amber', icon: 'mail' },
  { value: 'checkout', label: 'Guest checkout', short: 'Checkout', tone: 'brand', icon: 'bag' },
  { value: 'unknown', label: 'Not recorded', short: 'Unknown', tone: 'gray', icon: 'user' },
]

export const methodMeta = (v) =>
  SIGNUP_METHODS.find((m) => m.value === v) || {
    value: v,
    label: v || 'Not recorded',
    short: v || 'Unknown',
    tone: 'gray',
    icon: 'user',
  }

export const CUSTOMER_SORTS = [
  { value: 'created', label: 'Newest' },
  { value: 'lastLogin', label: 'Last sign-in' },
  { value: 'name', label: 'Name' },
  { value: 'orders', label: 'Orders' },
  { value: 'spent', label: 'Total spent' },
  { value: 'logins', label: 'Sign-in count' },
]

// Absolute date — used where the exact moment matters (tables, detail rows).
export const dateTime = (iso) => {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

// Relative age, for scanning a list quickly ("3d ago"). Falls back to the
// absolute date past a month, where "37d ago" stops being meaningful.
export const timeAgo = (iso) => {
  if (!iso) return 'Never'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

// Coarse device label from a user-agent string. Deliberately shallow: the admin
// only needs "which kind of thing was this", not a parsed UA.
export function deviceLabel(ua = '') {
  const s = String(ua)
  if (!s) return ''
  if (/\bAS-?Store-?App|Expo|okhttp|CFNetwork/i.test(s)) return 'Mobile app'
  if (/iPhone|iPad|iPod/i.test(s)) return 'iPhone / iPad'
  if (/Android/i.test(s)) return 'Android'
  if (/Windows/i.test(s)) return 'Windows'
  if (/Macintosh|Mac OS/i.test(s)) return 'Mac'
  if (/Linux/i.test(s)) return 'Linux'
  return 'Other'
}
