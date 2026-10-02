import 'dotenv/config'
import { app } from './app.js'
import { startNotificationWorker } from './notifications/worker.js'
import { startLicenseRenewalWorker } from './licenseRenewal.js'

const port = process.env.PORT || 8081
app.listen(port, () => {
  console.log(`AS Store API listening on port ${port}`)
})

// Background notification worker (outbox → deliveries). Advisory-locked in
// Postgres, so extra PM2 instances are safe. NOTIFY_WORKER_DISABLED=1 turns it
// off (e.g. to run the worker in a dedicated process instead).
if (process.env.NOTIFY_WORKER_DISABLED !== '1') startNotificationWorker()

// Re-sends paid AS-Punch licence renewals the licence server has not yet
// acknowledged (see licenseRenewal.js). Reports are idempotent there, so a
// second instance doing the same is harmless.
startLicenseRenewalWorker()
