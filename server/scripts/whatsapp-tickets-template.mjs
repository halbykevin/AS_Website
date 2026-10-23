// Submit the tickets WhatsApp template to Meta for approval — once per WABA
// and language. The template itself is defined in src/ticketsWhatsApp.js,
// beside the code that sends it.
//
//   npm run whatsapp:tickets-template              submit it
//   npm run whatsapp:tickets-template -- --status  how Meta's review is going
//   npm run whatsapp:tickets-template -- --dry-run print what would be sent
//
// Needs WHATSAPP_TOKEN (system user with whatsapp_business_management) and
// WHATSAPP_WABA_ID in server/.env; the template's name is
// WHATSAPP_TICKETS_TEMPLATE (default tickets_confirmed). A document header
// must come with a sample document, uploaded through Meta's resumable upload
// API on the token's own app — a watermarked sample ticket is rendered for it.
// Once Meta approves, set WHATSAPP_TICKETS_TEMPLATE and restart the API.

import 'dotenv/config'
import { renderTickets } from '../src/ticketPdf.js'
import { ticketsTemplateDefinition } from '../src/ticketsWhatsApp.js'

const TOKEN = process.env.WHATSAPP_TOKEN || ''
const WABA = process.env.WHATSAPP_WABA_ID || ''
const NAME = process.env.WHATSAPP_TICKETS_TEMPLATE || 'tickets_confirmed'
const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || 'v21.0'}`
const args = new Set(process.argv.slice(2))

async function graph(path, init = {}) {
  const res = await fetch(`${GRAPH}${path}`, { ...init, headers: { Authorization: `Bearer ${TOKEN}`, ...init.headers } })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data.error) {
    const e = data.error || {}
    throw new Error(`${path.split('?')[0]} → ${e.error_user_msg || e.message || res.status}${e.code ? ` (code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''})` : ''}`)
  }
  return data
}

if (args.has('--dry-run')) {
  console.log(JSON.stringify(ticketsTemplateDefinition({ headerHandle: '<uploaded sample PDF>', name: NAME }), null, 2))
  process.exit(0)
}
if (!TOKEN || !WABA) {
  console.error('Set WHATSAPP_TOKEN and WHATSAPP_WABA_ID in server/.env first.')
  process.exit(1)
}

try {
  if (args.has('--status')) {
    const { data } = await graph(`/${WABA}/message_templates?name=${NAME}&fields=name,language,status,category,rejected_reason`)
    if (!data.length) console.log(`No template called ${NAME} on WABA ${WABA}.`)
    for (const t of data) console.log(`${t.name} [${t.language}] ${t.category}: ${t.status}${t.rejected_reason && t.rejected_reason !== 'NONE' ? ` — ${t.rejected_reason}` : ''}`)
    process.exit(0)
  }

  // The sample document Meta reviews the template with.
  const pdf = await renderTickets({
    website: 'ticketing.as.com.lb',
    sample: true,
    event: { title: 'Al Qarna Al Bayda', date: '2026-12-26', time: '18:30', venue: 'Milad Al Ghazal Center', city: 'Zgharta', venueAr: '', poster: null },
    tickets: [{ serial: 'AST-SAMPLE00', qr: 'AS TICKETING SAMPLE - NOT A TICKET', holder: 'Maria', section: 'VIP', row: 'A', seat: '1' }],
  })
  const app = process.env.WHATSAPP_APP_ID || (await graph(`/debug_token?input_token=${TOKEN}`)).data.app_id
  const session = await graph(`/${app}/uploads?file_name=ticket-sample.pdf&file_length=${pdf.length}&file_type=application/pdf`, { method: 'POST' })
  const res = await fetch(`${GRAPH}/${session.id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' },
    body: pdf,
  })
  const upload = await res.json()
  if (!upload.h) throw new Error(`sample upload → ${upload.error?.message || res.status}`)

  const created = await graph(`/${WABA}/message_templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ticketsTemplateDefinition({ headerHandle: upload.h, name: NAME })),
  })
  console.log(`Submitted ${NAME}: ${created.status} (${created.category}, id ${created.id}).`)
  console.log('Check on it with --status; once APPROVED, set WHATSAPP_TICKETS_TEMPLATE and restart the API.')
} catch (err) {
  console.error(`Failed: ${err.message}`)
  process.exit(1)
}
