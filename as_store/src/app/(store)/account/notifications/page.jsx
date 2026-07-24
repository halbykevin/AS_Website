'use client'

// Notification center for signed-in customers: the inbox plus the preference
// controls (categories, email, quiet hours). Order/account updates are
// transactional and can't be switched off.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Icon from '@/components/Icon.jsx'
import { useAccount, accountApi } from '@/lib/account'

const CATEGORY_ICON = { order: 'box', promo: 'tag', news: 'globe', survey: 'star', account: 'cog' }
const OPTIONAL_CATEGORIES = [
  { key: 'promo', label: 'Offers & promotions', hint: 'Sales, new arrivals, vouchers' },
  { key: 'news', label: 'News & events', hint: 'Announcements from AS Company' },
  { key: 'survey', label: 'Surveys & feedback', hint: 'Quick questions after deliveries' },
]

const when = (d) =>
  new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })

export default function NotificationsPage() {
  const { customer, loading } = useAccount()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !customer) router.replace('/login?next=/account/notifications')
  }, [loading, customer, router])

  if (loading || !customer) {
    return (
      <section className="bg-white pt-28 sm:pt-32">
        <div className="mx-auto max-w-2xl px-6 py-20 text-center text-as-ink/40">Loading…</div>
      </section>
    )
  }

  return (
    <section className="bg-white pb-24 pt-28 sm:pt-32">
      <div className="mx-auto w-full max-w-2xl px-6">
        <h1 className="text-3xl font-semibold tracking-apple text-as-ink sm:text-4xl">Notifications</h1>
        <Inbox />
        <Preferences />
      </div>
    </section>
  )
}

function Inbox() {
  const [data, setData] = useState(null)
  const [extra, setExtra] = useState([])
  const [busy, setBusy] = useState(false)

  const load = () => accountApi.listNotifications().then(setData).catch(() => setData({ items: [], unreadCount: 0 }))
  useEffect(() => {
    load()
  }, [])

  const items = [...(data?.items ?? []), ...extra]
  const lastId = items.length ? items[items.length - 1].id : null

  const readAll = async () => {
    setBusy(true)
    try {
      await accountApi.readAllNotifications()
      await load()
      setExtra((x) => x.map((n) => ({ ...n, read: true })))
    } catch {
      /* transient */
    }
    setBusy(false)
  }

  const open = (n) => {
    accountApi.clickNotification(n.id).catch(() => {})
  }

  const loadMore = async () => {
    if (!lastId) return
    setBusy(true)
    try {
      const page = await accountApi.listNotifications(lastId)
      setExtra((prev) => [...prev, ...page.items])
    } catch {
      /* keep what we have */
    }
    setBusy(false)
  }

  return (
    <div className="mt-10 rounded-2xl border border-as-ink/10 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-as-ink">Inbox</h2>
        {(data?.unreadCount ?? 0) > 0 && (
          <button onClick={readAll} disabled={busy} className="text-sm font-medium text-as-red hover:underline">
            Mark all read
          </button>
        )}
      </div>
      {data === null ? (
        <p className="mt-2 text-sm text-as-ink/40">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-sm text-as-ink/50">
          Nothing here yet — order updates, offers and announcements will show up here.
        </p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-as-ink/8">
            {items.map((n) => {
              const inner = (
                <div className="flex items-start gap-3 py-3">
                  <span
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      n.read ? 'bg-as-ink/5 text-as-ink/40' : 'bg-as-red/10 text-as-red'
                    }`}
                  >
                    <Icon name={CATEGORY_ICON[n.category] || 'mail'} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.read ? 'font-normal text-as-ink/70' : 'font-semibold text-as-ink'}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-as-ink/55">{n.body}</p>}
                    <p className="mt-1 text-xs text-as-ink/40">{when(n.createdAt)}</p>
                  </div>
                  {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-as-red" />}
                </div>
              )
              const href = n.deepLink && n.deepLink.startsWith('/') ? n.deepLink : null
              return (
                <li key={n.id}>
                  {href ? (
                    <Link href={href} onClick={() => open(n)} className="block transition hover:opacity-80">
                      {inner}
                    </Link>
                  ) : (
                    <button onClick={() => open(n)} className="block w-full text-left">
                      {inner}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {data?.nextBefore && (extra.length === 0 || extra.length % 20 === 0) && (
            <button
              onClick={loadMore}
              disabled={busy}
              className="mt-4 w-full rounded-full border border-as-ink/15 py-2 text-sm font-medium text-as-ink/70 hover:border-as-ink/30"
            >
              {busy ? 'Loading…' : 'Load older'}
            </button>
          )}
        </>
      )}
    </div>
  )
}

function Preferences() {
  const [prefs, setPrefs] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    accountApi.getNotificationPrefs().then(setPrefs).catch((e) => setError(e.message))
  }, [])

  const save = async (patch) => {
    const next = {
      ...prefs,
      ...patch,
      categories: { ...prefs.categories, ...(patch.categories || {}) },
      quiet: { ...prefs.quiet, ...(patch.quiet || {}) },
    }
    setPrefs(next) // optimistic
    try {
      setPrefs(await accountApi.saveNotificationPrefs(next))
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }

  if (!prefs) return null
  const quiet = prefs.quiet || {}

  return (
    <div className="mt-8 rounded-2xl border border-as-ink/10 p-6">
      <h2 className="text-lg font-semibold text-as-ink">Preferences</h2>
      <div className="mt-4 divide-y divide-as-ink/8">
        <PrefRow
          label="Email"
          hint="Occasional emails for campaigns that include email"
          checked={prefs.emailEnabled}
          onChange={(v) => save({ emailEnabled: v })}
        />
        <PrefRow
          label="Push notifications (mobile app)"
          hint="Master switch for offers, news and surveys on your devices"
          checked={prefs.pushEnabled}
          onChange={(v) => save({ pushEnabled: v })}
        />
        {OPTIONAL_CATEGORIES.map((c) => (
          <PrefRow
            key={c.key}
            label={c.label}
            hint={c.hint}
            checked={prefs.categories?.[c.key] !== false}
            onChange={(v) => save({ categories: { [c.key]: v } })}
          />
        ))}
        <PrefRow label="Order & account updates" hint="Always on — needed to deliver your orders" checked disabled />
        <PrefRow
          label="Quiet hours (10pm–8am)"
          hint="Promotional pushes wait until morning; order updates still arrive"
          checked={Boolean(quiet.enabled)}
          onChange={(v) => save({ quiet: { enabled: v, start: quiet.start || '22:00', end: quiet.end || '08:00' } })}
        />
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  )
}

function PrefRow({ label, hint, checked, onChange, disabled = false }) {
  return (
    <label className={`flex items-center gap-4 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-as-ink">{label}</p>
        {hint && <p className="text-xs text-as-ink/50">{hint}</p>}
      </div>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? 'bg-as-red' : 'bg-as-ink/20'
        }`}
      >
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange?.(e.target.checked)}
          aria-label={label}
        />
        <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </label>
  )
}
