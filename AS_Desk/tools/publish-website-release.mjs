import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";

// Writes apps/website/public/releases.json for a released version.
//
//   npm run website:publish -- --version 0.7.1 [--legacy-version 0.7.1] [--mac-version 0.7.1] [--base-url URL] [--copy] [--skip-verify]
//
// The standard installer (Windows 10/11 x64) is required. The legacy Windows 7 edition (x64 + x86) is
// taken from release/ when --legacy-version (default: --version) was built, otherwise the manifest keeps
// the legacy installers it already lists: that edition is big and slow to build, so it can lag behind.
// The macOS disk image works the same way with --mac-version: it is built on a Mac (docs/macos.md).

// --key value, --key=value, or a bare --flag.
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith("--")) continue;
  const [key, inline] = value.slice(2).split("=");
  const next = process.argv[index + 1];
  args.set(key, inline ?? (next && !next.startsWith("--") ? process.argv[++index] : true));
}

const semver = /^\d+\.\d+\.\d+$/;
const sha256 = (file) =>
  new Promise((done, fail) => {
    const hash = createHash("sha256");
    createReadStream(file).on("data", (chunk) => hash.update(chunk)).on("end", () => done(hash.digest("hex"))).on("error", fail);
  });
const version = args.get("version");
const legacyVersion = args.get("legacy-version") ?? version;
const macVersion = args.get("mac-version") ?? version;
if (typeof version !== "string" || !semver.test(version) || !semver.test(String(legacyVersion)) || !semver.test(String(macVersion)))
  throw new Error(
    "Usage: npm run website:publish -- --version 0.7.1 [--legacy-version 0.7.1] [--mac-version 0.7.1] [--base-url https://example.com/downloads] [--copy] [--skip-verify]",
  );

const source = resolve(args.get("source") ?? "release");
const website = resolve("apps/website");
const manifestPath = join(website, "public/releases.json");
const copy = args.has("copy");
const baseUrl = String(args.get("base-url") ?? "https://asdesk-api.raiapp.dev/downloads").replace(/\/$/, "");
const targetRoot = copy ? "/downloads" : baseUrl;
const current = JSON.parse(await readFile(manifestPath, "utf8"));

const local = [{ edition: "standard", arch: "x64", version, file: `ASDesk-${version}-x64-Setup.exe` }];
const legacyFiles = ["x64", "x86"].map((arch) => ({
  edition: "legacy",
  arch,
  version: legacyVersion,
  file: `ASDesk-${legacyVersion}-win7-${arch}-Setup.exe`,
}));
const hasLegacy = legacyFiles.every(({ file }) => existsSync(join(source, file)));
if (hasLegacy) local.push(...legacyFiles);
else if (args.has("legacy-version")) throw new Error(`Legacy installers for ${legacyVersion} are not in ${source}`);
const macFile = { edition: "macos", arch: "universal", version: macVersion, file: `ASDesk-${macVersion}-macos-universal.dmg` };
const hasMac = existsSync(join(source, macFile.file));
if (hasMac) local.push(macFile);
else if (args.has("mac-version")) throw new Error(`The macOS disk image for ${macVersion} is not in ${source}`);

const installers = [];
for (const { file, ...installer } of local) {
  const { size } = await stat(join(source, file)); // throws if the installer was not built
  if (copy) {
    await mkdir(join(website, "public/downloads"), { recursive: true });
    await copyFile(join(source, file), join(website, "public/downloads", file));
  }
  // A disk image's notarization comes from what tools/desktop.mjs recorded next to it.
  const facts = installer.edition === "macos" ? JSON.parse(await readFile(join(source, `${file}.json`), "utf8").catch(() => "{}")) : {};
  installers.push({ ...installer, url: `${targetRoot}/${file}`, size, sha256: await sha256(join(source, file)),
    ...(installer.edition === "macos" && { notarized: facts.notarized === true }) });
}
for (const [edition, built, label] of [["legacy", hasLegacy, "legacy installers"], ["macos", hasMac, "macOS disk image"]]) {
  if (built) continue;
  const kept = (current.latest?.installers ?? []).filter((installer) => installer.edition === edition);
  installers.push(...kept);
  console.log(kept.length ? `Keeping the ${label} ${kept[0].version}` : `No ${label} listed`);
}

// The site links straight to these files, so refuse to publish links that would 404 or serve another build.
if (!copy && !args.has("skip-verify")) {
  const problems = [];
  for (const { url, size } of installers) {
    const response = await fetch(url, { method: "HEAD" }).catch((error) => ({ ok: false, status: error.message }));
    const length = Number(response.headers?.get("content-length"));
    if (!response.ok) problems.push(`${url} → ${response.status}`);
    else if (length && length !== size) problems.push(`${url} → ${length} bytes, expected ${size}`);
  }
  if (problems.length)
    throw new Error(
      `Installers are not on the download server yet:\n  ${problems.join("\n  ")}\n` +
        "Upload them first with: npm run desktop:publish (-- --win7 for legacy, -- --mac for macOS), or pass --copy / --skip-verify.",
    );
}

const release = { version, publishedAt: new Date().toISOString().slice(0, 10), installers };
const releases = [release, ...(current.releases ?? []).filter((item) => item.version !== version)].slice(0, 10);
await writeFile(manifestPath, `${JSON.stringify({ product: "ASDesk", latest: release, releases }, null, 2)}\n`);

console.log(`Published website manifest for ASDesk ${version}`);
for (const { edition, arch, version: v, url } of installers) console.log(`  ${edition} ${arch} ${v}: ${url}`);
if (!copy && !args.has("skip-verify")) console.log("Links verified against the download server.");
