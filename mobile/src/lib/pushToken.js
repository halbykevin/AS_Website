// Push-token persistence + the sign-out detach call. Kept separate from the
// notifications provider so `account.jsx` can use it without a circular import.

import { STORE_API_URL } from '@/src/config/env';
import { storage, KEYS } from './storage';

export const getStoredPushToken = () => storage.get(KEYS.pushToken);
export const rememberPushToken = token => storage.set(KEYS.pushToken, token);

// On sign-out the device stays registered (for broadcast promos) but is
// detached from the customer so account-targeted pushes stop immediately.
export async function detachDeviceFromCustomer() {
  const token = await getStoredPushToken();
  if (!token) return;
  try {
    await fetch(`${STORE_API_URL}/api/devices`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, mode: 'detach' })
    });
  } catch {
    /* offline sign-out is fine — the next register call re-syncs ownership */
  }
}
