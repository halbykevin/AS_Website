// The door scanner's line to the API (server/src/door.js), and what the phone
// keeps for when the signal drops.
//
// Online, the server decides every scan. Meanwhile the phone keeps the
// event's guest list — each ticket's code as a SHA-256 fingerprint, never the
// code itself — so that offline it can still tell a real ticket from a fake,
// a cancelled one, or one already used here. What it admits offline is queued
// and synced the moment the server answers again; if another gate admitted
// the same ticket meanwhile, the sync reports it as a conflict.
//
// Everything here lives in localStorage, per event, and survives a reload —
// a phone that loses signal and then refreshes the page keeps its list and
// its queue. Every read and write is guarded: a phone that refuses storage
// still scans, online.

import { API_URL } from '../lib/api.js'

const SESSION = 'as_door_session'
export const GATE = 'as_door_gate'
const listKey = (eventId) => `as_door_list_${eventId}`
const queueKey = (eventId) => `as_door_queue_${eventId}`

export const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key)
      return v == null ? fallback : JSON.parse(v)
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* private mode, or full: online scanning still works */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  },
}

/** No answer from the server: the network, not the ticket. */
export class Offline extends Error {}
/** The PIN changed or door access was turned off: back to the PIN screen. */
export class SignedOut extends Error {}

async function call(path, { method = 'GET', body, token, timeout = 6000 } = {}) {
  let res
  try {
    res = await fetch(`${API_URL}/api/door${path}`, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    })
  } catch {
    throw new Offline('No connection')
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && data.signedOut) throw new SignedOut(data.error)
  if (!res.ok) throw new Error(data.error || 'Something went wrong — try again.')
  return data
}

export const session = {
  get: () => store.get(SESSION),
  set: (s) => store.set(SESSION, s),
  clear: () => store.remove(SESSION),
}

export const login = (pin, gate) => call('/login', { method: 'POST', body: { pin, gate } })

/** The door's client, bound to one signed-in session. */
export function doorClient(s) {
  const eventId = s.event.id
  const token = s.token
  const api = (path, opts) => call(path, { ...opts, token })

  const list = () => store.get(listKey(eventId), { at: null, tickets: [] })
  const queue = () => store.get(queueKey(eventId), [])

  return {
    state: () => api('/state'),
    scan: (code) => api('/scan', { method: 'POST', body: { code } }),
    admitBySerial: (serial) => api('/scan', { method: 'POST', body: { serial, manual: true } }),
    lookup: (serial) => api('/lookup', { method: 'POST', body: { serial } }),
    undo: (serial) => api('/undo', { method: 'POST', body: { serial } }),

    list,
    queued: () => queue().length,

    /** Fetch a fresh guest list — offline admits not yet synced stay marked in. */
    async refreshList() {
      const fresh = await api('/list', { timeout: 15000 })
      const pending = new Set(queue().map((q) => q.serial))
      const old = new Map(list().tickets.map((t) => [t.serial, t]))
      fresh.tickets = fresh.tickets.map((t) =>
        pending.has(t.serial) && !t.checkedInAt ? { ...t, checkedInAt: old.get(t.serial)?.checkedInAt || new Date().toISOString() } : t,
      )
      store.set(listKey(eventId), fresh)
      return fresh
    },

    /** Send what was admitted offline. Resolves with the server's verdicts. */
    async sync() {
      const pending = queue()
      if (!pending.length) return null
      const out = await api('/sync', { method: 'POST', body: { admits: pending } })
      // Only what was sent is cleared; anything admitted during the call stays.
      const sent = new Set(pending.map((q) => q.serial))
      store.set(queueKey(eventId), queue().filter((q) => !sent.has(q.serial)))
      return out
    },

    /**
     * Decide a scan from the phone's own list: a QR code by its fingerprint, a
     * typed number by its serial. Same answers as the server's.
     */
    async decideOffline({ code, serial }, { admit = true } = {}) {
      const data = list()
      let t
      if (code) {
        const hash = await sha256(code.trim())
        t = data.tickets.find((x) => x.hash === hash)
      } else {
        t = data.tickets.find((x) => x.serial === normalizeSerial(serial))
      }
      if (!t) return { result: 'unknown', offline: true, listAt: data.at }
      const ticket = { ...t }
      if (!t.valid) return { result: 'void', ticket, offline: true }
      if (t.checkedInAt) return { result: 'already', ticket, offline: true }
      if (!admit) return { result: 'found', ticket, offline: true }
      const now = new Date().toISOString()
      t.checkedInAt = now
      t.checkedInGate = s.gate || ''
      store.set(listKey(eventId), data)
      store.set(queueKey(eventId), [...queue(), { serial: t.serial, at: now, manual: !code }])
      return { result: 'admitted', ticket: { ...t }, offline: true }
    },

    /** Take back an offline admit that hasn't synced yet. */
    undoOffline(serial) {
      const q = queue()
      if (!q.some((x) => x.serial === serial)) return false
      store.set(queueKey(eventId), q.filter((x) => x.serial !== serial))
      const data = list()
      const t = data.tickets.find((x) => x.serial === serial)
      if (t) {
        t.checkedInAt = null
        t.checkedInGate = ''
        store.set(listKey(eventId), data)
      }
      return true
    },

    /** Counts from the phone's list — what the screen shows offline. */
    offlineStats() {
      const valid = list().tickets.filter((t) => t.valid)
      return { admitted: valid.filter((t) => t.checkedInAt).length, total: valid.length }
    },

    /** Mark a ticket in on the phone's list after the server admitted it. */
    remember(ticket) {
      const data = list()
      const t = data.tickets.find((x) => x.serial === ticket?.serial)
      if (!t) return
      t.checkedInAt = ticket.checkedInAt || null
      t.checkedInGate = ticket.checkedInGate || ''
      store.set(listKey(eventId), data)
    },
  }
}

/** What a scanned or typed string is: a ticket's QR code, a ticket number, or neither. */
export function classify(text) {
  const raw = String(text || '').trim()
  if (/^AST1:/i.test(raw)) return { code: raw }
  const serial = normalizeSerial(raw)
  return /^AST-[A-Z0-9]{8}$/.test(serial) ? { serial } : {}
}

export function normalizeSerial(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '')
  return /^AST-/.test(s) ? s : `AST-${s}`
}

async function sha256(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
