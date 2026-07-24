// Background notification worker. Runs inside the API process on an interval
// (fits the single-VPS/PM2 deployment — no extra infra), guarded by a Postgres
// advisory lock so a second PM2 instance or overlapping tick can never
// double-process.
//
// Each tick: 1) drain the event outbox  2) promote due scheduled campaigns
//            3) dispatch due deliveries  4) expire finished campaigns.

import { query, pool } from '../db.js'
import { eventHandlers, fanoutCampaign, audit } from './service.js'
import { sendExpoPush, buildPushMessage, isExpoToken } from './expoPush.js'

const LOCK_KEY = 0x61_73_6e_66 // "asnf"
const INTERVAL_MS = Math.max(2000, Number(process.env.NOTIFY_WORKER_INTERVAL_MS) || 15_000)
const MAX_ATTEMPTS = 4

// Exponential backoff (seconds) for attempt n (1-based). Exported for tests.
export const backoffSeconds = (attempt) => Math.min(3600, 60 * 4 ** (attempt - 1))

let timer = null
let running = false

export function startNotificationWorker() {
  if (timer) return
  timer = setInterval(() => {
    tick().catch((e) => console.error('[notify] worker tick failed:', e?.message || e))
  }, INTERVAL_MS)
  timer.unref?.()
  console.log(`[notify] worker started (every ${INTERVAL_MS / 1000}s)`)
}

export function stopNotificationWorker() {
  if (timer) clearInterval(timer)
  timer = null
}

export async function tick() {
  if (running) return // re-entrancy guard within this process
  running = true
  const client = await pool.connect()
  try {
    const { rows } = await client.query(`SELECT pg_try_advisory_lock($1) AS ok`, [LOCK_KEY])
    if (!rows[0]?.ok) return // another instance holds the lock
    try {
      await drainOutbox()
      await promoteScheduledCampaigns()
      await dispatchDeliveries()
      await expireCampaigns()
    } finally {
      await client.query(`SELECT pg_advisory_unlock($1)`, [LOCK_KEY])
    }
  } finally {
    client.release()
    running = false
  }
}

// --- 1) Outbox --------------------------------------------------------------

async function drainOutbox() {
  const { rows: events } = await query(
    `SELECT * FROM notification_events
     WHERE status IN ('pending','failed') AND attempts < $1
     ORDER BY id LIMIT 50`,
    [MAX_ATTEMPTS],
  )
  for (const ev of events) {
    const handler = eventHandlers[ev.event_type]
    try {
      if (handler) await handler(ev.payload || {})
      await query(
        `UPDATE notification_events SET status = 'processed', processed_at = now(),
           attempts = attempts + 1, last_error = '' WHERE id = $1`,
        [ev.id],
      )
    } catch (e) {
      const attempts = ev.attempts + 1
      const dead = attempts >= MAX_ATTEMPTS
      console.error(`[notify] event #${ev.id} (${ev.event_type}) failed:`, e?.message || e)
      await query(
        `UPDATE notification_events SET status = $2, attempts = $3, last_error = $4 WHERE id = $1`,
        [ev.id, dead ? 'dead' : 'failed', attempts, String(e?.message || e).slice(0, 500)],
      )
    }
  }
}

// --- 2) Scheduled campaigns -------------------------------------------------

async function promoteScheduledCampaigns() {
  const { rows } = await query(
    `UPDATE notification_campaigns SET status = 'sending'
     WHERE status = 'scheduled' AND (scheduled_at IS NULL OR scheduled_at <= now())
     RETURNING *`,
  )
  for (const campaign of rows) {
    try {
      const summary = await fanoutCampaign(campaign)
      await query(
        `UPDATE notification_campaigns SET status = 'sent', sent_at = now() WHERE id = $1`,
        [campaign.id],
      )
      await audit('system', 'campaign_sent', 'campaign', campaign.id, summary)
      console.log(
        `[notify] campaign #${campaign.id} "${campaign.name}" sent to ${summary.created} customer(s)`,
      )
    } catch (e) {
      console.error(`[notify] campaign #${campaign.id} fanout failed:`, e?.message || e)
      await query(`UPDATE notification_campaigns SET status = 'failed' WHERE id = $1`, [
        campaign.id,
      ])
      await audit('system', 'campaign_failed', 'campaign', campaign.id, {
        error: String(e?.message || e).slice(0, 300),
      })
    }
  }
}

// --- 3) Deliveries ----------------------------------------------------------

async function dispatchDeliveries() {
  const { rows: due } = await query(
    `SELECT d.*, n.title, n.body, n.deep_link, n.data, n.priority, n.category,
            t.token, t.revoked_at
     FROM notification_deliveries d
     JOIN notifications n ON n.id = d.notification_id
     LEFT JOIN device_tokens t ON t.id = d.device_token_id
     WHERE d.status IN ('queued','failed') AND d.attempts < $1 AND d.next_attempt_at <= now()
     ORDER BY d.id LIMIT 200`,
    [MAX_ATTEMPTS],
  )
  if (!due.length) return

  const pushes = due.filter((d) => d.channel === 'push')
  const others = due.filter((d) => d.channel !== 'push')

  // Push: batch through the Expo API.
  const valid = pushes.filter((d) => d.token && !d.revoked_at && isExpoToken(d.token))
  for (const d of pushes.filter((x) => !valid.includes(x))) {
    await query(
      `UPDATE notification_deliveries SET status = 'skipped', last_error = 'token revoked or invalid' WHERE id = $1`,
      [d.id],
    )
  }
  if (valid.length) {
    const messages = valid.map((d) =>
      buildPushMessage({
        token: d.token,
        title: d.title,
        body: d.body,
        deepLink: d.deep_link,
        data: { ...(d.data || {}), notificationId: d.notification_id },
        priority: d.priority,
        channelId: d.category === 'order' ? 'orders' : 'default',
      }),
    )
    let results
    try {
      results = await sendExpoPush(messages)
    } catch (e) {
      // Whole-batch transport failure: back off every delivery in the batch.
      console.error('[notify] expo push batch failed:', e?.message || e)
      for (const d of valid) await bumpFailure(d, `push transport: ${e?.message || e}`)
      results = null
    }
    if (results) {
      for (let i = 0; i < valid.length; i++) {
        const d = valid[i]
        const r = results[i] || { status: 'error', error: 'missing ticket' }
        if (r.status === 'ok') {
          await query(
            `UPDATE notification_deliveries SET status = 'sent', sent_at = now(),
               attempts = attempts + 1, provider_id = $2, last_error = '' WHERE id = $1`,
            [d.id, r.id || ''],
          )
        } else if (r.shouldRevoke) {
          await query(`UPDATE device_tokens SET revoked_at = now() WHERE id = $1`, [
            d.device_token_id,
          ])
          await query(
            `UPDATE notification_deliveries SET status = 'dead', attempts = attempts + 1,
               last_error = $2 WHERE id = $1`,
            [d.id, 'DeviceNotRegistered — token revoked'],
          )
        } else {
          await bumpFailure(d, r.error || 'push rejected')
        }
      }
    }
  }

  // Email deliveries are queued by campaigns that include the channel; the
  // send itself reuses the store mailer lazily to avoid circular imports.
  for (const d of others) {
    if (d.channel === 'email') {
      try {
        const sent = await sendNotificationEmail(d)
        await query(
          `UPDATE notification_deliveries SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN now() END,
             attempts = attempts + 1, last_error = '' WHERE id = $1`,
          [d.id, sent ? 'sent' : 'skipped'],
        )
      } catch (e) {
        await bumpFailure(d, `email: ${e?.message || e}`)
      }
    } else {
      // Unknown channel — park it so it never loops.
      await query(
        `UPDATE notification_deliveries SET status = 'dead', last_error = 'unknown channel' WHERE id = $1`,
        [d.id],
      )
    }
  }
}

async function bumpFailure(d, message) {
  const attempts = d.attempts + 1
  const dead = attempts >= MAX_ATTEMPTS
  await query(
    `UPDATE notification_deliveries SET status = $2, attempts = $3, last_error = $4,
       next_attempt_at = now() + make_interval(secs => $5) WHERE id = $1`,
    [d.id, dead ? 'dead' : 'failed', attempts, String(message).slice(0, 500), backoffSeconds(attempts)],
  )
}

async function sendNotificationEmail(d) {
  const { mailEnabled } = await import('../mailer.js')
  if (!mailEnabled()) return false
  const { rows } = await query(
    `SELECT c.email, c.name FROM notifications n
     JOIN customers c ON c.id = n.customer_id WHERE n.id = $1`,
    [d.notification_id],
  )
  const to = rows[0]?.email
  if (!to) return false
  const nodemailer = (await import('nodemailer')).default
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  const esc = (s) =>
    String(s ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    )
  const link = String(d.deep_link || '')
  const url = link.startsWith('/') ? `${(process.env.STORE_URL || '').replace(/\/$/, '')}${link}` : link
  await transport.sendMail({
    from: process.env.MAIL_FROM || `AS Store <${process.env.SMTP_USER}>`,
    to,
    subject: String(d.title || 'AS Store'),
    html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="margin:0 0 12px">${esc(d.title)}</h2>
      <p style="line-height:1.6;color:#333">${esc(d.body)}</p>
      ${url ? `<p><a href="${esc(url)}" style="color:#A41E22">Open</a></p>` : ''}
    </div>`,
  })
  return true
}

// --- 4) Expiry --------------------------------------------------------------

async function expireCampaigns() {
  // Cancel any never-sent deliveries of expired notifications (their inbox rows
  // stay but are filtered out of customer queries by expires_at).
  await query(
    `UPDATE notification_deliveries d SET status = 'skipped', last_error = 'expired'
     FROM notifications n
     WHERE d.notification_id = n.id AND d.status IN ('queued','failed')
       AND n.expires_at IS NOT NULL AND n.expires_at <= now()`,
  )
}
