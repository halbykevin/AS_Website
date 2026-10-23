// Transactional email for the AS Company site, sent over the company mailbox
// (orders@as.com.lb, SMTP SSL :465 by default). Inert unless SMTP_HOST/SMTP_USER/
// SMTP_PASS are set, so nothing sends until the mailbox is configured.
//
// Sends two emails, both to the staff inbox:
//  • "new Guess the Score entry" after every public prediction submission, with a
//    one-tap WhatsApp button that opens a chat with the player, pre-filled with a
//    confirmation of their predicted score.
//  • "new contact message" after every /contact form submission, with reply-by-
//    email and reply-on-WhatsApp buttons (the email's Reply-To is the sender).
//
// And the ticket emails (bookings.js): to the customer when seats are reserved,
// paid for, expired unpaid or cancelled, and a notice to the staff inbox when a
// booking comes in or is paid.
import nodemailer from 'nodemailer'
import { toWhatsAppNumber } from './whatsapp.js'

const HOST = process.env.SMTP_HOST || ''
const PORT = Number(process.env.SMTP_PORT || 465)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || (USER ? `AS Company <${USER}>` : '')
// Where the entry notifications land. Defaults to the staff address on file.
const NOTIFY_TO = process.env.PREDICTOR_NOTIFY_TO || 'kevinhalby70199@gmail.com'
// Where contact-form messages land: the company mailbox staff answer from
// (same address the site sends as), overridable per environment.
const CONTACT_TO = process.env.CONTACT_NOTIFY_TO || 'orders@as.com.lb'

export const mailEnabled = () => Boolean(HOST && USER && PASS)

let transport = null
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465, // SSL/TLS on 465, STARTTLS otherwise
      auth: { user: USER, pass: PASS },
    })
  }
  return transport
}

const RED = '#A41E22'
const INK = '#1d1d1f'
const MUTED = '#6e6e73'

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// A draw number as a padded ticket, e.g. 7 → "#0007". Empty when unassigned.
const formatDraw = (n) => (n == null || n === '' ? '' : `#${String(n).padStart(4, '0')}`)

// Branded email shell — a light-gray page with a white card, a text logo header,
// and a small footer. All-inline styles for email-client compatibility. The
// `kicker` under the logo names which part of the site the email came from.
function emailShell(innerHtml, kicker = 'Guess the Score') {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f7;margin:0;padding:24px">
    <div style="max-width:600px;margin:0 auto">
      <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <div style="text-align:center;padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid #eee">
          <span style="font-size:22px;font-weight:800;letter-spacing:0.5px;color:${RED}">AS COMPANY</span>
          <div style="margin-top:4px;font-size:12px;color:${MUTED}">${esc(kicker)}</div>
        </div>
        ${innerHtml}
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:${MUTED};text-align:center;line-height:1.6">
        AS Company (Absolute Solutions SAL) · Lebanon
      </p>
    </div>
  </div>`
}

// Build the pre-filled WhatsApp message the player receives (plain text).
function whatsappText({ playerName, gameTitle, pick, drawNumber }) {
  const draw = formatDraw(drawNumber)
  const lines = []
  lines.push(`Hi ${playerName || 'there'}! 👋`)
  lines.push('')
  lines.push(`Thanks for entering ${gameTitle}. Your predicted final score:`)
  lines.push(`🏀 ${pick}`)
  if (draw) {
    lines.push('')
    lines.push(`Your draw number is ${draw} — keep it safe!`)
  }
  lines.push('')
  lines.push("You're in the draw — good luck! 🍀 — AS Company")
  return lines.join('\n')
}

// Send the staff notification for one prediction entry. Fire-and-forget: callers
// should .catch() it so a mail failure never affects the API response.
export async function sendPredictionEmail(entry) {
  if (!mailEnabled()) return { skipped: true }
  const {
    playerName, mobile, createdAt, gameTitle = 'Guess the Score',
    pick = '', sharePlatform = '', drawNumber = null,
  } = entry

  const draw = formatDraw(drawNumber)
  const waNumber = toWhatsAppNumber(mobile)
  const waText = whatsappText({ playerName, gameTitle, pick, drawNumber })
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}` : ''
  const when = createdAt ? new Date(createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''

  const pickBlock = `
    <div style="margin:22px 0;padding:18px;border:1px solid #eee;border-radius:12px;background:#fafafa;text-align:center">
      ${draw ? `<div style="margin-bottom:12px;font-size:15px;font-weight:800;color:${RED}">Draw number ${esc(draw)}</div>` : ''}
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED}">Predicted final score</div>
      <div style="margin-top:6px;font-size:20px;font-weight:800;color:${INK}">🏀 ${esc(pick || '—')}</div>
      ${sharePlatform ? `<div style="margin-top:8px;font-size:12px;color:${MUTED}">Shared on ${esc(sharePlatform)}</div>` : ''}
    </div>`

  const waButton = waHref
    ? `<div style="text-align:center;margin:26px 0 6px">
         <a href="${waHref}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px">
           💬 Message ${esc(playerName || 'the player')} on WhatsApp
         </a>
       </div>
       <p style="margin:8px 0 0;font-size:12px;color:${MUTED};text-align:center">
         Opens WhatsApp with a confirmation of their score, pre-filled to ${esc(mobile)}.
       </p>`
    : `<p style="margin:20px 0 0;font-size:13px;color:${MUTED}">No valid WhatsApp number to build a chat link for ${esc(mobile)}.</p>`

  const inner = `
    <h2 style="margin:0 0 4px;font-size:20px;color:${INK}">New Guess the Score entry 🏀</h2>
    <p style="margin:0 0 20px;font-size:14px;color:${MUTED}">A visitor just entered the draw.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px">
      <tr><td style="padding:6px 0;color:${MUTED};width:120px">Player</td><td style="padding:6px 0;color:${INK};font-weight:700">${esc(playerName)}</td></tr>
      <tr><td style="padding:6px 0;color:${MUTED}">Mobile</td><td style="padding:6px 0;color:${INK}">${esc(mobile)}</td></tr>
      ${when ? `<tr><td style="padding:6px 0;color:${MUTED}">Submitted</td><td style="padding:6px 0;color:${INK}">${esc(when)}</td></tr>` : ''}
    </table>

    ${pickBlock}

    ${waButton}`

  return getTransport().sendMail({
    from: FROM,
    to: NOTIFY_TO,
    replyTo: FROM,
    subject: `New Guess the Score entry — ${playerName || 'Anonymous'}`,
    html: emailShell(inner),
  })
}

// Send the staff notification for one contact-form message. Reply-To is the
// visitor's address, so hitting Reply in the inbox answers them directly.
// Fire-and-forget: callers should .catch() it — the message is already stored.
export async function sendContactEmail(msg) {
  if (!mailEnabled()) return { skipped: true }
  const { name, email, phone = '', subject = '', message = '', createdAt } = msg

  const when = createdAt
    ? new Date(createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
    : ''
  const waNumber = phone ? toWhatsAppNumber(phone) : ''
  const waHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(
        `Hi ${name || 'there'}! 👋 Thanks for reaching out to AS Company — we received your message and we're happy to help.`
      )}`
    : ''

  const messageBlock = `
    <div style="margin:22px 0;padding:18px;border:1px solid #eee;border-radius:12px;background:#fafafa">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:${MUTED}">Message</div>
      <div style="margin-top:8px;font-size:15px;line-height:1.6;color:${INK};white-space:pre-wrap">${esc(message)}</div>
    </div>`

  const buttons = `
    <div style="text-align:center;margin:26px 0 6px">
      <a href="mailto:${esc(email)}" style="display:inline-block;background:${RED};color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px">
        ✉️ Reply to ${esc(name || email)}
      </a>
    </div>
    ${
      waHref
        ? `<div style="text-align:center;margin:12px 0 6px">
             <a href="${waHref}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px">
               💬 Reply on WhatsApp
             </a>
           </div>`
        : ''
    }
    <p style="margin:12px 0 0;font-size:12px;color:${MUTED};text-align:center">
      Replying to this email also reaches ${esc(email)}.
    </p>`

  const inner = `
    <h2 style="margin:0 0 4px;font-size:20px;color:${INK}">New contact message ✉️</h2>
    <p style="margin:0 0 20px;font-size:14px;color:${MUTED}">Someone just wrote to you from the website.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px">
      <tr><td style="padding:6px 0;color:${MUTED};width:120px">Name</td><td style="padding:6px 0;color:${INK};font-weight:700">${esc(name)}</td></tr>
      <tr><td style="padding:6px 0;color:${MUTED}">Email</td><td style="padding:6px 0;color:${INK}">${esc(email)}</td></tr>
      ${phone ? `<tr><td style="padding:6px 0;color:${MUTED}">Phone</td><td style="padding:6px 0;color:${INK}">${esc(phone)}</td></tr>` : ''}
      ${subject ? `<tr><td style="padding:6px 0;color:${MUTED}">Subject</td><td style="padding:6px 0;color:${INK}">${esc(subject)}</td></tr>` : ''}
      ${when ? `<tr><td style="padding:6px 0;color:${MUTED}">Received</td><td style="padding:6px 0;color:${INK}">${esc(when)}</td></tr>` : ''}
    </table>

    ${messageBlock}

    ${buttons}`

  return getTransport().sendMail({
    from: FROM,
    to: CONTACT_TO,
    replyTo: email ? `${name || 'Website visitor'} <${email}>` : FROM,
    subject: `Website contact — ${subject || name || 'New message'}`,
    html: emailShell(inner, 'Contact form'),
  })
}

// ------------------------------------------------------------------ tickets ---

const TZ = 'Asia/Beirut'
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', {
        timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    : ''
const eventDay = (date) =>
  date
    ? new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : ''
const price = (n, currency) => {
  const v = Number(n) || 0
  const s = Number.isInteger(v) ? v.toLocaleString('en-US') : v.toFixed(2)
  return currency === 'USD' ? `$${s}` : `${s} ${currency}`
}

function ticketRows(b) {
  const rows = [
    ...(b.seats || []).map((s) => [`Row ${s.row} · Seat ${s.num}`, s.tier, price(s.price, b.currency)]),
    ...(b.zones || []).map((z) => [`${z.qty} × ${z.name}`, '', price(z.price * z.qty, b.currency)]),
  ]
  const cell = 'padding:7px 0;border-bottom:1px solid #f0f0f0'
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0 4px">
      ${rows
        .map(
          ([what, tier, amount]) => `<tr>
            <td style="${cell};color:${INK};font-weight:600">${esc(what)}</td>
            <td style="${cell};color:${MUTED}">${esc(tier)}</td>
            <td style="${cell};color:${INK};text-align:right">${esc(amount)}</td>
          </tr>`,
        )
        .join('')}
      <tr><td colspan="2" style="padding:10px 0 0;color:${INK};font-weight:800">Total</td>
          <td style="padding:10px 0 0;color:${INK};font-weight:800;text-align:right">${esc(price(b.total, b.currency))}</td></tr>
    </table>`
}

function eventBlock(b) {
  const e = b.event || {}
  const where = [e.venue, e.city].filter(Boolean).join(', ')
  return `
    <div style="margin:18px 0;padding:16px 18px;border:1px solid #eee;border-radius:12px;background:#fafafa">
      <div style="font-size:17px;font-weight:800;color:${INK}">${esc(e.title)}</div>
      <div style="margin-top:4px;font-size:14px;color:${MUTED}">
        ${esc([eventDay(e.date), e.time].filter(Boolean).join(' · '))}${where ? `<br>${esc(where)}` : ''}
      </div>
    </div>`
}

const codeBadge = (code) => `
  <div style="text-align:center;margin:20px 0">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${MUTED}">Booking code</div>
    <div style="margin-top:4px;font-size:26px;font-weight:800;letter-spacing:2px;color:${RED}">${esc(code)}</div>
  </div>`

const button = (href, label, bg = RED) => `
  <div style="text-align:center;margin:22px 0 6px">
    <a href="${esc(href)}" style="display:inline-block;background:${bg};color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px">${esc(label)}</a>
  </div>`

/** Where to pay in cash: the shop as the store admin describes it, or just its name. */
function cashLine(shop) {
  const name = shop?.name || 'AS Store'
  return shop?.address ? `${name}, ${shop.address}` : `${name} (AS Company)`
}

/**
 * The customer's email for one moment of a booking: 'reserved', 'paid',
 * 'expired' or 'cancelled'. `b` is the booking as bookings.js shapes it, with
 * `link` to its page on the ticketing hub. A 'paid' email carries the tickets
 * PDF in `attachments` (tickets.js) when it could be drawn.
 */
export async function sendBookingEmail(kind, b, shop = null, attachments = []) {
  if (!mailEnabled() || !b?.email) return { skipped: true }
  const hi = `<p style="margin:0 0 6px;font-size:15px;color:${INK}">Hi ${esc(b.name || 'there')},</p>`
  const para = (html) => `<p style="margin:0;font-size:15px;line-height:1.6;color:${INK}">${html}</p>`
  const title = b.event?.title || 'your event'
  let subject = ''
  let inner = ''

  if (kind === 'reserved') {
    subject = `Your seats are reserved — ${title} (${b.code})`
    inner = `
      <h2 style="margin:0 0 14px;font-size:20px;color:${INK}">Your seats are reserved 🎟️</h2>
      ${hi}
      ${para(`We're holding these tickets for you until <strong>${esc(when(b.expiresAt))}</strong> (Beirut time).
        Pay before then to keep them — if it isn't paid by then, the seats are released automatically.`)}
      ${eventBlock(b)}
      ${ticketRows(b)}
      ${codeBadge(b.code)}
      <div style="margin:8px 0 0;padding:16px 18px;border-radius:12px;background:#fff7f7;border:1px solid #f3d6d7">
        <div style="font-size:14px;font-weight:800;color:${INK}">How to pay</div>
        <p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:${INK}">
          ${b.canPayOnline ? '<strong>Online:</strong> open your booking and press <em>Pay online</em> (Whish).<br>' : ''}
          <strong>In cash:</strong> at ${esc(cashLine(shop))} — give your booking code <strong>${esc(b.code)}</strong>.
        </p>
      </div>
      ${button(b.link, 'View your booking')}
      <p style="margin:14px 0 0;font-size:12px;color:${MUTED};text-align:center">Already paid online? Your confirmation is on its way.</p>`
  } else if (kind === 'paid') {
    subject = `Your tickets are confirmed — ${title} (${b.code})`
    inner = `
      <h2 style="margin:0 0 14px;font-size:20px;color:${INK}">You're in! ✅</h2>
      ${hi}
      ${para(
        attachments.length
          ? `Your tickets are paid and confirmed — they're attached to this email, one per ${
              (b.zones || []).length ? 'place' : 'seat'
            }, each with its own QR code. Show them at the entrance, on your phone or printed.`
          : 'Your tickets are paid and confirmed — open your booking below to see them, with the QR code to show at the entrance.',
      )}
      ${eventBlock(b)}
      ${ticketRows(b)}
      ${codeBadge(b.code)}
      ${button(b.link, 'View your tickets')}`
  } else if (kind === 'expired') {
    subject = `Your reservation has expired — ${title} (${b.code})`
    inner = `
      <h2 style="margin:0 0 14px;font-size:20px;color:${INK}">Your reservation has expired</h2>
      ${hi}
      ${para(`Reservation <strong>${esc(b.code)}</strong> wasn't paid within ${esc(b.holdHours || 24)} hours, so its seats
        have been released. If you'd still like to come, you can book again — while seats last.`)}
      ${eventBlock(b)}
      ${b.eventLink ? button(b.eventLink, 'Book again') : ''}`
  } else if (kind === 'cancelled') {
    subject = `Your booking was cancelled — ${title} (${b.code})`
    inner = `
      <h2 style="margin:0 0 14px;font-size:20px;color:${INK}">Your booking was cancelled</h2>
      ${hi}
      ${para(`Booking <strong>${esc(b.code)}</strong> for ${esc(title)} has been cancelled and its seats released.
        If you think this is a mistake, reply to this email and we'll sort it out.`)}
      ${eventBlock(b)}`
  } else {
    return { skipped: true }
  }

  return getTransport().sendMail({
    from: FROM,
    to: b.email,
    replyTo: CONTACT_TO,
    subject,
    html: emailShell(inner, 'AS Ticketing'),
    attachments,
  })
}

/** The staff inbox hears about every booking and every payment. */
export async function sendBookingStaffEmail(kind, b) {
  if (!mailEnabled() || (kind !== 'reserved' && kind !== 'paid')) return { skipped: true }
  const label = kind === 'paid' ? `Paid (${b.paymentMethod === 'whish' ? 'online' : b.paymentMethod})` : 'New reservation'
  const row = (k, v) =>
    `<tr><td style="padding:6px 0;color:${MUTED};width:120px">${k}</td><td style="padding:6px 0;color:${INK}">${v}</td></tr>`
  const inner = `
    <h2 style="margin:0 0 4px;font-size:20px;color:${INK}">${esc(label)} — ${esc(b.code)}</h2>
    <p style="margin:0 0 16px;font-size:14px;color:${MUTED}">${esc(b.event?.title || '')}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px">
      ${row('Name', `<strong>${esc(b.name)}</strong>`)}
      ${row('Mobile', `+${esc(b.mobile)}`)}
      ${row('Email', esc(b.email))}
      ${kind === 'reserved' ? row('Held until', esc(when(b.expiresAt))) : ''}
    </table>
    ${ticketRows(b)}
    ${button(b.adminLink, 'Open in the admin', '#383F41')}`
  return getTransport().sendMail({
    from: FROM,
    to: CONTACT_TO,
    replyTo: b.email ? `${b.name || 'Customer'} <${b.email}>` : FROM,
    subject: `Tickets — ${label} ${b.code} · ${b.event?.title || ''}`,
    html: emailShell(inner, 'AS Ticketing'),
  })
}
