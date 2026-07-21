// Transactional email for the AS Company site, sent over the company mailbox
// (orders@as.com.lb, SMTP SSL :465 by default). Inert unless SMTP_HOST/SMTP_USER/
// SMTP_PASS are set, so nothing sends until the mailbox is configured.
//
// Currently sends one email: a "new Guess the Score entry" notification to the
// staff inbox after every public prediction submission. The email includes a
// one-tap WhatsApp button that opens a chat with the player, pre-filled with a
// confirmation of their predicted score.
import nodemailer from 'nodemailer'
import { toWhatsAppNumber } from './whatsapp.js'

const HOST = process.env.SMTP_HOST || ''
const PORT = Number(process.env.SMTP_PORT || 465)
const USER = process.env.SMTP_USER || ''
const PASS = process.env.SMTP_PASS || ''
const FROM = process.env.MAIL_FROM || (USER ? `AS Company <${USER}>` : '')
// Where the entry notifications land. Defaults to the staff address on file.
const NOTIFY_TO = process.env.PREDICTOR_NOTIFY_TO || 'kevinhalby70199@gmail.com'

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
// and a small footer. All-inline styles for email-client compatibility.
function emailShell(innerHtml) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f5f5f7;margin:0;padding:24px">
    <div style="max-width:600px;margin:0 auto">
      <div style="background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <div style="text-align:center;padding-bottom:22px;margin-bottom:24px;border-bottom:1px solid #eee">
          <span style="font-size:22px;font-weight:800;letter-spacing:0.5px;color:${RED}">AS COMPANY</span>
          <div style="margin-top:4px;font-size:12px;color:${MUTED}">Guess the Score</div>
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
