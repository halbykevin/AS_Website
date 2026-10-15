// The AS Company mobile app's store listings (settings.appStoreUrl /
// playStoreUrl, mapped to `content.apps`). One place decides which listings
// exist, so the footer and contact badges (components/AppBadges.jsx), the FAQ
// (lib/faq.js) and llms.txt (lib/seoFiles.js) can never disagree about it. A
// listing that is empty, or not an http(s) address, does not exist.

const isHttp = (v) => /^https?:\/\//i.test(String(v || ''))

/** [{ key, href, store, inSentence, platforms, label, badge }] — the listings to show, App Store first. */
export function appListings(c) {
  const apps = c?.apps || {}
  return [
    isHttp(apps.ios) && {
      key: 'ios',
      href: apps.ios,
      store: 'App Store',
      inSentence: 'the App Store',
      platforms: 'iPhone and iPad',
      // The badge's own wording, so the alt text reads what the artwork says.
      label: 'Download on the App Store',
      badge: '/badges/app-store.svg',
    },
    isHttp(apps.android) && {
      key: 'android',
      href: apps.android,
      store: 'Google Play',
      inSentence: 'Google Play',
      platforms: 'Android',
      label: 'Get it on Google Play',
      badge: '/badges/google-play.svg',
    },
  ].filter(Boolean)
}

// What the app is, in one sentence — the FAQ and llms.txt both say it.
export const APP_SUMMARY =
  'It brings AS Store — shopping, checkout and order tracking — and our events together in one app.'
