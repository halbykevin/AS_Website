// The printed ticket: AS Ticketing's design (as_ticketing/as-ticket-generator/
// ticket.py — same layout, same millimetres) drawn as a vector PDF, 200 × 80 mm,
// one page per admission. Vector rather than the script's 600 dpi raster, so
// the QR code and the text stay crisp at any print size, and a ten-ticket file
// is a few hundred KB, small enough to email.
//
// Pure drawing — no database. tickets.js hands it the event and the tickets.
//
// Arabic needs care here. fontkit (pdfkit's shaper) joins Arabic letters and
// runs a word right to left, but it treats a line as one run, so the digits in
// "السبت 26 ديسمبر" come out reversed. So text is laid out a word at a time,
// in the order a reader expects (visualWords below), each word shaped on its own.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

const ASSETS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'tickets')
const FONTS = {
  bold: path.join(ASSETS, 'Outfit-Bold.ttf'),
  regular: path.join(ASSETS, 'Outfit-Regular.ttf'),
  arabic: path.join(ASSETS, 'Janna_LT_Bold.ttf'),
}
const LOGO = path.join(ASSETS, 'logo.png')

// Geometry, in mm, as in ticket.py.
const W_MM = 200
const H_MM = 80
export const POSTER_MM = { w: 51, h: H_MM } // the left panel
const STUB_X = 148 // the perforation
const L = 59 // the details panel's inner edges
const R = 141
const QR_MM = 31

const RED = '#D8192C'
const DARK = '#1C1C1C'
const GRAY = '#737373'
const LINE = '#E1E1E1'
const WHITE = '#FFFFFF'

const mm = (v) => (v * 72) / 25.4

// ------------------------------------------------------------------ text ---

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/
const LATIN = /[A-Za-zÀ-ɏ]/

/**
 * The words of a line in drawing order, left to right — the bidi algorithm at
 * word level, which is all a ticket's short lines need. A line takes the
 * direction of its first letter; digits and punctuation take the direction on
 * both sides of them, or the line's. An Arabic line is drawn in Janna
 * throughout (its digits included), as the original does.
 */
function visualWords(text, font) {
  const words = text.split(' ').filter(Boolean)
  const strong = words.map((w) => (ARABIC.test(w) ? 'R' : LATIN.test(w) ? 'L' : 'N'))
  const base = strong.find((d) => d !== 'N') || 'L'
  const dirs = strong.map((d, i) => {
    if (d !== 'N') return d
    const before = strong.slice(0, i).reverse().find((x) => x !== 'N')
    const after = strong.slice(i + 1).find((x) => x !== 'N')
    return before && before === after ? before : base
  })
  let items = words.map((w, i) => ({
    word: w,
    dir: dirs[i],
    font: base === 'R' || ARABIC.test(w) ? 'arabic' : font,
  }))
  // A right-to-left line is drawn back to front; then any run going against
  // the line's direction is turned back round.
  if (base === 'R') items = items.reverse()
  const out = []
  for (let i = 0; i < items.length; ) {
    let j = i
    while (j < items.length && items[j].dir !== base) j++
    if (j > i) {
      out.push(...items.slice(i, j).reverse())
      i = j
    } else out.push(items[i++])
  }
  return { words: out, rtl: base === 'R' }
}

/**
 * One line of text with its baseline at (x, y) mm, anchored left, right or
 * centre like PIL's "ls"/"rs"/"ms". With `max`, a line too long for its space
 * is set smaller rather than run into its neighbour — a ticket type called
 * "Balcony Left" has to fit the box that "A" fits.
 */
function put(doc, value, x, y, { font = 'regular', size, color = DARK, align = 'left', max = 0 } = {}) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text) return 0
  const { words, rtl } = visualWords(text, font)
  const spaceFont = rtl ? 'arabic' : font
  const measure = (pt) =>
    words.reduce((n, w) => n + doc.font(w.font).fontSize(pt).widthOfString(w.word), 0) +
    (words.length - 1) * doc.font(spaceFont).fontSize(pt).widthOfString(' ')
  let pt = size
  let width = measure(pt)
  if (max && width > mm(max)) {
    pt = Math.max(size * 0.45, (pt * mm(max)) / width)
    width = measure(pt)
  }
  const space = doc.font(spaceFont).fontSize(pt).widthOfString(' ')
  let cx = mm(x) - (align === 'right' ? width : align === 'center' ? width / 2 : 0)
  doc.fillColor(color)
  for (const w of words) {
    doc.font(w.font).fontSize(pt)
    doc.text(w.word, cx, mm(y), { lineBreak: false, baseline: 'alphabetic' })
    cx += doc.widthOfString(w.word) + space
  }
  return width
}

/** Greedy word wrap, in reading order, for the poster panel's fallback title. */
function wrap(doc, text, font, pt, maxMm) {
  const lines = []
  let line = ''
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    const f = ARABIC.test(next) ? 'arabic' : font
    if (line && doc.font(f).fontSize(pt).widthOfString(next) > mm(maxMm)) {
      lines.push(line)
      line = word
    } else line = next
  }
  if (line) lines.push(line)
  return lines
}

// --------------------------------------------------------- date and time ---

const asDay = (date) => {
  if (!date) return null
  const iso = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : null
}

/** "26 Dec 2026" and "السبت 26 ديسمبر 2026" (Western digits, as printed in Lebanon). */
export function ticketDate(date) {
  const d = asDay(date)
  if (!d) return { en: '', ar: '' }
  const en = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d)
  const parts = new Intl.DateTimeFormat('ar-u-nu-latn', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).formatToParts(d)
  const ar = ['weekday', 'day', 'month', 'year'].map((k) => parts.find((p) => p.type === k)?.value).filter(Boolean).join(' ')
  return { en, ar }
}

/** "6:30 PM" and "6:30 مساءً" from "18:30" or "06:30 PM"; anything else as typed. */
export function ticketTime(raw) {
  const text = String(raw || '').trim()
  const m = /^(\d{1,2})[:.](\d{2})\s*(?:([ap])\.?\s*m\.?)?$/i.exec(text)
  if (!m) return { en: text, ar: '' }
  let h = Number(m[1])
  const ap = m[3]?.toLowerCase()
  if (ap === 'p' && h < 12) h += 12
  if (ap === 'a' && h === 12) h = 0
  if (h > 23 || Number(m[2]) > 59) return { en: text, ar: '' }
  const h12 = h % 12 || 12
  return {
    en: `${h12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`,
    ar: `${h12}:${m[2]} ${h < 12 ? 'صباحًا' : 'مساءً'}`,
  }
}

// -------------------------------------------------------------- drawing ---

/** The QR code as filled rectangles — vector, so it scans however it's printed. */
function drawQr(doc, text, x, y, size) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' })
  const n = modules.size
  const cell = mm(size) / n
  // A hair of overlap between rows, so no viewer draws seams between them.
  const seam = cell * 0.02
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; ) {
      if (!modules.get(r, c)) {
        c++
        continue
      }
      let end = c
      while (end < n && modules.get(r, end)) end++
      doc.rect(mm(x) + c * cell, mm(y) + r * cell, (end - c) * cell, cell + seam)
      c = end
    }
  }
  doc.fill(DARK)
}

function drawPoster(doc, event) {
  if (event.poster) {
    doc.image(event.poster, 0, 0, { width: mm(POSTER_MM.w), height: mm(POSTER_MM.h) })
    return
  }
  // No picture: the panel stays dark and carries the event's name instead.
  doc.rect(0, 0, mm(POSTER_MM.w), mm(H_MM)).fill(DARK)
  const pt = 13
  const lines = wrap(doc, event.title, 'bold', pt, POSTER_MM.w - 10).slice(0, 5)
  const lead = 6
  const top = H_MM / 2 - ((lines.length - 1) * lead) / 2 + 1.5
  lines.forEach((line, i) =>
    put(doc, line, POSTER_MM.w / 2, top + i * lead, { font: 'bold', size: pt, color: WHITE, align: 'center', max: POSTER_MM.w - 8 }),
  )
}

function drawTicket(doc, event, t, website, sample) {
  doc.save()
  // Rounded outer corners.
  doc.roundedRect(0, 0, mm(W_MM), mm(H_MM), mm(3)).clip()
  doc.rect(0, 0, mm(W_MM), mm(H_MM)).fill(WHITE)

  drawPoster(doc, event)
  doc.rect(mm(STUB_X), 0, mm(W_MM - STUB_X), mm(H_MM)).fill(RED)

  // --- details panel ---------------------------------------------------
  doc.image(LOGO, mm(L), mm(5), { width: mm(27) })
  put(doc, 'ADMIT ONE', R, 11, { font: 'bold', size: 8, align: 'right' })
  put(doc, 'تذكرة دخول', R, 15.2, { font: 'arabic', size: 8, color: GRAY, align: 'right' })
  doc.moveTo(mm(L), mm(20)).lineTo(mm(R), mm(20)).lineWidth(mm(0.3)).stroke(LINE)

  const label = (left, right, en, ar, y) => {
    put(doc, en, left, y, { size: 6, color: GRAY })
    put(doc, ar, right, y, { font: 'arabic', size: 7, color: GRAY, align: 'right' })
  }

  const date = ticketDate(event.date)
  const time = ticketTime(event.time)
  label(L, 96, 'DATE', 'التاريخ', 25)
  label(103, R, 'TIME', 'الوقت', 25)
  put(doc, date.en || '—', L, 31.8, { font: 'bold', size: 15, max: 96 - L })
  put(doc, date.ar, L, 36.2, { font: 'arabic', size: 8.5, color: GRAY, max: 96 - L })
  put(doc, time.en || '—', 103, 31.8, { font: 'bold', size: 15, max: R - 103 })
  put(doc, time.ar, 103, 36.2, { font: 'arabic', size: 8.5, color: GRAY, max: R - 103 })

  label(L, R, 'VENUE', 'المكان', 41)
  // The Arabic name sits right, the venue left; the venue gives way if both are long.
  const arWidth = event.venueAr
    ? put(doc, event.venueAr, R, 46.6, { font: 'arabic', size: 11, color: RED, align: 'right', max: (R - L) / 2 })
    : 0
  put(doc, event.venue || '—', L, 46.6, { font: 'bold', size: 9.5, max: R - L - (arWidth ? arWidth * (25.4 / 72) + 4 : 0) })
  put(doc, event.city, L, 50.4, { size: 6.5, color: GRAY, max: R - L })

  // Section / row / seat — or, for a standing ticket, the area across all three.
  const boxes = t.standing
    ? [{ en: 'AREA', ar: 'المنطقة', value: t.section, w: 3 * 26 + 2 * 2 }]
    : [
        { en: 'SECTION', ar: 'القسم', value: t.section, w: 26 },
        { en: 'ROW', ar: 'الصف', value: t.row, w: 26 },
        { en: 'SEAT', ar: 'المقعد', value: t.seat, w: 26 },
      ]
  const [by0, by1] = [53.5, 68.5]
  let x0 = L
  for (const b of boxes) {
    doc.roundedRect(mm(x0), mm(by0), mm(b.w), mm(by1 - by0), mm(2)).lineWidth(mm(0.45)).stroke(RED)
    const cx = x0 + b.w / 2
    put(doc, b.en, cx, by0 + 3.3, { size: 5.5, color: GRAY, align: 'center' })
    put(doc, b.ar, cx, by0 + 6.3, { font: 'arabic', size: 7, color: GRAY, align: 'center' })
    put(doc, b.value || '—', cx, by1 - 2.3, { font: 'bold', size: 19, color: RED, align: 'center', max: b.w - 3 })
    x0 += b.w + 2
  }

  // Holder and ticket number.
  const holderWidth = put(doc, 'TICKET HOLDER', L, 72, { size: 6, color: GRAY })
  put(doc, 'اسم الحامل', L + holderWidth * (25.4 / 72) + 2, 72, { font: 'arabic', size: 7, color: GRAY })
  put(doc, 'TICKET NO.', R, 72, { size: 6, color: GRAY, align: 'right' })
  const serialWidth = put(doc, t.serial, R, 76.4, { font: 'bold', size: 8.5, align: 'right' })
  put(doc, t.holder, L, 76.4, { font: 'bold', size: 8.5, max: R - L - serialWidth * (25.4 / 72) - 4 })

  // --- stub ------------------------------------------------------------
  const sc = (STUB_X + W_MM) / 2
  put(doc, 'ADMIT ONE', sc, 6.2, { font: 'bold', size: 8, color: WHITE, align: 'center' })
  const [qx, qy, pad] = [sc - QR_MM / 2, 11, 2.6]
  doc.roundedRect(mm(qx - pad), mm(qy - pad), mm(QR_MM + 2 * pad), mm(QR_MM + 2 * pad), mm(2.5)).fill(WHITE)
  drawQr(doc, t.qr, qx, qy, QR_MM)
  const base = qy + QR_MM + pad
  put(doc, 'SCAN AT THE ENTRANCE', sc, base + 5.2, { font: 'bold', size: 6, color: WHITE, align: 'center' })
  put(doc, 'امسح الرمز عند المدخل', sc, base + 9.2, { font: 'arabic', size: 7.5, color: WHITE, align: 'center' })
  const where = t.standing ? t.section : `SEC ${t.section}  ·  ROW ${t.row}  ·  SEAT ${t.seat}`
  put(doc, where, sc, base + 15.2, { font: 'bold', size: 7.5, color: WHITE, align: 'center', max: W_MM - STUB_X - 4 })
  put(doc, `${t.serial}   |   ${website}`, sc, H_MM - 3.2, {
    size: 5.8, color: WHITE, align: 'center', max: W_MM - STUB_X - 4,
  })

  // --- perforation and the ticket's cut-outs -------------------------
  doc.lineWidth(mm(0.35)).strokeColor(WHITE)
  for (let y = 3; y < H_MM - 3; y += 2.4) {
    doc.moveTo(mm(STUB_X + 1.2), mm(y)).lineTo(mm(STUB_X + 1.2), mm(y + 1.2))
  }
  doc.stroke()
  for (const cy of [0, H_MM]) doc.circle(mm(STUB_X), mm(cy), mm(3.6)).fill(WHITE)

  if (sample) {
    // A preview must never pass for a ticket.
    doc.save()
    doc.rotate(-14, { origin: [mm((L + R) / 2), mm(H_MM / 2)] })
    doc.fillOpacity(0.16)
    put(doc, 'SAMPLE', (L + R) / 2, H_MM / 2 + 8, { font: 'bold', size: 64, color: RED, align: 'center' })
    doc.restore()
  }
  doc.restore()
}

/**
 * One PDF, one page per ticket.
 *
 * event:   { title, date, time, venue, venueAr, city, poster: Buffer | null }
 *          (poster is already cropped to POSTER_MM — see tickets.js)
 * tickets: [{ serial, qr, holder, section, row, seat, standing }]
 */
export function renderTickets({ event, tickets, website, sample = false }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [mm(W_MM), mm(H_MM)],
      margin: 0,
      autoFirstPage: false,
      info: { Title: `Tickets — ${event.title}`, Author: 'AS Ticketing', Creator: 'AS Ticketing' },
    })
    for (const [name, file] of Object.entries(FONTS)) doc.registerFont(name, file)
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      for (const t of tickets) {
        doc.addPage()
        drawTicket(doc, event, t, website, sample)
      }
      doc.end()
    } catch (err) {
      reject(err)
    }
  })
}
