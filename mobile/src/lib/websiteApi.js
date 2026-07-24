// AS Company (marketing) API client. Loads the site content in one shot
// (settings, services, events, what-we-do, solutions, predictor…) and reshapes
// the API JSON into the shapes the screens consume — a trimmed port of the web
// app's src/lib/api.js. Everything fails soft to the static defaults.

import { WEBSITE_API_URL } from '@/src/config/env';
import { defaultWebsiteContent } from '@/src/content/websiteDefaults';
import { whatsappBookingUrl } from './whatsapp';
import { eventDateLabel } from './format';

const API = WEBSITE_API_URL;

async function req(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body != null) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      message = (await res.json()).error || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

const pick = (v, fallback) => (v === undefined || v === null || v === '' ? fallback : v);

// ---- Mappers (API JSON → screen shapes) ----
export function mapEvent(e) {
  return {
    id: e.slug,
    recordId: e.id,
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
    categorySlug: e.categorySlug || '',
    categoryName: e.categoryName || '',
    dates: Array.isArray(e.dates) ? e.dates : []
  };
}

function mapSolution(s) {
  return {
    id: s.id,
    slug: s.slug,
    title: s.title || '',
    summary: s.summary || '',
    icon: s.icon || 'chip',
    image: s.imageUrl || '',
    intro: s.intro || '',
    outro: s.outro || '',
    items: Array.isArray(s.items) ? s.items.filter(it => it && (it.title || it.description)) : [],
    sort: s.sort || 0,
    visible: s.visible !== false
  };
}

function mapCategory(c) {
  return { id: c.id, name: c.name, slug: c.slug, image: c.imageUrl || '', visible: c.visible !== false };
}

function mapWhatWeDo(meta) {
  const d = defaultWebsiteContent.whatWeDo;
  if (!meta) return d;
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
    divisions: Array.isArray(meta.divisions) && meta.divisions.length ? meta.divisions : d.divisions
  };
}

function mergeSettings(s) {
  const d = defaultWebsiteContent;
  return {
    ...d,
    published: Boolean(s.published),
    whatsappNumber: pick(s.whatsappNumber, ''),
    brand: { ...d.brand, name: pick(s.brandName, d.brand.name), legalName: pick(s.legalName, d.brand.legalName), tagline: pick(s.tagline, d.brand.tagline), logo: pick(s.logoUrl, '') },
    hero: { ...d.hero, eyebrow: pick(s.heroEyebrow, d.hero.eyebrow), title: pick(s.heroTitle, d.hero.title), subtitle: pick(s.heroSubtitle, d.hero.subtitle) },
    services: { ...d.services, heading: pick(s.servicesHeading, d.services.heading), subheading: pick(s.servicesSubheading, d.services.subheading) },
    eventsSection: { ...d.eventsSection, heading: pick(s.eventsHeading, d.eventsSection.heading), intro: pick(s.eventsIntro, d.eventsSection.intro) },
    about: { ...d.about, heading: pick(s.aboutHeading, d.about.heading), body: Array.isArray(s.aboutBody) && s.aboutBody.length ? s.aboutBody : d.about.body, stats: Array.isArray(s.aboutStats) && s.aboutStats.length ? s.aboutStats : d.about.stats },
    contact: { ...d.contact, heading: pick(s.contactHeading, d.contact.heading), subheading: pick(s.contactSubheading, d.contact.subheading), email: pick(s.contactEmail, d.contact.email), whatsapp: pick(s.contactWhatsapp, d.contact.whatsapp), instagram: pick(s.contactInstagram, d.contact.instagram), instagramHandle: pick(s.contactInstagramHandle, d.contact.instagramHandle) },
    store: { ...d.store, title: pick(s.storeTitle, d.store.title), eyebrow: pick(s.storeEyebrow, d.store.eyebrow), description: pick(s.storeDescription, d.store.description), url: pick(s.storeUrl, d.store.url) }
  };
}

function mapPredictor(meta, matches) {
  if (!meta || meta.enabled === false) return null;
  const list = Array.isArray(matches) ? matches.filter(m => m.visible !== false).map(m => ({ id: m.id, stage: m.stage || '', teamA: m.teamA || '', teamB: m.teamB || '', logoA: m.teamAFlag || '', logoB: m.teamBFlag || '', kickoff: m.kickoff || null })) : [];
  if (!list.length) return null;
  const deadlinePassed = meta.deadline ? new Date(meta.deadline).getTime() < Date.now() : false;
  return {
    title: meta.title || 'Guess the Score',
    subtitle: meta.subtitle || '',
    intro: meta.intro || '',
    prize: { enabled: meta.prizeEnabled !== false, title: meta.prizeTitle || '', description: meta.prizeDescription || '', image: meta.prizeImageUrl || '', amount: meta.prizeAmount || '' },
    shareUrl: meta.shareUrl || 'https://store.as.com.lb',
    shareMessage: meta.shareMessage || '',
    terms: Array.isArray(meta.terms) ? meta.terms.filter(Boolean) : [],
    deadline: meta.deadline || null,
    closed: meta.closed === true || deadlinePassed,
    successMessage: meta.successMessage || '',
    matches: list,
    match: list[0]
  };
}

// Load the whole marketing site content in one call. Returns { content, events }
// or null when the API is unreachable (screens fall back to defaults).
export async function loadWebsiteContent() {
  try {
    const [settings, services, events, categories, whatWeDoMeta, solutionsList, predictorMeta, predictorMatches] = await Promise.all([req('/api/settings'), req('/api/services').catch(() => []), req('/api/events').catch(() => []), req('/api/categories').catch(() => []), req('/api/what-we-do').catch(() => null), req('/api/solutions').catch(() => []), req('/api/predictor').catch(() => null), req('/api/predictor-matches').catch(() => [])]);

    const content = settings ? mergeSettings(settings) : { ...defaultWebsiteContent };

    if (Array.isArray(services) && services.length) {
      content.services = {
        ...content.services,
        items: services.map(s => ({ title: s.title, description: s.description, icon: s.icon || 'chip' }))
      };
    }

    const mappedEvents = (Array.isArray(events) ? events.map(mapEvent) : []).map(e => ({
      ...e,
      bookingUrl: whatsappBookingUrl(content.whatsappNumber, e) || e.ticketUrl,
      dateLabel: eventDateLabel(e)
    }));

    content.categories = Array.isArray(categories) ? categories.map(mapCategory).filter(c => c.visible) : [];
    content.whatWeDo = mapWhatWeDo(whatWeDoMeta);
    const mappedSolutions = Array.isArray(solutionsList) ? solutionsList.map(mapSolution).filter(s => s.visible) : [];
    content.solutions = mappedSolutions.length ? mappedSolutions : defaultWebsiteContent.solutions;
    content.predictor = mapPredictor(predictorMeta, predictorMatches);

    return { content, events: mappedEvents };
  } catch {
    return null;
  }
}

// Submit a public prediction entry (Guess the Score).
export const submitPrediction = data => req('/api/predictions', { method: 'POST', body: data });

export { req as websiteRequest, API as WEBSITE_API };
