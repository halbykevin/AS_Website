// Order emails over the company mailbox (orders@as.com.lb, SMTP SSL :465).
// Inert unless SMTP_HOST/SMTP_USER/SMTP_PASS are set. Two mails per order:
// a confirmation to the customer (when they gave an email) and a copy to the
// shop inbox (ORDERS_NOTIFY_TO, defaults to the sending account).
import nodemailer from 'nodemailer'

const HOST = process.env.SMTP_HOST || ''
const PORT = Number(process.env.SMTP_PORT || 465)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || (USER ? `AS Store <${USER}>` : '')
const NOTIFY = process.env.ORDERS_NOTIFY_TO || USER
const CONTACT_TO = process.env.CONTACT_TO || NOTIFY
const STORE_URL = (process.env.STORE_URL || 'http://localhost:5180').replace(/\/$/, '')

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

const money = (n) => `$${Number(n || 0).toLocaleString()}`
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const RED = '#A41E22'
const INK = '#1d1d1f'

function orderHtml(order, { intro, trackUrl }) {
  const rows = (order.items || [])
    .map(
      (it) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;color:${INK}">${esc(it.name)}</td>
        <td align="center" style="padding:10px 8px;border-bottom:1px solid #eee;color:${INK};white-space:nowrap">× ${it.qty}</td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;color:${INK};white-space:nowrap">${money(Number(it.price) * it.qty)}</td>
      </tr>`,
    )
    .join('')

  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f7;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
      <h1 style="margin:0;font-size:22px;color:${INK}">AS Store</h1>
      <p style="margin:16px 0 0;color:${INK}">${intro}</p>

      <p style="margin:20px 0 4px;font-size:13px;color:#6e6e73">Order #${order.id} · ${new Date(order.createdAt).toLocaleString('en-GB')}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
        ${rows}
        <tr>
          <td colspan="2" style="padding:12px 0;font-weight:bold;color:${INK}">Total — cash on delivery</td>
          <td align="right" style="padding:12px 0;font-weight:bold;color:${INK}">${money(order.subtotal)}</td>
        </tr>
      </table>

      <div style="margin-top:16px;background:#f5f5f7;border-radius:12px;padding:14px 16px;font-size:14px;color:${INK}">
        <strong>Delivery</strong><br/>
        ${esc(order.fullName)}<br/>
        ${esc(order.phone)}${order.email ? `<br/>${esc(order.email)}` : ''}<br/>
        ${esc(order.address)}${order.city ? `, ${esc(order.city)}` : ''}
        ${order.notes ? `<br/><span style="color:#6e6e73">“${esc(order.notes)}”</span>` : ''}
      </div>

      ${
        trackUrl
          ? `<p style="margin:24px 0 0;text-align:center">
               <a href="${trackUrl}" style="display:inline-block;background:${RED};color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600">Track your order</a>
             </p>`
          : ''
      }
      <p style="margin:24px 0 0;font-size:12px;color:#6e6e73;text-align:center">AS Company (Absolute Solutions SAL) · Lebanon</p>
    </div>
  </div>`
}

// Fire-and-forget from the order endpoint: never blocks or fails the order.
export async function sendOrderEmails(order, trackToken) {
  if (!mailEnabled()) return
  const t = getTransport()
  const trackUrl = trackToken
    ? `${STORE_URL}/account/orders/${order.id}?t=${encodeURIComponent(trackToken)}`
    : ''
  const jobs = []

  if (order.email) {
    jobs.push(
      t.sendMail({
        from: FROM,
        to: order.email,
        subject: `Your AS Store order #${order.id} — received`,
        html: orderHtml(order, {
          intro: `Hi ${esc(order.fullName || 'there')}, thanks for your order! We've received it and will confirm it shortly. You pay in cash when it arrives.`,
          trackUrl,
        }),
      }),
    )
  }

  if (NOTIFY) {
    jobs.push(
      t.sendMail({
        from: FROM,
        to: NOTIFY,
        subject: `New order #${order.id} — ${order.fullName} (${money(order.subtotal)})`,
        html: orderHtml(order, {
          intro: `New cash-on-delivery order from <strong>${esc(order.fullName)}</strong> (${esc(order.phone)}).`,
          trackUrl: '',
        }),
      }),
    )
  }

  const results = await Promise.allSettled(jobs)
  for (const r of results) {
    if (r.status === 'rejected') console.error('[mail] send failed:', r.reason?.message || r.reason)
  }
}

// Contact-form message → the shop inbox (CONTACT_TO, defaults to the orders
// notify address). Replies go straight to the visitor via reply-to. When SMTP
// isn't configured (e.g. local dev) it just logs the message so nothing is lost.
export async function sendContactEmail({ name, email, phone, message }) {
  if (!mailEnabled()) {
    console.log('[contact] (mail disabled) message from', name, email, phone, '\n', message)
    return { delivered: false }
  }
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f7;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:32px">
      <h1 style="margin:0;font-size:22px;color:${INK}">AS Store — new message</h1>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;font-size:14px;color:${INK}">
        <tr><td style="padding:4px 0;color:#6e6e73;width:90px">Name</td><td style="padding:4px 0">${esc(name)}</td></tr>
        <tr><td style="padding:4px 0;color:#6e6e73">Email</td><td style="padding:4px 0">${esc(email) || '—'}</td></tr>
        <tr><td style="padding:4px 0;color:#6e6e73">Phone</td><td style="padding:4px 0">${esc(phone) || '—'}</td></tr>
      </table>
      <div style="margin-top:16px;background:#f5f5f7;border-radius:12px;padding:14px 16px;font-size:14px;color:${INK};white-space:pre-line">${esc(message)}</div>
      <p style="margin:24px 0 0;font-size:12px;color:#6e6e73">Sent from the store contact form · AS Company (Absolute Solutions SAL)</p>
    </div>
  </div>`

  await getTransport().sendMail({
    from: FROM,
    to: CONTACT_TO,
    replyTo: email || undefined,
    subject: `New contact message — ${name || 'Website visitor'}`,
    html,
  })
  return { delivered: true }
}
