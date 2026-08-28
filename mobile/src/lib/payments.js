// Whish Pay — the app side of the AS Store online-payment flow.
//
// Same shape as the web store: the **server** creates the payment (the Whish
// secret never leaves it) and hands back a hosted `collectUrl`; the customer pays
// on Whish's page; the server's status check is the only thing that decides an
// order is paid. The app never sees a payment result it can trust — it just
// reopens the order and asks the API.
//
// Mobile-specific part: Whish can only redirect a browser to an http(s) URL, so
// checkout sends the app's deep link along with the order and the API bounces the
// customer back through `/api/orders/whish/return` → `<scheme>://orders/<id>`.

import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { accountApi } from './account';

export const PAYMENT_COD = 'cod';
export const PAYMENT_WHISH = 'whish';
// Never chosen at checkout — the server records it when wallet credit covered
// the order outright, so there was no payment page and there is no cash to take.
export const PAYMENT_WALLET = 'wallet';

// How an order was paid, in one place, because several screens ask.
export const paymentLabel = order => {
  if (order?.paymentMethod === PAYMENT_WALLET) return 'Paid from wallet';
  if (order?.paymentMethod === PAYMENT_WHISH) return order?.paymentStatus === 'paid' ? 'Paid with Whish' : 'Payment pending';
  return 'Cash on delivery';
};

// Where Whish should hand the customer back: the server appends `/<orderId>?…`.
// Resolves to `ascompany://orders` in a build and `exp://<host>/--/orders` in
// Expo Go.
//
// The API only honours schemes on its `APP_RETURN_SCHEMES` allowlist (`ascompany`
// in production) — an open redirect here would leak the order's track token to
// whatever URL an attacker put in the request. So in Expo Go the deep link is
// rejected and the customer lands on the *web* order page instead of back in the
// app. That is the allowlist doing its job, not a bug; to exercise the real
// return leg in development, add `exp` to APP_RETURN_SCHEMES on a **development**
// API only, or test with a preview build, which uses the real scheme.
export const paymentReturnUrl = () => ExpoLinking.createURL('/orders');

// Open the hosted Whish page and wait for the customer to come back.
//
// `openAuthSessionAsync` keeps the payment inside an in-app browser tab (shared
// cookies, dismissible, and the deep link back closes it automatically), and
// resolves as soon as we're returned to — no polling needed to know they're done.
// Returns 'returned' (came back via the deep link), 'closed' (dismissed the tab)
// or 'external' (fell back to the system browser). None of these mean *paid* —
// the caller always confirms with the server.
export async function openWhishCheckout(collectUrl) {
  try {
    const result = await WebBrowser.openAuthSessionAsync(collectUrl, paymentReturnUrl(), {
      showInRecents: true
    });
    return result?.type === 'success' ? 'returned' : 'closed';
  } catch {
    // Very old/locked-down devices without a custom-tab provider.
    await Linking.openURL(collectUrl);
    return 'external';
  }
}

// Re-check an online payment until it settles. The server callback usually beats
// the customer back, but a missed callback (or a payment finished on another
// device) leaves the order unpaid until someone asks — so ask, a few times, with
// a short gap. Calls `onOrder` with every fresh copy it gets.
export async function pollPayment({ id, token, tries = 5, interval = 2500, onOrder, isCancelled }) {
  const stop = () => (typeof isCancelled === 'function' ? isCancelled() : false);
  let order = null;
  for (let i = 0; i < tries; i += 1) {
    if (stop()) return order;
    try {
      order = await accountApi.reconcilePayment(id, token);
      if (stop()) return order;
      onOrder?.(order);
      if (order?.paymentStatus === 'paid' || order?.status === 'cancelled') return order;
    } catch {
      // Offline or a transient API error — keep trying, then give up quietly.
    }
    if (i < tries - 1) await new Promise(r => setTimeout(r, interval));
  }
  return order;
}

// True while an order is waiting on money: an online order that hasn't been paid
// and hasn't been cancelled.
export const isAwaitingPayment = order => order?.paymentMethod === PAYMENT_WHISH && order?.paymentStatus !== 'paid' && order?.status !== 'cancelled';
