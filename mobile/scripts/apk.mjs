#!/usr/bin/env node
/**
 * Build an Android APK on EAS and get it onto a phone.
 *
 *   npm run apk                          # preview APK, attach to a running build if there is one
 *   npm run apk:prod                     # same, production-apk profile
 *   npm run apk:latest                   # skip the build, grab the newest finished APK
 *   npm run apk -- --force-new           # always start a fresh build
 *
 * Ends with the .apk downloaded to mobile/build/ and, if adb is around, installed
 * on the connected phone. Without adb it serves the file over the local network
 * and prints a short URL to open on the Samsung — no cable, no expiring link.
 *
 * Everything goes through `npx eas-cli@latest`: eas.json pins a CLI floor the
 * globally installed CLI falls below. See mobile/package.json.
 */
import { spawnSync } from 'node:child_process'
import { createReadStream, createWriteStream, mkdirSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const MOBILE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(MOBILE_DIR, 'build')
const POLL_MS = 15_000
const EAS = ['--yes', 'eas-cli@latest']
const DONE = { FINISHED: 'finished', ERRORED: 'errored', CANCELED: 'canceled' }
const isWin = process.platform === 'win32'

// ------------------------------------------------------------------- args --
const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const opt = (f, fallback) => {
  const i = argv.indexOf(f)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback
}

if (has('--help') || has('-h')) {
  console.log(
    [
      '',
      'Build an Android APK on EAS and put it on your phone.',
      '',
      '  --profile <name>   eas.json build profile (default: preview)',
      '  --latest           use the newest finished APK instead of building',
      '  --force-new        start a build even if one is already running',
      '  --no-install       skip adb, go straight to the download link',
      '  --no-serve         download only, do not start the local server',
      '  --port <n>         port for the local server (default 8090)',
      '',
    ].join('\n'),
  )
  process.exit(0)
}

const profile = opt('--profile', 'preview')
const port = Number(opt('--port', '8090'))
const useLatest = has('--latest')
const forceNew = has('--force-new')
const skipInstall = has('--no-install')
const skipServe = has('--no-serve')

// ---------------------------------------------------------------- helpers --
const say = (s = '') => console.log(s)
const die = (s) => {
  console.error(`\n  x ${s}\n`)
  process.exit(1)
}

const quote = (s) => (/[\s"^&|<>()%!]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s)

/**
 * Windows needs a shell to resolve the npx/adb .cmd shims. Passing a single
 * pre-quoted string rather than an args array keeps Node from warning that it
 * is concatenating unescaped arguments (DEP0190).
 */
const sh = (cmd, args, opts = {}) =>
  isWin
    ? spawnSync([cmd, ...args].map(quote).join(' '), { shell: true, ...opts })
    : spawnSync(cmd, args, opts)

const npx = (args, opts = {}) => sh('npx', args, { cwd: MOBILE_DIR, ...opts })

/** eas prints a human preamble before --json output, so parse from the first bracket. */
function easJson(args) {
  const r = npx([...EAS, ...args, '--json', '--non-interactive'], { encoding: 'utf8' })
  const out = `${r.stdout || ''}`
  const at = Math.min(...['[', '{'].map((c) => out.indexOf(c)).filter((i) => i >= 0))
  if (!Number.isFinite(at)) die(`eas ${args[0]} returned no JSON.\n${r.stderr || out}`)
  try {
    return JSON.parse(out.slice(at))
  } catch {
    return die(`Could not parse the response from eas ${args[0]}.\n${out.slice(at, at + 400)}`)
  }
}

const listBuilds = (limit = 15) =>
  easJson(['build:list', '--platform', 'android', '--limit', String(limit)])

const apkUrl = (b) => b?.artifacts?.applicationArchiveUrl || b?.artifacts?.buildUrl || ''
const fmtSize = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
const fmtAge = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m ago`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h ${mins % 60}m ago` : `${Math.floor(h / 24)}d ago`
}

// ------------------------------------------------------ pick/start a build --
say(`\nAS Company mobile - APK (${profile})\n`)

const recent = listBuilds().filter((b) => b.buildProfile === profile)
const running = recent.find((b) => !DONE[b.status])
let build

if (useLatest) {
  build = recent.find((b) => b.status === 'FINISHED')
  if (!build) die(`No finished ${profile} build to download. Drop --latest to make one.`)
  say(`  Using the build from ${fmtAge(build.createdAt)} (version ${build.appVersion}).`)
} else if (running && !forceNew) {
  // Starting a second build here would burn a credit for an identical artifact.
  build = running
  say(`  A ${profile} build is already ${running.status.toLowerCase().replace('_', ' ')}`)
  say(`  (started ${fmtAge(running.createdAt)}) - waiting for that one.`)
  say('  Pass --force-new to build again anyway.')
} else {
  say('  Starting a build on EAS...\n')
  const started = Date.now()
  const r = npx(
    [...EAS, 'build', '--platform', 'android', '--profile', profile, '--non-interactive', '--no-wait'],
    { stdio: 'inherit' },
  )
  if (r.status !== 0) die('eas build failed to start - see the output above.')
  build = listBuilds().find(
    (b) => b.buildProfile === profile && new Date(b.createdAt).getTime() >= started - 60_000,
  )
  if (!build) die('The build started but could not be found in the build list.')
}

// -------------------------------------------------------------- wait for it --
if (!DONE[build.status]) {
  const { ownerAccount, slug } = build.project
  say(`\n  Build ${build.id}`)
  say(`  https://expo.dev/accounts/${ownerAccount.name}/projects/${slug}/builds/${build.id}`)
  say('\n  EAS builds take roughly 10-20 minutes. Safe to leave this running.\n')
  const started = Date.now()
  let last = ''
  /* eslint-disable no-await-in-loop */
  while (!DONE[build.status]) {
    await new Promise((r) => setTimeout(r, POLL_MS))
    const fresh = listBuilds().find((b) => b.id === build.id)
    if (fresh) build = fresh
    const line = `  ${build.status.toLowerCase().replace('_', ' ')} - ${Math.floor((Date.now() - started) / 60000)}m elapsed`
    if (line !== last) {
      process.stdout.write(`\r${' '.repeat(last.length)}\r${line}`)
      last = line
    }
  }
  /* eslint-enable no-await-in-loop */
  say('')
}

if (build.status !== 'FINISHED') {
  die(`Build ${build.status.toLowerCase()}. Logs: ${build.logFiles?.[0] || 'see expo.dev'}`)
}

// ------------------------------------------------------------------ download --
const url = apkUrl(build)
if (!url) die('The build finished but carries no APK artifact. Is this profile buildType: apk?')

mkdirSync(OUT_DIR, { recursive: true })
const file = join(OUT_DIR, `as-company-${profile}-v${build.appVersion}-${build.appBuildVersion}.apk`)

say('\n  Downloading APK...')
const res = await fetch(url)
if (!res.ok) die(`Download failed - ${res.status} ${res.statusText}`)
await pipeline(Readable.fromWeb(res.body), createWriteStream(file))
const size = statSync(file).size
say(`  ok  ${file}  (${fmtSize(size)})`)

// -------------------------------------------------------- onto the phone --
/** adb is rarely on PATH on Windows, but it is wherever Android Studio put it. */
function findAdb() {
  const works = (cmd) => sh(cmd, ['version'], { encoding: 'utf8' }).status === 0
  if (works('adb')) return 'adb'
  return (
    [
      process.env.ANDROID_HOME && join(process.env.ANDROID_HOME, 'platform-tools', 'adb'),
      process.env.ANDROID_SDK_ROOT && join(process.env.ANDROID_SDK_ROOT, 'platform-tools', 'adb'),
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
      process.env.HOME && join(process.env.HOME, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    ]
      .filter(Boolean)
      .find(works) || ''
  )
}

const adb = skipInstall ? '' : findAdb()
const devices = adb
  ? (sh(adb, ['devices'], { encoding: 'utf8' }).stdout || '')
      .split('\n')
      .slice(1)
      .filter((l) => l.trim().endsWith('\tdevice'))
  : []

if (adb && devices.length) {
  say(`\n  Installing over USB (${devices.length} device${devices.length > 1 ? 's' : ''})...`)
  if (sh(adb, ['install', '-r', file], { stdio: 'inherit' }).status === 0) {
    say('\n  ok  Installed. Look for "AS Company" in your app drawer.\n')
    process.exit(0)
  }
  say('\n  adb install failed - falling back to the download link.')
}

if (skipServe) {
  say(`\n  APK saved. Direct link (expires ${new Date(build.expirationDate).toDateString()}):`)
  say(`  ${url}\n`)
  process.exit(0)
}

/** First non-internal IPv4 — the address the phone can reach over Wi-Fi. */
const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((n) => n && n.family === 'IPv4' && !n.internal)?.address

const server = createServer((req, res) => {
  if (req.url === '/favicon.ico') return res.writeHead(404).end()
  res.writeHead(200, {
    'Content-Type': 'application/vnd.android.package-archive',
    'Content-Length': size,
    'Content-Disposition': `attachment; filename="${basename(file)}"`,
  })
  say('  -> phone is downloading...')
  return pipeline(createReadStream(file), res)
    .then(() => say('  ok  Sent. Open it from the phone\'s notification shade to install.'))
    .catch(() => say('  (download interrupted - just reload on the phone)'))
})

server.on('error', (e) =>
  die(
    e.code === 'EADDRINUSE'
      ? `Port ${port} is busy. Re-run with --port 8091.`
      : `Local server failed: ${e.message}`,
  ),
)

server.listen(port, () => {
  say('\n  -- Get it on your Samsung -----------------------------------')
  say('\n  Make sure the phone is on the same Wi-Fi, then open:\n')
  say(`      http://${lanIp || 'localhost'}:${port}\n`)
  say('  Chrome will download the APK. Tap it, and allow "Install unknown')
  say('  apps" for Chrome when Android asks (Settings > Apps > Chrome >')
  say('  Install unknown apps). That prompt is normal for sideloading.')
  say('\n  Leave this running until the phone has it. Ctrl-C when done.')
  say(`\n  Alternatives: copy ${basename(file)} over the USB cable, or use`)
  say(`  the EAS link (expires ${new Date(build.expirationDate).toDateString()}):`)
  say(`  ${url}\n`)
})
