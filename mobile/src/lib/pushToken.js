// Push-token persistence + the sign-out detach call. Kept separate from the
// notifications provider so `account.jsx` can use it without a circular import.

import { STORE_API_URL } from '@/src/config/env';
import { storage, KEYS } from './storage';

export const getStoredPushToken = () => storage.get(KEYS.pushToken);
export const rememberPushToken = token => storage.set(KEYS.pushToken, token);

// On sign-out the device stays registered (for broadcast promos) but is
// detached from the customer so account-targeted pushes stop immediately.
//
// `authToken` must be passed in by the caller, captured *before* the session is
// cleared: the API only lets the owning account detach its own device, and this
// function's first `await` already lands after sign-out has wiped the session.
// (It's a parameter rather than an import because account.jsx imports this
// module — reaching back for the token would make that circular.)
export async function detachDeviceFromCustomer(authToken) {
  const token = await getStoredPushToken();
  if (!token) return;
  try {
    await fetch(`${STORE_API_URL}/api/devices`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : null)
      },
      body: JSON.stringify({ token, mode: 'detach' })
    });
  } catch {
    /* offline sign-out is fine — the next register call re-syncs ownership */
  }
}
