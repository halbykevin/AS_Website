'use client'

import { useState } from 'react'
import Icon from './Icon.jsx'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'

const inputCls =
  'w-full rounded-2xl border border-as-ink/15 bg-white px-4 py-3 text-as-ink outline-none transition focus:border-as-red focus:ring-2 focus:ring-as-red/20'

// Contact form → POST /api/contact (emails the shop). Shows inline validation,
// a sending state, and a success confirmation. The parent renders the WhatsApp
// button alongside for the instant-chat channel.
export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim() || !form.message.trim()) {
      setError('Please add your name and a message.')
      return
    }
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Add an email or phone number so we can reply.')
      return
    }
    setStatus('sending')
    try {
      const res = await fetch(`${API}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong.')
      setStatus('sent')
    } catch (err) {
      setError(err.message || "We couldn't send your message.")
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[28px] border border-as-ink/10 bg-white p-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-as-red/10 text-as-red">
          <Icon name="check" className="h-7 w-7" />
        </span>
        <h3 className="text-xl font-semibold tracking-apple text-as-ink">Message sent</h3>
        <p className="text-as-ink/60">Thanks for reaching out — we'll get back to you soon.</p>
        <button
          onClick={() => {
            setForm({ name: '', email: '', phone: '', message: '' })
            setStatus('idle')
          }}
          className="link-cta mt-2"
        >
          Send another <Icon name="chevronRight" className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-[28px] border border-as-ink/10 bg-white p-6 sm:p-8">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-as-ink/70">Name</span>
          <input className={inputCls} value={form.name} onChange={set('name')} placeholder="Your name" autoComplete="name" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-as-ink/70">Phone</span>
          <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="03 000 000" inputMode="tel" autoComplete="tel" />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-as-ink/70">Email</span>
        <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-as-ink/70">Message</span>
        <textarea
          className={`${inputCls} min-h-[140px] resize-y`}
          value={form.message}
          onChange={set('message')}
          placeholder="How can we help?"
          maxLength={4000}
        />
      </label>

      {error && <p className="text-sm font-medium text-as-red">{error}</p>}

      <button type="submit" disabled={status === 'sending'} className="pill w-full justify-center disabled:opacity-60">
        {status === 'sending' ? 'Sending…' : 'Send message'}
      </button>
    </form>
  )
}
