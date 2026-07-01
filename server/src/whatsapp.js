// WhatsApp Cloud API sender (Meta Graph API).
//
// Used to send the "your predictions are confirmed" message after a public
// prediction submission. Business-initiated messages MUST use a pre-approved
// template, so we send a named template with two body parameters:
//   {{1}} = the person's name, {{2}} = their picks on one line.
//
// Completely inert unless WHATSAPP_TOKEN + WHATSAPP_PHONE_ID + WHATSAPP_TEMPLATE
// are set, so nothing changes until the Meta account is configured.

const TOKEN = process.env.WHATSAPP_TOKEN || ''
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || ''
const TEMPLATE = process.env.WHATSAPP_TEMPLATE || ''
const LANG = process.env.WHATSAPP_LANG || 'en'
// Default country code prepended to local numbers. Lebanon = 961.
const DEFAULT_CC = (process.env.WHATSAPP_DEFAULT_CC || '961').replace(/\D/g, '')
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'

export const whatsappEnabled = () => Boolean(TOKEN && PHONE_ID && TEMPLATE)

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

// Send a template message. `params` fills the body's {{1}}, {{2}}, ... in order.
// WhatsApp rejects newlines/tabs in body parameters, so callers should pass
// single-line strings. Throws on a non-2xx response; returns the API JSON on success.
export async function sendTemplate(toMobile, params = []) {
  if (!whatsappEnabled()) return { skipped: true }
  const to = toWhatsAppNumber(toMobile)
  if (!to) return { skipped: true }

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: TEMPLATE,
      language: { code: LANG },
      components: params.length
        ? [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }]
        : [],
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
