// Google sign-in for the app — the round-trip that keeps the customer *in the app*.
//
// The old flow opened the web OAuth page with `openBrowserAsync` and never came
// back: the token landed on the web storefront and the customer was left in the
// browser. Here we open it with `openAuthSessionAsync` and hand the API our deep
// link (`ascompany://auth/google`). The API's callback redirects the token to that
// link, which the OS routes to the app — the in-app browser tab closes itself and
// the promise resolves with the return URL. We read the token off it and adopt the
// session. Nothing about the sign-in is trusted from the browser beyond this token,
// which the API signed.

import * as WebBrowser from 'expo-web-browser'
import * as ExpoLinking from 'expo-linking'
import { googleSignInUrl } from './account'

// Where the API sends the customer back: `ascompany://auth/google` in a build,
// `exp://<host>/--/auth/google` in Expo Go.
export const googleReturnUrl = () => ExpoLinking.createURL('/auth/google')

// Run the flow. Resolves to:
//   { token, next }  — signed in; caller adopts the token
//   null             — the customer dismissed the browser (no result)
// Throws with a friendly message when the API reports the sign-in failed.
export async function signInWithGoogle(next = '/') {
  const returnUrl = googleReturnUrl()
  const result = await WebBrowser.openAuthSessionAsync(googleSignInUrl(next, returnUrl), returnUrl)
  if (result.type !== 'success' || !result.url) return null // dismissed / cancelled

  const { queryParams } = ExpoLinking.parse(result.url)
  if (queryParams?.error) throw new Error('Google sign-in was cancelled. Please try again.')
  const token = queryParams?.token ? String(queryParams.token) : ''
  if (!token) return null
  return { token, next: queryParams?.next ? String(queryParams.next) : next }
}
