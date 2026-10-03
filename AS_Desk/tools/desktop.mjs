import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Desktop builds (Tauri). `debug`: test build used by the E2E suite. `package`: NSIS installer in
// release/. `release`: the same, Authenticode-signed; refuses to run without a certificate.
// `--win7` (package/release): the Windows 7 edition instead, x64 and x86, for Windows 7 SP1 to 11
// (docs/windows7.md): a pinned nightly Rust for the *-win7-windows-msvc targets, the static C runtime,
// and a private copy of WebView2 109, the last version Microsoft made for Windows 7 and 8.
// `--mac` (package/release, on a Mac): the macOS edition instead, one universal app for Apple silicon
// and Intel in a disk image (docs/macos.md); from Windows, the "ASDesk macOS" GitHub workflow runs it.
const mode = process.argv[2];
const win7 = process.argv.includes('--win7');
const mac = process.argv.includes('--mac');
if (!['debug', 'package', 'release'].includes(mode) || ((win7 || mac) && mode === 'debug') || (win7 && mac)) throw new Error('Usage: node tools/desktop.mjs debug | package [--win7 | --mac] | release [--win7 | --mac]');
if (mac && process.platform !== 'darwin') throw new Error('macOS builds run on a Mac. From Windows, run the "ASDesk macOS" workflow on GitHub Actions instead (docs/macos.md).');
const run = (args, options = {}) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
};
const system = (command, args, what, env = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`${what} failed (${command} exited with ${result.status ?? result.error?.message})`);
};
const tauri = (args, env) => run([resolve('node_modules/@tauri-apps/cli/tauri.js'), ...args], { cwd: 'apps/desktop', env: { ...process.env, ...env } });
run(['tools/build-desktop.mjs']);

if (mode === 'debug') {
  tauri(['build', '--debug', '--no-bundle']);
  console.log(`Debug build: ${resolve('apps/desktop/src-tauri/target/debug/ASDesk.exe')}`);
  process.exit(0);
}

const { version, companyRemote } = JSON.parse(readFileSync('apps/desktop/package.json', 'utf8'));
const { productName } = JSON.parse(readFileSync('apps/desktop/src-tauri/tauri.conf.json', 'utf8'));
const tauriDir = 'apps/desktop/src-tauri';

// ── macOS edition ──────────────────────────────────────────────────────────────────────────────
// `package`: signed ad hoc, which Apple silicon needs to run it at all; Gatekeeper still asks people to
// allow it in System Settings. `release`: signed with a Developer ID certificate, then the app and the
// disk image are notarized and stapled, and nothing is written unless Gatekeeper accepts both. Tauri
// reads the certificate from the environment (docs/macos.md#signing):
//   APPLE_SIGNING_IDENTITY             "Developer ID Application: …" in the keychain, or
//   APPLE_CERTIFICATE + _PASSWORD      the exported .p12 (base64), imported into a temporary keychain;
// and notarizes with an App Store Connect API key (APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH)
// or an Apple ID (APPLE_ID, APPLE_PASSWORD app-specific, APPLE_TEAM_ID).
if (mac) {
  const capture = (command, args) => spawnSync(command, args, { encoding: 'utf8' });
  const env = process.env;
  let notary = [];
  if (mode === 'release') {
    if (!env.APPLE_SIGNING_IDENTITY && !env.APPLE_CERTIFICATE) throw new Error('A Developer ID Application certificate is required: set APPLE_SIGNING_IDENTITY or APPLE_CERTIFICATE and APPLE_CERTIFICATE_PASSWORD. No unsigned release will be produced.');
    if (env.APPLE_API_KEY && env.APPLE_API_ISSUER && env.APPLE_API_KEY_PATH) notary = ['--key', env.APPLE_API_KEY_PATH, '--key-id', env.APPLE_API_KEY, '--issuer', env.APPLE_API_ISSUER];
    else if (env.APPLE_ID && env.APPLE_PASSWORD && env.APPLE_TEAM_ID) notary = ['--apple-id', env.APPLE_ID, '--password', env.APPLE_PASSWORD, '--team-id', env.APPLE_TEAM_ID];
    else throw new Error('Notarization credentials are required: APPLE_API_KEY, APPLE_API_ISSUER and APPLE_API_KEY_PATH, or APPLE_ID, APPLE_PASSWORD and APPLE_TEAM_ID.');
  }
  const triple = 'universal-apple-darwin';
  system('rustup', ['target', 'add', 'aarch64-apple-darwin', 'x86_64-apple-darwin'], 'Installing the macOS Rust targets');
  tauri(['build', '--target', triple, '--bundles', 'app,dmg', ...(mode === 'package' ? ['--config', JSON.stringify({ bundle: { macOS: { signingIdentity: '-' } } })] : [])]);
  const bundle = join(tauriDir, 'target', triple, 'release/bundle');
  const app = join(bundle, 'macos', `${productName}.app`);
  const built = join(bundle, 'dmg', `${productName}_${version}_universal.dmg`);
  if (!existsSync(built)) throw new Error(`Expected the disk image at ${built}`);
  /** Who signed a bundle or disk image: "Developer ID Application: … (TEAM)", "ad hoc", or undefined. */
  const signer = file => {
    const { stderr } = capture('codesign', ['--display', '--verbose=2', file]);
    return stderr.match(/^Authority=(Developer ID Application: .+)$/m)?.[1] ?? (/Signature=adhoc/.test(stderr) ? 'ad hoc' : undefined);
  };
  system('codesign', ['--verify', '--deep', '--strict', app], 'Verifying the app signature');
  mkdirSync('release', { recursive: true });
  const name = `ASDesk-${version}-macos-universal.dmg`, target = `release/${name}`;
  rmSync(target, { force: true }); rmSync(`${target}.json`, { force: true });
  copyFileSync(built, target);
  let signed = signer(app) ?? 'unsigned', notarized = false;
  if (mode === 'release') {
    const fail = message => { rmSync(target, { force: true }); throw new Error(`${message}; nothing was written to release/`); };
    if (!signed.startsWith('Developer ID Application:')) fail(`ASDesk.app is signed by ${signed}, not a Developer ID`);
    // Tauri signs the disk image with the same identity; sign it here if this Tauri version did not.
    if (!signer(target)?.startsWith('Developer ID Application:')) {
      if (!env.APPLE_SIGNING_IDENTITY) fail('The disk image is not signed and APPLE_SIGNING_IDENTITY is not set to sign it');
      system('codesign', ['--sign', env.APPLE_SIGNING_IDENTITY, '--timestamp', target], 'Signing the disk image');
    }
    // The app inside is already notarized and stapled by Tauri; the image gets its own ticket so it
    // opens without a warning even offline.
    console.log('Notarizing the disk image (usually a few minutes)…');
    const submitted = capture('xcrun', ['notarytool', 'submit', target, ...notary, '--wait', '--output-format', 'json']);
    const result = (() => { try { return JSON.parse(submitted.stdout); } catch { return {}; } })();
    if (result.status !== 'Accepted') {
      if (result.id) console.error(capture('xcrun', ['notarytool', 'log', result.id, ...notary]).stdout);
      fail(`Notarization ${result.status ?? 'failed'}: ${result.message ?? submitted.stderr.trim()}`);
    }
    system('xcrun', ['stapler', 'staple', target], 'Stapling the notarization ticket');
    // Gatekeeper's own verdicts, as a downloaded copy would get them.
    const accepted = (args, file) => {
      const { stderr } = capture('spctl', [...args, '--verbose=2', file]);
      return /: accepted$/m.test(stderr) && /^source=Notarized Developer ID$/m.test(stderr);
    };
    if (!accepted(['--assess', '--type', 'execute'], app)) fail('Gatekeeper does not accept ASDesk.app as notarized');
    if (!accepted(['--assess', '--type', 'open', '--context', 'context:primary-signature'], target)) fail('Gatekeeper does not accept the disk image as notarized');
    notarized = true;
    console.log(`Signed by: ${signed}, notarized`);
  }
  // What desktop:publish warns about, since a disk image's notarization cannot be checked from Windows.
  writeFileSync(`${target}.json`, `${JSON.stringify({ file: name, version, signed, notarized }, null, 2)}\n`);
  console.log(`Disk image: ${resolve(target)} (${(statSync(target).size / 1048576).toFixed(1)} MB)${notarized ? '' : ' — not notarized: macOS will ask people to allow it in System Settings'}`);
  process.exit(0);
}

// Which edition the installer is, and where it sends people on the wrong Windows (windows/hooks.nsh).
const server = process.env.COMPANY_REMOTE_SERVER ?? companyRemote?.defaultServer ?? '';
const edition = name => writeFileSync(join(tauriDir, 'windows/edition.nsh'), ['; Generated by tools/desktop.mjs for each build; do not edit.',
  `!define ASDESK_EDITION "${name}"`, ...(server ? [`!define ASDESK_DOWNLOADS "${server}/downloads"`] : []), ''].join('\n'));

// Release signing (docs/desktop.md#windows-signing). Code-signing keys must be on a hardware token or in
// a cloud HSM, so either:
//   WINDOWS_CERTIFICATE_THUMBPRINT  a certificate in the user store (hardware token / virtual smart card), or
//   WINDOWS_SIGN_COMMAND            a cloud signing command with %1 for the file, e.g. Azure Trusted Signing:
//                                   trusted-signing-cli -e <endpoint> -a <account> -c <profile> -d ASDesk %1
// Tauri signs the app binary and the installer with it.
let signing = {};
if (mode === 'release') {
  const thumbprint = process.env.WINDOWS_CERTIFICATE_THUMBPRINT, signCommand = process.env.WINDOWS_SIGN_COMMAND;
  if (signCommand) {
    if (!signCommand.includes('%1')) throw new Error('WINDOWS_SIGN_COMMAND must contain %1 where the file to sign goes');
    signing = { signCommand };
  } else if (thumbprint) {
    signing = { certificateThumbprint: thumbprint, digestAlgorithm: 'sha256', timestampUrl: process.env.WINDOWS_TIMESTAMP_URL ?? 'http://timestamp.digicert.com' };
  } else {
    throw new Error('A real Authenticode certificate is required: set WINDOWS_CERTIFICATE_THUMBPRINT or WINDOWS_SIGN_COMMAND. No unsigned release will be produced.');
  }
}
function publish(bundle, arch, name) {
  const built = readdirSync(bundle).filter(f => f === `${productName}_${version}_${arch}-setup.exe`).map(f => join(bundle, f));
  if (built.length !== 1) throw new Error(`Expected one ${version} ${arch} installer in ${bundle}, found ${built.length}`);
  mkdirSync('release', { recursive: true });
  const target = `release/${name}`;
  copyFileSync(built[0], target);
  // A release must carry a valid, trusted signature; never leave an unsigned one where it could be published.
  if (mode === 'release') {
    const { status, subject } = authenticode(target);
    if (status !== 'Valid') { rmSync(target); throw new Error(`${name} is not validly signed (${status}); nothing was written to release/`); }
    console.log(`Signed by: ${subject}`);
  }
  console.log(`Installer: ${resolve(target)} (${(statSync(target).size / 1048576).toFixed(1)} MB)`);
}

if (!win7) {
  edition('standard');
  tauri(['build', '--bundles', 'nsis', ...(mode === 'release' ? ['--config', JSON.stringify({ bundle: { windows: signing } })] : [])]);
  publish(join(tauriDir, 'target/release/bundle/nsis'), 'x64', `ASDesk-${version}-x64-Setup.exe`);
  process.exit(0);
}

// ── Windows 7 edition ──────────────────────────────────────────────────────────────────────────
// Rust 1.78 dropped Windows 7 from the standard targets; the *-win7-windows-msvc targets keep it, but
// are built from source (build-std) on nightly. Pinned, so a release is reproducible.
const TOOLCHAIN = 'nightly-2026-09-27';
// WebView2 109.0.1518.78: the last fixed-version runtime for Windows 7 and 8. Microsoft no longer
// hosts it; this mirror keeps the original Microsoft-signed CABs. Both the hash and Microsoft's
// signature are checked, so the mirror only has to be available, not trusted.
const WEBVIEW2 = '109.0.1518.78';
const RUNTIMES = {
  x64: { sha256: '7622281cf83de1a35e3a471f432f7a897d65f0a7d3975df08512b7b253dd45c7' },
  x86: { sha256: 'c507e0df03fe941f6669b74faf713545708653d568d1dce1e683cbe707382253' },
};
const MIRROR = `https://github.com/westinyang/WebView2RuntimeArchive/releases/download/${WEBVIEW2}`;

const sha256 = file => new Promise((done, fail) => {
  const hash = createHash('sha256');
  createReadStream(file).on('data', chunk => hash.update(chunk)).on('end', () => done(hash.digest('hex'))).on('error', fail);
});
/** Windows' own verdict on a file's Authenticode signature: Valid, NotSigned, HashMismatch, ... */
function authenticode(file) {
  const check = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$s = Get-AuthenticodeSignature -LiteralPath '${resolve(file).replace(/'/g, "''")}'; "$($s.Status)|$($s.SignerCertificate.Subject)"`], { encoding: 'utf8' });
  const [status = 'Unknown', subject = ''] = check.stdout.trim().split('|');
  return { status, subject };
}
const microsoftSigned = file => {
  const { status, subject } = authenticode(file);
  return status === 'Valid' && /(^|, )O=Microsoft Corporation(,|$)/.test(subject);
};

/** The extracted runtime, next to tauri.conf.json: the app finds it relative to its own folder. */
async function webview2(arch) {
  const name = `Microsoft.WebView2.FixedVersionRuntime.${WEBVIEW2}.${arch}`;
  const folder = join(tauriDir, name);
  const marker = join(folder, '.asdesk-verified');
  if (existsSync(marker)) return name;
  const cache = '.cache/webview2', cab = join(cache, `${name}.cab`);
  mkdirSync(cache, { recursive: true });
  if (!existsSync(cab) || await sha256(cab) !== RUNTIMES[arch].sha256) {
    console.log(`Downloading WebView2 ${WEBVIEW2} (${arch}, about 200 MB)…`);
    system('curl.exe', ['-fL', '--retry', '20', '--retry-all-errors', '--retry-delay', '3', '-C', '-', '-o', `${cab}.part`, `${MIRROR}/${name}.cab`], 'WebView2 download');
    renameSync(`${cab}.part`, cab);
  }
  if (await sha256(cab) !== RUNTIMES[arch].sha256) { rmSync(cab); throw new Error(`${cab} does not match the pinned SHA-256; deleted, run again`); }
  if (!microsoftSigned(cab)) throw new Error(`${cab} is not signed by Microsoft`);
  const staging = join(cache, `${name}.extract`);
  rmSync(staging, { recursive: true, force: true }); rmSync(folder, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  system(join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'expand.exe'), [resolve(cab), '-F:*', resolve(staging)], 'Extracting WebView2');
  const root = existsSync(join(staging, name)) ? join(staging, name) : staging;
  if (!existsSync(join(root, 'msedgewebview2.exe')) || !microsoftSigned(join(root, 'msedgewebview2.exe'))) throw new Error(`Unexpected WebView2 CAB layout or signature in ${staging}`);
  renameSync(root, folder);
  rmSync(staging, { recursive: true, force: true });
  writeFileSync(marker, `${RUNTIMES[arch].sha256}\n`);
  return name;
}

edition('win7');
system('rustup', ['toolchain', 'install', TOOLCHAIN, '--profile', 'minimal', '--component', 'rust-src', '--no-self-update'], `Installing Rust ${TOOLCHAIN}`);
const { mainBinaryName } = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));
const crate = readFileSync(join(tauriDir, 'Cargo.toml'), 'utf8').match(/^name = "([^"]+)"/m)[1];
for (const [arch, triple] of [['x64', 'x86_64-win7-windows-msvc'], ['x86', 'i686-win7-windows-msvc']]) {
  const runtime = await webview2(arch);
  // A merge patch over tauri.conf.json: null removes the standard edition's bootstrapper-only field.
  const config = JSON.stringify({ bundle: { windows: { ...signing, webviewInstallMode: { type: 'fixedRuntime', path: `./${runtime}/`, silent: null } } } });
  // `tauri build --target` accepts only targets `rustup target list` shows, which never includes tier-3
  // targets. So compile exactly as `tauri build` would (release, --bins, tauri/custom-protocol, the
  // merged configuration in TAURI_CONFIG), then let `tauri bundle` package the result.
  system('cargo', ['build', '--release', '--bins', '--features', 'tauri/custom-protocol', '--target', triple,
    '--manifest-path', join(tauriDir, 'Cargo.toml')], `Building ${triple}`, {
    RUSTUP_TOOLCHAIN: TOOLCHAIN,
    CARGO_UNSTABLE_BUILD_STD: 'std,panic_abort',
    // No Visual C++ or Universal C runtime to install on Windows 7 (older PCs often lack both).
    RUSTFLAGS: '-C target-feature=+crt-static',
    TAURI_CONFIG: config,
  });
  const out = join(tauriDir, 'target', triple, 'release');
  renameSync(join(out, `${crate}.exe`), join(out, `${mainBinaryName}.exe`));
  // Refuse to ship a build that Windows 7 would not even start.
  run(['tools/win7-imports.mjs', join(out, `${mainBinaryName}.exe`), arch]);
  tauri(['bundle', '--bundles', 'nsis', '--target', triple, '--config', config]);
  publish(join(out, 'bundle/nsis'), arch, `ASDesk-${version}-win7-${arch}-Setup.exe`);
}
