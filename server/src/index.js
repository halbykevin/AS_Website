import 'dotenv/config'
import { app } from './app.js'
import { mailEnabled } from './mailer.js'

const port = process.env.PORT || 8080
app.listen(port, () => {
  console.log(`AS Company API listening on port ${port}`)
  console.log(
    mailEnabled()
      ? '[mail] SMTP configured — prediction entry emails ON'
      : '[mail] SMTP not configured (SMTP_HOST/SMTP_USER/SMTP_PASS missing) — prediction entry emails OFF'
  )
})
