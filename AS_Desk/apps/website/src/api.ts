export type Architecture = 'x64' | 'x86' | 'universal';

/**
 * `standard`: Windows 10/11 x64, uses the system WebView2 (small). `legacy`: Windows 7 SP1+, bundles its runtime.
 * `macos`: macOS 13+, one universal app for Apple silicon and Intel, in a disk image.
 */
export type Edition = 'standard' | 'legacy' | 'macos';

/** `notarized` (macOS only): Apple checked it, so it opens without System Settings' "Open Anyway". */
export type Installer = { edition: Edition; arch: Architecture; version: string; url: string; size: number; sha256?: string; notarized?: boolean };

export type Release = { version: string; publishedAt: string; installers: Installer[] };

export type ReleaseManifest = { product: string; latest: Release; releases: Release[] };

/** The download server's latest.json / latest-macos.json, written by `npm run desktop:publish` (proxied same-origin). */
type LatestPointer = { file: string; sha256?: string; published?: string; size?: number; notarized?: boolean };

/** The editions the download server keeps a pointer for, and how their files are named. */
const POINTERS = {
  standard: { path: '/latest.json', file: /^ASDesk-(\d+\.\d+\.\d+)-x64-Setup\.exe$/, arch: 'x64' },
  macos: { path: '/latest-macos.json', file: /^ASDesk-(\d+\.\d+\.\d+)-macos-universal\.dmg$/, arch: 'universal' },
} as const;
export type LiveEdition = keyof typeof POINTERS;

/** Newest installer of an edition on the download server, or undefined if it cannot be read. */
export async function fetchLatest(edition: LiveEdition, downloadsBase: string): Promise<Installer | undefined> {
  const pointer = POINTERS[edition];
  const response = await fetch(pointer.path, { headers: { Accept: 'application/json' }, cache: 'no-cache' }).catch(() => undefined);
  if (!response?.ok) return undefined;
  const latest = (await response.json().catch(() => ({}))) as LatestPointer;
  const version = pointer.file.exec(latest.file ?? '')?.[1];
  if (!version) return undefined;
  const installer: Installer = { edition, arch: pointer.arch, version, url: `${downloadsBase}/${latest.file}`, size: latest.size ?? 0, sha256: latest.sha256 };
  if (typeof latest.notarized === 'boolean') installer.notarized = latest.notarized;
  return installer;
}

/** Numeric semver comparison: positive when a is newer. */
export const compareVersions = (a: string, b: string) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i += 1) if (x![i] !== y![i]) return (x![i] ?? 0) - (y![i] ?? 0);
  return 0;
};

export async function fetchReleaseManifest(): Promise<ReleaseManifest> {
  const response = await fetch('/releases.json', { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  if (!response.ok) throw new Error('Release information is unavailable right now.');
  return response.json() as Promise<ReleaseManifest>;
}
