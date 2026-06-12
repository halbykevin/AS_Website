import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { formatDate } from '../components/EventCard.jsx'
import { useContent } from '../store/content.jsx'
import { createReservation } from '../lib/api.js'

export default function EventDetail() {
  const { id } = useParams()
  const { ticketing, getEvent } = useContent()
  const event = getEvent(id)

  if (!event) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-24 text-center sm:px-8">
        <h1 className="text-3xl font-extrabold text-as-charcoal">Event not found</h1>
        <p className="mt-4 text-as-charcoal/60">
          This event may have ended or moved.
        </p>
        <Link
          to="/events"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white transition hover:bg-as-red-light"
        >
          <Icon name="arrow" className="h-4 w-4 rotate-180" />
          Back to events
        </Link>
      </section>
    )
  }

  return (
    <article>
      {/* Hero image */}
      <div className="relative h-64 w-full overflow-hidden bg-as-gray/10 sm:h-80 lg:h-96">
        <img src={event.image} alt={event.title} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-5xl px-5 pb-6 sm:px-8">
          <Link
            to="/events"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition hover:text-white"
          >
            <Icon name="arrow" className="h-4 w-4 rotate-180" />
            All events
          </Link>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {event.title}
          </h1>
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-3">
        {/* Details */}
        <div className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoCard icon="calendar" label="Date" value={`${formatDate(event.date)}`} />
            <InfoCard icon="clock" label="Time" value={event.time} />
            <InfoCard icon="pin" label="Venue" value={`${event.venue}, ${event.city}`} />
          </div>

          <h2 className="mt-10 text-xl font-bold text-as-charcoal">About this event</h2>
          <p className="mt-3 leading-relaxed text-as-charcoal/70">{event.description}</p>
        </div>

        {/* Reservation panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
            {event.ticketUrl ? (
              <a
                href={event.ticketUrl}
                target="_blank"
                rel="noreferrer"
                className="block w-full rounded-full bg-as-red px-6 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md"
              >
                Buy tickets
              </a>
            ) : (
              <ReservationForm event={event} />
            )}
            <div className="mt-4 flex items-center justify-center gap-2 border-t border-black/5 pt-4">
              <img src={ticketing.logo} alt={ticketing.name} className="h-6 w-auto" />
              <span className="text-xs text-as-charcoal/45">{ticketing.note}</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

function InfoCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-as-red">
        <Icon name={icon} className="h-5 w-5" />
        <span className="text-xs font-semibold uppercase tracking-wider text-as-charcoal/50">
          {label}
        </span>
      </div>
      <p className="mt-2 text-sm font-semibold text-as-charcoal">{value}</p>
    </div>
  )
}

function ReservationForm({ event }) {
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', quantity: 1 })

  const isOpen = event.status === 'open'

  const handleChange = (e) =>
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await createReservation({ eventRecordId: event.recordId, ...form })
      setSubmitted(true)
    } catch (err) {
      setError('Sorry, we could not submit your reservation. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) {
    return (
      <div className="mt-5 rounded-xl bg-as-gray/10 px-4 py-5 text-center text-sm font-medium text-as-charcoal/60">
        {event.status === 'sold-out'
          ? 'This event is sold out.'
          : 'Reservations open soon — check back shortly.'}
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="mt-5 rounded-xl bg-green-50 px-4 py-6 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-green-600">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </div>
        <p className="mt-3 text-sm font-semibold text-as-charcoal">Reservation received!</p>
        <p className="mt-1 text-xs text-as-charcoal/60">
          We&rsquo;ll confirm your spot for {event.title} by email shortly.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3">
      <Field label="Full name" name="name" value={form.name} onChange={handleChange} required />
      <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
      <Field label="Phone" name="phone" type="tel" value={form.phone} onChange={handleChange} required />
      <div>
        <label className="mb-1 block text-xs font-medium text-as-charcoal/60">Tickets</label>
        <select
          name="quantity"
          value={form.quantity}
          onChange={handleChange}
          className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-as-charcoal outline-none transition focus:border-as-red focus:ring-2 focus:ring-as-red/20"
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs font-medium text-as-red">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Reserving…' : 'Reserve now'}
      </button>
    </form>
  )
}

function Field({ label, name, type = 'text', value, onChange, required }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-as-charcoal/60">{label}</label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        required={required}
        className="w-full rounded-lg border border-black/10 bg-white px-3 py-2.5 text-sm text-as-charcoal outline-none transition focus:border-as-red focus:ring-2 focus:ring-as-red/20"
      />
    </div>
  )
}
