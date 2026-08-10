// The last line of defence: errors that no React boundary can catch.
//
// A boundary only sees errors thrown *while rendering*. Everything else — a
// `.then()` that throws, a setTimeout callback, an event handler, a native
// module rejecting — goes straight past React to React Native's global handler.
// In a release build that handler's default behaviour for a fatal error is to
// **tear down the app**: the customer is dumped to the home screen mid-checkout,
// with no message and nothing to retry.
//
// Almost none of those errors actually justify killing the app. A failed
// analytics ping, a push-token refresh against a flaky network, a stray null in
// a callback — the UI on screen is still perfectly usable. So in production we
// log and carry on. The customer keeps their cart and their place, and the worst
// case is that one background thing silently didn't happen, which is strictly
// better than the app vanishing.
//
// In development we hand every error straight back to the default handler, red
// box and all. Swallowing errors while you're building is how bugs ship.

let installed = false;

// Kept small on purpose: with no crash-reporting service wired up, this is a
// console line plus a hook for whoever adds one later. If you do add Sentry (or
// anything else), this function is the single place it needs to go — every
// boundary and the global handler already funnel through here.
export function reportError(error, context = {}) {
  const where = context.boundary ? `[${context.boundary}]` : '';
  console.warn(`[error]${where}`, error?.message || String(error), context.fatal ? '(fatal)' : '');
  if (__DEV__ && error?.stack) console.warn(error.stack);
}

export function installGlobalErrorHandler() {
  if (installed) return;
  // `ErrorUtils` is a React Native global; guard so a web build (or a test
  // runner) doesn't blow up on the way in.
  const errorUtils = global.ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;
  installed = true;

  const defaultHandler = errorUtils.getGlobalHandler?.();

  errorUtils.setGlobalHandler((error, isFatal) => {
    reportError(error, { fatal: isFatal, global: true });

    // Development: let the red box through so the error is impossible to miss.
    if (__DEV__) {
      defaultHandler?.(error, isFatal);
      return;
    }

    // Production: a non-fatal error was never going to end the app — pass it on
    // so nothing that depends on the default handling changes. A fatal one we
    // deliberately do not forward: that call is what would kill the process.
    if (!isFatal) defaultHandler?.(error, isFatal);
  });
}
