// WhatsApp Cloud API sender (Meta Graph API) — sign-in OTP codes.
//
// Business-initiated messages must use a pre-approved template, and a login code
// must specifically use an AUTHENTICATION-category template (created in the Meta
// dashboard with an OTP button, otp_type COPY_CODE). Meta wants the code TWICE
// in the send payload: once for the body's {{1}} and once for the button, which
// is what fills the "copy code" action. Both parameters must carry the same value
// or the send is rejected.
//
// Inert unless WHATSAPP_TOKEN + WHATSAPP_PHONE_ID + WHATSAPP_OTP_TEMPLATE are all
// set — until then sendOtpWhatsApp() logs the code like the mailer does in dev,
// and whatsappOtpEnabled() stays false so the UI never offers the option.
//
// Mirrors the marketing site's server/src/whatsapp.js, which sends a Utility
// template; the payload differs because authentication templates need the button
// component.

import express from 'express'
import crypto from 'node:crypto'

const TOKEN = process.env.WHATSAPP_TOKEN || ''
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || ''
const TEMPLATE = process.env.WHATSAPP_OTP_TEMPLATE || ''
const LANG = process.env.WHATSAPP_LANG || 'en'
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || ''
const APP_SECRET = process.env.WHATSAPP_APP_SECRET || ''

export const whatsappOtpEnabled = () => Boolean(TOKEN && PHONE_ID && TEMPLATE)

// Send a sign-in code. `mobile` is already normalized to digits + country code
// by normalizeMobile() in customerAuth.js. Throws on a non-2xx so the caller can
// surface a "couldn't send" error instead of leaving the shopper waiting.
export async function sendOtpWhatsApp(mobile, code) {
  const to = String(mobile || '').replace(/\D/g, '')
  if (!whatsappOtpEnabled()) {
    console.log(`[otp] whatsapp sign-in code for ${to}: ${code}`)
    return { skipped: true }
  }
  if (!to) throw new Error('WhatsApp send failed: empty recipient')

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: TEMPLATE,
      language: { code: LANG },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  }

  const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`WhatsApp send failed (${resp.status}): ${text}`)
  }
  return resp.json()
}

// ---------------------------------------------------------------------------
// Webhook. Meta requires an app to be subscribed to a WABA before a phone
// number can be registered on it, and a subscription needs a public HTTPS
// callback that answers the verification handshake — so this endpoint exists
// even though the OTP flow itself only ever SENDS and never needs to listen.
//
// What it gives us beyond unblocking registration: delivery/read receipts for
// the codes we send (`statuses`) and any replies customers send back
// (`messages`). Both are log-only today.
// ---------------------------------------------------------------------------

export const whatsappRouter = express.Router()

// Subscription handshake: Meta GETs with a challenge; echo it back verbatim,
// but only when the verify token matches the one set in the app dashboard.
whatsappRouter.get('/api/whatsapp/webhook', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return res.status(200).type('text/plain').send(String(req.query['hub.challenge'] ?? ''))
  }
  res.sendStatus(403)
})

// Meta signs each delivery with the app secret. Checked only when
// WHATSAPP_APP_SECRET is set, so the endpoint still works before it's configured.
function validSignature(req) {
  const header = req.get('x-hub-signature-256') || ''
  const expected =
    'sha256=' +
    crypto.createHmac('sha256', APP_SECRET).update(req.rawBody || Buffer.alloc(0)).digest('hex')
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Meta retries anything that isn't a prompt 2xx, so acknowledge first and do
// the work after.
whatsappRouter.post('/api/whatsapp/webhook', (req, res) => {
  if (APP_SECRET && !validSignature(req)) return res.sendStatus(401)
  res.sendStatus(200)
  try {
    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {}
        for (const s of v.statuses || []) {
          const err = s.errors ? ` ${JSON.stringify(s.errors)}` : ''
          console.log(`[whatsapp] message ${s.id} → ${s.status}${err}`)
        }
        for (const m of v.messages || []) {
          console.log(`[whatsapp] inbound from ${m.from}: ${m.text?.body ?? `(${m.type})`}`)
        }
      }
    }
  } catch (e) {
    console.error('[whatsapp] webhook parse failed:', e?.message || e)
  }
})
