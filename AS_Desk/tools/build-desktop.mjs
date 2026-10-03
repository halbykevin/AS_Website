import { build as viteBuild } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Builds the web UI that the Tauri shell (apps/desktop/src-tauri) embeds. The server shown in the
// setup form: COMPANY_REMOTE_SERVER, else companyRemote.defaultServer in apps/desktop/package.json
// (src-tauri/build.rs reads the same setting for automatic first-run registration).
const desktop = JSON.parse(await readFile('apps/desktop/package.json', 'utf8'));
const defaultServer = process.env.COMPANY_REMOTE_SERVER ?? desktop.companyRemote?.defaultServer ?? '';
if (defaultServer && !/^https:\/\/[a-z0-9.-]+$/.test(defaultServer)) throw new Error(`Invalid default server: ${defaultServer}`);
// The oldest engines the UI runs on: WebView2 109, the last for Windows 7 and 8 (the Windows 7 edition
// ships it; see docs/windows7.md), and the WebKit of macOS 13 (Safari 16; docs/macos.md). Syntax and
// CSS are lowered to both; newer browser APIs need a fallback.
const ENGINES = ['chrome109', 'edge109', 'safari16'];
await viteBuild({ root: resolve('apps/desktop'), base: './', build: { outDir: 'dist/ui', emptyOutDir: true, target: ENGINES }, configFile: false, logLevel: 'warn',
  define: { __DEFAULT_SERVER__: JSON.stringify(defaultServer) } });
console.log(`Desktop UI built (${desktop.version}, default server ${defaultServer || 'none'})`);
