// ---------------------------------------------------------------------------
// The events sync's daily run.
//
// No cron: the API checks once a minute whether `event_sync_schedule.next_run_at`
// has passed, and if so claims it — moving the clock to the next morning in the
// same UPDATE that decides to run. That single statement is what makes it fire
// once: a second API process sharing the database sees the moved clock and
// does nothing. It also makes a missed run catch up: if the API was down at
// 07:00 it runs as soon as it is back, once, and resumes the next morning.
//
// The time is Beirut wall-clock time whatever zone the VPS keeps, so "07:00"
// stays 07:00 across the summer-time change. Lebanon changes its clocks at
// midnight, so a morning time is never skipped or repeated.
// ---------------------------------------------------------------------------
import { query } from './db.js'

export const SCHEDULE_TZ = 'Asia/Beirut'
const TICK_MS = 60_000

export const isRunAt = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ''))

const zoneFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHEDULE_TZ, hourCycle: 'h23',
  year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
})

// What the zone's clock reads at `ms`, as if that reading were UTC.
function wallClock(ms) {
  const p = Object.fromEntries(zoneFmt.formatToParts(new Date(ms)).map((x) => [x.type, Number(x.value)]))
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
}

// The instant the zone's clock reads y-m-d hh:mm (day may overflow the month).
function zonedInstant(y, m, d, hh, mm) {
  const target = Date.UTC(y, m - 1, d, hh, mm)
  let at = target - (wallClock(target) - target)
  at += target - wallClock(at) // second pass settles a guess made across a clock change
  return new Date(at)
}

/** The first `runAt` (HH:MM, Beirut) strictly after `now`. */
export function nextRunAfter(runAt, now = new Date()) {
  const [hh, mm] = runAt.split(':').map(Number)
  const today = new Date(wallClock(now.getTime()))
  const y = today.getUTCFullYear()
  const m = today.getUTCMonth() + 1
  const d = today.getUTCDate()
  const at = zonedInstant(y, m, d, hh, mm)
  return at > now ? at : zonedInstant(y, m, d + 1, hh, mm)
}

let lastWarning = ''
const warnOnce = (msg) => {
  if (msg !== lastWarning) console.warn(`[events-sync] ${msg}`)
  lastWarning = msg
}

/**
 * Start the minute ticker. `onDue(row)` is called with the schedule row each
 * time a run is claimed; it decides what to start.
 */
export function startSchedule(onDue) {
  const tick = async () => {
    try {
      const { rows } = await query('SELECT run_at FROM event_sync_schedule WHERE id = 1 AND enabled')
      if (!rows[0]) return
      const next = nextRunAfter(rows[0].run_at)
      // Switched on outside the admin (or the clock was lost): set it, don't run.
      await query(
        'UPDATE event_sync_schedule SET next_run_at = $1 WHERE id = 1 AND enabled AND next_run_at IS NULL',
        [next]
      )
      const claim = await query(
        `UPDATE event_sync_schedule SET next_run_at = $1
          WHERE id = 1 AND enabled AND next_run_at <= now()
          RETURNING *`,
        [next]
      )
      lastWarning = ''
      if (claim.rows[0]) await onDue(claim.rows[0])
    } catch (err) {
      warnOnce(`schedule check failed: ${err.message}`)
    }
  }
  setTimeout(tick, 10_000).unref()
  setInterval(tick, TICK_MS).unref()
}
