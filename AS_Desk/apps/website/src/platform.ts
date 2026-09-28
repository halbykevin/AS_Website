import type { Architecture, Edition } from "./api";

export type Platform = { edition: Edition; arch: Architecture };

/**
 * Which installer suits this visitor. Browsers still reveal Windows 7/8 (NT 6.x) and 32-bit Windows,
 * which need the legacy edition; everyone else, including non-Windows visitors downloading for someone
 * else, gets the small standard installer.
 */
export function detectPlatform(userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent): Platform {
  const windows = /Windows/.test(userAgent);
  const legacyWindows = /Windows NT (5\.|6\.[0-3])/.test(userAgent);
  const x86 = windows && !/Win64|WOW64|x64|amd64|arm64/i.test(userAgent);
  if (legacyWindows || x86) return { edition: "legacy", arch: x86 ? "x86" : "x64" };
  return { edition: "standard", arch: "x64" };
}
