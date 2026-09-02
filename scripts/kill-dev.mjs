import { execFileSync } from 'node:child_process'
import { createServer } from 'node:net'

const isWin = process.platform === 'win32'

const PORTS = [
  [5173, 'vite — site (root)'],
  [5174, 'vite — fallback'],
  [5175, 'vite — fallback'],
  [5180, 'next — as_store'],
  [5181, 'next — as_ticketing'],
  [8080, 'express — site API (server/)'],
  [8081, 'express — store API (as_store/server/)'],
  [8082, 'expo/metro — mobile'],
  [8083, 'expo/metro — fallback'],
]

const argv = process.argv.slice(2)
const dry = argv.includes('--dry')
const targets = [...PORTS]

for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--port') continue
  const n = Number(argv[i + 1])
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    fail(`--port needs a port number, got '${argv[i + 1] ?? ''}'`)
  }
  targets.push([n, 'requested with --port'])
  i++
}

// Never kill ourselves, our shell, or the Windows kernel pseudo-processes.
const OFF_LIMITS = new Set([0, 4, process.pid, process.ppid].filter((n) => Number.isInteger(n)))

const listening = snapshot()
const names = processNames([...new Set([...listening.values()].flat())])

console.log(`\nAS Website — ${dry ? 'dev servers currently running' : 'stopping dev servers'}\n`)

let hits = 0
const reserved = []
for (const [port, what] of targets) {
  const pids = (listening.get(port) ?? []).filter((pid) => !OFF_LIMITS.has(pid))
  if (!pids.length) {
    console.log(`  ${String(port).padEnd(6)}${what.padEnd(42)}${await why(port)}`)
    continue
  }
  for (const pid of pids) {
    hits++
    const label = `${what.padEnd(42)}pid ${String(pid).padEnd(7)}${(names.get(pid) ?? '').padEnd(16)}`
    if (dry) {
      console.log(`  ${String(port).padEnd(6)}${label}would kill`)
    } else {
      const ok = kill(pid)
      console.log(`  ${String(port).padEnd(6)}${label}${ok ? 'killed' : 'could not kill'}`)
    }
  }
}

console.log(
  hits === 0
    ? '\nNo dev servers were running.'
    : dry
      ? `\n${hits} process(es) would be killed. Re-run without --dry.`
      : `\n${hits} process(es) stopped.`,
)

if (reserved.length) {
  // Group into contiguous runs so each netsh line reserves exactly one block.
  const runs = []
  for (const port of [...reserved].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1]
    if (last && port === last.start + last.count) last.count++
    else runs.push({ start: port, count: 1 })
  }
  const many = reserved.length > 1

  console.log(
    `\nHeads up: ${reserved.join(', ')} ${many ? 'are' : 'is'} reserved by Windows, not held by a\n` +
      `process — killing things will never free ${many ? 'them' : 'it'}. Hyper-V/WSL/Docker grab\n` +
      `dynamic port ranges on boot. Claim them back from an ADMIN shell:\n\n` +
      `  netsh int ipv4 show excludedportrange protocol=tcp\n` +
      `  net stop winnat\n` +
      runs
        .map(
          (r) =>
            `  netsh int ipv4 add excludedportrange protocol=tcp startport=${r.start} numberofports=${r.count} store=persistent\n`,
        )
        .join('') +
      `  net start winnat\n\n` +
      `That reservation is persistent and survives reboots, so the range stays\n` +
      `yours instead of going back to Hyper-V. (net stop winnat briefly drops\n` +
      `Docker/WSL networking.)`,
  )
}
console.log('')

/**
 * Explains a port that has no listener. "Free" is the normal answer, but on
 * Windows a port can be unusable with nothing holding it: Hyper-V/WSL/Docker
 * reserve dynamic ranges (`netsh int ipv4 show excludedportrange protocol=tcp`)
 * and binding inside one fails with EACCES. Dev servers report that as "port is
 * being used by another process", which sends you hunting for a process to kill
 * that does not exist — so name it here instead.
 */
async function why(port) {
  const code = await new Promise((resolve) => {
    const probe = createServer()
    probe.once('error', (err) => resolve(err.code))
    probe.once('listening', () => probe.close(() => resolve(null)))
    probe.listen(port, '0.0.0.0')
  })
  if (code === 'EACCES') {
    reserved.push(port)
    return 'RESERVED by Windows — nothing to kill (see below)'
  }
  if (code === 'EADDRINUSE') return 'in use, owner hidden — retry in an elevated shell'
  return 'not running'
}

/** Map of port -> [pid] for every LISTENING socket on the machine. */
function snapshot() {
  const map = new Map()
  const add = (port, pid) => {
    if (!Number.isInteger(pid)) return
    const list = map.get(port)
    if (list) { if (!list.includes(pid)) list.push(pid) } else map.set(port, [pid])
  }

  if (isWin) {
    // netstat is the one tool guaranteed to exist on a stock Windows box.
    // Rows look like: TCP    0.0.0.0:5180    0.0.0.0:0    LISTENING    21344
    for (const line of run('netstat', ['-ano', '-p', 'TCP']).split(/\r?\n/)) {
      const m = line.trim().match(/^TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)$/i)
      if (m) add(Number(m[2]), Number(m[3]))
    }
    return map
  }

  // lsof is the usual answer on macOS; ss covers a bare Linux box.
  const lsof = run('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn'])
  if (lsof) {
    // -F output is one field per line: `p<pid>` then `n<addr>:<port>` per socket.
    let pid = null
    for (const line of lsof.split('\n')) {
      if (line.startsWith('p')) pid = Number(line.slice(1))
      else if (line.startsWith('n')) {
        const m = line.match(/:(\d+)$/)
        if (m) add(Number(m[1]), pid)
      }
    }
    return map
  }

  for (const line of run('ss', ['-lntpH']).split('\n')) {
    const port = line.match(/\s\S*?:(\d+)\s/)
    const pid = line.match(/pid=(\d+)/)
    if (port && pid) add(Number(port[1]), Number(pid[1]))
  }
  return map
}

/** Best-effort pid -> executable name, purely so the output is readable. */
function processNames(pids) {
  const names = new Map()
  if (!pids.length) return names

  if (isWin) {
    for (const line of run('tasklist', ['/NH', '/FO', 'CSV']).split(/\r?\n/)) {
      const m = line.match(/^"([^"]+)","(\d+)"/)
      if (m) names.set(Number(m[2]), m[1])
    }
    return names
  }

  for (const line of run('ps', ['-o', 'pid=,comm=', '-p', pids.join(',')]).split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(.+)$/)
    if (m) names.set(Number(m[1]), m[2].split('/').pop())
  }
  return names
}

function kill(pid) {
  if (isWin) {
    // /T takes the process tree, /F skips the "are you sure" close request that
    // console apps like node never answer.
    return run('taskkill', ['/PID', String(pid), '/F', '/T'], true) !== null
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch (err) {
    return err.code === 'ESRCH' // already gone counts as success
  }
  // Give it a moment to close DB pools and sockets, then insist.
  const until = Date.now() + 800
  while (Date.now() < until) {
    try {
      process.kill(pid, 0)
    } catch {
      return true
    }
  }
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    /* raced us to exit */
  }
  return true
}

function run(cmd, args, strict = false) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    })
  } catch {
    // A non-zero exit just means "no matches" for netstat/lsof/ps/tasklist.
    return strict ? null : ''
  }
}

function fail(msg) {
  console.error(`\nkill-dev: ${msg}\n`)
  process.exit(1)
}
