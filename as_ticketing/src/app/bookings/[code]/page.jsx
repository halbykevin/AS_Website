import Link from 'next/link'
import { notFound } from 'next/navigation'

import { getShop } from '@/lib/api'
import { getBooking, ticketsPdfUrl } from '@/lib/bookings'
import { formatDate } from '@/lib/events'
import { hoursSentence } from '@/lib/hours'
import { money } from '@/lib/seatmap'
import { AwaitPayment, PayOnlineButton } from '@/components/BookingActions'

// A customer's own booking, reached from their email or straight after
// booking: /bookings/<code>?t=<token>. The token is what makes it theirs — a
// code alone (read out at a counter, printed on a screen) shows nothing.
//
// Private, so: rendered per request, never cached, never indexed, and no
// Referer leaves it (the URL carries the token, and "Pay online" goes to Whish).
export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Your booking',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

const beirut = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: 'Asia/Beirut', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
      })
    : ''

const STATUS = {
  reserved: { label: 'Reserved', tone: 'bg-amber-50 ring-amber-200 text-amber-900' },
  paid: { label: 'Paid', tone: 'bg-green-50 ring-green-200 text-green-900' },
  expired: { label: 'Expired', tone: 'bg-as-charcoal/[0.04] ring-black/10 text-as-charcoal' },
  cancelled: { label: 'Cancelled', tone: 'bg-as-red/5 ring-as-red/20 text-as-charcoal' },
}

export default async function BookingPage({ params, searchParams }) {
  const { code } = await params
  const sp = await searchParams
  const token = typeof sp?.t === 'string' ? sp.t : ''
  const booking = token ? await getBooking(code, token) : null
  if (!booking) notFound()

  const b = booking
  const shop = b.status === 'reserved' ? await getShop() : null
  const hours = hoursSentence(shop?.hours)
  const where = [b.event.venue, b.event.city].filter(Boolean).join(', ')
  const backFromWhish = sp?.paid === '1' && b.status === 'reserved'
  const failed = sp?.failed === '1' && b.status === 'reserved'
  const onlineDown = sp?.online === 'unavailable' && b.status === 'reserved'
  const status = STATUS[b.status] || STATUS.reserved

  return (
    <section className="mx-auto max-w-2xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href={`/events/${b.event.slug}`}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-as-charcoal/60 transition hover:text-as-red"
      >
        <svg className="h-4 w-4 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
        {b.event.title}
      </Link>

      <div className={`mt-5 rounded-2xl p-5 ring-1 ${status.tone}`}>
        <p className="text-xs font-bold uppercase tracking-wider opacity-70">{status.label}</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          {b.status === 'paid'
            ? 'You’re in!'
            : b.status === 'reserved'
              ? 'Your seats are reserved'
              : b.status === 'expired'
                ? 'This reservation has expired'
                : 'This booking was cancelled'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed opacity-80">
          {b.status === 'paid' &&
            `Your tickets are paid and confirmed — show their QR codes at the entrance.${
              b.email ? ' We’ve emailed them to you too.' : ''
            }`}
          {b.status === 'reserved' &&
            `Held for you until ${beirut(b.expiresAt)} (Beirut time). Pay before then to keep them — if it isn’t paid in time, the seats are released automatically.`}
          {b.status === 'expired' && 'It wasn’t paid in time, so its seats were released. You can book again while seats last.'}
          {b.status === 'cancelled' && 'Its seats were released. If you think this is a mistake, get in touch with us.'}
        </p>
        {backFromWhish && <AwaitPayment />}
        {failed && (
          <p className="mt-2 text-sm font-semibold">
            The online payment didn’t go through — your seats are still held. Try again, or pay in cash at AS Company.
          </p>
        )}
        {onlineDown && (
          <p className="mt-2 text-sm font-semibold">
            Online payment isn’t available right now — your seats are reserved, and you can pay in cash at AS Company.
          </p>
        )}
      </div>

      <div className="mt-6 text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-as-charcoal/45">Booking code</p>
        <p className="mt-1 font-mono text-3xl font-extrabold tracking-[0.15em] text-as-red">{b.code}</p>
      </div>

      {b.status === 'paid' && b.tickets?.length > 0 && (
        <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-extrabold text-as-charcoal">
              Your ticket{b.tickets.length > 1 ? 's' : ''}
            </h2>
            <a
              href={ticketsPdfUrl(b.code, token)}
              className="inline-flex items-center gap-2 rounded-full bg-as-red px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" /></svg>
              Download (PDF)
            </a>
          </div>
          <p className="mt-1 text-sm text-as-charcoal/60">
            One QR code per person — show it at the entrance, on your phone or printed.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {b.tickets.map((t) => (
              <li key={t.serial} className="flex items-center gap-4 rounded-xl p-3 ring-1 ring-black/10">
                {/* The API's own QR drawing, as an image so nothing in it can run. */}
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(t.qr)}`}
                  alt={`QR code of ticket ${t.serial}`}
                  className="h-28 w-28 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-as-charcoal">
                    {t.standing ? t.section : `Row ${t.row} · Seat ${t.seat}`}
                  </p>
                  {!t.standing && <p className="text-xs text-as-charcoal/55">{t.section}</p>}
                  <p className="mt-1.5 font-mono text-xs text-as-charcoal/55">{t.serial}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-extrabold text-as-charcoal">{b.event.title}</h2>
        <p className="mt-1 text-sm text-as-charcoal/60">
          {[formatDate(b.event.date), b.event.time].filter(Boolean).join(' · ')}
          {where ? <><br />{where}</> : null}
        </p>

        <ul className="mt-4 divide-y divide-black/5 border-t border-black/5">
          {b.seats.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="font-semibold text-as-charcoal">
                Row {s.row} · Seat {s.num}
                <span className="ml-2 font-normal text-as-charcoal/50">{s.tier}</span>
              </span>
              <span className="text-as-charcoal/70">{money(s.price, b.currency)}</span>
            </li>
          ))}
          {b.zones.map((z) => (
            <li key={z.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <span className="font-semibold text-as-charcoal">
                {z.qty} × {z.name}
              </span>
              <span className="text-as-charcoal/70">{money(z.price * z.qty, b.currency)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 py-3 text-base font-extrabold text-as-charcoal">
            <span>Total</span>
            <span>{money(b.total, b.currency)}</span>
          </li>
        </ul>
        <p className="text-xs text-as-charcoal/45">
          Booked by {[b.name, b.email].filter(Boolean).join(' · ')}
          {b.status === 'paid' && b.paidAt
            ? ` · paid ${b.paymentMethod === 'whish' ? 'online' : b.paymentMethod === 'free' ? '(free)' : 'in cash'} ${beirut(b.paidAt)}`
            : ''}
        </p>
      </div>

      {b.status === 'reserved' && (
        <div className="mt-6 space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <h2 className="text-base font-extrabold text-as-charcoal">How to pay</h2>
          {b.canPayOnline && (
            <div>
              <p className="mb-3 text-sm text-as-charcoal/70">Pay now with Whish — your tickets are confirmed straight away.</p>
              <PayOnlineButton code={b.code} token={token} label={`Pay online · ${money(b.total, b.currency)}`} />
            </div>
          )}
          <div className={b.canPayOnline ? 'border-t border-black/5 pt-4' : ''}>
            <p className="text-sm font-semibold text-as-charcoal">Pay in cash at {shop?.name || 'AS Store'}</p>
            <p className="mt-1 text-sm leading-relaxed text-as-charcoal/70">
              {shop?.address ? `${shop.address}. ` : ''}
              {hours ? `${hours} ` : ''}
              Give your booking code <strong className="text-as-charcoal">{b.code}</strong> at the counter.
            </p>
          </div>
        </div>
      )}

      {(b.status === 'expired' || b.status === 'cancelled') && (
        <div className="mt-6 text-center">
          <Link
            href={`/events/${b.event.slug}`}
            className="inline-flex rounded-full bg-as-red px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-as-red-light"
          >
            See the event
          </Link>
        </div>
      )}
    </section>
  )
}
