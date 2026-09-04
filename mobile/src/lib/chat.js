// The shopping assistant, in the app.
//
// It talks to the SAME endpoint the storefront's chat widget uses —
// POST <store website>/api/chat — rather than a second copy of the assistant
// living in the store API. Everything that makes the answers trustworthy is in
// that route: the system prompt, the three tools pointed at the real catalog,
// the tool-round budget, the rate limit, and the API key (which never leaves
// the server). Porting it here would mean two prompts to keep in step and a
// second place to leak a key from, so the app is a client and nothing more.
//
// It is a plain POST with no cookies and no auth, so there is nothing for a
// mobile client to be missing — and React Native's fetch has no browser origin,
// so the cross-origin call the web could not make is simply a request here.

import { STORE_WEB_URL } from '@/src/config/env';
import { mapChatProduct } from './storeApi';

// The endpoint bounds this too (MAX_HISTORY); sending less costs less and keeps
// the model's context to the part of the conversation that is still relevant.
const MAX_HISTORY = 10;
const TIMEOUT_MS = 45000;

export const GREETING =
  "Hi! Tell me what you're looking for — a budget, a use case, or a product name — and I'll find it.";

export const SUGGESTIONS = ['A laptop under $700', 'Wireless mouse for work', 'How long is delivery?'];

/**
 * Ask the assistant. `history` is the thread so far, oldest first, each
 * `{ role: 'user' | 'model', text }` — the greeting is ours, not part of the
 * conversation, so callers leave it out.
 *
 * Resolves to `{ reply, products }`. Products are whole catalog rows, so they
 * render as real ProductTiles with a working Add to Bag: the model only ever
 * hands back what a tool looked up, never prices or names it typed itself.
 */
export async function askAssistant(history) {
  const messages = (Array.isArray(history) ? history : [])
    .filter(m => m && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_HISTORY)
    .map(m => ({ role: m.role === 'model' ? 'model' : 'user', text: m.text.slice(0, 1000) }));

  if (!messages.length) throw new Error('Say something first.');

  // A model call can be slow; it should not be able to hang the screen forever.
  //
  // AbortController + a timer, NOT AbortSignal.timeout(): React Native ships an
  // AbortController polyfill but no `timeout` static (a 2022 addition to the web
  // spec that never reached it), so calling it is "undefined is not a function"
  // the moment you hit send. Anything newer than fetch itself has to be checked
  // against Hermes before it goes in here.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${STORE_WEB_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal: controller.signal
    });
  } catch {
    // An abort we caused reads as a timeout; anything else is the network.
    if (timedOut) throw new Error('That took too long. Try asking again.');
    throw new Error("Can't reach the assistant. Check your connection.");
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* fall through to the status check */
  }
  // The route answers its own errors in words meant for a customer (the rate
  // limit, the "not available right now"), so show what it said.
  if (!res.ok) throw new Error(data?.error || 'Something went wrong. Please try again.');

  return {
    reply: data?.reply || "Sorry — I couldn't find an answer for that.",
    products: Array.isArray(data?.products) ? data.products.map(mapChatProduct).filter(Boolean) : []
  };
}
