import type { Architecture, Edition } from "./api";

export type Platform = { edition: Edition; arch: Architecture };

/**
 * Which installer suits this visitor. A Mac gets the macOS app. Browsers still reveal Windows 7/8
 * (NT 6.x) and 32-bit Windows, which need the legacy edition; everyone else, including phone visitors
 * downloading for someone else, gets the small standard installer.
 */
export function detectPlatform(
  userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent,
  touchPoints = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints,
): Platform {
  // iPadOS Safari also says "Macintosh"; only a Mac has no touch screen.
  if (/Macintosh|Mac OS X/.test(userAgent) && !/iPhone|iPad/.test(userAgent) && touchPoints < 2) return { edition: "macos", arch: "universal" };
  const windows = /Windows/.test(userAgent);
  const legacyWindows = /Windows NT (5\.|6\.[0-3])/.test(userAgent);
  const x86 = windows && !/Win64|WOW64|x64|amd64|arm64/i.test(userAgent);
  if (legacyWindows || x86) return { edition: "legacy", arch: x86 ? "x86" : "x64" };
  return { edition: "standard", arch: "x64" };
}
