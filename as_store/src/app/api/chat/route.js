// The shopping assistant.
//
// A customer's question goes to the model with three tools pointed at the real
// catalog; the model decides what to look up, we run it, and it answers from
// what came back. Products it mentions are returned as slugs so the widget can
// render genuine ProductTiles — live price, working Add to Bag — instead of the
// model retyping details it might get wrong.
//
// The API key lives here and only here (see lib/ai.js). Nothing in this file is
// ever sent to the browser.

import { NextResponse } from 'next/server'
import { askModel, aiConfigured, AiError } from '@/lib/ai'
import { searchCatalog, loadProduct, loadPage, loadCategories } from '@/lib/catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_TOOL_ROUNDS = 3 // bounds cost per message; after this it must answer
const MAX_HISTORY = 10
const RATE = { limit: 20, windowMs: 10 * 60 * 1000 }

// --- Rate limiting ---------------------------------------------------------
// A public endpoint that costs money per call is a gift to whoever finds it.
// In-memory per instance: enough to stop a bored visitor or a scraper, and it
// costs nothing. It is NOT a defence against a distributed attack — if this
// ever gets seriously abused, move the counter to the API's Postgres.
const hits = new Map()
function rateLimited(ip) {
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || now > rec.reset) {
    hits.set(ip, { n: 1, reset: now + RATE.windowMs })
    if (hits.size > 5000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k)
    return false
  }
  rec.n += 1
  return rec.n > RATE.limit
}

// --- Tools -----------------------------------------------------------------
const TOOLS = [
  {
    name: 'search_products',
    description:
      'Search the AS Store catalog. Use for any question about what is sold, ' +
      'including vague needs ("a laptop for design work") and budgets. Returns ' +
      'live products with their real current prices.',
    parameters: {
      type: 'object',
      properties: {
        // The search matches words against product names and descriptions, and
        // ALL words must match. So "laptop for design work" finds almost
        // nothing, while "laptop" finds them all and lets the model choose.
        query: {
          type: 'string',
          description:
            'Product type and/or brand ONLY — e.g. "laptop", "logitech mouse", "webcam". ' +
            'Never include the use case, adjectives, or words like cheap/best/good: every ' +
            'word must appear in the product for it to match, so extra words return nothing. ' +
            'Judge suitability yourself from the results.',
        },
        category: { type: 'string', description: 'Category slug, only if one clearly applies.' },
        minPrice: { type: 'number', description: 'Minimum price in USD.' },
        maxPrice: { type: 'number', description: 'Maximum price in USD.' },
      },
    },
  },
  {
    name: 'get_product',
    description:
      'Full description and specification table for one product, by slug. Use ' +
      'when asked about details, or to compare two products.',
    parameters: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'The product slug from a search result.' } },
      required: ['slug'],
    },
  },
  {
    name: 'get_policy',
    description:
      'The shop\'s own policy text: shipping, warranty, support, about. Use for ' +
      'delivery times, returns, guarantees, or company questions.',
    parameters: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'One of: shipping, warranty, support, about, contact.' },
      },
      required: ['slug'],
    },
  },
]

// Trim a product to what the model needs to choose and describe it. Sending
// whole rows wastes tokens and tempts it to quote fields we'd rather it didn't
// (stock is meaningless in this database — see the system prompt).
const brief = (p) => ({
  slug: p.slug,
  name: p.name,
  price: p.price,
  oldPrice: p.oldPrice || undefined,
  brand: p.brand || undefined,
  category: p.category || undefined,
  tagline: p.tagline || undefined,
})

// `cards` collects what the widget will render. A search REPLACES it (the newest
// search is what the customer asked about); looking up one product ADDS it.
// Deriving the cards from the tool results — rather than parsing them out of the
// model's prose — means the displayed prices are always the ones we looked up.
async function runTool(name, args, cards) {
  if (name === 'search_products') {
    const rows = await searchCatalog({
      query: args.query,
      category: args.category,
      minPrice: args.minPrice,
      maxPrice: args.maxPrice,
      limit: 8,
    })
    cards.length = 0
    cards.push(...rows)
    return { count: rows.length, products: rows.map(brief) }
  }

  if (name === 'get_product') {
    const p = await loadProduct(String(args.slug || ''))
    if (!p) return { found: false }
    if (!cards.some((c) => c.slug === p.slug)) cards.push(p)
    return {
      found: true,
      ...brief(p),
      description: (p.description || '').slice(0, 2000),
      // 60% of the catalog has no spec table; say so explicitly rather than
      // letting an empty array read as "no features".
      specs: p.specs?.length ? p.specs : undefined,
      specsAvailable: Boolean(p.specs?.length),
    }
  }

  if (name === 'get_policy') {
    const allowed = ['shipping', 'warranty', 'support', 'about', 'contact']
    const slug = String(args.slug || '').toLowerCase()
    if (!allowed.includes(slug)) return { found: false }
    const page = await loadPage(slug)
    return page ? { found: true, title: page.title, body: (page.body || '').slice(0, 4000) } : { found: false }
  }

  return { error: 'unknown tool' }
}

// --- Prompt ----------------------------------------------------------------
function systemPrompt(categories) {
  return `You are the shopping assistant for AS Store, an electronics retailer in Lebanon.
Prices are in USD.

HOW TO ANSWER
- Use the tools for every question about products, prices or policies. Never answer those from your own knowledge.
- Search with the product type or brand only ("laptop", "logitech mouse"). The search requires every word to match, so use-case words like "for design work" or "gaming" find nothing. Search broadly, then judge which results suit the customer.
- If a search comes back empty or very small, try again with fewer words before telling the customer you found nothing.
- NEVER answer about a different kind of product than the one asked for. If you cannot find what they asked for, say exactly that — do not substitute another category.
- State only facts that came back from a tool. If a detail isn't in the result, say you don't have it.
- Reply in the language the customer writes in (Arabic, French or English).
- The catalog is written in ENGLISH ONLY, so always translate the request into English keywords before searching — searching in Arabic or French returns nothing. "بدي ماوس لاسلكي رخيص" → search "wireless mouse", then answer in Arabic.

FORMATTING — THIS MATTERS
The results of your most recent search are ALWAYS shown to the customer as cards
underneath your message, each with its picture, its live price and an Add to Bag
button. They can already see them. So:
- Your words must match what is on screen. If the results are not really what they asked for, say what they ARE rather than pretending nothing is there: "We don't carry that model, but here are the iPhones we do have."
- NEVER write a list of products. No bullet points, no names with prices in brackets, no markdown.
- Write ONE or TWO short sentences: what you found, and anything genuinely useful about choosing between them ("the two HP OmniBooks differ only in memory").
- Only name a specific product when you are recommending one above the others, or answering about that one product.
- Never write out a price unless the customer asked about one specific product's price.

WHAT YOU MUST NOT DO
- Never state whether something is in stock, reserved, or how many are left — that information does not exist here. If asked, say you can't confirm availability and to send a message via the contact page.
- Never invent or estimate a price, specification, delivery time or warranty term.
- Never promise a discount, a delivery date, or anything about an existing order. For order questions, point to the account's Orders page.
- If nothing matches, say so plainly and suggest leaving a message on the contact page. Do not offer a substitute you haven't looked up.

Categories available: ${categories.map((c) => c.slug).join(', ')}`
}

// --- Route -----------------------------------------------------------------
export async function POST(req) {
  if (!aiConfigured()) {
    return NextResponse.json({ error: 'The assistant is not available right now.' }, { status: 503 })
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "That's a lot of questions! Give it a few minutes, or send us a message." },
      { status: 429 },
    )
  }

  let incoming
  try {
    incoming = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  }

  // Normalize and bound whatever the client sent — it is user input.
  const history = (Array.isArray(incoming?.messages) ? incoming.messages : [])
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role === 'model' ? 'model' : 'user', text: m.text.slice(0, 1000) }))

  if (!history.length) return NextResponse.json({ error: 'Say something first.' }, { status: 400 })

  const categories = await loadCategories()
  const system = systemPrompt(categories)
  const cards = [] // the products the widget will render, from tool results
  const messages = [...history]

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // On the last round drop the tools, which forces a written answer instead
      // of another lookup we would not run.
      const tools = round < MAX_TOOL_ROUNDS ? TOOLS : []
      const { text, toolCalls } = await askModel({ system, messages, tools })

      if (!toolCalls.length) {
        return NextResponse.json({
          reply: text || "Sorry — I couldn't find an answer for that.",
          products: cards.slice(0, 6),
        })
      }

      messages.push({ role: 'model', toolCalls })
      for (const call of toolCalls) {
        const result = await runTool(call.name, call.args, cards)
        messages.push({ role: 'tool', name: call.name, response: result })
      }
    }
  } catch (e) {
    if (e instanceof AiError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error('[chat]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ reply: "Sorry — I couldn't work that out. Try asking differently?", products: [] })
}
