import 'dotenv/config'
import { app } from './app.js'

const port = process.env.PORT || 8081
app.listen(port, () => {
  console.log(`AS Store API listening on port ${port}`)
})
