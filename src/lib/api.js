import * as defaults from '../content/site.js'
import { events as defaultEvents } from '../data/events.js'
import { flagUrl } from './flags.js'

// ---------------------------------------------------------------------------
// Frontend data layer — talks to the AS Company API (Express + PostgreSQL).
// Public reads fall back to the static defaults in src/content + src/data so
// the site still renders if the backend is unreachable.
// ---------------------------------------------------------------------------

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '')
const TOKEN_KEY = 'as_admin_token'
const EMAIL_KEY = 'as_admin_email'

export const auth = {
  token: () => localStorage.getItem(TOKEN_KEY),
  email: () => localStorage.getItem(EMAIL_KEY),
  isAuthed: () => Boolean(localStorage.getItem(TOKEN_KEY)),
  set: (token, email) => {
    localStorage.setItem(TOKEN_KEY, token)
    if (email) localStorage.setItem(EMAIL_KEY, email)
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
  },
}

async function request(path, { method = 'GET', body, form, authed = false } = {}) {
  const headers = {}
  if (authed) headers.Authorization = `Bearer ${auth.token()}`
  let payload
  if (form) {
    payload = form // FormData — let the browser set the content type
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }

  const res = await fetch(`${API_URL}${path}`, { method, headers, body: payload })

  if (res.status === 401 && authed) auth.clear()
  if (!res.ok) {
    let message = 'Request failed'
    try {
      message = (await res.json()).error || message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  if (res.status === 204) return null
  return res.json()
}

// ---------------- Public site ----------------

export const defaultContent = {
  brand: defaults.brand,
  nav: defaults.nav,
  hero: defaults.hero,
  services: defaults.services,
  whatWeDo: defaults.whatWeDo,
  solutions: defaults.solutions,
  eventsSection: defaults.eventsSection,
  store: defaults.store,
  storeShowcase: defaults.storeShowcase,
  ticketing: defaults.ticketing,
  about: defaults.about,
  contact: defaults.contact,
  banners: [],
  sections: [],
  categories: [],
  popup: null,
  story: null,
  predictor: null,
  published: false,
}

const pick = (value, fallback) =>
  value === undefined || value === null || value === '' ? fallback : value

function mergeSettings(s) {
  const d = defaultContent
  return {
    ...d,
    published: Boolean(s.published),
    // Global WhatsApp number (international digits) used to build event/banner
    // "reserve" links — see whatsappBookingUrl().
    whatsappNumber: pick(s.whatsappNumber, ''),
    // Browser-tab icon (favicon); applied at runtime in ContentProvider.
    faviconUrl: pick(s.faviconUrl, ''),
    brand: {
      ...d.brand,
      name: pick(s.brandName, d.brand.name),
      legalName: pick(s.legalName, d.brand.legalName),
      tagline: pick(s.tagline, d.brand.tagline),
      logo: pick(s.logoUrl, d.brand.logo),
      logoSize: pick(s.logoSize, d.brand.logoSize),
    },
    hero: {
      ...d.hero,
      eyebrow: pick(s.heroEyebrow, d.hero.eyebrow),
      title: pick(s.heroTitle, d.hero.title),
      subtitle: pick(s.heroSubtitle, d.hero.subtitle),
      primaryCta: { ...d.hero.primaryCta, label: pick(s.heroPrimaryLabel, d.hero.primaryCta.label) },
      secondaryCta: { ...d.hero.secondaryCta, label: pick(s.heroSecondaryLabel, d.hero.secondaryCta.label) },
    },
    services: {
      ...d.services,
      heading: pick(s.servicesHeading, d.services.heading),
      subheading: pick(s.servicesSubheading, d.services.subheading),
    },
    eventsSection: {
      ...d.eventsSection,
      heading: pick(s.eventsHeading, d.eventsSection.heading),
      intro: pick(s.eventsIntro, d.eventsSection.intro),
    },
    about: {
      ...d.about,
      heading: pick(s.aboutHeading, d.about.heading),
      body: Array.isArray(s.aboutBody) && s.aboutBody.length ? s.aboutBody : d.about.body,
      stats: Array.isArray(s.aboutStats) && s.aboutStats.length ? s.aboutStats : d.about.stats,
    },
    contact: {
      ...d.contact,
      heading: pick(s.contactHeading, d.contact.heading),
      subheading: pick(s.contactSubheading, d.contact.subheading),
      email: pick(s.contactEmail, d.contact.email),
      whatsapp: pick(s.contactWhatsapp, d.contact.whatsapp),
      instagram: pick(s.contactInstagram, d.contact.instagram),
      instagramHandle: pick(s.contactInstagramHandle, d.contact.instagramHandle),
    },
    store: {
      ...d.store,
      title: pick(s.storeTitle, d.store.title),
      eyebrow: pick(s.storeEyebrow, d.store.eyebrow),
      description: pick(s.storeDescription, d.store.description),
      url: pick(s.storeUrl, d.store.url),
    },
  }
}

export function mapEvent(e) {
  return {
    id: e.slug, // used in the URL
    recordId: e.id, // used to link reservations
    title: e.title,
    date: e.date,
    time: e.time,
    venue: e.venue,
    city: e.city,
    image: e.imageUrl,
    ticketUrl: e.ticketUrl || '',
    status: e.status || 'open',
    excerpt: e.excerpt,
    description: e.description,
    categoryId: e.categoryId || null,
    categorySlug: e.categorySlug || '',
    categoryName: e.categoryName || '',
    dates: Array.isArray(e.dates) ? e.dates : [],
  }
}

export function mapBanner(b) {
  return {
    id: b.id,
    title: b.title,
    subtitle: b.subtitle,
    image: b.imageUrl,
    link: b.linkUrl || '',
    active: b.active !== false,
    eventId: b.eventId || null,
    focalX: b.focalX === undefined || b.focalX === null ? 50 : Number(b.focalX),
    focalY: b.focalY === undefined || b.focalY === null ? 50 : Number(b.focalY),
  }
}

export function mapCategory(c) {
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    image: c.imageUrl || '',
    visible: c.visible !== false,
  }
}

// Format an event date (YYYY-MM-DD) with weekday, e.g. "Thursday 18 Jun 2026".
function formatBannerDate(date) {
  if (!date) return ''
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

// The date label shown under the banner title: a weekday range for multi-day
// events ("Thursday 18 Jun 2026 - Friday 03 Jul 2026"), otherwise a single day.
function eventDateLabel(ev) {
  const days = Array.isArray(ev.dates) ? ev.dates.map((d) => d?.date).filter(Boolean).sort() : []
  if (days.length > 1) {
    const start = formatBannerDate(days[0])
    const end = formatBannerDate(days[days.length - 1])
    return start && end ? `${start} - ${end}` : start || end
  }
  return formatBannerDate(ev.date)
}

// Build a WhatsApp "click to chat" link for an event: opens a chat with the
// admin-configured number, pre-filled with the event details so the visitor
// just hits send. Returns '' when no number is set, so callers can fall back to
// the original ticket link. The mapped event carries title/date/venue/ticketUrl.
export function whatsappBookingUrl(number, event) {
  const digits = String(number || '').replace(/\D/g, '')
  if (!digits || !event) return ''
  const location = [event.venue, event.city].filter(Boolean).join(', ')
  const details = [
    event.title && `🎫 ${event.title}`,
    eventDateLabel(event) && `📅 ${eventDateLabel(event)}`,
    location && `📍 ${location}`,
    event.ticketUrl && `🔗 ${event.ticketUrl}`,
  ].filter(Boolean)
  const message = [
    "Hello👋 I'd like more details about this event:",
    '',
    ...details,
    '',
    'Is it still available, and how can I reserve a spot?',
  ].join('\n')
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

// A banner can be "driven" by an event: it then borrows the event's image,
// title and link, so updating the event updates the banner automatically.
// Any field the admin typed on the banner still wins.
function resolveBanner(banner, events) {
  if (!banner.eventId) return banner
  const ev = events.find((e) => e.recordId === banner.eventId)
  if (!ev) return banner
  const dateLabel = eventDateLabel(ev)
  return {
    ...banner,
    image: banner.image || ev.image,
    title: banner.title || ev.title,
    subtitle: banner.subtitle || dateLabel || [ev.venue, ev.city].filter(Boolean).join(', ') || ev.excerpt,
    // Borrow the event's reserve link (WhatsApp when configured, else its ticket
    // URL); a link the admin typed on the banner still wins.
    link: banner.link || ev.bookingUrl || ev.ticketUrl || `/events/${ev.id}`,
  }
}

export function mapSection(s) {
  return {
    id: s.id,
    eyebrow: s.eyebrow,
    heading: s.heading,
    body: s.body || '',
    image: s.imageUrl || '',
    buttonLabel: s.buttonLabel || '',
    buttonUrl: s.buttonUrl || '',
    theme: s.theme === 'dark' ? 'dark' : 'light',
    visible: s.visible !== false,
  }
}

export function mapStoreProduct(p) {
  return {
    id: p.id,
    name: p.name || '',
    image: p.imageUrl || '',
    link: p.linkUrl || '',
    visible: p.visible !== false,
  }
}

// Combine the showcase section row (copy + flags) with its products. Falls back
// to the static defaults for any empty copy field so the section never looks
// broken; products come straight from the DB (empty = section hidden).
function mapStoreShowcase(meta, products) {
  const d = defaultContent.storeShowcase
  const mapped = Array.isArray(products) ? products.map(mapStoreProduct).filter((p) => p.visible) : []
  if (!meta) return { ...d, products: mapped }
  return {
    enabled: meta.enabled !== false,
    eyebrow: pick(meta.eyebrow, d.eyebrow),
    heading: pick(meta.heading, d.heading),
    subheading: pick(meta.subheading, d.subheading),
    visibleCount: Number(meta.visibleCount) || d.visibleCount,
    products: mapped,
  }
}

export function mapStoryPanel(p) {
  return {
    id: p.id,
    heading: p.heading || '',
    caption: p.caption || '',
    image: p.imageUrl || '',
    accent: p.accent || '',
    accent2: p.accent2 || '',
    gradientType: p.gradientType || 'linear',
    link: p.linkUrl || '',
    buttonEnabled: p.buttonEnabled === true,
    buttonLabel: p.buttonLabel || 'Explore',
    size: p.size || 'md',
    fit: p.fit || 'cover',
    fontSize: p.fontSize || 'md',
    visible: p.visible !== false,
  }
}

// The horizontal scroll-story: section copy + its ordered, visible panels.
// Hidden (null) unless enabled with at least one visible panel.
function mapStory(meta, panels) {
  const list = Array.isArray(panels) ? panels.map(mapStoryPanel).filter((p) => p.visible) : []
  if (!meta || meta.enabled === false || list.length === 0) return null
  return {
    eyebrow: meta.eyebrow || '',
    heading: meta.heading || '',
    subheading: meta.subheading || '',
    panels: list,
  }
}

export function mapSolution(s) {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title || '',
    summary: s.summary || '',
    icon: s.icon || 'chip',
    image: s.imageUrl || '',
    intro: s.intro || '',
    outro: s.outro || '',
    items: Array.isArray(s.items) ? s.items.filter((it) => it && (it.title || it.description)) : [],
    sort: s.sort || 0,
    visible: s.visible !== false,
  }
}

// The "What We Do" (Absolute Solution) page copy. Falls back to the static
// defaults for any empty field so the page never looks broken.
function mapWhatWeDo(meta) {
  const d = defaultContent.whatWeDo
  if (!meta) return d
  return {
    enabled: meta.enabled !== false,
    eyebrow: pick(meta.eyebrow, d.eyebrow),
    title: pick(meta.title, d.title),
    intro: Array.isArray(meta.intro) && meta.intro.length ? meta.intro : d.intro,
    solutionsHeading: pick(meta.solutionsHeading, d.solutionsHeading),
    solutionsIntro: pick(meta.solutionsIntro, d.solutionsIntro),
    visionHeading: pick(meta.visionHeading, d.visionHeading),
    vision: pick(meta.vision, d.vision),
    missionHeading: pick(meta.missionHeading, d.missionHeading),
    mission: pick(meta.mission, d.mission),
    divisionsHeading: pick(meta.divisionsHeading, d.divisionsHeading),
    divisionsIntro: pick(meta.divisionsIntro, d.divisionsIntro),
    divisions: Array.isArray(meta.divisions) && meta.divisions.length ? meta.divisions : d.divisions,
  }
}

export function mapPopup(p) {
  if (!p) return null
  return {
    enabled: p.enabled === true,
    title: p.title || '',
    body: p.body || '',
    image: p.imageUrl || '',
    link: p.linkUrl || '',
    linkLabel: p.linkLabel || '',
    trigger: p.trigger === 'scroll' ? 'scroll' : 'load',
    delaySeconds: Number(p.delaySeconds) || 0,
    scrollPercent: Number(p.scrollPercent) || 0,
    // Changes whenever the admin saves — used to re-show a "seen" popup.
    version: p.updatedAt ? String(p.updatedAt) : '1',
  }
}

export function mapPredictorMatch(m) {
  return {
    id: m.id,
    stage: m.stage || '',
    teamA: m.teamA || '',
    teamB: m.teamB || '',
    flagA: flagUrl(m.teamACode, m.teamAFlag),
    flagB: flagUrl(m.teamBCode, m.teamBFlag),
    kickoff: m.kickoff || null,
    visible: m.visible !== false,
  }
}

// The World Cup predictor game: config row + its visible matches. Hidden (null)
// unless enabled with at least one visible match. `closed` is true once the
// admin closes it or the deadline passes — the form then becomes read-only.
function mapPredictor(meta, matches) {
  if (!meta || meta.enabled === false) return null
  const list = Array.isArray(matches) ? matches.map(mapPredictorMatch).filter((m) => m.visible) : []
  if (!list.length) return null
  const deadlinePassed = meta.deadline ? new Date(meta.deadline).getTime() < Date.now() : false
  return {
    title: meta.title || 'Predict & Win',
    subtitle: meta.subtitle || '',
    intro: meta.intro || '',
    prize: {
      enabled: meta.prizeEnabled !== false,
      title: meta.prizeTitle || '',
      description: meta.prizeDescription || '',
      image: meta.prizeImageUrl || '',
    },
    deadline: meta.deadline || null,
    closed: meta.closed === true || deadlinePassed,
    successMessage: meta.successMessage || '',
    matches: list,
  }
}

// Submit a public prediction entry. picks = [{ matchId, scoreA, scoreB }].
export const submitPrediction = (data) =>
  request('/api/predictions', { method: 'POST', body: data })

export async function loadSite() {
  try {
    const [settings, services, events, banners, sections, categories, popup, storeMeta, storeProducts, storyMeta, storyPanels, whatWeDoMeta, solutionsList, predictorMeta, predictorMatches] =
      await Promise.all([
        request('/api/settings'),
        request('/api/services'),
        request('/api/events'),
        request('/api/banners').catch(() => []),
        request('/api/sections').catch(() => []),
        request('/api/categories').catch(() => []),
        request('/api/popup').catch(() => null),
        request('/api/store-showcase').catch(() => null),
        request('/api/store-products').catch(() => []),
        request('/api/story').catch(() => null),
        request('/api/story-panels').catch(() => []),
        request('/api/what-we-do').catch(() => null),
        request('/api/solutions').catch(() => []),
        request('/api/predictor').catch(() => null),
        request('/api/predictor-matches').catch(() => []),
      ])
    const content = settings ? mergeSettings(settings) : { ...defaultContent }
    if (Array.isArray(services) && services.length) {
      content.services = {
        ...content.services,
        items: services.map((s) => ({ title: s.title, description: s.description, icon: s.icon || 'chip' })),
      }
    }
    const baseEvents = Array.isArray(events) && events.length ? events.map(mapEvent) : defaultEvents
    // Attach a "reserve" link to every event: a pre-filled WhatsApp chat when a
    // number is configured, otherwise the original ticket URL. Cards, banners
    // and the detail CTA all open this.
    const mappedEvents = baseEvents.map((e) => ({
      ...e,
      bookingUrl: whatsappBookingUrl(content.whatsappNumber, e) || e.ticketUrl,
    }))
    content.banners = Array.isArray(banners)
      ? banners.map(mapBanner).map((b) => resolveBanner(b, mappedEvents)).filter((b) => b.active && b.image)
      : []
    content.sections = Array.isArray(sections) ? sections.map(mapSection).filter((s) => s.visible) : []
    content.categories = Array.isArray(categories) ? categories.map(mapCategory).filter((c) => c.visible) : []
    content.popup = mapPopup(popup)
    content.storeShowcase = mapStoreShowcase(storeMeta, storeProducts)
    content.story = mapStory(storyMeta, storyPanels)
    content.predictor = mapPredictor(predictorMeta, predictorMatches)
    content.whatWeDo = mapWhatWeDo(whatWeDoMeta)
    // Solutions from the DB (visible only); fall back to the static defaults so
    // the What We Do page still has content if the table is empty / API is down.
    const mappedSolutions = Array.isArray(solutionsList) ? solutionsList.map(mapSolution).filter((s) => s.visible) : []
    content.solutions = mappedSolutions.length ? mappedSolutions : defaultContent.solutions
    return { content, events: mappedEvents }
  } catch {
    return null
  }
}

// ---------------- Admin auth ----------------

export async function adminLogin(email, password) {
  const { token } = await request('/api/auth/login', { method: 'POST', body: { email, password } })
  auth.set(token, email)
  return token
}

// ---------------- Admin CRUD ----------------

export const adminApi = {
  getSettings: () => request('/api/settings'),
  saveSettings: (data) => request('/api/settings', { method: 'PUT', body: data, authed: true }),

  listServices: () => request('/api/services'),
  createService: (data) => request('/api/services', { method: 'POST', body: data, authed: true }),
  updateService: (id, data) => request(`/api/services/${id}`, { method: 'PUT', body: data, authed: true }),
  deleteService: (id) => request(`/api/services/${id}`, { method: 'DELETE', authed: true }),

  listEvents: () => request('/api/events'),
  createEvent: (data) => request('/api/events', { method: 'POST', body: data, authed: true }),
  updateEvent: (id, data) => request(`/api/events/${id}`, { method: 'PUT', body: data, authed: true }),
  deleteEvent: (id) => request(`/api/events/${id}`, { method: 'DELETE', authed: true }),

  listBanners: () => request('/api/banners'),
  createBanner: (data) => request('/api/banners', { method: 'POST', body: data, authed: true }),
  updateBanner: (id, data) => request(`/api/banners/${id}`, { method: 'PUT', body: data, authed: true }),
  deleteBanner: (id) => request(`/api/banners/${id}`, { method: 'DELETE', authed: true }),

  listSections: () => request('/api/sections'),
  createSection: (data) => request('/api/sections', { method: 'POST', body: data, authed: true }),
  updateSection: (id, data) => request(`/api/sections/${id}`, { method: 'PUT', body: data, authed: true }),
  deleteSection: (id) => request(`/api/sections/${id}`, { method: 'DELETE', authed: true }),

  listCategories: () => request('/api/categories'),
  createCategory: (data) => request('/api/categories', { method: 'POST', body: data, authed: true }),
  updateCategory: (id, data) => request(`/api/categories/${id}`, { method: 'PUT', body: data, authed: true }),
  deleteCategory: (id) => request(`/api/categories/${id}`, { method: 'DELETE', authed: true }),

  getPopup: () => request('/api/popup'),
  savePopup: (data) => request('/api/popup', { method: 'PUT', body: data, authed: true }),

  getStoreShowcase: () => request('/api/store-showcase'),
  saveStoreShowcase: (data) => request('/api/store-showcase', { method: 'PUT', body: data, authed: true }),
  listStoreProducts: () => request('/api/store-products'),
  createStoreProduct: (data) => request('/api/store-products', { method: 'POST', body: data, authed: true }),
  updateStoreProduct: (id, data) => request(`/api/store-products/${id}`, { method: 'PUT', body: data, authed: true }),
  deleteStoreProduct: (id) => request(`/api/store-products/${id}`, { method: 'DELETE', authed: true }),

  getStory: () => request('/api/story'),
  saveStory: (data) => request('/api/story', { method: 'PUT', body: data, authed: true }),
  listStoryPanels: () => request('/api/story-panels'),
  createStoryPanel: (data) => request('/api/story-panels', { method: 'POST', body: data, authed: true }),
  updateStoryPanel: (id, data) => request(`/api/story-panels/${id}`, { method: 'PUT', body: data, authed: true }),
  deleteStoryPanel: (id) => request(`/api/story-panels/${id}`, { method: 'DELETE', authed: true }),

  getWhatWeDo: () => request('/api/what-we-do'),
  saveWhatWeDo: (data) => request('/api/what-we-do', { method: 'PUT', body: data, authed: true }),
  listSolutions: () => request('/api/solutions'),
  createSolution: (data) => request('/api/solutions', { method: 'POST', body: data, authed: true }),
  updateSolution: (id, data) => request(`/api/solutions/${id}`, { method: 'PUT', body: data, authed: true }),
  deleteSolution: (id) => request(`/api/solutions/${id}`, { method: 'DELETE', authed: true }),

  getPredictor: () => request('/api/predictor'),
  savePredictor: (data) => request('/api/predictor', { method: 'PUT', body: data, authed: true }),
  listPredictorMatches: () => request('/api/predictor-matches'),
  createPredictorMatch: (data) => request('/api/predictor-matches', { method: 'POST', body: data, authed: true }),
  updatePredictorMatch: (id, data) => request(`/api/predictor-matches/${id}`, { method: 'PUT', body: data, authed: true }),
  deletePredictorMatch: (id) => request(`/api/predictor-matches/${id}`, { method: 'DELETE', authed: true }),
  listPredictions: () => request('/api/predictions', { authed: true }),
  deletePrediction: (id) => request(`/api/predictions/${id}`, { method: 'DELETE', authed: true }),

  startScrape: (data) => request('/api/scrape', { method: 'POST', body: data, authed: true }),
  startEventsScrape: (data) => request('/api/scrape/events', { method: 'POST', body: data || {}, authed: true }),
  getScrape: (id) => request(`/api/scrape/${id}`, { authed: true }),

  upload: async (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/api/uploads', { method: 'POST', form, authed: true })
  },
}

// Download an authed file (the API requires a Bearer token, so we can't use a
// plain <a href>): fetch it as a blob and trigger a browser download.
async function downloadAuthed(path, filename) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { Authorization: `Bearer ${auth.token()}` },
  })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

export const downloadScrapeFile = (id, name) =>
  downloadAuthed(`/api/scrape/${id}/files/${encodeURIComponent(name)}`, name)

export const downloadScrapeZip = (id) =>
  downloadAuthed(`/api/scrape/${id}/zip`, `scrape-${id}.zip`)
