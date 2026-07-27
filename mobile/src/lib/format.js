// Small formatting helpers shared across screens. Mirrors the web's `money`
// helper and the marketing site's event-date formatting.

export const money = n => `$${Number(n || 0).toLocaleString()}`;

// Format an event date (YYYY-MM-DD) as "Thursday 18 Jun 2026".
export function formatEventDate(date) {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

// Weekday range for multi-day events, single day otherwise (matches the web).
export function eventDateLabel(ev) {
  const days = Array.isArray(ev?.dates)
    ? ev.dates
        .map(d => d?.date)
        .filter(Boolean)
        .sort()
    : [];
  if (days.length > 1) {
    const start = formatEventDate(days[0]);
    const end = formatEventDate(days[days.length - 1]);
    return start && end ? `${start} – ${end}` : start || end;
  }
  return formatEventDate(ev?.date);
}

// The last calendar day an event runs.
export function eventLastDate(ev) {
  if (!ev) return '';
  const days = Array.isArray(ev.dates)
    ? ev.dates
        .map(d => d?.date)
        .filter(Boolean)
        .sort()
    : [];
  if (days.length) return days[days.length - 1];
  return ev.date || '';
}

// True when an event's last day is already in the past.
export function isEventPast(ev) {
  const last = eventLastDate(ev);
  if (!last) return false;
  const d = new Date(`${last}T23:59:59`);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

// Order timestamp → readable date.
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// --- Product copy ------------------------------------------------------------

// Product specs arrive from the API as [label, value] PAIRS, not objects. This
// normalises whatever a row happens to be into { label, value } so a screen can
// render it without knowing the wire format:
//
//   ['Processor', 'Apple M5 Pro']  ->  { label: 'Processor', value: 'Apple M5 Pro' }
//   { label, value } / { name, value } / { key, value }  ->  passed through
//   'Backlit keyboard'             ->  { label: '', value: 'Backlit keyboard' }
export function normalizeSpecs(specs) {
  if (!Array.isArray(specs)) return [];
  const out = [];
  for (const row of specs) {
    if (Array.isArray(row)) {
      const [label, value] = row;
      if (label == null && value == null) continue;
      out.push({ label: String(label ?? '').trim(), value: String(value ?? '').trim() });
    } else if (row && typeof row === 'object') {
      const label = row.label ?? row.name ?? row.key ?? '';
      const value = row.value ?? row.val ?? '';
      out.push({ label: String(label).trim(), value: String(value).trim() });
    } else if (typeof row === 'string' && row.trim()) {
      out.push({ label: '', value: row.trim() });
    }
  }
  return out.filter(s => s.label || s.value);
}

// Some catalog descriptions are machine-written and arrive carrying research
// artefacts — markdown citation markers like "[2](https://bhphotovideo.com/…)"
// and bare URLs — which have no business on a product page and, unrendered as
// markdown, show up as a wall of raw link text.
//
// Numeric citations are dropped outright; a link with a real label keeps the
// label and loses the URL. Paragraph breaks are preserved because the teaser
// logic splits on them.
const MD_LINK = /\[([^\]\n]*)\]\((https?:\/\/[^)\s]*)\)/g;
const BARE_URL = /\bhttps?:\/\/[^\s)\]]+/g;
const CITATION = /\[\d+\]/g;

export function cleanDescription(text) {
  return String(text || '')
    .replace(MD_LINK, (_, label) => (/^\d+$/.test(label.trim()) ? '' : label))
    .replace(BARE_URL, '')
    .replace(CITATION, '')
    .split('\n')
    // Tidy up what the removals left behind — doubled spaces, a space stranded
    // before punctuation, empty brackets — without flattening the paragraphs.
    .map(line =>
      line
        .replace(/\(\s*\)|\[\s*\]/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1')
        .trim()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Human label for an order status.
export const ORDER_STATUS_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};
