#!/usr/bin/env node
// Cross-platform entry for `npm run server:*`: runs deploy/asdesk.sh under bash
// (Git Bash on Windows), forwarding arguments and the terminal.
'use strict';
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

const script = path.join(__dirname, 'asdesk.sh');
let shell = 'bash';
if (process.platform === 'win32') {
  const candidates = [
    process.env.GIT_BASH,
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Git', 'bin', 'bash.exe')
  ].filter(Boolean);
  shell = candidates.find(candidate => existsSync(candidate));
  if (!shell) {
    console.error('[asdesk] Git Bash not found. Install Git for Windows or set GIT_BASH to bash.exe.');
    process.exit(1);
  }
}
const child = spawn(shell, [script, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
child.on('error', error => { console.error(`[asdesk] cannot start ${shell}: ${error.message}`); process.exit(1); });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
