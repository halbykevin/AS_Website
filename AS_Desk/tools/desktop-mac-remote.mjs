import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { crc32, inflateRawSync } from 'node:zlib';

// The macOS edition, from a computer that is not a Mac (tools/desktop.mjs package|release --mac).
// A Mac app can only be built on macOS, so the "ASDesk macOS" workflow builds it on GitHub's Macs from
// the commit pushed for this branch; this starts it, follows it and unpacks its disk image into
// release/, ready for `npm run desktop:publish -- --mac`. A build already running or finished for the
// same commit is picked up instead of starting another (so a Ctrl+C loses nothing).
//
//   node tools/desktop-mac-remote.mjs package | release      (release: signed and notarized)
//   node tools/desktop-mac-remote.mjs --run <id>             (fetch the disk image of a finished run)
//
// GitHub access: GITHUB_TOKEN (or GH_TOKEN), else the github.com login `git push` already uses.
const WORKFLOW = 'asdesk-macos.yml';
const ARTIFACT = 'ASDesk-macOS';
const args = process.argv.slice(2);
const runArg = args.includes('--run') ? args[args.indexOf('--run') + 1] : undefined;
const mode = args.find(a => a === 'package' || a === 'release');
if (!runArg && !mode) throw new Error('Usage: node tools/desktop-mac-remote.mjs package | release | --run <id>');
if (runArg && !/^\d+$/.test(runArg)) throw new Error(`Not a workflow run id: ${runArg}`);

const git = (...a) => {
  const result = spawnSync('git', a, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${a.join(' ')} failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};
const origin = git('remote', 'get-url', 'origin');
const repo = origin.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/)?.[1];
if (!repo) throw new Error(`origin is not a GitHub repository: ${origin}`);

function token() {
  if (process.env.GITHUB_TOKEN || process.env.GH_TOKEN) return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const filled = spawnSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
  const password = filled.stdout?.match(/^password=(.+)$/m)?.[1];
  if (!password) throw new Error('No GitHub login found: sign in with `git push` once, or set GITHUB_TOKEN.');
  return password;
}
const auth = token();
async function github(path, init = {}) {
  const response = await fetch(path.startsWith('https://') ? path : `https://api.github.com/repos/${repo}${path}`, {
    ...init, headers: { Authorization: `Bearer ${auth}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
  });
  if (!response.ok) throw new Error(`GitHub ${init.method ?? 'GET'} ${path}: ${response.status} ${(await response.text()).slice(0, 300)}`);
  return response;
}
const json = async (path, init) => (await github(path, init)).json();
const sleep = ms => new Promise(done => setTimeout(done, ms));
const minutes = since => `${Math.floor((Date.now() - since) / 60000)}m${String(Math.floor(((Date.now() - since) % 60000) / 1000)).padStart(2, '0')}s`;

/** The run to follow: the one named, one already going (or done) for this commit, or a new one. */
async function findOrStartRun() {
  if (runArg) return json(`/actions/runs/${runArg}`);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch === 'HEAD') throw new Error('Check out a branch first: the build runs from what is pushed to a branch.');
  git('fetch', '--quiet', 'origin', branch);
  const local = git('rev-parse', 'HEAD');
  const pushed = spawnSync('git', ['rev-parse', `origin/${branch}`], { encoding: 'utf8' }).stdout.trim();
  if (local !== pushed) throw new Error(`Push ${branch} first: the Mac builds GitHub's copy (${pushed.slice(0, 7) || 'not on GitHub'}), and this computer has ${local.slice(0, 7)}.`);
  if (git('status', '--porcelain', '--', '.', '../.github')) console.warn('Note: uncommitted changes here are not part of the build.');

  // The workflow names each run after its mode (run-name), so a release is never mistaken for a package.
  const title = `ASDesk macOS ${mode}`;
  const runs = async () => (await json(`/actions/workflows/${WORKFLOW}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=20`)).workflow_runs;
  const reusable = (await runs()).find(r => r.head_sha === local && r.display_title === title && (r.status !== 'completed' || r.conclusion === 'success'));
  if (reusable) { console.log(`Following the ${reusable.status === 'completed' ? 'finished' : 'running'} build of ${local.slice(0, 7)}`); return reusable; }

  const known = new Set((await runs()).map(r => r.id));
  const started = Date.now();
  await github(`/actions/workflows/${WORKFLOW}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: branch, inputs: { release: mode === 'release' ? 'true' : 'false' } }) });
  console.log(`Started the ${mode} build of ${branch} at ${local.slice(0, 7)} on GitHub's Macs`);
  while (Date.now() - started < 120_000) {
    await sleep(4000);
    const run = (await runs()).find(r => !known.has(r.id) && r.head_sha === local);
    if (run) return run;
  }
  throw new Error(`The build was started but did not appear; see https://github.com/${repo}/actions/workflows/${WORKFLOW}`);
}

/** Prints each step as it finishes, until the run does. */
async function follow(run) {
  console.log(run.html_url);
  if (run.status === 'completed') return run;
  const since = new Date(run.created_at).getTime(), printed = new Set();
  process.on('SIGINT', () => { console.log('\nThe build keeps running on GitHub; run the same command again to pick it up.'); process.exit(130); });
  for (;;) {
    const { jobs } = await json(`/actions/runs/${run.id}/jobs`);
    for (const step of jobs.flatMap(j => j.steps ?? [])) {
      if (step.status !== 'completed' || printed.has(step.number) || step.conclusion === 'skipped') continue;
      printed.add(step.number);
      console.log(`  ${minutes(since).padStart(6)}  ${step.conclusion === 'success' ? '✓' : '✗'} ${step.name}`);
    }
    run = await json(`/actions/runs/${run.id}`);
    if (run.status === 'completed') return run;
    await sleep(20_000);
  }
}

/** The failed job's log, last lines, so the reason is on screen. */
async function explain(run) {
  const { jobs } = await json(`/actions/runs/${run.id}/jobs`);
  for (const job of jobs.filter(j => j.conclusion === 'failure')) {
    const failed = job.steps?.find(s => s.conclusion === 'failure');
    console.error(`\n✗ ${failed ? `"${failed.name}"` : job.name} failed. Last lines of its log:\n`);
    const log = await (await github(`/actions/jobs/${job.id}/logs`)).text();
    console.error(log.split('\n').slice(-60).map(line => line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /, '')).join('\n'));
  }
}

/** The files of a zip archive (GitHub artifacts: stored or deflated, no zip64). */
function unzip(zip) {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('The artifact is not a zip archive');
  const files = [];
  for (let at = zip.readUInt32LE(end + 16), n = zip.readUInt16LE(end + 10); n > 0; n--) {
    const method = zip.readUInt16LE(at + 10), crc = zip.readUInt32LE(at + 16), size = zip.readUInt32LE(at + 20);
    if (size === 0xffffffff) throw new Error('The artifact uses zip64, which this reader does not handle');
    const nameLength = zip.readUInt16LE(at + 28), local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(start, start + size);
    const data = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : undefined;
    if (!data || crc32(data) !== crc) throw new Error(`${name} in the artifact is damaged or uses an unknown compression`);
    files.push({ name, data });
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return files;
}

const run = await follow(await findOrStartRun());
if (run.conclusion !== 'success') {
  await explain(run).catch(error => console.error(`(could not read the log: ${error.message})`));
  throw new Error(`The macOS build ${run.conclusion}: ${run.html_url}`);
}
const { artifacts } = await json(`/actions/runs/${run.id}/artifacts`);
const artifact = artifacts.find(a => a.name === ARTIFACT && !a.expired);
if (!artifact) throw new Error(`The run has no ${ARTIFACT} artifact (it may have expired): ${run.html_url}`);
console.log(`Downloading the disk image (${(artifact.size_in_bytes / 1048576).toFixed(1)} MB)…`);
const files = unzip(Buffer.from(await (await github(artifact.archive_download_url)).arrayBuffer()));
mkdirSync('release', { recursive: true });
for (const { name, data } of files) {
  if (!/^ASDesk-\d+\.\d+\.\d+-macos-universal\.dmg(\.json)?$/.test(name)) throw new Error(`Unexpected file in the artifact: ${name}`);
  writeFileSync(join('release', name), data);
}
const image = files.find(f => f.name.endsWith('.dmg'));
const info = JSON.parse(readFileSync(join('release', `${image.name}.json`), 'utf8'));
console.log(`Disk image: ${resolve('release', image.name)} (${(image.data.length / 1048576).toFixed(1)} MB), signed ${info.signed}${info.notarized ? ', notarized' : ', not notarized'}`);
console.log('Publish it with: npm run desktop:publish -- --mac');
