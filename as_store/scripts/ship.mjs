#!/usr/bin/env node
// One-command deploy: stage everything, commit, push. Pushing to GitHub is what
// triggers the Vercel build for store.as.com.lb (and the marketing site), so this
// is the whole deploy. Works the same in PowerShell, cmd, and bash.
//
//   npm run ship                 -> commits with a timestamped message, pushes
//   npm run ship -- "your note"  -> commits with "your note", pushes
//
// git runs against the whole repo regardless of the folder you call it from.

import { execSync } from 'node:child_process'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

// Commit message: everything after the script name, or a timestamped default.
const msg =
  process.argv.slice(2).join(' ').trim() ||
  `chore: update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`

try {
  run('git add -A')

  // Anything staged? If not, skip the commit but still push (there may be
  // local commits that were never pushed).
  const staged = out('git diff --cached --name-only')
  if (staged) {
    console.log(`\nCommitting:\n${staged}\n`)
    // Pass the message via a temp arg so quotes/spaces survive every shell.
    execSync('git commit -F -', { input: msg, stdio: ['pipe', 'inherit', 'inherit'] })
  } else {
    console.log('\nNothing new to commit — pushing any unpushed commits.\n')
  }

  run('git push')
  console.log('\n✓ Pushed. Vercel will build and deploy store.as.com.lb automatically.')
} catch (err) {
  console.error('\n✗ Ship failed:', err.message)
  process.exit(1)
}
