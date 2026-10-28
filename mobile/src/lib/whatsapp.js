// Event reservation over WhatsApp — the mobile port of the web's
// `whatsappBookingUrl`. Builds a pre-filled wa.me link (opens the WhatsApp app
// on device) with the event details, so a visitor just hits send. Nothing falls
// back to the partner's ticket URL: the button is never the site we list an
// event from. The message does carry the event's direct link at its source
// (eventRefs()), so staff open the listing they buy from in one tap.

import { Linking } from 'react-native';
import { TICKETING_WEB_URL } from '@/src/config/env';
import { eventDateLabel } from './format';
import { AS_TICKETING, sourceOf } from './sources';

export function whatsappBookingUrl(number, event, { source = '', link = '' } = {}) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits || !event) return '';
  const location = [event.venue, event.city].filter(Boolean).join(', ');
  const details = [
    event.title && `🎫 ${event.title}`,
    eventDateLabel(event) && `📅 ${eventDateLabel(event)}`,
    location && `📍 ${location}`,
    source && `🏷️ Source: ${source}`,
    link && `🔗 ${link}`
  ].filter(Boolean);
  const message = ["Hello👋 I'd like more details about this event:", '', ...details, '', 'Is it still available, and how can I reserve a spot?'].join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// The event's page on the ticketing hub. The app's `id` is the event's slug,
// which is exactly what the hub's URLs carry (`/events/<slug>`).
export const eventPageUrl = event => (event?.id ? `${TICKETING_WEB_URL}/events/${encodeURIComponent(event.id)}` : '');

// What every reservation message says beyond the title, date and venue: the
// source its card names and the event's direct link there — the partner's own
// page for it (the night's own page, for one night), or the hub page for an
// event AS hosts or a partner row with no link. The hub's own eventRefs(), so a
// message sent from the phone reads like one sent from the website. The partner
// link in the message is the owner's call (2026-10-28); nothing in the app
// opens it.
export function eventRefs(event, night) {
  const source = sourceOf(event);
  const partner = source === AS_TICKETING ? '' : [night?.url, event?.ticketUrl].find(isWebUrl);
  return { source: source?.name || '', link: partner || eventPageUrl(event) };
}

const isWebUrl = url => typeof url === 'string' && /^https?:\/\//i.test(url);

// An event AS hosts itself — made in the admin, not pulled in by the sync.
export const isHostedEvent = event => sourceOf(event) === AS_TICKETING;

// The reserve link for an event. One AS hosts is booked on its hub page: the
// seat map, the 24-hour hold and Whish all live there, and the app draws none of
// them. Anything else is our WhatsApp, or '' with no number set — never the
// partner's page.
export function eventBookingUrl(whatsappNumber, event) {
  if (isHostedEvent(event)) return eventPageUrl(event);
  return whatsappBookingUrl(whatsappNumber, event, eventRefs(event));
}

// Open a WhatsApp chat with a plain number (used for the store's max-qty note).
export function whatsappChatUrl(number, text) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

// Open any external URL (http/https/wa.me/mailto/tel). Safe no-op on failure.
export async function openUrl(url) {
  if (!url) return false;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
