// Seat picking, in the app.
//
// A deliberate mirror of as_ticketing/src/lib/seatmap.js — the ticketing hub's
// copy — for the same reason lib/events.js mirrors the marketing site's: a
// customer who picks seats on ticketing.as.com.lb and one who picks them here
// have to be offered the same thing, worded the same way, and end up sending
// the same WhatsApp message. If you change the wording there, change it here.
//
// Everything it reads comes from one endpoint on the marketing site's API
// (server/src/seatmap.js), which reads the partner's own page on demand. There
// is no mobile-specific server and no copy of the parser here.

import { WEBSITE_API_URL } from '@/src/config/env';
import { formatEventDate } from './format';

/**
 * `night` is a row out of `event.dates`, not just its date: a run can play
 * twice in one day, each show its own hall with its own seats sold, and a date
 * on its own would always fetch the earlier one.
 */
function nightQuery(night) {
  const params = [];
  if (night?.date) params.push(`date=${encodeURIComponent(night.date)}`);
  if (night?.time) params.push(`time=${encodeURIComponent(night.time)}`);
  return params.length ? `?${params.join('&')}` : '';
}

export const seatmapUrl = (slug, night) => `${WEBSITE_API_URL}/api/events/${encodeURIComponent(slug)}/seatmap${nightQuery(night)}`;

/** The seats inside one block of a map that has blocks (ihjoz). */
export const seatmapSectionUrl = (slug, sid, night) =>
  `${WEBSITE_API_URL}/api/events/${encodeURIComponent(slug)}/seatmap/sections/${encodeURIComponent(sid)}${nightQuery(night)}`;

// The three partners the sync pulls from all publish their hall to an anonymous
// browser, and the API has a reader for each. Anything else — a hand-made
// event, a fourth site — has no map, and asking would be a wasted request on
// most of the calendar.
const SOURCES = /(^|\.)(ticketingboxoffice\.com|ihjoz\.com|tickit\.co)$/i;

const hostOf = url => {
  const m = String(url || '').match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : '';
};

export function hasSeatmap(event) {
  const urls = [event?.ticketUrl, ...((event?.dates || []).map(d => d?.url))].filter(Boolean);
  return urls.some(u => SOURCES.test(hostOf(u)));
}

export const seatMoney = (amount, currency = 'USD') => {
  const n = Number(amount) || 0;
  const value = Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);
  return currency === 'USD' ? `$${value}` : `${value} ${currency}`;
};

/**
 * Some halls label a seat with something that isn't a number — a lounge sells
 * a place at a table and calls every one of them "XXX". Numbering that would
 * invent detail the box office never gave us.
 */
export const isNumberedSeat = num => /\d/.test(String(num || ''));

/** "Salle — Row B" / "LOUNGES — L 1" / "Row B", whichever parts exist. */
export const seatPlace = seat => [seat.section, seat.row && `Row ${seat.row}`].filter(Boolean).join(' — ');

/**
 * The WhatsApp message: what they picked, what it comes to, and a question.
 *
 * Seats are grouped by their place so a family of four reads as one line, and
 * the totals are stated because the visitor has already seen them on screen —
 * a message that drops them makes the conversation start with "how much?".
 *
 * The wording asks whether the seats are still free. That is deliberate and it
 * is not a formality: nothing here holds a seat, so the reply has to be able to
 * be "that one just went, here is what's next to it".
 */
export function whatsappSeatsUrl(number, { event, date, seats = [], zones = [], currency = 'USD' }) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits || (!seats.length && !zones.length)) return '';

  const where = [event?.venue, event?.city].filter(Boolean).join(', ');
  const lines = [
    "Hello 👋 I'd like to reserve these tickets:",
    '',
    event?.title && `🎫 ${event.title}`,
    date ? `📅 ${formatEventDate(date)}` : null,
    where && `📍 ${where}`,
    ''
  ].filter(l => l !== null && l !== undefined && l !== false);

  // Seats, grouped by section + row.
  const groups = new Map();
  for (const s of seats) {
    const key = `${seatPlace(s)}|${s.price}`;
    const g = groups.get(key) || { place: seatPlace(s), price: s.price, nums: [] };
    g.nums.push(isNumberedSeat(s.num) ? s.num : null);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    const numbered = g.nums.filter(Boolean);
    const label = numbered.length
      ? `${numbered.length > 1 ? 'seats' : 'seat'} ${numbered.join(', ')}`
      : `${g.nums.length} ${g.nums.length > 1 ? 'places' : 'place'}`;
    const each = g.nums.length > 1 ? ' each' : '';
    lines.push(`🪑 ${[g.place, label].filter(Boolean).join(', ')} — ${seatMoney(g.price, currency)}${each}`);
  }

  // Zones (halls with no numbered seats, or a block we couldn't draw).
  for (const z of zones) {
    lines.push(`🪑 ${z.qty} × ${z.name} — ${seatMoney(z.price, currency)}${z.qty > 1 ? ' each' : ''}`);
  }

  const total =
    seats.reduce((sum, s) => sum + (Number(s.price) || 0), 0) +
    zones.reduce((sum, z) => sum + (Number(z.price) || 0) * (Number(z.qty) || 0), 0);
  const count = seats.length + zones.reduce((n, z) => n + (Number(z.qty) || 0), 0);

  lines.push('');
  lines.push(`💵 Total: ${seatMoney(total, currency)} for ${count} ${count === 1 ? 'ticket' : 'tickets'}`);
  lines.push('');
  lines.push('Are these still available?');

  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/**
 * Grey out the blocks that are not on sale, in the partner's own drawing.
 *
 * On the web the states are attributes on live DOM nodes and CSS paints them.
 * There is no DOM here: react-native-svg parses the markup into native views
 * once and nothing can reach in afterwards, so a state change means handing it
 * a new string and re-parsing the lot. One of these halls is 60 KB and 88
 * blocks, and re-parsing that on every tap is precisely the kind of work that
 * makes a screen feel broken.
 *
 * So only the one thing that cannot change while you are looking at it gets
 * painted — what is on sale — and this runs once per hall. What you have
 * *picked* is shown in the list underneath and in the chips above the button,
 * which are cheap to re-render and are also where the tapping happens (a 7×14dp
 * table is not something to ask a thumb to hit).
 */
export function paintSections(svg, sections) {
  if (!svg) return '';
  const off = new Set((sections || []).filter(s => !s.inStock).map(s => s.id));
  if (!off.size) return String(svg);

  // Into the `style`, NOT as an `opacity` attribute. ihjoz ships every block
  // with an inline `style="…opacity:0.5…"`, and in SVG a presentation attribute
  // loses to the style attribute — so `opacity="0.25"` on the tag is silently
  // ignored and a sold-out block renders exactly like an available one. The
  // appended declaration wins because it comes last in the same style.
  return String(svg).replace(/<[a-zA-Z][^>]*\bdata-sid="([^"]*)"[^>]*>/g, (tag, id) => {
    if (!off.has(id)) return tag;
    return /\bstyle="/.test(tag)
      ? tag.replace(/\bstyle="([^"]*)"/, (_, css) => `style="${css};opacity:0.25"`)
      : tag.replace(/\bdata-sid="/, 'style="opacity:0.25" data-sid="');
  });
}

/** react-native-svg wants a whole document; the API sends inner markup only. */
export const svgDocument = map =>
  map?.svg ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${map.viewBox || '0 0 1000 1000'}">${map.svg}</svg>` : '';
