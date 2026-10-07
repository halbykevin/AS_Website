import 'dotenv/config'
import { app } from './app.js'
import { mailEnabled } from './mailer.js'
import { rebuildEnabled, startRebuildSchedule } from './rebuild.js'
import { startEventsSchedule } from './scraper.js'

const port = process.env.PORT || 8080
app.listen(port, () => {
  console.log(`AS Company API listening on port ${port}`)
  console.log(
    mailEnabled()
      ? '[mail] SMTP configured — prediction entry emails ON'
      : '[mail] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — prediction entry emails OFF'
  )
  console.log(
    rebuildEnabled()
      ? '[rebuild] deploy hook configured — content edits rebuild the pre-rendered site'
      : '[rebuild] SITE_REBUILD_HOOK_URL not set — pre-rendered pages refresh only on deploy'
  )
  startRebuildSchedule()
  startEventsSchedule()
})
