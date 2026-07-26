#!/usr/bin/env node
/**
 * `npm run deploy` entry point — picks the right deployer for the machine
 * you are on, so the same command works from Windows and from the VPS.
 *
 *   Windows / macOS (a dev machine) → deploy.ps1, which SSHes into the VPS.
 *   Linux with the repo present      → deploy.sh directly (you are ON the VPS).
 *
 * Flags are passed through. POSIX-style flags are translated to their
 * PowerShell parameter names on Windows, so `--branch main --force-migrate`
 * works everywhere.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)

// On the VPS, deploy.sh is the real deployer. Anywhere else we drive it over SSH.
// `--here` forces the local/bash path (useful when testing on a Linux dev box).
const onServer = process.platform !== 'win32' && !argv.includes('--remote')
const args = argv.filter((a) => a !== '--remote' && a !== '--here')

let cmd
let cmdArgs

if (onServer) {
  const script = join(root, 'deploy.sh')
  if (!existsSync(script)) fail(`deploy.sh not found at ${script}`)
  cmd = 'bash'
  cmdArgs = [script, ...args]
} else {
  const script = join(root, 'deploy.ps1')
  if (!existsSync(script)) fail(`deploy.ps1 not found at ${script}`)

  // --branch main → -Branch main ; --force-migrate → -ForceMigrate
  const flag = (s) => '-' + s.replace(/^--/, '').replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase())
  const ps = args.map((a) => (a.startsWith('--') ? flag(a) : a))

  const shell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
  cmd = shell
  cmdArgs = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...ps]
}

const child = spawn(cmd, cmdArgs, { stdio: 'inherit', cwd: root })
child.on('error', (err) => {
  if (err.code === 'ENOENT') fail(`'${cmd}' was not found on PATH.`)
  fail(err.message)
})
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1))

function fail(msg) {
  console.error(`\nDeploy could not start: ${msg}\n`)
  process.exit(1)
}
