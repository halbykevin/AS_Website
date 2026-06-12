import { useEffect, useState } from 'react'
import { adminApi } from '../../lib/api.js'
import { Card, Select, Button, Banner } from '../ui.jsx'

const STATUS = ['new', 'confirmed', 'cancelled']
const badge = {
  new: 'bg-as-red/5 text-as-red',
  confirmed: 'bg-green-50 text-green-700',
  cancelled: 'bg-as-gray/20 text-as-charcoal/60',
}

export default function ReservationsAdmin() {
  const [items, setItems] = useState([])
  const [msg, setMsg] = useState(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      setItems(await adminApi.listReservations())
    } catch {
      setMsg({ kind: 'error', text: 'Could not load reservations.' })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  async function setStatus(r, status) {
    setItems((list) => list.map((it) => (it.id === r.id ? { ...it, status } : it)))
    try {
      await adminApi.updateReservation(r.id, { status })
    } catch {
      setMsg({ kind: 'error', text: 'Could not update status.' })
      load()
    }
  }

  async function remove(r) {
    if (!confirm(`Delete reservation from ${r.name}?`)) return
    await adminApi.deleteReservation(r.id)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-as-charcoal">Reservations</h1>
        <Button variant="ghost" onClick={load}>Refresh</Button>
      </div>

      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <Card>
        {loading ? (
          <p className="text-sm text-as-charcoal/50">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-as-charcoal/50">No reservations yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/5 text-xs uppercase tracking-wider text-as-charcoal/45">
                  <th className="py-2 pr-4 font-semibold">Event</th>
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Contact</th>
                  <th className="py-2 pr-4 font-semibold">Qty</th>
                  <th className="py-2 pr-4 font-semibold">Status</th>
                  <th className="py-2 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {items.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-as-charcoal">{r.eventTitle || '—'}</p>
                      <p className="text-xs text-as-charcoal/45">{new Date(r.created).toLocaleString()}</p>
                    </td>
                    <td className="py-3 pr-4 text-as-charcoal/80">{r.name}</td>
                    <td className="py-3 pr-4 text-as-charcoal/70">
                      <p>{r.email}</p>
                      <p className="text-xs">{r.phone}</p>
                    </td>
                    <td className="py-3 pr-4 text-as-charcoal/80">{r.quantity}</td>
                    <td className="py-3 pr-4">
                      <span className={`mb-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge[r.status] || badge.new}`}>
                        {r.status || 'new'}
                      </span>
                      <Select value={r.status || 'new'} onChange={(e) => setStatus(r, e.target.value)}>
                        {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </Select>
                    </td>
                    <td className="py-3">
                      <Button variant="danger" onClick={() => remove(r)} className="px-3 py-1.5">Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
