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
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
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
      '  --bluestacks       install into BlueStacks instead of a real phone',
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
const wantBluestacks = has('--bluestacks') || has('--bs')

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

// A finished build's artifact never changes, so a matching local copy is the
// same bytes — no point pulling 90 MB again on every run.
const onDisk = existsSync(file) ? statSync(file).size : 0
const expected = Number(
  (await fetch(url, { method: 'HEAD' }).catch(() => null))?.headers.get('content-length') || 0,
)

if (onDisk && onDisk === expected) {
  say(`\n  ok  Already downloaded: ${file}  (${fmtSize(onDisk)})`)
} else {
  say('\n  Downloading APK...')
  const res = await fetch(url)
  if (!res.ok) die(`Download failed - ${res.status} ${res.statusText}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file))
  say(`  ok  ${file}  (${fmtSize(statSync(file).size)})`)
}
const size = statSync(file).size

// -------------------------------------------------------- onto the phone --
const BLUESTACKS_DIRS = [
  `${process.env.ProgramFiles}\\BlueStacks_nxt`,
  `${process.env['ProgramFiles(x86)']}\\BlueStacks_nxt`,
]
const bluestacksDir = isWin ? BLUESTACKS_DIRS.find((d) => existsSync(d)) : ''

/**
 * BlueStacks listens for adb on a per-instance port recorded in its conf —
 * 5555 for the first instance, 5565/5575/... for extra ones. Reading the file
 * beats guessing, but fall back to the usual suspects if it is not there.
 */
function bluestacksPorts() {
  const conf = `${process.env.ProgramData}\\BlueStacks_nxt\\bluestacks.conf`
  try {
    const found = [...readFileSync(conf, 'utf8').matchAll(/status\.adb_port="(\d+)"/g)].map((m) => m[1])
    if (found.length) return [...new Set(found)]
  } catch {
    /* not installed, or no conf yet */
  }
  return ['5555', '5565', '5575']
}

/** adb is rarely on PATH on Windows. Prefer a real SDK one; BlueStacks ships its own. */
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
      bluestacksDir && join(bluestacksDir, 'HD-Adb.exe'),
    ]
      .filter(Boolean)
      .find(works) || ''
  )
}

/**
 * BlueStacks ships with ADB access switched off (bst.enable_adb_access="0"),
 * and with it off the port still accepts a connection but every shell/sync
 * request comes back "closed" — which adb reports as an unhelpful
 * "connect error for write". Read the flag rather than letting install fail.
 */
const bluestacksAdbOn = (() => {
  try {
    return /bst\.enable_adb_access="1"/.test(
      readFileSync(`${process.env.ProgramData}\\BlueStacks_nxt\\bluestacks.conf`, 'utf8'),
    )
  } catch {
    return false
  }
})()

// --bluestacks goes through the file association, so adb is not consulted at all.
const adb = skipInstall || wantBluestacks ? '' : findAdb()

// Emulators speak adb over TCP but only show up once something connects to them.
if (adb && bluestacksDir && bluestacksAdbOn) {
  const hit = bluestacksPorts().find(
    (p) => `${sh(adb, ['connect', `127.0.0.1:${p}`], { encoding: 'utf8' }).stdout || ''}`.match(/connected to/i),
  )
  if (hit) say(`\n  BlueStacks is up on port ${hit}.`)
}

// With BlueStacks' ADB access off, a stale adb server still lists its emulator
// but every install to it dies with "connect error for write: closed". Don't
// offer it as a target — a real phone over USB is the only thing that can work.
const unreachableEmulator = (serial) =>
  bluestacksDir && !bluestacksAdbOn && /^(emulator-|127\.0\.0\.1:|localhost:)/.test(serial)

const devices = adb
  ? (sh(adb, ['devices'], { encoding: 'utf8' }).stdout || '')
      .split('\n')
      .slice(1)
      .filter((l) => l.trim().endsWith('\tdevice'))
      .map((l) => l.split('\t')[0].trim())
      .filter((s) => !unreachableEmulator(s))
  : []

if (adb && devices.length) {
  say(`\n  Installing to ${devices.join(', ')} ...`)
  if (sh(adb, ['-s', devices[0], 'install', '-r', file], { stdio: 'inherit' }).status === 0) {
    say('\n  ok  Installed. Look for "AS Company" in the app drawer.\n')
    process.exit(0)
  }
  say('\n  adb install failed - falling back below.')
}

/**
 * Windows registers BlueStacks as the .apk handler, so handing the file to the
 * shell installs it. This is the only route that works with ADB access off,
 * which is how BlueStacks ships. Opt-in, so it never steals a run meant for a
 * real phone on a machine that happens to have BlueStacks installed.
 */
if (wantBluestacks && isWin) {
  if (!bluestacksDir) die('BlueStacks does not look installed - no BlueStacks_nxt folder.')
  say('\n  Handing the APK to BlueStacks...')
  if (!bluestacksAdbOn) {
    say('  (ADB access is off in BlueStacks, so adb install is not available.')
    say('   Turn on Settings > Advanced > Android Debug Bridge to enable it.)')
  }
  const r = sh('cmd', ['/c', 'start', '""', file])
  if (r.status === 0) {
    say('\n  ok  Sent to BlueStacks. Accept its install prompt, then look for')
    say('      "AS Company" on the BlueStacks home screen.\n')
    process.exit(0)
  }
  say('  Could not launch it - open the file manually (path below).')
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

// A previous run left holding the port shouldn't cost you the whole download.
let tryPort = port
server.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') die(`Local server failed: ${e.message}`)
  if (tryPort - port >= 5) die(`Ports ${port}-${tryPort} are all busy. Pass --port <n>.`)
  tryPort += 1
  say(`  (port ${tryPort - 1} busy, trying ${tryPort})`)
  server.listen(tryPort)
})

server.on('listening', () => {
  const bound = server.address().port
  if (bluestacksDir) {
    say('\n  Testing on BlueStacks instead? Re-run with --bluestacks,')
    say('  or just double-click the .apk (Windows opens it with BlueStacks).')
  }
  say('\n  -- Get it on your phone -------------------------------------')
  say('\n  Make sure the phone is on the same Wi-Fi, then open:\n')
  say(`      http://${lanIp || 'localhost'}:${bound}\n`)
  say('  Chrome will download the APK. Tap it, and allow "Install unknown')
  say('  apps" for Chrome when Android asks (Settings > Apps > Chrome >')
  say('  Install unknown apps). That prompt is normal for sideloading.')
  say('\n  Leave this running until the phone has it. Ctrl-C when done.')
  say(`\n  Alternatives: copy ${basename(file)} over the USB cable, or use`)
  say(`  the EAS link (expires ${new Date(build.expirationDate).toDateString()}):`)
  say(`  ${url}\n`)
})

server.listen(port)
