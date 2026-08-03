// The only file that knows which AI provider we use.
//
// Everything above it speaks in one shape — messages in, {text, toolCalls} out —
// so swapping Gemini for another provider is this file plus two env vars, not a
// rewrite of the chat route. Server-side only: importing this from a client
// component would leak the key into the browser bundle.

const KEY = process.env.GEMINI_API_KEY || ''
// Pinned deliberately. "latest" aliases move under you, and Google retires
// models for new keys without warning (gemini-2.5-flash already refuses them),
// so the model is a one-line env override when that day comes.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite'
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

export const aiConfigured = () => Boolean(KEY)

/** Raised for anything the caller should show the user a friendly message for. */
export class AiError extends Error {
  constructor(message, { status = 502, retryable = false } = {}) {
    super(message)
    this.status = status
    this.retryable = retryable
  }
}

// Our neutral message shape → Gemini's `contents`.
// - roles: 'user' | 'model'
// - a tool result is a message { role:'tool', name, response }
function toContents(messages) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'user', parts: [{ functionResponse: { name: m.name, response: m.response } }] }
    }
    if (m.role === 'model' && m.toolCalls?.length) {
      return {
        role: 'model',
        // thoughtSignature must be echoed back exactly as received: Gemini 3
        // models reject a tool conversation without it ("Function call is
        // missing a thought_signature"). It is opaque to us — carry, don't read.
        parts: m.toolCalls.map((c) => ({
          functionCall: { name: c.name, args: c.args },
          ...(c.thoughtSignature ? { thoughtSignature: c.thoughtSignature } : {}),
        })),
      }
    }
    return { role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text ?? '') }] }
  })
}

/**
 * One turn with the model.
 *
 * @param {object}   opts
 * @param {string}   opts.system   System instruction.
 * @param {Array}    opts.messages Conversation so far (see toContents).
 * @param {Array}    opts.tools    Function declarations the model may call.
 * @param {number}   opts.maxTokens
 * @returns {Promise<{text: string, toolCalls: Array<{name: string, args: object}>, usage: object}>}
 */
export async function askModel({ system, messages, tools = [], maxTokens = 800 }) {
  if (!KEY) throw new AiError('The assistant is not configured.', { status: 503 })

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: toContents(messages),
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.3 },
  }
  if (tools.length) body.tools = [{ functionDeclarations: tools }]

  let res
  try {
    res = await fetch(`${ENDPOINT}/${MODEL}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    })
  } catch (e) {
    throw new AiError(e.name === 'TimeoutError' ? 'The assistant timed out.' : 'Could not reach the assistant.', {
      retryable: true,
    })
  }

  if (!res.ok) {
    // 429 is the one users will actually hit on a free tier — say so plainly
    // rather than showing a generic failure.
    const detail = await res.json().catch(() => null)
    const msg = detail?.error?.message || `HTTP ${res.status}`
    if (res.status === 429) {
      throw new AiError('The assistant is busy right now — please try again in a minute.', {
        status: 429,
        retryable: true,
      })
    }
    throw new AiError(`Assistant error: ${msg}`, { status: 502 })
  }

  const data = await res.json()
  const parts = data?.candidates?.[0]?.content?.parts || []
  return {
    text: parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim(),
    toolCalls: parts.filter((p) => p.functionCall).map((p) => ({
      name: p.functionCall.name,
      args: p.functionCall.args || {},
      thoughtSignature: p.thoughtSignature,
    })),
    usage: data?.usageMetadata || {},
  }
}
