#!/usr/bin/env node
/**
 * One command: scrape the source shop from THIS machine, then update the live
 * AS Store catalog with what it found.
 *
 *   cd as_store && npm run sync-catalog
 *
 * It exists because the shop blocks the VPS's IP, so the admin "Import products"
 * page comes back empty. Everything that needs to talk to the shop happens here
 * on your laptop; only the finished data and photos travel to the server.
 *
 *   1. scrape           python scraper/scrape.py  →  products.json
 *   2. photos           downloaded locally, named the way the import expects
 *   3. upload           one tarball + products.json over scp
 *   4. photos in place  unpacked into the API's UPLOAD_DIR (before any DB write,
 *                       so no product ever points at an image that isn't there)
 *   5. backup           pg_dump of the live database
 *   6. dry run          prints what would change — then asks you
 *   7. import           updates existing products, inserts new ones, hides the
 *                       ones the shop has dropped, purges the storefront cache
 *
 * A whole-catalog run is a mirror: a product that is no longer on the shop is
 * hidden here too (--no-delist opts out). Hidden, never deleted — see
 * as_store/OFFLINE-IMPORT.md. Your hand-uploaded category images are
 * snapshotted and verified by step 7 itself.
 *
 * The VPS target comes from deploy.env at the repo root — the same file
 * `npm run deploy` uses.
 */

import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const AS_STORE = path.join(HERE, '..')
const ROOT = path.join(AS_STORE, '..')
const SCRAPER_DIR = path.join(AS_STORE, 'scraper')
const SERVER_DIR = path.join(AS_STORE, 'server')

const USAGE = `
Scrape the source shop here, then update the live AS Store.

  npm run sync-catalog -- [options]

  --url <url>       Shop to scrape            (default https://pacmax.me)
  --mode <mode>     site | auto | crawl | single  (default site = whole catalog)
  --limit <n>       Stop after n products     (default 0 = everything)
  --workers <n>     Parallel fetches          (default 10)
  --reuse <dir>     Skip the scrape, use an existing run folder
  --no-delist       Keep products the shop no longer sells (default: hide them)
  --delist-floor <n>  How much of what we still list the scrape must cover before
                    the mirror is trusted, 0-1 (default 0.5). Lower it only when
                    you know the shop really has shrunk that much — it is the one
                    guard between a half-finished crawl and a mass hiding.
  --dry-run         Stop after showing what the import would change
  --yes             Don't ask before writing to the live database
  --deploy          Put the import tool on the VPS first if it isn't there yet
                    (commits the tooling files, pushes, deploys). One-time.
`

// --- output helpers --------------------------------------------------------
const C = process.stdout.isTTY
  ? { dim: '\x1b[2m', bold: '\x1b[1m', red: '\x1b[31m', green: '\x1b[32m', cyan: '\x1b[36m', off: '\x1b[0m' }
  : { dim: '', bold: '', red: '', green: '', cyan: '', off: '' }

let stepNo = 0
const step = (msg) => console.log(`\n${C.cyan}${C.bold}[${++stepNo}] ${msg}${C.off}`)
const info = (msg) => console.log(`    ${msg}`)
const dim = (msg) => console.log(`${C.dim}    ${msg}${C.off}`)
function fail(msg) {
  console.error(`\n${C.red}x ${msg}${C.off}\n`)
  process.exit(1)
}

// --- args ------------------------------------------------------------------
const opts = { url: 'https://pacmax.me', mode: 'site', limit: 0, workers: 10, reuse: '', dryRun: false, yes: false, deploy: false, delist: true, delistFloor: null }
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--url') opts.url = argv[++i]
  else if (a === '--mode') opts.mode = argv[++i]
  else if (a === '--limit') opts.limit = Number(argv[++i])
  else if (a === '--workers') opts.workers = Number(argv[++i])
  else if (a === '--reuse') opts.reuse = argv[++i]
  else if (a === '--no-delist') opts.delist = false
  else if (a === '--delist-floor') opts.delistFloor = Number(argv[++i])
  else if (a === '--dry-run') opts.dryRun = true
  else if (a === '--yes' || a === '-y') opts.yes = true
  else if (a === '--deploy') opts.deploy = true
  else if (a === '-h' || a === '--help') { console.log(USAGE); process.exit(0) }
  else fail(`Unknown option: ${a}\n${USAGE}`)
}

// --- elapsed / remaining ---------------------------------------------------
const started = Date.now()
function duration(ms) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

// Run a command, streaming its output. Rejects on a non-zero exit.
//
// `progress` turns a child's own "[483/1330]" chatter into a time estimate: the
// long steps here are a 20-minute scrape and a few thousand image downloads, and
// watching them without knowing how much is left is the worst part of the job.
function run(cmd, args, { cwd = ROOT, stdin = null, quiet = false, progress = null, noStdin = false, okCodes = [0] } = {}) {
  return new Promise((resolve, reject) => {
    if (!quiet) dim(`$ ${cmd} ${args.join(' ')}`)
    const t0 = Date.now()
    const child = spawn(cmd, args, {
      cwd,
      stdio: [noStdin ? 'ignore' : stdin === null ? 'inherit' : 'pipe', progress ? 'pipe' : 'inherit', progress ? 'pipe' : 'inherit'],
      env: { ...process.env, PYTHONUNBUFFERED: '1', AS_SYNC_CATALOG: '1' },
    })

    if (progress) {
      let buf = ''
      let firstAt = 0
      let firstDone = 0
      let lastShown = 0

      const show = (done, total, force = false) => {
        const now = Date.now()
        if (!force && now - lastShown < 10_000) return
        lastShown = now
        const pct = Math.round((done / total) * 100)
        // Rate from the first counted item, not from process start — the scraper
        // spends its first minutes collecting links, which would skew it slow.
        const elapsed = now - (firstAt || now)
        const rate = elapsed > 0 ? (done - firstDone) / elapsed : 0
        const left =
          done >= total ? 'done'
          : rate > 0 ? `about ${duration((total - done) / rate)} left`
          : 'estimating…'
        console.log(`${C.cyan}    ── ${done}/${total} (${pct}%) · ${duration(now - t0)} elapsed · ${left}${C.off}`)
      }

      const onChunk = (chunk) => {
        buf += chunk.toString()
        const lines = buf.split(/\r?\n/)
        buf = lines.pop() ?? ''
        for (const line of lines) {
          console.log(line)
          const p = progress(line)
          if (!p) continue
          if (p.counting) {
            // No total yet (the scraper is still discovering products).
            if (Date.now() - lastShown > 10_000) {
              lastShown = Date.now()
              console.log(`${C.cyan}    ── ${p.counting} found so far · ${duration(Date.now() - t0)} elapsed${C.off}`)
            }
            continue
          }
          if (!firstAt) {
            firstAt = Date.now()
            firstDone = p.done
          }
          show(p.done, p.total, p.done === p.total)
        }
      }
      child.stdout.on('data', onChunk)
      child.stderr.on('data', onChunk)
    }

    child.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? `'${cmd}' is not on your PATH.` : e.message)))
    child.on('exit', (code) => {
      if (progress) dim(`(${duration(Date.now() - t0)})`)
      okCodes.includes(code) ? resolve(code) : reject(new Error(`${cmd} exited with ${code}`))
    })
    if (stdin !== null) {
      child.stdin.write(stdin)
      child.stdin.end()
    }
  })
}

// "[483/1330] Product name — 218.0 USD" while scraping products, and
// "page 7: +25 product(s) (total 175)" while still collecting links.
const scrapeProgress = (line) => {
  const m = /^\s*\[(\d+)\/(\d+)\]/.exec(line)
  if (m) return { done: Number(m[1]), total: Number(m[2]) }
  const c = /\(total (\d+)\)\s*$/.exec(line)
  return c ? { counting: Number(c[1]) } : null
}

// "  …1200/3677  (downloaded 900, already there 300, failed 0)"
const stageProgress = (line) => {
  const m = /(\d+)\/(\d+)\s+\(downloaded/.exec(line)
  return m ? { done: Number(m[1]), total: Number(m[2]) } : null
}

// Same, but captures stdout — for the small probe commands.
function capture(cmd, args, { stdin = null, cwd = ROOT } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: [stdin === null ? 'ignore' : 'pipe', 'pipe', 'inherit'] })
    let out = ''
    child.stdout.on('data', (d) => (out += d))
    child.on('error', (e) => reject(new Error(e.code === 'ENOENT' ? `'${cmd}' is not on your PATH.` : e.message)))
    child.on('exit', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} exited with ${code}`))))
    if (stdin !== null) {
      child.stdin.write(stdin)
      child.stdin.end()
    }
  })
}

async function confirm(question) {
  if (opts.yes) return true
  if (!process.stdin.isTTY) fail(`${question}\n  No terminal to ask in — re-run with --yes if that is what you want.`)
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question(`\n${C.bold}${question}${C.off} [y/N] `)).trim().toLowerCase()
  rl.close()
  // Let go of the console: readline leaves stdin flowing and referenced, which
  // both keeps the process alive at exit and confuses child processes that
  // inherit the handle.
  process.stdin.pause()
  return answer === 'y' || answer === 'yes'
}

// --- the VPS, from deploy.env ----------------------------------------------
function loadTarget() {
  const file = path.join(ROOT, 'deploy.env')
  if (!fs.existsSync(file)) {
    fail(`deploy.env not found at ${file}.\n  Run \`npm run deploy:store\` once from the repo root — it creates it.`)
  }
  const cfg = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (m && !line.trimStart().startsWith('#')) cfg[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  const host = cfg.DEPLOY_HOST
  if (!host) fail('DEPLOY_HOST is missing from deploy.env.')
  return {
    host,
    user: cfg.DEPLOY_USER || 'root',
    port: cfg.DEPLOY_PORT || '22',
    remotePath: cfg.DEPLOY_PATH || '/opt/as-company',
    key: cfg.DEPLOY_KEY || path.join(process.env.USERPROFILE || process.env.HOME || '', '.ssh', 'id_ed25519'),
  }
}

const T = loadTarget()
const TARGET = `${T.user}@${T.host}`
const SSH_ARGS = ['-i', T.key, '-p', T.port, '-o', 'StrictHostKeyChecking=accept-new']
const SCP_ARGS = ['-i', T.key, '-P', T.port, '-o', 'StrictHostKeyChecking=accept-new'] // scp wants -P
const REMOTE_SERVER = `${T.remotePath}/as_store/server`

// Remote scripts go over stdin (`bash -s`) so nothing has to survive a round of
// shell quoting on the way there.
const remote = (script, { quiet = false, okCodes = [0] } = {}) =>
  run('ssh', [...SSH_ARGS, TARGET, 'bash -s'], { stdin: script, quiet, okCodes })
const remoteCapture = (script) => capture('ssh', [...SSH_ARGS, TARGET, 'bash -s'], { stdin: script })

// ===========================================================================
// Mirroring only makes sense for a run that could have seen the whole shop.
// A single-product, one-category or --limit run legitimately brings back a
// fraction of the catalog, and calling the remainder "delisted" would hide the
// store. The import re-checks this against the database (--delist-floor).
const delist = opts.delist && opts.mode === 'site' && !(opts.limit > 0)
if (opts.delistFloor !== null && !(opts.delistFloor >= 0 && opts.delistFloor <= 1)) {
  fail('--delist-floor must be a number between 0 and 1.')
}
const FLOOR = delist && opts.delistFloor !== null ? ` --delist-floor ${opts.delistFloor}` : ''
const DELIST = delist ? ` --delist${FLOOR}` : ''

console.log(`${C.bold}AS Store — catalog sync${C.off}`)
info(`source:  ${opts.url}  (${opts.mode})`)
info(`target:  ${TARGET}:${T.port}  ${REMOTE_SERVER}`)
info(
  delist
    ? `mirror:  on — products no longer on ${opts.url.replace(/^https?:\/\//, '')} get hidden here`
    : `mirror:  off — products no longer on the shop stay live${opts.delist ? ' (partial run)' : ' (--no-delist)'}`,
)
if (FLOOR) {
  info(`floor:   ${Math.round(opts.delistFloor * 100)}% (lowered from 50%) — the scrape may hide that much of the catalog`)
}

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
const runDir = opts.reuse ? path.resolve(opts.reuse) : path.join(SERVER_DIR, 'scrapes', `sync-${stamp}`)
const productsFile = path.join(runDir, 'products.json')
const stageDir = path.join(runDir, 'stage')
const tarball = path.join(runDir, 'photos.tar.gz')
const remoteDir = `/tmp/as-catalog-sync-${stamp}`

// --- 1. scrape -------------------------------------------------------------
if (opts.reuse) {
  step('Scrape — skipped')
  if (!fs.existsSync(productsFile)) fail(`No products.json in ${runDir}`)
  info(`reusing ${productsFile}`)
} else {
  step(`Scraping ${opts.url}`)
  fs.mkdirSync(runDir, { recursive: true })
  const python = process.env.PYTHON_BIN || (process.platform === 'win32' ? 'python' : 'python3')
  const modeFlag = { site: '--site', auto: '--auto', crawl: '--crawl', single: '--url' }[opts.mode]
  if (!modeFlag) fail(`--mode must be one of site, auto, crawl, single`)
  const args = ['scrape.py', modeFlag, opts.url, '--out', runDir, '--name', 'products', '--format', 'json', '--workers', String(opts.workers)]
  if (opts.limit > 0) args.push('--limit', String(opts.limit))
  await run(python, args, { cwd: SCRAPER_DIR, progress: scrapeProgress }).catch((e) =>
    fail(`${e.message}\n  Is Python installed, with \`pip install -r scraper/requirements.txt\` done?`),
  )
}
if (!fs.existsSync(productsFile)) fail(`The scraper produced no products.json in ${runDir}`)
const products = JSON.parse(fs.readFileSync(productsFile, 'utf8'))
info(`${C.green}${products.length} product(s)${C.off} in ${productsFile}`)
if (!products.length) fail('Nothing was scraped — stopping before touching the live store.')

// --- 2. photos -------------------------------------------------------------
step('Downloading the product photos')
dim('(from here — the VPS cannot reach the shop, which is the whole point)')
await run(process.execPath, ['src/import-scrape.js', productsFile, '--stage-images', stageDir, '--workers', '8'], {
  cwd: SERVER_DIR,
  progress: stageProgress,
})
const staged = fs.existsSync(stageDir) ? fs.readdirSync(stageDir).filter((f) => f.startsWith('scrape-')) : []
if (!staged.length) fail('No photos were downloaded — stopping.')

// --- 3. what does the server already have? ---------------------------------
// The VPS keeps every photo a previous import downloaded, and they are named by
// a hash of the source URL — so anything it already has is byte-for-byte what we
// just staged. Sending only the difference turns a 300 MB upload into a handful
// of files, which matters on a box with a few GB free.
step('Checking the VPS')
const probe = await remoteCapture(`
cd '${REMOTE_SERVER}' 2>/dev/null || { echo 'IMPORT_TOOL=NO_CLONE'; exit 0; }
test -f src/import-scrape.js && echo 'IMPORT_TOOL=HAVE' || echo 'IMPORT_TOOL=MISSING'
UP=$(grep -oP '(?<=^UPLOAD_DIR=).*' .env | tr -d '"' | tr -d "'")
echo "UPLOAD_DIR=$UP"
echo '--FILES--'
ls -1 "$UP" 2>/dev/null | grep '^scrape-' || true
`).catch((e) => fail(`Could not reach ${TARGET}: ${e.message}`))

const [head, fileList = ''] = probe.split('--FILES--')
const present = /IMPORT_TOOL=(\w+)/.exec(head)?.[1]
const remoteUploadDir = /UPLOAD_DIR=(.*)/.exec(head)?.[1]?.trim()
if (present === 'NO_CLONE') fail(`${REMOTE_SERVER} does not exist on ${T.host}.`)
if (!remoteUploadDir) fail('Could not read UPLOAD_DIR from the API .env on the VPS.')
const remotePhotos = new Set(fileList.split('\n').map((s) => s.trim()).filter(Boolean))
info(`uploads dir: ${remoteUploadDir} (${remotePhotos.size} photo(s) already there)`)

if (present !== 'HAVE') {
  if (!opts.deploy) {
    fail(
      `The import tool isn't on the VPS yet.\n` +
        `  Re-run with --deploy and it will put it there:\n` +
        `      npm run sync-catalog -- --deploy`,
    )
  }
  info('not there yet — shipping it')

  // The VPS only ever gets code by pulling the branch, so anything still sitting
  // in the working tree has to be committed and pushed first. Only the paths this
  // tool actually needs — never a blanket `git add -A` over someone's repo.
  // `as_store/src` is in here because the storefront half of this feature ships
  // through the same push: Vercel rebuilds on it, and a product whose only photo
  // was the source shop's logo needs the fallback image or its page won't render.
  const SHIP_PATHS = [
    'as_store/scripts',
    'as_store/server/src',
    'as_store/src',
    // The schema the import needs (products.delisted_at). deploy.sh fingerprints
    // as_store/db/*.sql to decide whether to migrate, so leaving it out would
    // ship code that reads a column the live database doesn't have yet.
    'as_store/db',
    'as_store/server/package.json',
    'as_store/package.json',
    'as_store/OFFLINE-IMPORT.md',
    'as_store/server/README.md',
    'as_store/scraper/README.md',
  ]
  const pending = await capture('git', ['status', '--porcelain', '--', ...SHIP_PATHS])
  if (pending) {
    console.log(`\n    these files need to be committed and pushed for the VPS to get them:`)
    for (const line of pending.split('\n')) console.log(`      ${line.trim()}`)
    if (!(await confirm('Commit and push them?'))) fail('Nothing was committed — stopping.')
    await run('git', ['add', '--', ...SHIP_PATHS])
    await run('git', ['commit', '-m', 'chore(store): catalog sync tooling'])
  }

  const unpushed = await capture('git', ['rev-list', '--count', '@{u}..HEAD']).catch(() => '0')
  if (Number(unpushed) > 0) {
    info(`pushing ${unpushed} commit(s)`)
    await run('git', ['push'])
  }

  // Deploying is safe to retry — it fast-forwards the branch and health-checks
  // itself — so a failure here is a stop, never a half-applied state.
  //
  // noStdin is NOT optional: deploy.ps1 shells out to ssh, and an inherited
  // Windows console that this script has already used for a y/N prompt leaves
  // ssh blocking forever on its first remote probe. Handing the child no stdin
  // at all is what makes the integrated deploy work. deploy.env is required
  // above, so deploy.ps1 has nothing left to ask us.
  await run(process.execPath, [path.join(ROOT, 'scripts', 'deploy.mjs'), '--app', 'store'], { noStdin: true }).catch((e) =>
    fail(
      `The deploy did not finish: ${e.message}\n` +
        `  Your work is committed and pushed, so nothing is lost.\n` +
        `  Run it on its own to see why:  npm run deploy:store   (from as_store/ or the repo root)\n` +
        `  Then re-run this with:  npm run sync-catalog -- --reuse "${runDir}"`,
    ),
  )
  const again = await remoteCapture(`test -f '${REMOTE_SERVER}/src/import-scrape.js' && echo HAVE || echo MISSING`)
  if (again !== 'HAVE') fail('The deploy finished but the VPS still has no src/import-scrape.js.')
}
info('import tool present')

// --- 4. pack only the photos it is missing ---------------------------------
step('Packing the new photos')
const missing = staged.filter((f) => !remotePhotos.has(f))
info(`${staged.length} photo(s) here, ${staged.length - missing.length} already on the VPS → sending ${missing.length}`)

if (missing.length) {
  const listFile = path.join(runDir, 'to-upload.txt')
  fs.writeFileSync(listFile, missing.join('\n') + '\n')
  await run('tar', ['-czf', tarball, '-C', stageDir, '-T', listFile])
  info(`${(fs.statSync(tarball).size / 1024 / 1024).toFixed(1)} MB`)
}

// --- 5. upload + unpack the photos ----------------------------------------
step('Uploading')
await remote(`mkdir -p '${remoteDir}'`, { quiet: true })
await run('scp', [...SCP_ARGS, ...(missing.length ? [tarball] : []), productsFile, `${TARGET}:${remoteDir}/`])

if (missing.length) {
  step('Putting the photos in place')
  dim('(before any database write, so nothing can point at a missing image)')
  await remote(`
set -euo pipefail
UP='${remoteUploadDir}'
mkdir -p "$UP"
before=$(ls -1 "$UP" | wc -l)
tar -xzf '${remoteDir}/photos.tar.gz' -C "$UP"
after=$(ls -1 "$UP" | wc -l)
rm -f '${remoteDir}/photos.tar.gz'
echo "    uploads: $before files -> $after (+$((after - before)) new)"
df -h "$UP" | awk 'NR==2 {print "    disk free: " $4}'
`)
}

// --- 6. backup + dry run ---------------------------------------------------
step('Backing up the live database')
await remote(`
set -euo pipefail
cd '${REMOTE_SERVER}'
DB=$(grep -oP '(?<=^DATABASE_URL=).*' .env | tr -d '"' | tr -d "'")
pg_dump "$DB" > '${remoteDir}/as_store-before-import.sql'
echo "    $(du -h '${remoteDir}/as_store-before-import.sql' | cut -f1) -> ${remoteDir}/as_store-before-import.sql"
`)

step('Dry run — what the import would change')
await remote(`cd '${REMOTE_SERVER}' && node src/import-scrape.js '${remoteDir}/products.json' --dry-run${DELIST}`)

if (opts.dryRun) {
  console.log(`\n${C.green}Dry run only — the live database was not touched.${C.off}`)
  console.log(`Run it for real:  npm run sync-catalog -- --reuse "${runDir}"`)
  process.exit(0)
}

// --- 7. import -------------------------------------------------------------
const ask =
  delist ?
    `Update the live store with these ${products.length} product(s), and hide the ones listed above as gone?`
  : `Update the live store with these ${products.length} product(s)?`
if (!(await confirm(ask))) {
  console.log(`\nStopped. Nothing was written. The photos are already uploaded (harmless).`)
  console.log(`Resume later with:  npm run sync-catalog -- --reuse "${runDir}"`)
  process.exit(0)
}

step('Importing into the live catalog')
// Exit 3 = imported fine, but the delist guard judged the scrape too incomplete
// to mirror. Not a failure of the import, so it must not roll the run back —
// but it must not read as a clean success either.
const code = await remote(
  `cd '${REMOTE_SERVER}' && node src/import-scrape.js '${remoteDir}/products.json' --purge${DELIST}`,
  { okCodes: [0, 3] },
)

console.log(`\n${C.green}${C.bold}Live store updated${C.off} — ${duration(Date.now() - started)} in total.`)
if (code === 3) {
  console.log(`${C.red}But nothing was hidden — see DELISTING SKIPPED above. The catalog still lists${C.off}`)
  console.log(`${C.red}products the shop may have dropped.${C.off}`)
}
info(`backup:  ${TARGET}:${remoteDir}/as_store-before-import.sql`)
info(`local:   ${runDir}`)
