// WhatsApp Cloud API sender (Meta Graph API).
//
// Business-initiated messages MUST use a pre-approved template. Two use it:
//  • the predictor's "your predictions are confirmed" (sendTemplate below —
//    WHATSAPP_TEMPLATE, body {{1}} = name, {{2}} = their picks on one line);
//  • the ticketing tickets message (ticketsWhatsApp.js), which attaches the
//    tickets PDF as the template's document header.
//
// Completely inert unless WHATSAPP_TOKEN + WHATSAPP_PHONE_ID are set (and each
// feature's own template name), so nothing changes until Meta is configured.

const TOKEN = process.env.WHATSAPP_TOKEN || ''
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || ''
const TEMPLATE = process.env.WHATSAPP_TEMPLATE || ''
const LANG = process.env.WHATSAPP_LANG || 'en'
// Default country code prepended to local numbers. Lebanon = 961.
const DEFAULT_CC = (process.env.WHATSAPP_DEFAULT_CC || '961').replace(/\D/g, '')
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

/** A number to send from and a token to send with. */
export const whatsappConnected = () => Boolean(TOKEN && PHONE_ID)
export const whatsappEnabled = () => whatsappConnected() && Boolean(TEMPLATE)

// Convert a stored mobile (which may be a local Lebanese number or carry a '+')
// into the digits-only E.164 form (country code + number, no '+') the Cloud API
// expects. Local numbers get the default country code; a leading trunk 0 is dropped.
export function toWhatsAppNumber(mobile, cc = DEFAULT_CC) {
  let d = String(mobile || '').replace(/\D/g, '')
  if (!d) return ''
  // Already international (begins with the country code and is long enough).
  if (d.startsWith(cc) && d.length >= cc.length + 7) return d
  d = d.replace(/^0+/, '') // drop national trunk prefix
  return cc + d
}

// Meta's own words for a failure, which is what staff need to see: "Recipient
// phone number not in allowed list", "Template name does not exist", …
async function failure(resp, what) {
  const text = await resp.text().catch(() => '')
  let detail = text
  try {
    const e = JSON.parse(text).error
    detail = [e.error_data?.details || e.error_user_msg || e.message, e.code && `code ${e.code}`].filter(Boolean).join(' — ')
  } catch {
    /* not JSON */
  }
  const err = new Error(`WhatsApp ${what} failed (${resp.status}): ${detail}`.slice(0, 500))
  err.status = resp.status
  return err
}

/** Upload a file to send as a message's media (kept by Meta for 30 days) → its media id. */
export async function uploadMedia(buffer, filename, mime) {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', mime)
  form.append('file', new Blob([buffer], { type: mime }), filename)
  const resp = await fetch(`${GRAPH}/${PHONE_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  })
  if (!resp.ok) throw await failure(resp, 'upload')
  return (await resp.json()).id
}

/**
 * Send a template message: `components` are the header/body/button parameters
 * in the Cloud API's shape. Throws with Meta's reason on a non-2xx; returns
 * the API JSON (with `messages[0].id`) on success. Accepted is not delivered —
 * a number that isn't on WhatsApp fails later, on the webhook.
 */
export async function sendTemplateMessage(toMobile, { name, language = LANG, components = [] }) {
  const to = toWhatsAppNumber(toMobile)
  if (!to) throw new Error('No mobile number to send to')
  const resp = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: { name, language: { code: language }, components },
    }),
  })
  if (!resp.ok) throw await failure(resp, 'send')
  return resp.json()
}

// The predictor's confirmation. `params` fills the body's {{1}}, {{2}}, ... in
// order. WhatsApp rejects newlines/tabs in body parameters, so callers should
// pass single-line strings.
export async function sendTemplate(toMobile, params = []) {
  if (!whatsappEnabled()) return { skipped: true }
  if (!toWhatsAppNumber(toMobile)) return { skipped: true }
  return sendTemplateMessage(toMobile, {
    name: TEMPLATE,
    components: params.length
      ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
      : [],
  })
}
