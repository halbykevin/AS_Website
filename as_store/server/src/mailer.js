import nodemailer from 'nodemailer'
import { OTP_TTL_MINUTES } from './otp.js'

const HOST = process.env.SMTP_HOST || ''
const PORT = Number(process.env.SMTP_PORT || 465)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || (USER ? `AS Store <${USER}>` : '')
const NOTIFY = process.env.ORDERS_NOTIFY_TO || USER
const CONTACT_TO = process.env.CONTACT_TO || NOTIFY
const STORE_URL = (process.env.STORE_URL || 'http://localhost:5180').replace(/\/$/, '')
const LOGO_URL = process.env.MAIL_LOGO_URL || `${STORE_URL}/as-store-logo.png`

export const mailEnabled = () => Boolean(HOST && USER && PASS)

let transport = null
function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: HOST,
      port: PORT,
      secure: PORT === 465, 
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
const MUTED = '#6e6e73'

// How an order paid, in the three places an email has to say it. A Whish order
// only reaches the customer/staff mails once markWhishPaid has settled it, so
// 'paid' is the normal case there — but the wording still follows the actual
// payment_status rather than assuming it.
function paymentWording(order) {
  const paid = order?.paymentStatus === 'paid'
  if (order?.paymentMethod === 'whish') {
    return {
      tag: 'Whish Pay',
      totalLabel: paid ? 'Total — paid with Whish Pay' : 'Total — awaiting Whish Pay payment',
      customerLine: paid
        ? "We've received your payment in full."
        : 'Your Whish Pay payment is still pending.',
      staffLine: paid ? 'paid online with Whish Pay' : 'started but not yet paid via Whish Pay',
    }
  }
  return {
    tag: 'Cash on delivery',
    totalLabel: 'Total — cash on delivery',
    customerLine: 'You pay in cash when it arrives.',
    staffLine: 'to be paid cash on delivery',
  }
}

function emailShell(innerHtml) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f7;margin:0;padding:24px">
    <div style="max-width:560px;margin:0 auto">
      <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <div style="text-align:center;padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid #eee">
          <a href="${STORE_URL}" style="text-decoration:none">
            <img src="${LOGO_URL}" alt="AS Store" width="150" style="width:150px;max-width:60%;height:auto;border:0" />
          </a>
        </div>
        ${innerHtml}
      </div>
      <p style="margin:20px 0 0;font-size:12px;color:${MUTED};text-align:center;line-height:1.6">
        AS Company (Absolute Solutions SAL) · Lebanon<br/>
        <a href="${STORE_URL}" style="color:${RED};text-decoration:none">store.as.com.lb</a>
      </p>
    </div>
  </div>`
}

function orderBody(order, { intro, trackUrl }) {
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
    <p style="margin:0 0 0;color:${INK};font-size:15px;line-height:1.6">${intro}</p>

    <p style="margin:20px 0 4px;font-size:13px;color:${MUTED}">Order #${order.id} · ${new Date(order.createdAt).toLocaleString('en-GB')}</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px">
      ${rows}
      <tr>
        <td colspan="2" style="padding:12px 0;font-weight:bold;color:${INK}">${esc(paymentWording(order).totalLabel)}</td>
        <td align="right" style="padding:12px 0;font-weight:bold;color:${INK}">${money(order.subtotal)}</td>
      </tr>
    </table>

    <div style="margin-top:16px;background:#f5f5f7;border-radius:12px;padding:14px 16px;font-size:14px;color:${INK}">
      <strong>Delivery</strong><br/>
      ${esc(order.fullName)}<br/>
      ${esc(order.phone)}${order.email ? `<br/>${esc(order.email)}` : ''}<br/>
      ${esc(order.address)}${order.city ? `, ${esc(order.city)}` : ''}
      ${order.notes ? `<br/><span style="color:${MUTED}">“${esc(order.notes)}”</span>` : ''}
    </div>

    ${
      trackUrl
        ? `<p style="margin:24px 0 0;text-align:center">
             <a href="${trackUrl}" style="display:inline-block;background:${RED};color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:600">Track your order</a>
           </p>`
        : ''
    }`
}

// Copy for each fulfilment status the admin can move an order to. 'pending' is
// absent on purpose: it is the state an order starts in, so moving *back* to it
// is an internal correction the customer should not be emailed about.
const STATUS_EMAILS = {
  confirmed: {
    subject: (o) => `Your AS Store order #${o.id} is confirmed`,
    intro: (o) =>
      `Good news ${esc(firstName(o.fullName))} — your order is confirmed and we're getting it ready.`,
  },
  shipped: {
    subject: (o) => `Your AS Store order #${o.id} is on its way`,
    intro: (o) =>
      `Your order is on its way, ${esc(firstName(o.fullName))}. We'll let you know once it's delivered.`,
  },
  delivered: {
    subject: (o) => `Your AS Store order #${o.id} has been delivered`,
    intro: (o) =>
      `Your order has been delivered — thanks for shopping with AS Store, ${esc(firstName(o.fullName))}!`,
  },
  cancelled: {
    subject: (o) => `Your AS Store order #${o.id} has been cancelled`,
    // Only promise a refund conversation when money actually changed hands.
    intro: (o) =>
      `Your order has been cancelled, ${esc(firstName(o.fullName))}.` +
      (o.paymentStatus === 'paid'
        ? " Since this order was already paid, we'll be in touch about your refund."
        : '') +
      " If this was unexpected, just reply to this email and we'll help.",
  },
}

const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || 'there'

export const statusEmailExists = (status) => Boolean(STATUS_EMAILS[status])

// Fire-and-forget when the admin moves an order to a new status. Only the
// customer is mailed — staff made the change, so a copy back to them is noise.
export async function sendOrderStatusEmail(order, trackToken) {
  if (!mailEnabled()) return { sent: false, reason: 'mail disabled' }
  const copy = STATUS_EMAILS[order?.status]
  if (!copy) return { sent: false, reason: `no email for status ${order?.status}` }
  if (!order.email) return { sent: false, reason: 'order has no email address' }

  const trackUrl = trackToken
    ? `${STORE_URL}/account/orders/${order.id}?t=${encodeURIComponent(trackToken)}`
    : ''

  await getTransport().sendMail({
    from: FROM,
    to: order.email,
    subject: copy.subject(order),
    html: emailShell(orderBody(order, { intro: copy.intro(order), trackUrl })),
  })
  return { sent: true }
}

// Fire-and-forget from the order endpoint: never blocks or fails the order.
export async function sendOrderEmails(order, trackToken) {
  if (!mailEnabled()) return
  const t = getTransport()
  const trackUrl = trackToken
    ? `${STORE_URL}/account/orders/${order.id}?t=${encodeURIComponent(trackToken)}`
    : ''
  const jobs = []
  const pay = paymentWording(order)

  if (order.email) {
    jobs.push(
      t.sendMail({
        from: FROM,
        to: order.email,
        subject: `Your AS Store order #${order.id} — received`,
        html: emailShell(
          orderBody(order, {
            intro: `Hi ${esc(order.fullName || 'there')}, thanks for your order! We've received it and will confirm it shortly. ${esc(pay.customerLine)}`,
            trackUrl,
          }),
        ),
      }),
    )
  }

  if (NOTIFY) {
    jobs.push(
      t.sendMail({
        from: FROM,
        // The payment method is in the subject so staff can triage the inbox
        // without opening the mail — an unpaid order needs different handling.
        subject: `New order #${order.id} — ${order.fullName} (${money(order.subtotal)}) · ${pay.tag}`,
        to: NOTIFY,
        html: emailShell(
          orderBody(order, {
            intro: `New order from <strong>${esc(order.fullName)}</strong> (${esc(order.phone)}), ${esc(pay.staffLine)}.`,
            trackUrl: '',
          }),
        ),
      }),
    )
  }

  const results = await Promise.allSettled(jobs)
  for (const r of results) {
    if (r.status === 'rejected') console.error('[mail] send failed:', r.reason?.message || r.reason)
  }
}

export async function sendContactEmail({ name, email, phone, message }) {
  if (!mailEnabled()) {
    console.log('[contact] (mail disabled) message from', name, email, phone, '\n', message)
    return { delivered: false }
  }
  const body = `
    <h1 style="margin:0 0 16px;font-size:20px;color:${INK}">New message from the store</h1>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:${INK}">
      <tr><td style="padding:4px 0;color:${MUTED};width:90px">Name</td><td style="padding:4px 0">${esc(name)}</td></tr>
      <tr><td style="padding:4px 0;color:${MUTED}">Email</td><td style="padding:4px 0">${esc(email) || '—'}</td></tr>
      <tr><td style="padding:4px 0;color:${MUTED}">Phone</td><td style="padding:4px 0">${esc(phone) || '—'}</td></tr>
    </table>
    <div style="margin-top:16px;background:#f5f5f7;border-radius:12px;padding:14px 16px;font-size:14px;color:${INK};white-space:pre-line">${esc(message)}</div>`

  await getTransport().sendMail({
    from: FROM,
    to: CONTACT_TO,
    replyTo: email || undefined,
    subject: `New contact message — ${name || 'Website visitor'}`,
    html: emailShell(body),
  })
  return { delivered: true }
}

export async function sendOtpEmail(email, code) {
  if (!mailEnabled()) {
    console.log(`[otp] sign-in code for ${email}: ${code}`)
    return { delivered: false }
  }
  const body = `
    <h1 style="margin:0 0 8px;font-size:20px;color:${INK}">Your sign-in code</h1>
    <p style="margin:0;color:${MUTED};font-size:14px;line-height:1.6">Enter this code to sign in to AS Store. It expires in ${OTP_TTL_MINUTES} minutes.</p>
    <div style="margin:26px 0;text-align:center">
      <span style="display:inline-block;background:#f5f5f7;border-radius:14px;padding:18px 30px;font-size:34px;font-weight:700;letter-spacing:12px;color:${INK}">${esc(code)}</span>
    </div>
    <p style="margin:0;color:${MUTED};font-size:13px;line-height:1.6">If you didn't request this, you can safely ignore this email — no one can sign in without the code.</p>`

  await getTransport().sendMail({
    from: FROM,
    to: email,
    subject: `${code} is your AS Store sign-in code`,
    html: emailShell(body),
  })
  return { delivered: true }
}
