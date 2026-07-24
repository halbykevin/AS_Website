// Unit tests for the notification domain's pure logic (no DB, no network).
// Run with: npm test   (uses Node's built-in test runner)

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  renderString,
  renderTemplate,
  localized,
  safeDeepLink,
  clampCategory,
  clampChannels,
  clampPriority,
  TRANSACTIONAL,
} from '../src/notifications/templates.js'
import { audienceQuery, audienceLabel } from '../src/notifications/audience.js'
import {
  categoryAllowed,
  allowedChannels,
  quietDelayMs,
  prefsJson,
} from '../src/notifications/service.js'
import { backoffSeconds } from '../src/notifications/worker.js'
import { isExpoToken, chunkMessages, buildPushMessage, EXPO_CHUNK_SIZE } from '../src/notifications/expoPush.js'

// --- Template rendering -----------------------------------------------------

test('renderString fills known placeholders and blanks unknown ones', () => {
  assert.equal(renderString('Order #{{orderId}} for {{name}}', { orderId: 12, name: 'Sara' }), 'Order #12 for Sara')
  assert.equal(renderString('Hi {{missing}}!', {}), 'Hi !')
  assert.equal(renderString('{{ spaced }}', { spaced: 'ok' }), 'ok')
  assert.equal(renderString('', { a: 1 }), '')
})

test('localized prefers Arabic when present, falls back to English', () => {
  const row = { title_en: 'Shipped', title_ar: 'تم الشحن' }
  assert.equal(localized(row, 'title', 'ar'), 'تم الشحن')
  assert.equal(localized(row, 'title', 'en'), 'Shipped')
  assert.equal(localized({ title_en: 'Shipped', title_ar: '' }, 'title', 'ar'), 'Shipped')
})

test('renderTemplate produces title/body/deepLink', () => {
  const row = {
    title_en: 'Order #{{orderId}}',
    body_en: 'Hi {{name}}',
    deep_link: '/orders/{{orderId}}',
  }
  const r = renderTemplate(row, { orderId: 7, name: 'Ali' })
  assert.deepEqual(r, { title: 'Order #7', body: 'Hi Ali', deepLink: '/orders/7' })
})

// --- Deep-link allowlist ----------------------------------------------------

test('safeDeepLink accepts in-app paths and allowlisted https hosts', () => {
  assert.equal(safeDeepLink('/orders/5'), '/orders/5')
  assert.equal(safeDeepLink('https://store.as.com.lb/sale', ['as.com.lb']), 'https://store.as.com.lb/sale')
  assert.equal(safeDeepLink('https://evil.example.com', ['as.com.lb']), '')
  assert.equal(safeDeepLink('javascript:alert(1)'), '')
  assert.equal(safeDeepLink('//evil.com'), '')
  assert.equal(safeDeepLink('http://as.com.lb', ['as.com.lb']), '') // non-https rejected
  assert.equal(safeDeepLink(''), '')
})

// --- Clamps -----------------------------------------------------------------

test('clamps normalize category/channels/priority', () => {
  assert.equal(clampCategory('promo'), 'promo')
  assert.equal(clampCategory('bogus'), 'news')
  assert.equal(clampPriority('high'), 'high')
  assert.equal(clampPriority('whatever'), 'normal')
  assert.deepEqual(clampChannels(['push', 'push', 'bad', 'email']), ['push', 'email'])
  assert.deepEqual(clampChannels([]), ['inapp']) // never empty
})

// --- Preference enforcement -------------------------------------------------

test('transactional categories ignore opt-out; promo respects it', () => {
  const prefs = prefsJson({ categories: { promo: false, news: false } }, 1)
  assert.equal(categoryAllowed('order', prefs), true)
  assert.equal(categoryAllowed('account', prefs), true)
  assert.equal(categoryAllowed('promo', prefs), false)
  assert.equal(categoryAllowed('news', prefs), false)
  assert.equal(categoryAllowed('survey', prefs), true) // not opted out
  assert.ok(TRANSACTIONAL.has('order') && TRANSACTIONAL.has('account'))
})

test('allowedChannels honors push/email master switches for promo only', () => {
  const off = prefsJson({ push_enabled: false, email_enabled: false }, 1)
  // Promo: both push+email suppressed, inapp survives.
  assert.deepEqual(allowedChannels('promo', ['inapp', 'push', 'email'], off), ['inapp'])
  // Order (transactional): channels delivered regardless of switches.
  assert.deepEqual(allowedChannels('order', ['inapp', 'push', 'email'], off), ['inapp', 'push', 'email'])
})

// --- Quiet hours (scheduling) ----------------------------------------------

test('quietDelayMs delays promo pushes inside the window and not outside', () => {
  const quiet = { enabled: true, start: '22:00', end: '08:00', tz: 'UTC' }
  // 23:00 UTC -> 9h left until 08:00
  const at23 = new Date('2026-07-24T23:00:00Z')
  assert.equal(Math.round(quietDelayMs(quiet, at23) / 3_600_000), 9)
  // 12:00 UTC -> outside window, no delay
  const noon = new Date('2026-07-24T12:00:00Z')
  assert.equal(quietDelayMs(quiet, noon), 0)
  // disabled -> no delay
  assert.equal(quietDelayMs({ enabled: false }, at23), 0)
})

// --- Retry backoff ----------------------------------------------------------

test('backoffSeconds grows exponentially and caps at 1h', () => {
  assert.equal(backoffSeconds(1), 60)
  assert.equal(backoffSeconds(2), 240)
  assert.equal(backoffSeconds(3), 960)
  assert.ok(backoffSeconds(10) <= 3600)
})

// --- Audience builder -------------------------------------------------------

test('audienceQuery: all customers', () => {
  const { sql, params } = audienceQuery({ type: 'all' })
  assert.match(sql, /SELECT id FROM customers/)
  assert.equal(params.length, 0)
})

test('audienceQuery: explicit customer ids are parameterized', () => {
  const { sql, params } = audienceQuery({ type: 'customers', ids: [1, 2, 'x', 3] })
  assert.match(sql, /id = ANY\(\$1\)/)
  assert.deepEqual(params[0], [1, 2, 3]) // non-numeric dropped
})

test('audienceQuery: empty id list matches nobody', () => {
  const { sql, params } = audienceQuery({ type: 'customers', ids: [] })
  assert.match(sql, /WHERE false/)
  assert.equal(params.length, 0)
})

test('audienceQuery: filter by order history + category + city', () => {
  const { sql, params } = audienceQuery({
    type: 'filter',
    orderedSince: 30,
    categoryIds: [4, 5],
    city: 'Beirut',
  })
  assert.match(sql, /EXISTS \(SELECT 1 FROM orders/)
  assert.match(sql, /JOIN order_items/)
  assert.match(sql, /make_interval/)
  assert.ok(params.some((p) => Array.isArray(p) && p.includes(4)))
  assert.ok(params.some((p) => typeof p === 'string' && p.includes('Beirut')))
})

test('audienceQuery: never-ordered filter', () => {
  const { sql } = audienceQuery({ type: 'filter', hasOrders: false })
  assert.match(sql, /NOT EXISTS/)
})

test('audienceLabel summarizes each shape', () => {
  assert.equal(audienceLabel({ type: 'all' }), 'all customers')
  assert.equal(audienceLabel({ type: 'customers', ids: [1, 2] }), '2 selected customer(s)')
  assert.match(audienceLabel({ type: 'filter', hasOrders: true }), /has ordered/)
})

// --- Expo push adapter ------------------------------------------------------

test('isExpoToken validates the token shape', () => {
  assert.ok(isExpoToken('ExponentPushToken[abc123]'))
  assert.ok(isExpoToken('ExpoPushToken[xyz]'))
  assert.equal(isExpoToken('not-a-token'), false)
  assert.equal(isExpoToken(''), false)
  assert.equal(isExpoToken(null), false)
})

test('chunkMessages splits into <=100 batches', () => {
  const msgs = Array.from({ length: 250 }, (_, i) => i)
  const chunks = chunkMessages(msgs)
  assert.equal(chunks.length, 3)
  assert.equal(chunks[0].length, EXPO_CHUNK_SIZE)
  assert.equal(chunks[2].length, 50)
})

test('buildPushMessage carries deep link in data and maps priority/channel', () => {
  const m = buildPushMessage({
    token: 'ExponentPushToken[x]',
    title: 'Hi',
    body: 'There',
    deepLink: '/orders/9',
    data: { orderId: 9 },
    priority: 'high',
    channelId: 'orders',
  })
  assert.equal(m.to, 'ExponentPushToken[x]')
  assert.equal(m.priority, 'high')
  assert.equal(m.channelId, 'orders')
  assert.equal(m.data.deepLink, '/orders/9')
  assert.equal(m.data.orderId, 9)
})
