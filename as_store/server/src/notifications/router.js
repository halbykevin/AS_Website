// HTTP surface of the notification domain. Customer endpoints only ever touch
// the caller's own rows; everything under /api/admin requires the admin JWT.

import express from 'express'
import { query } from '../db.js'
import { requireAuth } from '../auth.js'
import { requireCustomer, optionalCustomer } from '../customerAuth.js'
import {
  CATEGORIES,
  TRANSACTIONAL,
  clampCategory,
  clampChannels,
  clampPriority,
  renderString,
  safeDeepLink,
} from './templates.js'
import { audienceQuery, audienceLabel } from './audience.js'
import {
  createNotification,
  loadPrefs,
  prefsJson,
  audit,
  allowedLinkHosts,
} from './service.js'
import { isExpoToken } from './expoPush.js'

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

export const notificationsRouter = express.Router()
const r = notificationsRouter

// ---------------------------------------------------------------------------
// JSON mappers
// ---------------------------------------------------------------------------

const notificationJson = (row) => ({
  id: row.id,
  category: row.category,
  title: row.title,
  body: row.body,
  imageUrl: row.image_url || '',
  deepLink: row.deep_link || '',
  data: row.data && typeof row.data === 'object' ? row.data : {},
  priority: row.priority,
  read: Boolean(row.read_at),
  readAt: row.read_at,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
})

const campaignJson = (row, stats) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  title: row.title,
  body: row.body,
  titleAr: row.title_ar || '',
  bodyAr: row.body_ar || '',
  imageUrl: row.image_url || '',
  deepLink: row.deep_link || '',
  channels: Array.isArray(row.channels) ? row.channels : [],
  audience: row.audience && typeof row.audience === 'object' ? row.audience : { type: 'all' },
  audienceLabel: audienceLabel(row.audience),
  priority: row.priority,
  status: row.status,
  scheduledAt: row.scheduled_at,
  sentAt: row.sent_at,
  expiresAt: row.expires_at,
  surveyId: row.survey_id,
  createdBy: row.created_by || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(stats ? { stats } : {}),
})

const templateJson = (row) => ({
  id: row.id,
  key: row.key,
  name: row.name,
  category: row.category,
  titleEn: row.title_en,
  bodyEn: row.body_en,
  titleAr: row.title_ar,
  bodyAr: row.body_ar,
  deepLink: row.deep_link,
  channels: Array.isArray(row.channels) ? row.channels : [],
  active: row.active,
  version: row.version,
  updatedAt: row.updated_at,
})

const surveyJson = (row) => ({
  id: row.id,
  title: row.title,
  intro: row.intro || '',
  questions: Array.isArray(row.questions) ? row.questions : [],
  active: row.active,
  createdAt: row.created_at,
  responseCount: row.response_count != null ? Number(row.response_count) : undefined,
})

// ---------------------------------------------------------------------------
// Customer: inbox
// ---------------------------------------------------------------------------

const LIVE = `(expires_at IS NULL OR expires_at > now())`

r.get(
  '/api/notifications',
  requireCustomer,
  ah(async (req, res) => {
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const before = Number(req.query.before) || null
    const params = [req.customerId, limit]
    let cursor = ''
    if (before) {
      params.push(before)
      cursor = `AND id < $3`
    }
    const { rows } = await query(
      `SELECT * FROM notifications
       WHERE customer_id = $1 AND ${LIVE} ${cursor}
       ORDER BY id DESC LIMIT $2`,
      params,
    )
    const { rows: cnt } = await query(
      `SELECT count(*)::int AS n FROM notifications
       WHERE customer_id = $1 AND read_at IS NULL AND ${LIVE}`,
      [req.customerId],
    )
    res.json({
      items: rows.map(notificationJson),
      unreadCount: cnt[0].n,
      nextBefore: rows.length === limit ? rows[rows.length - 1].id : null,
    })
  }),
)

r.get(
  '/api/notifications/unread-count',
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(
      `SELECT count(*)::int AS n FROM notifications
       WHERE customer_id = $1 AND read_at IS NULL AND ${LIVE}`,
      [req.customerId],
    )
    res.json({ unreadCount: rows[0].n })
  }),
)

r.post(
  '/api/notifications/read-all',
  requireCustomer,
  ah(async (req, res) => {
    await query(
      `UPDATE notifications SET read_at = now() WHERE customer_id = $1 AND read_at IS NULL`,
      [req.customerId],
    )
    res.json({ ok: true })
  }),
)

r.post(
  '/api/notifications/:id/read',
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now())
       WHERE id = $1 AND customer_id = $2 RETURNING *`,
      [req.params.id, req.customerId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(notificationJson(rows[0]))
  }),
)

// Tap-through tracking (also marks read).
r.post(
  '/api/notifications/:id/click',
  requireCustomer,
  ah(async (req, res) => {
    const { rows } = await query(
      `UPDATE notifications SET clicked_at = COALESCE(clicked_at, now()),
         read_at = COALESCE(read_at, now())
       WHERE id = $1 AND customer_id = $2 RETURNING *`,
      [req.params.id, req.customerId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(notificationJson(rows[0]))
  }),
)

// ---------------------------------------------------------------------------
// Customer: preferences
// ---------------------------------------------------------------------------

r.get(
  '/api/notifications/prefs',
  requireCustomer,
  ah(async (req, res) => {
    res.json(await loadPrefs(req.customerId))
  }),
)

r.put(
  '/api/notifications/prefs',
  requireCustomer,
  ah(async (req, res) => {
    const b = req.body || {}
    const categories = {}
    for (const c of CATEGORIES) {
      if (TRANSACTIONAL.has(c)) continue // can't opt out of transactional
      if (typeof b.categories?.[c] === 'boolean') categories[c] = b.categories[c]
    }
    const q = b.quiet || {}
    const hhmm = (s) => (/^\d{2}:\d{2}$/.test(String(s || '')) ? s : null)
    const quiet = {
      enabled: Boolean(q.enabled),
      start: hhmm(q.start) || '22:00',
      end: hhmm(q.end) || '08:00',
      tz: String(q.tz || 'Asia/Beirut').slice(0, 60),
    }
    const { rows } = await query(
      `INSERT INTO notification_prefs (customer_id, push_enabled, email_enabled, categories, quiet)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
       ON CONFLICT (customer_id) DO UPDATE SET
         push_enabled = EXCLUDED.push_enabled,
         email_enabled = EXCLUDED.email_enabled,
         categories = EXCLUDED.categories,
         quiet = EXCLUDED.quiet
       RETURNING *`,
      [
        req.customerId,
        b.pushEnabled !== false,
        b.emailEnabled !== false,
        JSON.stringify(categories),
        JSON.stringify(quiet),
      ],
    )
    res.json(prefsJson(rows[0], req.customerId))
  }),
)

// ---------------------------------------------------------------------------
// Devices (push tokens). Guests may register; sign-in attaches, sign-out detaches.
// ---------------------------------------------------------------------------

r.post(
  '/api/devices',
  optionalCustomer,
  ah(async (req, res) => {
    const token = String(req.body?.token || '').trim()
    if (!isExpoToken(token)) return res.status(400).json({ error: 'Invalid push token' })
    const platform = ['ios', 'android'].includes(req.body?.platform) ? req.body.platform : ''
    const appVersion = String(req.body?.appVersion || '').slice(0, 40)
    const locale = String(req.body?.locale || 'en').slice(0, 10)
    const { rows } = await query(
      `INSERT INTO device_tokens (token, customer_id, platform, app_version, locale)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (token) DO UPDATE SET
         customer_id = COALESCE($2, device_tokens.customer_id),
         platform = EXCLUDED.platform,
         app_version = EXCLUDED.app_version,
         locale = EXCLUDED.locale,
         last_seen_at = now(),
         revoked_at = NULL
       RETURNING id`,
      [token, req.customerId ?? null, platform, appVersion, locale],
    )
    res.json({ ok: true, id: rows[0].id })
  }),
)

// Sign-out (`detach`: device stays for guest broadcasts) or full opt-out
// (`revoke`: never push to this token again).
r.delete(
  '/api/devices',
  optionalCustomer,
  ah(async (req, res) => {
    const token = String(req.body?.token || req.query.token || '').trim()
    if (!token) return res.status(400).json({ error: 'token is required' })
    const mode = req.body?.mode === 'revoke' ? 'revoke' : 'detach'
    if (mode === 'revoke') {
      await query(`UPDATE device_tokens SET revoked_at = now(), customer_id = NULL WHERE token = $1`, [token])
    } else {
      await query(`UPDATE device_tokens SET customer_id = NULL WHERE token = $1`, [token])
    }
    res.json({ ok: true })
  }),
)

// ---------------------------------------------------------------------------
// Surveys (customer)
// ---------------------------------------------------------------------------

r.get(
  '/api/surveys/:id',
  ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM surveys WHERE id = $1 AND active = true`, [
      req.params.id,
    ])
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(surveyJson(rows[0]))
  }),
)

r.post(
  '/api/surveys/:id/responses',
  requireCustomer,
  ah(async (req, res) => {
    const { rows: srows } = await query(`SELECT * FROM surveys WHERE id = $1 AND active = true`, [
      req.params.id,
    ])
    const survey = srows[0]
    if (!survey) return res.status(404).json({ error: 'Not found' })

    const orderId = Number(req.body?.orderId) || null
    if (orderId) {
      const { rows: orows } = await query(
        `SELECT id FROM orders WHERE id = $1 AND customer_id = $2`,
        [orderId, req.customerId],
      )
      if (!orows[0]) return res.status(400).json({ error: 'That order is not yours' })
    }

    // Only accept answers to questions that exist; clamp free text.
    const questions = Array.isArray(survey.questions) ? survey.questions : []
    const answers = {}
    for (const qn of questions) {
      const v = req.body?.answers?.[qn.id]
      if (v === undefined || v === null) continue
      if (qn.type === 'rating') {
        const n = Number(v)
        if (Number.isFinite(n) && n >= 1 && n <= 5) answers[qn.id] = n
      } else if (qn.type === 'choice') {
        if ((qn.options || []).includes(v)) answers[qn.id] = v
      } else {
        answers[qn.id] = String(v).slice(0, 2000)
      }
    }
    if (!Object.keys(answers).length)
      return res.status(400).json({ error: 'Please answer at least one question' })

    const { rows } = await query(
      `INSERT INTO survey_responses (survey_id, customer_id, order_id, answers)
       VALUES ($1,$2,$3,$4::jsonb)
       ON CONFLICT (survey_id, customer_id, COALESCE(order_id, 0)) DO NOTHING
       RETURNING id`,
      [survey.id, req.customerId, orderId, JSON.stringify(answers)],
    )
    if (!rows[0]) return res.status(409).json({ error: 'You already answered this survey' })
    res.status(201).json({ ok: true, id: rows[0].id })
  }),
)

// ---------------------------------------------------------------------------
// Admin: campaigns
// ---------------------------------------------------------------------------

const CAMPAIGN_EDITABLE = ['draft', 'scheduled', 'paused']

function campaignBody(b, current = {}) {
  const name = String(b.name ?? current.name ?? '').trim()
  const scheduledAt = b.scheduledAt ? new Date(b.scheduledAt) : null
  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw httpError(400, 'Invalid schedule time')
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw httpError(400, 'Invalid expiry time')
  return {
    name,
    category: clampCategory(b.category ?? current.category ?? 'promo'),
    title: String(b.title ?? current.title ?? '').slice(0, 170),
    body: String(b.body ?? current.body ?? '').slice(0, 1000),
    title_ar: String(b.titleAr ?? current.title_ar ?? '').slice(0, 170),
    body_ar: String(b.bodyAr ?? current.body_ar ?? '').slice(0, 1000),
    image_url: String(b.imageUrl ?? current.image_url ?? '').slice(0, 500),
    deep_link: safeDeepLink(b.deepLink ?? current.deep_link ?? '', allowedLinkHosts()),
    channels: JSON.stringify(clampChannels(b.channels ?? current.channels ?? ['inapp', 'push'])),
    audience: JSON.stringify(
      b.audience && typeof b.audience === 'object' ? b.audience : current.audience || { type: 'all' },
    ),
    priority: clampPriority(b.priority ?? current.priority),
    scheduled_at: scheduledAt,
    expires_at: expiresAt,
    survey_id: b.surveyId !== undefined ? Number(b.surveyId) || null : (current.survey_id ?? null),
  }
}

const httpError = (status, message) => Object.assign(new Error(message), { status })

async function campaignStats(id) {
  const { rows } = await query(
    `SELECT
       (SELECT count(*)::int FROM notifications WHERE campaign_id = $1 AND customer_id IS NOT NULL) AS recipients,
       (SELECT count(*)::int FROM notifications WHERE campaign_id = $1 AND read_at IS NOT NULL) AS reads,
       (SELECT count(*)::int FROM notifications WHERE campaign_id = $1 AND clicked_at IS NOT NULL) AS clicks,
       (SELECT count(*)::int FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
         WHERE n.campaign_id = $1 AND d.channel = 'push' AND d.status = 'sent') AS push_sent,
       (SELECT count(*)::int FROM notification_deliveries d JOIN notifications n ON n.id = d.notification_id
         WHERE n.campaign_id = $1 AND d.status IN ('failed','dead')) AS failures,
       (SELECT count(*)::int FROM survey_responses sr JOIN notification_campaigns c ON c.survey_id = sr.survey_id
         WHERE c.id = $1) AS survey_responses`,
    [id],
  )
  const s = rows[0]
  return {
    recipients: s.recipients,
    reads: s.reads,
    clicks: s.clicks,
    pushSent: s.push_sent,
    failures: s.failures,
    surveyResponses: s.survey_responses,
  }
}

r.get(
  '/api/admin/notifications/campaigns',
  requireAuth,
  ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM notification_campaigns ORDER BY id DESC LIMIT 200`)
    res.json(rows.map((row) => campaignJson(row)))
  }),
)

r.post(
  '/api/admin/notifications/campaigns',
  requireAuth,
  ah(async (req, res) => {
    const c = campaignBody(req.body || {})
    if (!c.name) return res.status(400).json({ error: 'name is required' })
    if (!c.title) return res.status(400).json({ error: 'title is required' })
    const { rows } = await query(
      `INSERT INTO notification_campaigns
         (name, category, title, body, title_ar, body_ar, image_url, deep_link, channels,
          audience, priority, scheduled_at, expires_at, survey_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        c.name, c.category, c.title, c.body, c.title_ar, c.body_ar, c.image_url, c.deep_link,
        c.channels, c.audience, c.priority, c.scheduled_at, c.expires_at, c.survey_id,
        req.admin.email,
      ],
    )
    await audit(req.admin.email, 'campaign_created', 'campaign', rows[0].id, { name: c.name })
    res.status(201).json(campaignJson(rows[0]))
  }),
)

r.get(
  '/api/admin/notifications/campaigns/:id',
  requireAuth,
  ah(async (req, res) => {
    const { rows } = await query(`SELECT * FROM notification_campaigns WHERE id = $1`, [
      req.params.id,
    ])
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    res.json(campaignJson(rows[0], await campaignStats(rows[0].id)))
  }),
)

r.put(
  '/api/admin/notifications/campaigns/:id',
  requireAuth,
  ah(async (req, res) => {
    const { rows: cur } = await query(`SELECT * FROM notification_campaigns WHERE id = $1`, [
      req.params.id,
    ])
    if (!cur[0]) return res.status(404).json({ error: 'Not found' })
    if (!CAMPAIGN_EDITABLE.includes(cur[0].status))
      return res.status(400).json({ error: `A ${cur[0].status} campaign can't be edited` })
    const c = campaignBody(req.body || {}, cur[0])
    const { rows } = await query(
      `UPDATE notification_campaigns SET
         name=$2, category=$3, title=$4, body=$5, title_ar=$6, body_ar=$7, image_url=$8,
         deep_link=$9, channels=$10::jsonb, audience=$11::jsonb, priority=$12,
         scheduled_at=$13, expires_at=$14, survey_id=$15
       WHERE id = $1 RETURNING *`,
      [
        req.params.id, c.name, c.category, c.title, c.body, c.title_ar, c.body_ar,
        c.image_url, c.deep_link, c.channels, c.audience, c.priority, c.scheduled_at,
        c.expires_at, c.survey_id,
      ],
    )
    await audit(req.admin.email, 'campaign_updated', 'campaign', rows[0].id, { name: c.name })
    res.json(campaignJson(rows[0]))
  }),
)

r.delete(
  '/api/admin/notifications/campaigns/:id',
  requireAuth,
  ah(async (req, res) => {
    const { rows } = await query(
      `DELETE FROM notification_campaigns WHERE id = $1 AND status IN ('draft','cancelled','failed') RETURNING id`,
      [req.params.id],
    )
    if (!rows[0])
      return res.status(400).json({ error: 'Only draft/cancelled campaigns can be deleted' })
    await audit(req.admin.email, 'campaign_deleted', 'campaign', Number(req.params.id))
    res.status(204).end()
  }),
)

// State transitions. "Send now" and "schedule" both move to `scheduled`; the
// worker picks it up (within its interval) so the HTTP request never waits on
// providers.
async function setCampaignStatus(req, res, from, to, patch = '') {
  const { rows } = await query(
    `UPDATE notification_campaigns SET status = $3 ${patch}
     WHERE id = $1 AND status = ANY($2) RETURNING *`,
    [req.params.id, from, to],
  )
  if (!rows[0]) {
    const { rows: cur } = await query(`SELECT status FROM notification_campaigns WHERE id = $1`, [
      req.params.id,
    ])
    return res.status(400).json({
      error: cur[0] ? `Can't ${to} a ${cur[0].status} campaign` : 'Not found',
    })
  }
  await audit(req.admin.email, `campaign_${to}`, 'campaign', rows[0].id)
  res.json(campaignJson(rows[0]))
}

r.post(
  '/api/admin/notifications/campaigns/:id/send',
  requireAuth,
  ah(async (req, res) =>
    setCampaignStatus(req, res, ['draft', 'paused', 'scheduled'], 'scheduled', ', scheduled_at = now()'),
  ),
)

r.post(
  '/api/admin/notifications/campaigns/:id/schedule',
  requireAuth,
  ah(async (req, res) => {
    const at = new Date(req.body?.at || '')
    if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 60_000)
      return res.status(400).json({ error: 'Pick a valid future time' })
    const { rows } = await query(
      `UPDATE notification_campaigns SET status = 'scheduled', scheduled_at = $2
       WHERE id = $1 AND status = ANY($3) RETURNING *`,
      [req.params.id, at, ['draft', 'paused', 'scheduled']],
    )
    if (!rows[0]) return res.status(400).json({ error: 'Campaign not schedulable' })
    await audit(req.admin.email, 'campaign_scheduled', 'campaign', rows[0].id, { at })
    res.json(campaignJson(rows[0]))
  }),
)

r.post(
  '/api/admin/notifications/campaigns/:id/pause',
  requireAuth,
  ah(async (req, res) => setCampaignStatus(req, res, ['scheduled'], 'paused')),
)

r.post(
  '/api/admin/notifications/campaigns/:id/cancel',
  requireAuth,
  ah(async (req, res) => setCampaignStatus(req, res, ['draft', 'scheduled', 'paused'], 'cancelled')),
)

r.post(
  '/api/admin/notifications/campaigns/:id/duplicate',
  requireAuth,
  ah(async (req, res) => {
    const { rows: cur } = await query(`SELECT * FROM notification_campaigns WHERE id = $1`, [
      req.params.id,
    ])
    if (!cur[0]) return res.status(404).json({ error: 'Not found' })
    const c = cur[0]
    const { rows } = await query(
      `INSERT INTO notification_campaigns
         (name, category, title, body, title_ar, body_ar, image_url, deep_link, channels,
          audience, priority, expires_at, survey_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        `${c.name} (copy)`, c.category, c.title, c.body, c.title_ar, c.body_ar, c.image_url,
        c.deep_link, JSON.stringify(c.channels || []), JSON.stringify(c.audience || {}),
        c.priority, c.expires_at, c.survey_id, req.admin.email,
      ],
    )
    await audit(req.admin.email, 'campaign_duplicated', 'campaign', rows[0].id, { from: c.id })
    res.status(201).json(campaignJson(rows[0]))
  }),
)

// Test send: deliver this campaign's content to one customer (by id or mobile)
// without touching campaign state. Uses a time-based dedupe key so repeat tests work.
r.post(
  '/api/admin/notifications/campaigns/:id/test',
  requireAuth,
  ah(async (req, res) => {
    const { rows: cur } = await query(`SELECT * FROM notification_campaigns WHERE id = $1`, [
      req.params.id,
    ])
    const c = cur[0]
    if (!c) return res.status(404).json({ error: 'Not found' })
    let customerId = Number(req.body?.customerId) || null
    if (!customerId && req.body?.mobile) {
      const digits = String(req.body.mobile).replace(/\D/g, '')
      const { rows } = await query(`SELECT id FROM customers WHERE mobile = $1`, [digits])
      customerId = rows[0]?.id || null
    }
    if (!customerId)
      return res.status(400).json({ error: 'Provide a customerId or a known mobile number' })
    const id = await createNotification({
      customerId,
      campaignId: c.id,
      category: c.category,
      title: `[TEST] ${c.title}`,
      body: c.body,
      imageUrl: c.image_url || '',
      deepLink: safeDeepLink(c.deep_link || '', allowedLinkHosts()),
      data: { campaignId: c.id, test: true },
      priority: c.priority,
      channels: Array.isArray(c.channels) ? c.channels : ['inapp', 'push'],
      dedupeKey: `campaign:${c.id}:test:${Date.now()}`,
    })
    await audit(req.admin.email, 'campaign_test_sent', 'campaign', c.id, { customerId })
    res.json({ ok: true, notificationId: id })
  }),
)

// Estimate audience size while composing.
r.post(
  '/api/admin/notifications/audience/preview',
  requireAuth,
  ah(async (req, res) => {
    const { sql, params } = audienceQuery(req.body?.audience || { type: 'all' })
    const { rows } = await query(`SELECT count(*)::int AS n FROM (${sql}) t`, params)
    const { rows: devices } = await query(
      `SELECT count(*)::int AS n FROM device_tokens WHERE revoked_at IS NULL`,
    )
    res.json({
      customers: rows[0].n,
      label: audienceLabel(req.body?.audience),
      liveDevices: devices[0].n,
    })
  }),
)

// ---------------------------------------------------------------------------
// Admin: templates
// ---------------------------------------------------------------------------

r.get(
  '/api/admin/notifications/templates',
  requireAuth,
  ah(async (_req, res) => {
    const { rows } = await query(`SELECT * FROM notification_templates ORDER BY category, key`)
    res.json(rows.map(templateJson))
  }),
)

r.put(
  '/api/admin/notifications/templates/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const { rows } = await query(
      `UPDATE notification_templates SET
         name = COALESCE($2, name),
         title_en = COALESCE($3, title_en), body_en = COALESCE($4, body_en),
         title_ar = COALESCE($5, title_ar), body_ar = COALESCE($6, body_ar),
         deep_link = COALESCE($7, deep_link),
         channels = COALESCE($8::jsonb, channels),
         active = COALESCE($9, active),
         version = version + 1
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        b.name ?? null,
        b.titleEn ?? null,
        b.bodyEn ?? null,
        b.titleAr ?? null,
        b.bodyAr ?? null,
        b.deepLink !== undefined ? String(b.deepLink) : null,
        b.channels !== undefined ? JSON.stringify(clampChannels(b.channels)) : null,
        typeof b.active === 'boolean' ? b.active : null,
      ],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    await audit(req.admin.email, 'template_updated', 'template', rows[0].id, { key: rows[0].key })
    res.json(templateJson(rows[0]))
  }),
)

// Render arbitrary copy with sample vars for the composer preview.
r.post(
  '/api/admin/notifications/preview',
  requireAuth,
  ah(async (req, res) => {
    const vars = req.body?.vars && typeof req.body.vars === 'object' ? req.body.vars : {}
    res.json({
      title: renderString(req.body?.title || '', vars),
      body: renderString(req.body?.body || '', vars),
      deepLink: safeDeepLink(renderString(req.body?.deepLink || '', vars), allowedLinkHosts()),
    })
  }),
)

// ---------------------------------------------------------------------------
// Admin: surveys
// ---------------------------------------------------------------------------

const cleanQuestions = (list) =>
  (Array.isArray(list) ? list : [])
    .slice(0, 20)
    .map((q, i) => ({
      id: String(q?.id || `q${i + 1}`).slice(0, 40),
      type: ['rating', 'text', 'choice'].includes(q?.type) ? q.type : 'text',
      label: String(q?.label || '').slice(0, 300),
      ...(q?.type === 'choice'
        ? { options: (Array.isArray(q.options) ? q.options : []).map((o) => String(o).slice(0, 120)).slice(0, 10) }
        : {}),
    }))
    .filter((q) => q.label)

r.get(
  '/api/admin/surveys',
  requireAuth,
  ah(async (_req, res) => {
    const { rows } = await query(
      `SELECT s.*, (SELECT count(*) FROM survey_responses sr WHERE sr.survey_id = s.id) AS response_count
       FROM surveys s ORDER BY s.id DESC`,
    )
    res.json(rows.map(surveyJson))
  }),
)

r.post(
  '/api/admin/surveys',
  requireAuth,
  ah(async (req, res) => {
    const title = String(req.body?.title || '').trim()
    if (!title) return res.status(400).json({ error: 'title is required' })
    const questions = cleanQuestions(req.body?.questions)
    if (!questions.length) return res.status(400).json({ error: 'Add at least one question' })
    const { rows } = await query(
      `INSERT INTO surveys (title, intro, questions, active)
       VALUES ($1,$2,$3::jsonb,$4) RETURNING *`,
      [title, String(req.body?.intro || '').slice(0, 1000), JSON.stringify(questions), req.body?.active !== false],
    )
    await audit(req.admin.email, 'survey_created', 'survey', rows[0].id, { title })
    res.status(201).json(surveyJson(rows[0]))
  }),
)

r.put(
  '/api/admin/surveys/:id',
  requireAuth,
  ah(async (req, res) => {
    const b = req.body || {}
    const { rows } = await query(
      `UPDATE surveys SET
         title = COALESCE($2, title), intro = COALESCE($3, intro),
         questions = COALESCE($4::jsonb, questions), active = COALESCE($5, active)
       WHERE id = $1 RETURNING *`,
      [
        req.params.id,
        b.title !== undefined ? String(b.title).trim() : null,
        b.intro !== undefined ? String(b.intro).slice(0, 1000) : null,
        b.questions !== undefined ? JSON.stringify(cleanQuestions(b.questions)) : null,
        typeof b.active === 'boolean' ? b.active : null,
      ],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Not found' })
    await audit(req.admin.email, 'survey_updated', 'survey', rows[0].id)
    res.json(surveyJson(rows[0]))
  }),
)

r.delete(
  '/api/admin/surveys/:id',
  requireAuth,
  ah(async (req, res) => {
    await query(`DELETE FROM surveys WHERE id = $1`, [req.params.id])
    await audit(req.admin.email, 'survey_deleted', 'survey', Number(req.params.id))
    res.status(204).end()
  }),
)

r.get(
  '/api/admin/surveys/:id/responses',
  requireAuth,
  ah(async (req, res) => {
    const { rows } = await query(
      `SELECT sr.*, c.name AS customer_name, c.mobile AS customer_mobile
       FROM survey_responses sr LEFT JOIN customers c ON c.id = sr.customer_id
       WHERE sr.survey_id = $1 ORDER BY sr.id DESC LIMIT 500`,
      [req.params.id],
    )
    res.json(
      rows.map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customer_name || '',
        customerMobile: row.customer_mobile || '',
        orderId: row.order_id,
        answers: row.answers || {},
        createdAt: row.created_at,
      })),
    )
  }),
)

// ---------------------------------------------------------------------------
// Admin: overview, recent activity, audit log
// ---------------------------------------------------------------------------

r.get(
  '/api/admin/notifications/overview',
  requireAuth,
  ah(async (_req, res) => {
    const { rows } = await query(
      `SELECT
        (SELECT count(*)::int FROM notifications) AS total,
        (SELECT count(*)::int FROM notifications WHERE created_at > now() - interval '7 days') AS last7d,
        (SELECT count(*)::int FROM notifications WHERE read_at IS NOT NULL) AS reads,
        (SELECT count(*)::int FROM device_tokens WHERE revoked_at IS NULL) AS devices,
        (SELECT count(*)::int FROM device_tokens WHERE revoked_at IS NULL AND customer_id IS NOT NULL) AS attached_devices,
        (SELECT count(*)::int FROM notification_deliveries WHERE status = 'dead') AS dead_deliveries,
        (SELECT count(*)::int FROM notification_events WHERE status IN ('pending','failed')) AS pending_events`,
    )
    const s = rows[0]
    res.json({
      total: s.total,
      last7d: s.last7d,
      reads: s.reads,
      devices: s.devices,
      attachedDevices: s.attached_devices,
      deadDeliveries: s.dead_deliveries,
      pendingEvents: s.pending_events,
    })
  }),
)

r.get(
  '/api/admin/notifications/recent',
  requireAuth,
  ah(async (req, res) => {
    const limit = Math.min(100, Number(req.query.limit) || 50)
    const { rows } = await query(
      `SELECT n.*, c.name AS customer_name,
        (SELECT json_agg(json_build_object('channel', d.channel, 'status', d.status, 'error', d.last_error))
         FROM notification_deliveries d WHERE d.notification_id = n.id) AS deliveries
       FROM notifications n LEFT JOIN customers c ON c.id = n.customer_id
       ORDER BY n.id DESC LIMIT $1`,
      [limit],
    )
    res.json(
      rows.map((row) => ({
        ...notificationJson(row),
        customerId: row.customer_id,
        customerName: row.customer_name || (row.customer_id ? '' : '(guest devices)'),
        templateKey: row.template_key || '',
        deliveries: row.deliveries || [],
      })),
    )
  }),
)

r.get(
  '/api/admin/notifications/audit',
  requireAuth,
  ah(async (req, res) => {
    const limit = Math.min(200, Number(req.query.limit) || 100)
    const { rows } = await query(`SELECT * FROM notification_audit ORDER BY id DESC LIMIT $1`, [
      limit,
    ])
    res.json(
      rows.map((row) => ({
        id: row.id,
        actor: row.actor,
        action: row.action,
        entity: row.entity,
        entityId: row.entity_id,
        detail: row.detail || {},
        createdAt: row.created_at,
      })),
    )
  }),
)
