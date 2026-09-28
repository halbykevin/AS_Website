export type Architecture = 'x64' | 'x86';

/** `standard`: Windows 10/11 x64, uses the system WebView2 (small). `legacy`: Windows 7 SP1+, bundles its runtime. */
export type Edition = 'standard' | 'legacy';

export type Installer = { edition: Edition; arch: Architecture; version: string; url: string; size: number; sha256?: string };

export type Release = { version: string; publishedAt: string; installers: Installer[] };

export type ReleaseManifest = { product: string; latest: Release; releases: Release[] };

/** The download server's latest.json, written by `npm run desktop:publish` (proxied same-origin as /latest.json). */
type LatestPointer = { file: string; sha256?: string; published?: string; size?: number };

/** Newest standard installer on the download server, or undefined if it cannot be read. */
export async function fetchLatestStandard(downloadsBase: string): Promise<Installer | undefined> {
  const response = await fetch('/latest.json', { headers: { Accept: 'application/json' }, cache: 'no-cache' });
  if (!response.ok) return undefined;
  const latest = (await response.json()) as LatestPointer;
  const version = /^ASDesk-(\d+\.\d+\.\d+)-x64-Setup\.exe$/.exec(latest.file ?? '')?.[1];
  if (!version) return undefined;
  return { edition: 'standard', arch: 'x64', version, url: `${downloadsBase}/${latest.file}`, size: latest.size ?? 0, sha256: latest.sha256 };
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
