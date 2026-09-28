import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Produces a self-contained server release: dependencies are bundled, so the host needs only Node.
const out = resolve(process.argv[2] ?? '.deploy-out/release');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const git = (...args) => { try { return execFileSync('git', args, { encoding: 'utf8' }).trim(); } catch { return 'nogit'; } };
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain') ? '-dirty' : '';
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await build({
  entryPoints: { server: 'services/control-api/src/main.ts', migrate: 'services/control-api/src/migrate.ts', admin: 'services/control-api/src/admin.ts' },
  outdir: resolve(out, 'dist'), outExtension: { '.js': '.mjs' }, bundle: true, splitting: true, platform: 'node', format: 'esm', target: 'node22',
  // Bundled CommonJS dependencies still call require() for Node built-ins.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  external: ['pg-native', 'bufferutil', 'utf-8-validate'], sourcemap: true, legalComments: 'none', logLevel: 'warning'
});
await cp('services/control-api/migrations', resolve(out, 'migrations'), { recursive: true });
await writeFile(resolve(out, 'build-info.json'), `${JSON.stringify({ version: pkg.version, commit: commit + dirty, builtAt: new Date().toISOString() }, null, 2)}\n`);
console.log(`Server release built in ${out} (${pkg.version}, ${commit}${dirty})`);
