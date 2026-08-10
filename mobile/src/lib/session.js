// One place to say "the token we're holding is no longer good".
//
// Customer tokens last 30 days, but they can stop working sooner: the account
// was deleted, the secret rotated, or the clock ran out mid-session. Every API
// client answers a 401 the same way — hand the app back to the signed-out state
// — and they all need to do it without importing each other (account.jsx,
// notifications.jsx and spin.js already form a chain), so the callback lives
// here, registered once by AccountProvider.
//
// Only report a 401 from a request that actually *sent* a token. Several
// endpoints are public and a 401 from one of those says nothing about our
// session; signing the customer out over it would be a bug that looks like a
// random logout.

let handler = null;

export const setSessionExpiredHandler = fn => {
  handler = fn;
};

export function reportUnauthorized() {
  handler?.();
}

// Small helper so each client's `req` stays a one-liner at the call site.
export function noteAuthFailure(status, sentToken) {
  if (status === 401 && sentToken) reportUnauthorized();
}
