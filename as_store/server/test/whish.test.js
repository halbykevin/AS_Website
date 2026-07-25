import assert from 'node:assert/strict'
import test from 'node:test'

process.env.WHISH_CHANNEL = 'test-channel'
process.env.WHISH_SECRET = 'test-secret'
process.env.WHISH_WEBSITE_URL = 'https://store.example.com'
process.env.WHISH_BASE_URL = 'https://whish.example/api'

const { createPayment, getCollectStatus } = await import('../src/whish.js')

const jsonResponse = (payload, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

test('createPayment follows the v1.4.4 string contract', async () => {
  let request
  global.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) }
    return jsonResponse({ status: true, code: null, data: { collectUrl: 'https://whish.example/pay/abc' } })
  }

  const result = await createPayment({
    amount: 12.5,
    externalId: 42,
    invoice: 'Order #42',
    successCallbackUrl: 'https://api.example.com/success',
    failureCallbackUrl: 'https://api.example.com/failure',
    successRedirectUrl: 'https://store.example.com/success',
    failureRedirectUrl: 'https://store.example.com/failure',
  })

  assert.equal(result.collectUrl, 'https://whish.example/pay/abc')
  assert.equal(request.url, 'https://whish.example/api/payment/whish')
  assert.equal(request.body.amount, '12.50')
  assert.equal(request.body.externalId, '42')
  assert.equal(request.options.headers.websiteUrl, 'https://store.example.com')
})

test('status lookup retries code 500 with the same string externalId', async () => {
  const bodies = []
  global.fetch = async (_url, options) => {
    bodies.push(JSON.parse(options.body))
    if (bodies.length === 1) {
      return jsonResponse({ status: false, code: 500, dialog: { message: 'Unknown result' } })
    }
    return jsonResponse({ status: true, code: null, data: { collectStatus: 'success' } })
  }

  const result = await getCollectStatus({ externalId: 77, currency: 'USD' })

  assert.equal(result.collectStatus, 'success')
  assert.equal(bodies.length, 2)
  assert.deepEqual(bodies.map((body) => body.externalId), ['77', '77'])
})
