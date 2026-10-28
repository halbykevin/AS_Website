// Runtime configuration — the two API base URLs the app talks to.
//
// Resolution order (first wins):
//   1. EXPO_PUBLIC_* env vars (from .env / the shell) — great for dev + EAS.
//   2. app.json → expo.extra defaults — the committed fallback.
//
// On a physical device `localhost` is the phone itself, so point these at your
// machine's LAN IP (see .env.example).

import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {};

const stripSlash = u => String(u || '').replace(/\/$/, '');

export const WEBSITE_API_URL = stripSlash(process.env.EXPO_PUBLIC_WEBSITE_API_URL || extra.websiteApiUrl || 'https://asapi.as.com.lb');

export const STORE_API_URL = stripSlash(process.env.EXPO_PUBLIC_STORE_API_URL || extra.storeApiUrl || 'https://store-api.as.com.lb');

// The customer-facing store *website* (not the API). The app links out to it for
// the pages that must exist somewhere public and stay in one place — the privacy
// policy above all, which both app stores require to be reachable from a URL
// they can review.
export const STORE_WEB_URL = stripSlash(process.env.EXPO_PUBLIC_STORE_WEB_URL || extra.storeWebUrl || 'https://store.as.com.lb');

// The ticketing hub's *website* (ticketing.as.com.lb). Every WhatsApp
// reservation links the event's page there, and an event AS hosts itself is
// booked there — its seat map, 24-hour holds and Whish payment live on the hub.
// Not in app.json → extra on purpose: under the fingerprint runtime policy that
// would make this a native change, and it has to ship as an OTA update.
export const TICKETING_WEB_URL = stripSlash(process.env.EXPO_PUBLIC_TICKETING_WEB_URL || extra.ticketingWebUrl || 'https://ticketing.as.com.lb');

export const LEGAL_URLS = {
  privacy: `${STORE_WEB_URL}/pages/privacy`,
  warranty: `${STORE_WEB_URL}/pages/warranty`,
  shipping: `${STORE_WEB_URL}/pages/shipping`,
  support: `${STORE_WEB_URL}/pages/support`
};

// App-wide constants mirrored from the web stores.
export const MAX_ITEM_QTY = 2; // store policy: at most 2 of any product per order
export const APP_NAME = 'AS Company';
export const STORE_NAME = 'AS Store';

export default { WEBSITE_API_URL, STORE_API_URL, STORE_WEB_URL, TICKETING_WEB_URL, LEGAL_URLS, MAX_ITEM_QTY, APP_NAME, STORE_NAME };
