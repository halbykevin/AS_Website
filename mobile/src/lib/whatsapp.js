// Event reservation over WhatsApp — the mobile port of the web's
// `whatsappBookingUrl`. Builds a pre-filled wa.me link (opens the WhatsApp app
// on device) with the event details, so a visitor just hits send. Falls back to
// the event's ticket URL when no number is configured.

import { Linking } from 'react-native';
import { eventDateLabel } from './format';

export function whatsappBookingUrl(number, event) {
  const digits = String(number || '').replace(/\D/g, '');
  if (!digits || !event) return '';
  const location = [event.venue, event.city].filter(Boolean).join(', ');
  const details = [event.title && `🎫 ${event.title}`, eventDateLabel(event) && `📅 ${eventDateLabel(event)}`, location && `📍 ${location}`, event.ticketUrl && `🔗 ${event.ticketUrl}`].filter(Boolean);
  const message = ["Hello👋 I'd like more details about this event:", '', ...details, '', 'Is it still available, and how can I reserve a spot?'].join('\n');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

// The reserve link for an event: WhatsApp when a number is set, else ticket URL.
export function eventBookingUrl(whatsappNumber, event) {
  return whatsappBookingUrl(whatsappNumber, event) || event?.ticketUrl || '';
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
