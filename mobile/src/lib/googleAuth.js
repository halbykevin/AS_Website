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
import { accountApi, googleSignInUrl } from './account'

WebBrowser.maybeCompleteAuthSession()

// Android can deliver the same deep link both to Expo Router and to the active
// auth-session promise. Sharing the exchange promise keeps the server's
// single-use code exactly-once while both UI paths converge on the same result.
const exchanges = new Map()

// Where the API sends the customer back: `ascompany://auth/google` in a build,
// `exp://<host>/--/auth/google` in Expo Go.
export const googleReturnUrl = () => ExpoLinking.createURL('/auth/google')

export function completeGoogleCode(code) {
  const value = String(code || '')
  if (!value) throw new Error('Google sign-in returned no authorization code.')
  if (!exchanges.has(value)) exchanges.set(value, accountApi.exchangeGoogleCode(value))
  return exchanges.get(value)
}

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
  // Rolling-deploy compatibility: an older API may still return its signed
  // customer token directly. New deployments always return the one-time code.
  const legacyToken = queryParams?.token ? String(queryParams.token) : ''
  if (legacyToken) {
    return { token: legacyToken, next: queryParams?.next ? String(queryParams.next) : next }
  }
  const code = queryParams?.code ? String(queryParams.code) : ''
  if (!code) return null
  const session = await completeGoogleCode(code)
  return { token: session.token, next: session.next || next }
}
