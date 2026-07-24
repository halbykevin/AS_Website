// Expo push channel adapter. Talks straight to the Expo push HTTP API — no SDK
// dependency. Production FCM/APNs credentials live in the Expo/EAS project, not
// here; the only (optional) secret is EXPO_ACCESS_TOKEN for enhanced security.
//
// chunkMessages is exported separately so batching is unit-testable.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const ACCESS_TOKEN = process.env.EXPO_ACCESS_TOKEN || ''
export const EXPO_CHUNK_SIZE = 100 // Expo's documented max per request

export const isExpoToken = (t) =>
  /^Expo(nent)?PushToken\[[^\]]+\]$/.test(String(t || ''))

export function chunkMessages(messages, size = EXPO_CHUNK_SIZE) {
  const chunks = []
  for (let i = 0; i < messages.length; i += size) chunks.push(messages.slice(i, i + size))
  return chunks
}

// Build one Expo push message. `data` rides along for deep-link routing.
export function buildPushMessage({ token, title, body, deepLink, data, priority, channelId }) {
  return {
    to: token,
    title: String(title || '').slice(0, 170),
    body: String(body || '').slice(0, 230),
    sound: 'default',
    priority: priority === 'high' ? 'high' : 'default',
    channelId: channelId || 'default',
    data: { ...(data || {}), deepLink: deepLink || '' },
  }
}

// Send a batch. Returns [{status:'ok', id} | {status:'error', error, shouldRevoke}]
// aligned with the input order. Throws only on transport-level failure (caller
// retries with backoff).
export async function sendExpoPush(messages) {
  if (!messages.length) return []
  const results = []
  for (const chunk of chunkMessages(messages)) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(ACCESS_TOKEN ? { Authorization: `Bearer ${ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Expo push HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = await res.json()
    const tickets = Array.isArray(json?.data) ? json.data : []
    for (const t of tickets) {
      if (t.status === 'ok') {
        results.push({ status: 'ok', id: t.id || '' })
      } else {
        const err = t.details?.error || t.message || 'unknown'
        results.push({
          status: 'error',
          error: String(err).slice(0, 300),
          // Token is gone from the device — stop sending to it forever.
          shouldRevoke: t.details?.error === 'DeviceNotRegistered',
        })
      }
    }
    // Pad if the provider returned fewer tickets than messages sent.
    while (results.length < chunk.length) results.push({ status: 'error', error: 'missing ticket' })
  }
  return results
}
