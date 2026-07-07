// Transactional email for the AS Company site, sent over the company mailbox
// (orders@as.com.lb, SMTP SSL :465 by default). Inert unless SMTP_HOST/SMTP_USER/
// SMTP_PASS are set, so nothing sends until the mailbox is configured.
//
// Currently sends one email: a detailed "new Predict & Win entry" notification to
// the staff inbox after every public prediction submission. The email includes a
// one-tap WhatsApp button that opens a chat with the player, pre-filled with a
// confirmation + Whish payment message.
import nodemailer from 'nodemailer'
import { toWhatsAppNumber } from './whatsapp.js'

const HOST = process.env.SMTP_HOST || ''
const PORT = Number(process.env.SMTP_PORT || 465)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || (USER ? `AS Company <${USER}>` : '')
// Where the entry notifications land. Defaults to the staff address on file.
const NOTIFY_TO = process.env.PREDICTOR_NOTIFY_TO || 'kevinhalby70199@gmail.com'
// Link the player taps to open / download the Whish app to pay the entry fee.
const WHISH_APP_URL =
  process.env.WHISH_APP_URL ||
  'https://www.whish.money/download?utm_source=whish_website&utm_medium=whish_website'

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

// Branded email shell — a light-gray page with a white card, a text logo header,
// and a small footer. All-inline styles for email-client compatibility.
function emailShell(innerHtml) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f7;margin:0;padding:24px">
    <div style="max-width:600px;margin:0 auto">
      <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <div style="text-align:center;padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid #eee">
          <span style="font-size:22px;font-weight:800;letter-spacing:0.5px;color:${RED}">AS COMPANY</span>
          <div style="margin-top:4px;font-size:12px;color:${MUTED}">Predict &amp; Win — World Cup 2026</div>
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
function whatsappText({ playerName, gameTitle, picks, paymentEnabled, amount, recipient, note }) {
  const lines = []
  lines.push(`Hi ${playerName || 'there'}! 👋`)
  lines.push('')
  lines.push(`Thanks for entering ${gameTitle}. We've received your predictions:`)
  picks.forEach((p, i) => {
    lines.push(`${i + 1}. ${p.teamA} vs ${p.teamB} — Both teams to score: ${p.btts}; Qualifies: ${p.qualifier}`)
  })
  if (paymentEnabled) {
    lines.push('')
    lines.push(`To confirm your entry, please pay ${amount} on Whish to ${recipient}${note ? ` with the note ${note}` : ''}.`)
    lines.push(`Open / download Whish here: ${WHISH_APP_URL}`)
  }
  lines.push('')
  lines.push('Good luck! 🍀 — AS Company')
  return lines.join('\n')
}

// Send the staff notification for one prediction entry. Fire-and-forget: callers
// should .catch() it so a mail failure never affects the API response.
export async function sendPredictionEmail(entry) {
  if (!mailEnabled()) return { skipped: true }
  const {
    playerName, mobile, createdAt, gameTitle = 'Predict & Win — World Cup 2026',
    picks = [], paymentEnabled = false, amount = '', recipient = 'AS Company', note = '',
  } = entry

  const waNumber = toWhatsAppNumber(mobile)
  const waText = whatsappText({ playerName, gameTitle, picks, paymentEnabled, amount, recipient, note })
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waText)}` : ''
  const when = createdAt ? new Date(createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : ''

  const rows = picks
    .map(
      (p) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #eee;color:${INK}">${esc(p.teamA)} <span style="color:${MUTED}">vs</span> ${esc(p.teamB)}</td>
        <td align="center" style="padding:10px 8px;border-bottom:1px solid #eee;color:${INK};white-space:nowrap">${esc(p.btts)}</td>
        <td align="right" style="padding:10px 8px;border-bottom:1px solid #eee;color:${INK};font-weight:700;white-space:nowrap">${esc(p.qualifier)}</td>
      </tr>`
    )
    .join('')

  const paymentBlock = paymentEnabled
    ? `<p style="margin:18px 0 0;font-size:14px;color:${INK}">
         💳 <strong>Entry fee:</strong> ${esc(amount)} on Whish to <strong>${esc(recipient)}</strong>${note ? ` · note <strong style="color:${RED}">${esc(note)}</strong>` : ''}
       </p>`
    : ''

  const waButton = waHref
    ? `<div style="text-align:center;margin:26px 0 6px">
         <a href="${waHref}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px">
           💬 Message ${esc(playerName || 'the player')} on WhatsApp
         </a>
       </div>
       <p style="margin:8px 0 0;font-size:12px;color:${MUTED};text-align:center">
         Opens WhatsApp with a confirmation + Whish payment link, pre-filled to ${esc(mobile)}.
       </p>`
    : `<p style="margin:20px 0 0;font-size:13px;color:${MUTED}">No valid WhatsApp number to build a chat link for ${esc(mobile)}.</p>`

  const inner = `
    <h2 style="margin:0 0 4px;font-size:20px;color:${INK}">New Predict &amp; Win entry ⚽</h2>
    <p style="margin:0 0 20px;font-size:14px;color:${MUTED}">A visitor just submitted their World Cup predictions.</p>

    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:8px">
      <tr><td style="padding:6px 0;color:${MUTED};width:120px">Player</td><td style="padding:6px 0;color:${INK};font-weight:700">${esc(playerName)}</td></tr>
      <tr><td style="padding:6px 0;color:${MUTED}">Mobile</td><td style="padding:6px 0;color:${INK}">${esc(mobile)}</td></tr>
      ${when ? `<tr><td style="padding:6px 0;color:${MUTED}">Submitted</td><td style="padding:6px 0;color:${INK}">${esc(when)}</td></tr>` : ''}
    </table>

    ${paymentBlock}

    <h3 style="margin:24px 0 8px;font-size:15px;color:${INK}">Predictions (${picks.length})</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr>
        <th align="left" style="padding:8px;border-bottom:2px solid #eee;color:${MUTED};font-weight:600;text-transform:uppercase;font-size:11px">Match</th>
        <th align="center" style="padding:8px;border-bottom:2px solid #eee;color:${MUTED};font-weight:600;text-transform:uppercase;font-size:11px">BTTS</th>
        <th align="right" style="padding:8px;border-bottom:2px solid #eee;color:${MUTED};font-weight:600;text-transform:uppercase;font-size:11px">Qualifies</th>
      </tr>
      ${rows}
    </table>

    ${waButton}

    <p style="margin:24px 0 0;font-size:13px;color:${MUTED}">
      💳 Whish app link: <a href="${WHISH_APP_URL}" style="color:${RED}">${esc(WHISH_APP_URL)}</a>
    </p>`

  return getTransport().sendMail({
    from: FROM,
    to: NOTIFY_TO,
    replyTo: FROM,
    subject: `New Predict & Win entry — ${playerName || 'Anonymous'}`,
    html: emailShell(inner),
  })
}
