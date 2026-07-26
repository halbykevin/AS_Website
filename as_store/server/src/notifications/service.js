// Centralized notification service: the only place that creates notification
// rows and delivery attempts. Producers call emitEvent() (transactional outbox);
// the worker drains events through the handlers below. Admin campaigns fan out
// through fanoutCampaign().

import { query } from '../db.js'
import {
  TRANSACTIONAL,
  clampCategory,
  clampChannels,
  clampPriority,
  renderTemplate,
  renderString,
  safeDeepLink,
} from './templates.js'
import { audienceQuery } from './audience.js'

const STORE_URL = (process.env.STORE_URL || 'http://localhost:5180').replace(/\/$/, '')

// Hosts an admin-entered deep link may point at (besides in-app "/..." paths).
export function allowedLinkHosts() {
  const hosts = []
  for (const v of [process.env.STORE_PUBLIC_URL, process.env.STORE_URL, process.env.WEBSITE_URL]) {
    try {
      if (v) hosts.push(new URL(v).hostname.toLowerCase())
    } catch {
      /* ignore malformed env */
    }
  }
  return hosts.length ? hosts : ['as.com.lb']
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

// Record a business event. Safe to call from a transaction (pass its client as
// `db`) so the event commits atomically with the change that caused it.
// Duplicate dedupe keys are silently ignored -> idempotent producers.
export async function emitEvent(eventType, payload = {}, dedupeKey = null, db = { query }) {
  await db.query(
    `INSERT INTO notification_events (event_type, payload, dedupe_key)
     VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [eventType, JSON.stringify(payload), dedupeKey],
  )
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function loadPrefs(customerId) {
  const { rows } = await query(`SELECT * FROM notification_prefs WHERE customer_id = $1`, [
    customerId,
  ])
  return prefsJson(rows[0], customerId)
}

export function prefsJson(row, customerId) {
  return {
    customerId,
    pushEnabled: row?.push_enabled ?? true,
    emailEnabled: row?.email_enabled ?? true,
    categories: row?.categories && typeof row.categories === 'object' ? row.categories : {},
    quiet: row?.quiet && typeof row.quiet === 'object' ? row.quiet : {},
  }
}

// Category opt-out only ever applies to non-transactional messages.
export function categoryAllowed(category, prefs) {
  if (TRANSACTIONAL.has(category)) return true
  return prefs.categories?.[category] !== false
}

// Which of the requested channels this customer may receive for this category.
export function allowedChannels(category, requested, prefs) {
  const transactional = TRANSACTIONAL.has(category)
  return requested.filter((ch) => {
    if (ch === 'inapp') return true
    if (ch === 'push') return transactional || prefs.pushEnabled !== false
    if (ch === 'email') return transactional || prefs.emailEnabled !== false
    return false
  })
}

// Quiet hours: milliseconds to delay a *promotional* push, or 0 when outside
// the window / disabled. Pure — `now` injectable for tests.
export function quietDelayMs(quiet, now = new Date()) {
  if (!quiet?.enabled || !quiet.start || !quiet.end) return 0
  const tz = quiet.tz || 'Asia/Beirut'
  let local
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour')?.value)
    const m = Number(parts.find((p) => p.type === 'minute')?.value)
    local = h * 60 + m
  } catch {
    return 0
  }
  const toMin = (s) => {
    const [h, m] = String(s).split(':').map(Number)
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0)
  }
  const start = toMin(quiet.start)
  const end = toMin(quiet.end)
  const inWindow = start <= end ? local >= start && local < end : local >= start || local < end
  if (!inWindow) return 0
  const minsLeft = local < end ? end - local : 24 * 60 - local + end
  return minsLeft * 60_000
}

// ---------------------------------------------------------------------------
// Creating notifications
// ---------------------------------------------------------------------------

async function liveTokensFor(customerId) {
  const { rows } = await query(
    `SELECT id, token, locale FROM device_tokens
     WHERE customer_id = $1 AND revoked_at IS NULL`,
    [customerId],
  )
  return rows
}

// Insert one notification + its delivery rows. Returns the notification id or
// null when deduped/opted out. This is the single write path for all sends.
export async function createNotification({
  customerId,
  campaignId = null,
  templateKey = '',
  templateVersion = null,
  category,
  title,
  body,
  imageUrl = '',
  deepLink = '',
  data = {},
  priority = 'normal',
  channels = ['inapp'],
  dedupeKey = null,
  expiresAt = null,
  delayPushMs = 0,
}) {
  category = clampCategory(category)
  priority = clampPriority(priority)
  channels = clampChannels(channels)

  const prefs = await loadPrefs(customerId)
  if (!categoryAllowed(category, prefs)) return null
  const chans = allowedChannels(category, channels, prefs)
  if (!chans.length) return null

  const { rows } = await query(
    `INSERT INTO notifications
       (customer_id, campaign_id, template_key, template_version, category, title, body,
        image_url, deep_link, data, priority, dedupe_key, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      customerId,
      campaignId,
      templateKey,
      templateVersion,
      category,
      title,
      body,
      imageUrl,
      deepLink,
      JSON.stringify(data || {}),
      priority,
      dedupeKey,
      expiresAt,
    ],
  )
  if (!rows[0]) return null // dedupe hit — already sent
  const notificationId = rows[0].id

  // Promotional pushes respect quiet hours; transactional ones go now.
  const quietMs = TRANSACTIONAL.has(category) ? 0 : quietDelayMs(prefs.quiet)
  const pushDelay = Math.max(Number(delayPushMs) || 0, quietMs)

  for (const ch of chans) {
    if (ch === 'inapp') {
      // The notification row itself is the inbox entry — mark delivered.
      await query(
        `INSERT INTO notification_deliveries (notification_id, channel, status, sent_at, attempts)
         VALUES ($1,'inapp','sent',now(),1)`,
        [notificationId],
      )
    } else if (ch === 'push') {
      const tokens = await liveTokensFor(customerId)
      if (!tokens.length) {
        await query(
          `INSERT INTO notification_deliveries (notification_id, channel, status, last_error)
           VALUES ($1,'push','skipped','no registered device')`,
          [notificationId],
        )
      } else {
        for (const t of tokens) {
          await query(
            `INSERT INTO notification_deliveries
               (notification_id, channel, device_token_id, next_attempt_at)
             VALUES ($1,'push',$2, now() + make_interval(secs => $3))`,
            [notificationId, t.id, Math.round(pushDelay / 1000)],
          )
        }
      }
    } else if (ch === 'email') {
      await query(
        `INSERT INTO notification_deliveries (notification_id, channel) VALUES ($1,'email')`,
        [notificationId],
      )
    }
  }
  return notificationId
}

// Render a stored template for a customer and send it.
export async function sendTemplate(customerId, templateKey, vars = {}, opts = {}) {
  const { rows } = await query(
    `SELECT * FROM notification_templates WHERE key = $1 AND active = true`,
    [templateKey],
  )
  const tpl = rows[0]
  if (!tpl) {
    console.warn(`[notify] template "${templateKey}" missing/inactive — skipping`)
    return null
  }
  const locale = opts.locale || 'en'
  const r = renderTemplate(tpl, vars, locale)
  return createNotification({
    customerId,
    templateKey,
    templateVersion: tpl.version,
    category: tpl.category,
    title: r.title,
    body: r.body,
    deepLink: safeDeepLink(r.deepLink, allowedLinkHosts()),
    data: opts.data ?? vars,
    channels: Array.isArray(tpl.channels) ? tpl.channels : ['inapp', 'push'],
    dedupeKey: opts.dedupeKey ?? null,
    priority: opts.priority || 'normal',
    campaignId: opts.campaignId ?? null,
    imageUrl: opts.imageUrl || '',
    expiresAt: opts.expiresAt ?? null,
    delayPushMs: opts.delayPushMs ?? 0,
  })
}

// ---------------------------------------------------------------------------
// Event handlers (outbox consumers) — MUST be idempotent: every notification
// they create carries a dedupe key derived from the event.
// ---------------------------------------------------------------------------

const money = (n) => `$${Number(n || 0).toLocaleString()}`

// "Khoder Al Jaber" -> "Khoder"; empty -> "there", so templates can always
// greet with {{name}} and never render an awkward blank.
const firstName = (full) => String(full || '').trim().split(/\s+/)[0] || 'there'

export const eventHandlers = {
  async order_created({ orderId, customerId, name, itemCount, total }) {
    if (!customerId) return
    await sendTemplate(
      customerId,
      'order_received',
      { orderId, name: firstName(name), itemCount, total: money(total) },
      // Transactional: high priority so the push wakes a sleeping device.
      { dedupeKey: `order:${orderId}:received`, data: { orderId }, priority: 'high' },
    )
  },

  async order_status_changed({ orderId, customerId, status }) {
    if (!customerId) return
    const tplByStatus = {
      confirmed: 'order_confirmed',
      shipped: 'order_shipped',
      delivered: 'order_delivered',
      cancelled: 'order_cancelled',
    }
    const key = tplByStatus[status]
    if (!key) return
    // Pull the order's name/total so the copy can be personal ("Good news,
    // Khoder…") instead of a bare order number.
    const { rows: ord } = await query(
      `SELECT full_name, subtotal FROM orders WHERE id = $1`,
      [orderId],
    )
    await sendTemplate(
      customerId,
      key,
      { orderId, name: firstName(ord[0]?.full_name), total: money(ord[0]?.subtotal) },
      { dedupeKey: `order:${orderId}:status:${status}`, data: { orderId }, priority: 'high' },
    )
    // A delivered order schedules a feedback survey (delayed a bit so the push
    // doesn't land in the same second as the delivery one).
    if (status === 'delivered') {
      const { rows } = await query(
        `SELECT id FROM surveys WHERE active = true ORDER BY id DESC LIMIT 1`,
      )
      if (rows[0]) {
        await sendTemplate(
          customerId,
          'delivery_feedback',
          { orderId, surveyId: rows[0].id },
          {
            dedupeKey: `order:${orderId}:feedback`,
            data: { orderId, surveyId: rows[0].id },
            delayPushMs: 60 * 60_000, // 1h later
          },
        )
      }
    }
  },

  async payment_paid({ orderId, customerId, total }) {
    if (!customerId) return
    await sendTemplate(
      customerId,
      'payment_paid',
      { orderId, total: money(total) },
      { dedupeKey: `order:${orderId}:paid`, data: { orderId }, priority: 'high' },
    )
  },
}

// ---------------------------------------------------------------------------
// Campaign fanout
// ---------------------------------------------------------------------------

// Turn a campaign row into per-customer notifications (+ guest-device pushes).
// Dedupe key campaign:<id>:customer:<id> makes re-runs safe (resume after crash).
export async function fanoutCampaign(campaign) {
  const channels = clampChannels(campaign.channels)
  const link = safeDeepLink(campaign.deep_link || '', allowedLinkHosts())
  const { sql, params } = audienceQuery(campaign.audience)
  const { rows: recipients } = await query(sql, params)

  let created = 0
  for (const r of recipients) {
    const id = await createNotification({
      customerId: r.id,
      campaignId: campaign.id,
      category: campaign.category,
      title: campaign.title,
      body: campaign.body,
      imageUrl: campaign.image_url || '',
      deepLink: link,
      data: {
        campaignId: campaign.id,
        ...(campaign.survey_id ? { surveyId: campaign.survey_id } : {}),
      },
      priority: campaign.priority,
      channels,
      dedupeKey: `campaign:${campaign.id}:customer:${r.id}`,
      expiresAt: campaign.expires_at,
    })
    if (id) created++
  }

  // Broadcast promos also reach signed-out devices (guest tokens) via push.
  let guestPushes = 0
  if (channels.includes('push') && (campaign.audience?.type ?? 'all') === 'all') {
    const { rows: guests } = await query(
      `SELECT id FROM device_tokens WHERE customer_id IS NULL AND revoked_at IS NULL`,
    )
    if (guests.length) {
      const { rows: nrows } = await query(
        `INSERT INTO notifications
           (customer_id, campaign_id, category, title, body, image_url, deep_link, data, priority, dedupe_key, expires_at)
         VALUES (NULL,$1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
         ON CONFLICT (dedupe_key) DO NOTHING
         RETURNING id`,
        [
          campaign.id,
          clampCategory(campaign.category),
          campaign.title,
          campaign.body,
          campaign.image_url || '',
          link,
          JSON.stringify({ campaignId: campaign.id }),
          clampPriority(campaign.priority),
          `campaign:${campaign.id}:guests`,
          campaign.expires_at,
        ],
      )
      if (nrows[0]) {
        for (const g of guests) {
          await query(
            `INSERT INTO notification_deliveries (notification_id, channel, device_token_id)
             VALUES ($1,'push',$2)`,
            [nrows[0].id, g.id],
          )
          guestPushes++
        }
      }
    }
  }

  return { recipients: recipients.length, created, guestPushes }
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export async function audit(actor, action, entity, entityId, detail = {}) {
  await query(
    `INSERT INTO notification_audit (actor, action, entity, entity_id, detail)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [actor || 'system', action, entity, entityId ?? null, JSON.stringify(detail)],
  ).catch((e) => console.error('[notify] audit write failed:', e?.message || e))
}
