// Sign in with Apple — the app half.
//
// Nothing like the Google flow: iOS presents the sheet itself, so there is no
// browser, no deep link and no one-time code to come back for. We hand the API
// the identity token iOS gives us and it answers with a session.
//
// **The name and email arrive exactly once.** Apple includes them on the very
// first authorization for this app and never again — every later sign-in carries
// only the stable `user` id. So whatever we get, we send straight on; there is
// no second chance to collect it, and the server stores it against `apple_sub`
// for good.

import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'
import * as Crypto from 'expo-crypto'
import { accountApi } from './account'

// iOS 13+ only. Android and older iPhones never see the button — Apple's own
// guidance is not to offer a sign-in the device cannot complete.
export async function isAppleAuthAvailable() {
  if (Platform.OS !== 'ios') return false
  try {
    return await AppleAuthentication.isAvailableAsync()
  } catch {
    return false
  }
}

const randomNonce = async () => {
  const bytes = await Crypto.getRandomBytesAsync(16)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Resolves to { token, customer, linkChannel } on success, or null when the
// customer dismissed the sheet — a cancel is not an error and must not paint
// one on the screen.
export async function signInWithApple() {
  const nonce = await randomNonce()
  let credential
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL
      ],
      nonce
    })
  } catch (e) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return null
    throw new Error('Apple sign-in failed. Please try again.')
  }

  if (!credential?.identityToken) throw new Error('Apple returned no identity token.')

  const name = [credential.fullName?.givenName, credential.fullName?.familyName]
    .filter(Boolean)
    .join(' ')
    .trim()

  return accountApi.appleSignIn({
    identityToken: credential.identityToken,
    // Only present on the first authorization; the server uses it to revoke the
    // grant if the account is ever deleted.
    code: credential.authorizationCode || '',
    nonce,
    name
  })
}
