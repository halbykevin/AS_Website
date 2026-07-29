import { useEffect, useMemo, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Banner, Button, Card, PageHeader, SegmentedControl } from '../ui.jsx'

// Contact form submissions (public /contact page). Read-only apart from the
// read/unread flag and delete — replies happen by email or WhatsApp.
export default function MessagesAdmin() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all') // all | unread
  const [openId, setOpenId] = useState(null)

  const load = () => {
    setLoading(true)
    adminApi
      .listContactMessages()
      .then((rows) => {
        setMessages(Array.isArray(rows) ? rows : [])
        setError('')
      })
      .catch((err) => setError(err.message || 'Could not load messages'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const unread = messages.filter((m) => !m.read).length
  const list = useMemo(
    () => (filter === 'unread' ? messages.filter((m) => !m.read) : messages),
    [messages, filter]
  )

  const patch = (id, changes) =>
    setMessages((rows) => rows.map((m) => (m.id === id ? { ...m, ...changes } : m)))

  const toggleRead = async (msg, read) => {
    patch(msg.id, { read })
    try {
      await adminApi.markContactMessageRead(msg.id, read)
    } catch (err) {
      patch(msg.id, { read: msg.read })
      setError(err.message || 'Could not update the message')
    }
  }

  const remove = async (msg) => {
    if (!window.confirm(`Delete the message from ${msg.name}? This cannot be undone.`)) return
    try {
      await adminApi.deleteContactMessage(msg.id)
      setMessages((rows) => rows.filter((m) => m.id !== msg.id))
    } catch (err) {
      setError(err.message || 'Could not delete the message')
    }
  }

  // Open a message: expands it and marks it read the first time.
  const open = (msg) => {
    const next = openId === msg.id ? null : msg.id
    setOpenId(next)
    if (next && !msg.read) toggleRead(msg, true)
  }

  return (
    <>
      <PageHeader
        title="Messages"
        description="Everything visitors send from the Contact page. Each one is also emailed to the staff inbox."
        actions={
          <Button variant="ghost" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
        }
      />

      {error && <Banner kind="error">{error}</Banner>}

      <Card
        title={`${messages.length} message${messages.length === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}`}
        actions={
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: `Unread${unread ? ` (${unread})` : ''}` },
            ]}
          />
        }
      >
        {loading && messages.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">Loading messages…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">
            {filter === 'unread' ? 'No unread messages.' : 'No messages yet.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {list.map((msg) => (
              <MessageRow
                key={msg.id}
                msg={msg}
                expanded={openId === msg.id}
                onToggle={() => open(msg)}
                onRead={(read) => toggleRead(msg, read)}
                onDelete={() => remove(msg)}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

// Lebanese local numbers get the 961 country code so wa.me links work.
const waNumber = (phone) => {
  const d = String(phone || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('961')) return d
  return `961${d.replace(/^0+/, '')}`
}

const formatWhen = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
}

function MessageRow({ msg, expanded, onToggle, onRead, onDelete }) {
  const wa = waNumber(msg.phone)
  return (
    <li
      className={`overflow-hidden rounded-xl border transition ${
        msg.read ? 'border-black/10 bg-white' : 'border-as-red/25 bg-as-red/[0.03]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left"
      >
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${msg.read ? 'bg-as-gray/60' : 'bg-as-red'}`}
          aria-label={msg.read ? 'Read' : 'Unread'}
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold text-as-charcoal">{msg.name}</span>
            <span className="text-xs text-as-charcoal/50">{msg.email}</span>
          </span>
          <span className="mt-0.5 block truncate text-sm text-as-charcoal/70">
            {msg.subject ? <strong className="font-semibold">{msg.subject} — </strong> : null}
            {msg.message}
          </span>
        </span>
        <span className="shrink-0 whitespace-nowrap pt-0.5 text-xs text-as-charcoal/45">
          {formatWhen(msg.createdAt)}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-black/5 px-4 py-4">
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            <Detail label="Email" value={msg.email} href={`mailto:${msg.email}`} />
            {msg.phone && <Detail label="Phone" value={msg.phone} href={`tel:${msg.phone}`} />}
            {msg.subject && <Detail label="Subject" value={msg.subject} />}
            <Detail label="Received" value={formatWhen(msg.createdAt)} />
          </dl>

          <p className="mt-4 whitespace-pre-wrap rounded-xl bg-as-charcoal/[0.04] px-4 py-3 text-sm leading-relaxed text-as-charcoal">
            {msg.message}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <a
              href={`mailto:${msg.email}?subject=${encodeURIComponent(
                msg.subject ? `Re: ${msg.subject}` : 'Re: your message to AS Company'
              )}`}
              className="rounded-full bg-as-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light"
            >
              Reply by email
            </a>
            {wa && (
              <a
                href={`https://wa.me/${wa}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-black/10 bg-white px-5 py-2.5 text-sm font-semibold text-as-charcoal shadow-sm transition hover:border-as-red/30 hover:text-as-red"
              >
                WhatsApp
              </a>
            )}
            <Button variant="ghost" onClick={() => onRead(!msg.read)}>
              {msg.read ? 'Mark unread' : 'Mark read'}
            </Button>
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

function Detail({ label, value, href }) {
  return (
    <div className="flex gap-2">
      <dt className="w-20 shrink-0 text-as-charcoal/45">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-as-charcoal">
        {href ? (
          <a href={href} className="transition hover:text-as-red">
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  )
}
