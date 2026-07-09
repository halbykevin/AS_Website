// On-the-fly image resizing for /uploads.
//
// Stored files are never modified. When a request carries resize params
// (?w=, ?format=, ?q=) we produce a resized/re-encoded variant with sharp,
// cache it on disk, and serve that; repeat requests hit the cache. Requests
// without params fall through to express.static (the untouched original).
import path from 'node:path'
import fs from 'node:fs'
import fsp from 'node:fs/promises'

// sharp is optional: if it isn't installed the middleware is a no-op and
// originals are still served, so the site never breaks over an image.
let sharp = null
try {
  sharp = (await import('sharp')).default
} catch {
  console.warn('[images] sharp not installed — serving original images without resizing')
}

const IMAGE_EXT = /\.(jpe?g|png|webp|avif|gif|tiff?)$/i
const FORMATS = new Set(['webp', 'jpeg', 'jpg', 'png', 'avif'])

const clampInt = (v, min, max) => {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return null
  return Math.min(max, Math.max(min, n))
}

// Round widths to a small set of buckets so we don't cache one file per
// arbitrary pixel value (protects disk from cache explosion).
const bucketWidth = (w) => {
  const buckets = [320, 480, 640, 768, 1024, 1280, 1600, 2000]
  return buckets.find((b) => w <= b) ?? 2000
}

export function imageResizer(uploadDir) {
  const cacheDir = path.join(uploadDir, '.cache')
  if (sharp) fs.mkdirSync(cacheDir, { recursive: true })

  return async function (req, res, next) {
    if (!sharp) return next()
    // Only act when there's something to do.
    if (req.query.w == null && req.query.format == null) return next()

    // Resolve safely inside uploadDir (block path traversal).
    const name = path.basename(decodeURIComponent(req.path))
    if (!IMAGE_EXT.test(name)) return next()
    const srcPath = path.join(uploadDir, name)

    let srcStat
    try {
      srcStat = await fsp.stat(srcPath)
    } catch {
      return next() // let static handler produce the 404
    }

    const width = req.query.w != null ? bucketWidth(clampInt(req.query.w, 16, 2000) ?? 2000) : null
    const quality = clampInt(req.query.q, 1, 100) ?? 80
    let format = String(req.query.format || '').toLowerCase()
    if (!FORMATS.has(format)) format = '' // empty = keep source format
    const outExt = format === 'jpg' ? 'jpeg' : format || path.extname(name).slice(1).toLowerCase()

    const key = `${name}.w${width ?? 'orig'}.q${quality}.${outExt}`
    const cachePath = path.join(cacheDir, key)

    const setHeaders = () => {
      res.type(outExt === 'jpg' ? 'jpeg' : outExt)
      res.set('Cache-Control', 'public, max-age=31536000, immutable')
    }

    // Serve from cache when it's newer than the source.
    try {
      const cacheStat = await fsp.stat(cachePath)
      if (cacheStat.mtimeMs >= srcStat.mtimeMs) {
        setHeaders()
        return res.sendFile(cachePath)
      }
    } catch {
      // no cache entry yet — build it below
    }

    try {
      let pipeline = sharp(srcPath, { animated: true }).rotate()
      if (width) pipeline = pipeline.resize({ width, withoutEnlargement: true })
      if (outExt === 'webp') pipeline = pipeline.webp({ quality })
      else if (outExt === 'avif') pipeline = pipeline.avif({ quality })
      else if (outExt === 'png') pipeline = pipeline.png()
      else pipeline = pipeline.jpeg({ quality, mozjpeg: true })

      const buf = await pipeline.toBuffer()
      // Write cache best-effort; still serve even if the write fails.
      fsp.writeFile(cachePath, buf).catch(() => {})
      setHeaders()
      return res.send(buf)
    } catch (err) {
      console.warn('[images] resize failed for', name, err.message)
      return next() // fall back to the original via static
    }
  }
}
