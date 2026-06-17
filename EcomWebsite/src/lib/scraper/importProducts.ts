/**
 * Ingests products scraped by WebScarping/scrape.py into Payload.
 *
 * - Parses each product's category breadcrumb ("A > B > C") into a real
 *   category tree (find-or-create each level, linked by `parent`).
 * - Uploads product images into the Media collection.
 * - Upserts products keyed on `sku` (idempotent re-sync), storing the USD
 *   price in minor units (cents). LBP is left empty — converted later.
 *
 * Runs inside the Payload process via the Local API, so it can be called
 * both from a CLI script and from the admin "Sync" endpoint.
 */
import type { Payload } from 'payload'

/** Shape of one product in scrape.py's JSON output (see ecom_scraper/models.py). */
export type ScrapedProduct = {
  url?: string
  name?: string | null
  brand?: string | null
  sku?: string | null
  price?: number | null
  currency?: string | null
  availability?: string | null
  description?: string | null
  categories?: string[]
  images?: string[]
  image_files?: string[]
}

export type ImportOptions = {
  /** Max products to import (0 = all). */
  limit?: number
  /** Mark imported products as published (default true). */
  publish?: boolean
  /** Optional logger (e.g. payload.logger.info or a job log appender). */
  log?: (msg: string) => void
}

export type ImportSummary = {
  total: number
  created: number
  updated: number
  skipped: number
  categories: number
  images: number
}

// --- small helpers ---------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

/** Decode the HTML entities that show up in scraped names/categories. */
function decodeEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
}

/** Strip a trailing site-name suffix scrapers often append (e.g. "… Pacmax.me"). */
function cleanName(name: string, url?: string): string {
  let out = decodeEntities(name).trim()
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '') // e.g. pacmax.me
      const label = host.split('.')[0] // e.g. pacmax
      const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Remove a trailing "<host>" or "<label>" with optional separators.
      out = out
        .replace(new RegExp(`\\s*[|\\-–—]?\\s*${esc(host)}\\s*$`, 'i'), '')
        .replace(new RegExp(`\\s*[|\\-–—]?\\s*${esc(label)}\\s*$`, 'i'), '')
        .trim()
    } catch {
      /* ignore bad URL */
    }
  }
  return out.replace(/[\s|\-–—]+$/, '').trim()
}

function slugify(input: string): string {
  return decodeEntities(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/** Wrap plain text into the minimal Lexical rich-text structure Payload expects. */
function lexicalFromText(text: string) {
  const clean = decodeEntities(String(text || '')).trim()
  return {
    root: {
      type: 'root',
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
      children: clean
        ? [
            {
              type: 'paragraph',
              direction: 'ltr' as const,
              format: '' as const,
              indent: 0,
              version: 1,
              textFormat: 0,
              textStyle: '',
              children: [
                { type: 'text', detail: 0, format: 0, mode: 'normal', style: '', text: clean, version: 1 },
              ],
            },
          ]
        : [],
    },
  }
}

/** Build a fetchable File object for payload.create({ collection: 'media', file }). */
async function fetchFile(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`image fetch ${res.status} for ${url}`)
  const data = Buffer.from(await res.arrayBuffer())
  const ext = (url.split('.').pop() || 'jpg').split(/[?#]/)[0].toLowerCase()
  return {
    name: url.split('/').pop()?.split(/[?#]/)[0] || `image-${Date.now()}.${ext}`,
    data,
    mimetype: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    size: data.byteLength,
  }
}

// --- ingest ----------------------------------------------------------------

export async function importProducts(
  payload: Payload,
  products: ScrapedProduct[],
  opts: ImportOptions = {},
): Promise<ImportSummary> {
  const log = opts.log || (() => {})
  const publish = opts.publish !== false
  const list = opts.limit && opts.limit > 0 ? products.slice(0, opts.limit) : products

  const summary: ImportSummary = {
    total: list.length,
    created: 0,
    updated: 0,
    skipped: 0,
    categories: 0,
    images: 0,
  }

  // Per-run caches so repeated categories/images aren't re-created.
  const catCache = new Map<string, number | string>() // `${parentId}//${title}` -> id
  const mediaCache = new Map<string, number | string>() // url -> media id

  /** Ensure a "A > B > C" breadcrumb exists as a category chain; return the leaf id. */
  const ensureCategoryPath = async (breadcrumb: string): Promise<number | string | null> => {
    // Decode entities FIRST — the scraped separator is the literal "&gt;"
    // (no real ">" char), so we must turn it into ">" before splitting.
    const parts = decodeEntities(breadcrumb)
      .split('>')
      .map((p) => p.trim())
      .filter(Boolean)
    if (!parts.length) return null

    let parentId: number | string | null = null
    let leafId: number | string | null = null

    for (const title of parts) {
      const cacheKey = `${parentId ?? 'root'}//${title.toLowerCase()}`
      const cached = catCache.get(cacheKey)
      if (cached != null) {
        parentId = cached
        leafId = cached
        continue
      }

      // Find an existing category with this title under this parent.
      const where: Record<string, unknown> = { title: { equals: title } }
      where.parent = parentId == null ? { exists: false } : { equals: parentId }
      const found = await payload.find({ collection: 'categories', where, limit: 1, depth: 0 })

      let id: number | string
      if (found.docs[0]) {
        id = found.docs[0].id
      } else {
        const created = await payload.create({
          collection: 'categories',
          data: {
            title,
            slug: slugify(title),
            ...(parentId != null ? { parent: parentId } : {}),
          },
        })
        id = created.id
        summary.categories++
        log(`  + category: ${parts.slice(0, parts.indexOf(title) + 1).join(' › ')}`)
      }
      catCache.set(cacheKey, id)
      parentId = id
      leafId = id
    }
    return leafId
  }

  const ensureMedia = async (url: string, alt: string): Promise<number | string | null> => {
    const cached = mediaCache.get(url)
    if (cached != null) return cached
    try {
      const file = await fetchFile(url)
      const media = await payload.create({ collection: 'media', data: { alt }, file })
      mediaCache.set(url, media.id)
      summary.images++
      return media.id
    } catch (err) {
      log(`  ! image failed (${url}): ${(err as Error).message}`)
      return null
    }
  }

  for (const p of list) {
    const name = cleanName(p.name || '', p.url)
    if (!name) {
      summary.skipped++
      continue
    }
    const sku = (p.sku || '').trim()

    // Categories (each breadcrumb → a leaf the product belongs to).
    const categoryIds: (number | string)[] = []
    for (const bc of p.categories || []) {
      const leaf = await ensureCategoryPath(bc)
      if (leaf != null && !categoryIds.includes(leaf)) categoryIds.push(leaf)
    }

    // Images → media → gallery rows. Prefer local files, else remote URLs.
    // Fetch a product's images in parallel (the main per-product bottleneck).
    const imageUrls = (p.image_files?.length ? p.image_files : p.images) || []
    const mediaResults = await Promise.all(
      imageUrls.slice(0, 5).map((url) => ensureMedia(url, name)),
    )
    const galleryIds = mediaResults.filter((id): id is number | string => id != null)

    const data: Record<string, unknown> = {
      title: name,
      slug: slugify(name).slice(0, 80) || slugify(sku) || `product-${Date.now()}`,
      brand: decodeEntities(p.brand || '') || undefined,
      sku: sku || undefined,
      sourceUrl: p.url || undefined,
      description: lexicalFromText(p.description || ''),
      categories: categoryIds,
      priceInUSDEnabled: true,
      priceInUSD: p.price != null ? Math.round(p.price * 100) : 0,
      _status: publish ? 'published' : 'draft',
    }
    if (galleryIds.length) {
      data.gallery = galleryIds.map((id) => ({ image: id }))
      // SEO/social preview: use the first image + a trimmed description.
      const metaDesc = decodeEntities(p.description || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 155)
      data.meta = { image: galleryIds[0], title: name.slice(0, 70), description: metaDesc }
    }

    // Upsert: match an existing product by SKU when we have one.
    let existing
    if (sku) {
      const found = await payload.find({
        collection: 'products',
        where: { sku: { equals: sku } },
        limit: 1,
        depth: 0,
      })
      existing = found.docs[0]
    }

    try {
      if (existing) {
        // Don't clobber a gallery the admin may have curated if we found none.
        if (!galleryIds.length) delete data.gallery
        await payload.update({ collection: 'products', id: existing.id, data })
        summary.updated++
        log(`  ~ updated: ${name}`)
      } else {
        if (!galleryIds.length) {
          // gallery requires minRows:1 — skip products we couldn't image.
          summary.skipped++
          log(`  - skipped (no image): ${name}`)
          continue
        }
        await payload.create({ collection: 'products', data })
        summary.created++
        log(`  + created: ${name}`)
      }
    } catch (err) {
      summary.skipped++
      log(`  ! product failed (${name}): ${(err as Error).message}`)
    }
  }

  return summary
}
