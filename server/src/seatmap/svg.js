// Making a partner's venue drawing safe to put on our page.
//
// Two of the three ticketing sites hand out their hall as an SVG rather than as
// rows of seats: ihjoz draws the room in the event page, tickit hosts one file
// per venue. Rebuilding those from coordinates the way we rebuild the box
// office's grid is not possible — the shapes ARE the information, and a lounge
// laid out as 82 numbered tables means nothing as a list of names.
//
// So we serve their drawing. Which means it arrives as third-party markup that
// ends up inside our DOM, and SVG is a scripting context: <script>, on* event
// attributes, <foreignObject>, xlink:href, `style` with url()/expression() are
// all live if we pass them through. Hence an allow-list, not a block-list —
// anything not named here is dropped, so a tag we have never seen cannot
// arrive and be trusted by accident.
//
// It is also a size and collision filter. Both sites publish Inkscape output:
// sodipodi/inkscape/rdf attributes are most of the bytes and none of the
// picture, and every `id` in there would land in our document's id namespace.
// Ids go, except the one thing we need to address — the section — which becomes
// `data-sid`.

// Elements we render. Everything else is dropped; the ones listed in DROP_TREE
// take their children with them, anything else keeps its children (so an
// unexpected wrapper loses the wrapper, not the picture).
const KEEP = new Set([
  'svg',
  'g',
  'defs',
  'title',
  'desc',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'path',
  'text',
  'tspan',
  'lineargradient',
  'radialgradient',
  'stop',
])

// Dropped with everything inside them: script and style are code, the rest is
// either metadata or a way to load something external.
const DROP_TREE = new Set([
  'script',
  'style',
  'metadata',
  'foreignobject',
  'image',
  'a',
  'use',
  'switch',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
  'filter',
  'mask',
  'pattern',
  'clippath',
  'marker',
  'symbol',
  'color-profile',
  // ihjoz ships the section list as its own <sections> element inside the file.
  // We read it before sanitising and it has no business being rendered.
  'sections',
])

const ATTRS = new Set([
  'class',
  'viewbox',
  'preserveaspectratio',
  'width',
  'height',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'dx',
  'dy',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientunits',
  'gradienttransform',
  'xml:space',
  // Ours, written by the parsers before this runs.
  'data-sid',
])

// `style` survives because both sites put the section's colour in it, but only
// these properties and only values that cannot fetch or execute anything.
const STYLE_PROPS = new Set([
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'opacity',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'letter-spacing',
])

const UNSAFE_VALUE = /url\s*\(|expression\s*\(|javascript:|data:|[<>]/i

/** The first complete <svg>…</svg> in a document, or ''. */
export function extractSvg(html) {
  const start = String(html || '').search(/<svg[\s>]/i)
  if (start < 0) return ''
  const end = String(html).toLowerCase().indexOf('</svg>', start)
  return end < 0 ? '' : String(html).slice(start, end + 6)
}

/** `<rect … sid="s3" …>` -> the attribute value, without a DOM parser. */
export function attr(tag, name) {
  const m = String(tag).match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"', 'i'))
  return m ? m[1].trim() : ''
}

export function viewBoxOf(svg) {
  const box = attr(svg.slice(0, 2000), 'viewBox')
  if (box) return box
  const w = Number(attr(svg.slice(0, 2000), 'width')) || 0
  const h = Number(attr(svg.slice(0, 2000), 'height')) || 0
  return w && h ? `0 0 ${w} ${h}` : ''
}

function cleanStyle(value) {
  const out = []
  for (const part of String(value).split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    const prop = part.slice(0, i).trim().toLowerCase()
    const val = part.slice(i + 1).trim()
    if (!STYLE_PROPS.has(prop) || !val || UNSAFE_VALUE.test(val)) continue
    out.push(`${prop}:${val}`)
  }
  return out.join(';')
}

function cleanTag(name, raw, selfClosing) {
  const kept = []
  const re = /([a-zA-Z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(raw))) {
    const key = m[1].toLowerCase()
    const value = m[3] ?? m[4] ?? ''
    if (key === 'style') {
      const style = cleanStyle(value)
      if (style) kept.push(`style="${style}"`)
      continue
    }
    // Namespaced attributes are all either Inkscape bookkeeping or xlink, which
    // is a way to reference something. xml:space is the one exception above.
    if (!ATTRS.has(key)) continue
    if (UNSAFE_VALUE.test(value) && key !== 'd' && key !== 'points') continue
    kept.push(`${key}="${escapeAttr(value)}"`)
  }
  if (name === 'svg') {
    // We re-emit the root ourselves so it always carries a namespace, always
    // scales to its box, and never carries a fixed pixel size.
    return null
  }
  return `<${name}${kept.length ? ' ' + kept.join(' ') : ''}${selfClosing ? ' /' : ''}>`
}

const escapeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Rewrite a partner's SVG into something we are willing to inject.
 *
 * Returns the inner markup only — no <svg> root — so the caller renders its own
 * root with its own viewBox and sizing, and the file cannot set width/height,
 * a style, or anything else on the element we mount.
 */
export function sanitizeSvg(svg) {
  const src = String(svg || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
    .replace(/<[?!][^>]*>/g, '')

  const out = []
  // How many levels of a dropped-with-children element we are inside.
  let skip = 0
  const tag = /<\/?([a-zA-Z][\w.:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)\/?>/g
  let last = 0
  let m
  while ((m = tag.exec(src))) {
    if (!skip) {
      const text = src.slice(last, m.index)
      if (text.trim()) out.push(text.replace(/</g, '&lt;'))
    }
    last = tag.lastIndex

    const whole = m[0]
    const name = m[1].toLowerCase()
    const closing = whole.startsWith('</')
    const selfClosing = whole.endsWith('/>')

    if (DROP_TREE.has(name) || name.includes(':')) {
      if (!selfClosing) skip += closing ? -1 : 1
      if (skip < 0) skip = 0
      continue
    }
    if (skip) continue
    if (!KEEP.has(name)) continue

    if (closing) {
      if (name !== 'svg') out.push(`</${name}>`)
      continue
    }
    const rendered = cleanTag(name, m[2] || '', selfClosing)
    if (rendered) out.push(rendered)
  }
  const tail = src.slice(last)
  if (!skip && tail.trim()) out.push(tail.replace(/</g, '&lt;'))

  return out.join('').replace(/\s{2,}/g, ' ').trim()
}
