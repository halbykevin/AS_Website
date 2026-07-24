// Runtime configuration — the two API base URLs the app talks to.
//
// Resolution order (first wins):
//   1. EXPO_PUBLIC_* env vars (from .env / the shell) — great for dev + EAS.
//   2. app.json → expo.extra defaults — the committed fallback.
//
// On a physical device `localhost` is the phone itself, so point these at your
// machine's LAN IP (see .env.example).

import Constants from 'expo-constants'

const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra ?? {}

const stripSlash = (u) => String(u || '').replace(/\/$/, '')

export const WEBSITE_API_URL = stripSlash(
  process.env.EXPO_PUBLIC_WEBSITE_API_URL || extra.websiteApiUrl || 'https://asapi.as.com.lb',
)

export const STORE_API_URL = stripSlash(
  process.env.EXPO_PUBLIC_STORE_API_URL || extra.storeApiUrl || 'https://store-api.as.com.lb',
)

// App-wide constants mirrored from the web stores.
export const MAX_ITEM_QTY = 2 // store policy: at most 2 of any product per order
export const APP_NAME = 'AS Company'
export const STORE_NAME = 'AS Store'

export default { WEBSITE_API_URL, STORE_API_URL, MAX_ITEM_QTY, APP_NAME, STORE_NAME }
