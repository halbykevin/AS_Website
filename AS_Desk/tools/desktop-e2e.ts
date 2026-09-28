import { chromium, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildApp } from '../services/control-api/src/app.ts';
import { MemoryStore } from '../services/control-api/test/memory-store.ts';
import type {} from '../apps/desktop/src/contracts.ts'; // window.remote

// Two real app instances (the Tauri debug build from `npm run desktop:debug`): enrollment, consent,
// screen capture, WebRTC video, input channels, the sharing panel and recent connections. Each
// instance gets its own profile and WebView2 debugging port; Playwright drives the web views over
// CDP and WebView2's automation flag picks the first screen in place of the picker.
// By default against an in-memory server on loopback. To verify a deployment end to end, set
//   E2E_SERVER=https://asdesk-api.example.com [E2E_ENROLLMENT_TOKEN=...] [E2E_RELAY=1]
// (the token can be left out when the server's enrollment is open). E2E_RELAY forces media through
// the TURN relay. Enrolled test devices should be revoked afterwards.
const exe = resolve('apps/desktop/src-tauri/target/debug/ASDesk.exe');
if (!existsSync(exe)) throw new Error('Build the app first: npm run desktop:debug');
const remote = process.env.E2E_SERVER;
const relay = process.env.E2E_RELAY === '1';
let server: string;
let token: string;
let close = async () => {};
if (remote) {
  server = remote;
  token = process.env.E2E_ENROLLMENT_TOKEN ?? '';
} else {
  const keys = generateKeyPairSync('ed25519');
  token = 'local-e2e-enrollment-token-not-for-production';
  const { app } = await buildApp(new MemoryStore(), { enrollmentToken: token, signingKey: keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not start');
  server = `http://127.0.0.1:${address.port}`;
  close = () => app.close();
}
const base = resolve('.local', `e2e-${Date.now()}`);
await mkdir(base, { recursive: true });
const processes: ChildProcess[] = [];
const browsers: Browser[] = [];
const pages: Page[] = [];
const errors: string[] = [];
const enrolled: string[] = [];
let debugPort = 9340 + Math.floor(Math.random() * 500);

async function attach(port: number): Promise<Page> {
  for (let attempt = 0; attempt < 60; attempt++) {
    let browser: Browser;
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); }
    catch { await new Promise(r => setTimeout(r, 500)); continue; }
    browsers.push(browser);
    for (let wait = 0; wait < 60; wait++) {
      const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().startsWith('https://tauri.localhost'));
      if (page) return page;
      await new Promise(r => setTimeout(r, 250));
    }
    throw new Error('The app page did not load');
  }
  throw new Error(`Cannot attach to the app on port ${port}`);
}
async function launch(name: string) {
  const port = debugPort++;
  // The app itself starts WebView2 with --use-fake-ui-for-media-stream (no screen picker); this
  // variable replaces its arguments, so the flag is repeated alongside the debugging port.
  const env: NodeJS.ProcessEnv = { ...process.env, COMPANY_REMOTE_PROFILE: resolve(base, name), COMPANY_REMOTE_DRY_INPUT: '1',
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --use-fake-ui-for-media-stream` };
  const child = spawn(exe, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.push(child);
  child.stdout?.on('data', (data: Buffer) => console.log(name, data.toString().trim()));
  child.stderr?.on('data', (data: Buffer) => console.log(name, data.toString().trim()));
  const page = await attach(port);
  pages.push(page);
  page.on('pageerror', error => errors.push(`${name}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') console.log(`${name} renderer: ${message.text()}`);
    if (message.text().startsWith('SESSION STOP:') || message.text().startsWith('STATE:')) console.log(name, message.text());
  });
  await page.getByLabel('Company server', { exact: true }).fill(server);
  if (token) await page.getByLabel('Enrollment token').fill(token);
  await page.getByRole('button', { name: 'Set up this computer' }).click();
  await expect(page.getByText('Ready to connect', { exact: true })).toBeVisible({ timeout: 20000 });
  const id = (await page.getByTestId('device-id').innerText()).replaceAll(' ', '');
  enrolled.push(id);
  await page.evaluate(() => window.remote.onEvent(event => {
    if (event.type === 'stop') console.log('SESSION STOP:', event.reason);
    if (event.type === 'state') console.log('STATE:', event.state.status, event.state.error ?? '');
  }));
  return { page, id, pid: child.pid!, port };
}
// Whether the app's own window (titled ASDesk, or SHARING — … — ASDesk) is visible on screen; the
// process also owns tiny helper windows (tray, messages), which are ignored.
const windowScript = `Add-Type @'
using System; using System.Runtime.InteropServices; using System.Text;
public static class W {
  delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(Cb cb, IntPtr l);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowThreadProcessId(IntPtr h, out int pid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static bool Visible(int pid) { bool found = false; EnumWindows((h, l) => { int p; GetWindowThreadProcessId(h, out p); var t = new StringBuilder(256); GetWindowText(h, t, 256);
    if (p == pid && IsWindowVisible(h) && t.ToString().EndsWith("ASDesk")) found = true; return true; }, IntPtr.Zero); return found; } }
'@;`;
const hasVisibleWindow = (pid: number) => execFileSync('powershell', ['-NoProfile', '-Command', `${windowScript} [W]::Visible(${pid})`]).toString().trim() === 'True';
const framesDecoded = (page: Page, peer: string) => page.locator(`.viewer[data-peer="${peer}"] video`).evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames);
const spaced = (id: string) => id.replace(/(\d{3})(?=\d)/g, '$1 ');
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
// Input is sent to the display the agent maps the captured screen to. Compare what the capture shows
// with a thumbnail of that display, so a wrong mapping (clicks landing on another monitor) fails.
async function checkDisplayMapping(page: Page) {
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.id = 'e2e-probe'; button.textContent = 'probe'; button.style.cssText = 'position:fixed;left:0;bottom:0;z-index:99';
    // No named function expressions in here: the test runner's helpers do not exist in the page.
    button.onclick = () => void (async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' }, audio: false } as DisplayMediaStreamOptions);
      const track = stream.getVideoTracks()[0]!; const settings = track.getSettings();
      const video = document.createElement('video'); video.muted = true; video.srcObject = stream; await video.play();
      await new Promise(r => setTimeout(r, 500));
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 18;
      const context = canvas.getContext('2d')!; context.drawImage(video, 0, 0, 32, 18);
      const rgba = context.getImageData(0, 0, 32, 18).data;
      const captured = Array.from({ length: 32 * 18 }, (_, i) => Math.round((rgba[i * 4]! * 299 + rgba[i * 4 + 1]! * 587 + rgba[i * 4 + 2]! * 114) / 1000));
      track.stop();
      const invoke = (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args: unknown) => Promise<[number[], [number[], number[]][]]> } }).__TAURI_INTERNALS__.invoke;
      const [rect, displays] = await invoke('probe_display', { sourceId: settings.deviceId, width: settings.width, height: settings.height });
      const scored = displays.map(([r, thumbnail]) => ({ rect: r, difference: captured.reduce((sum, v, i) => sum + Math.abs(v - thumbnail[i]!), 0) / captured.length, mapped: r.join() === rect.join() }));
      (window as unknown as { e2eProbe: unknown }).e2eProbe = { sourceId: settings.deviceId, rect, displays: scored };
      button.remove();
    })().catch(error => { (window as unknown as { e2eProbe: unknown }).e2eProbe = { error: String(error) }; });
    document.body.append(button);
  });
  await page.click('#e2e-probe');
  type Scored = { rect: number[]; difference: number; mapped: boolean };
  const probe = await page.waitForFunction(() => (window as unknown as { e2eProbe?: unknown }).e2eProbe, undefined, { timeout: 15000 }).then(h => h.jsonValue()) as { sourceId: string; rect: number[]; displays: Scored[] };
  console.log('display mapping', JSON.stringify(probe));
  if ('error' in probe) throw new Error(`Display probe failed: ${String(probe.error)}`);
  const mapped = probe.displays.find(d => d.mapped);
  // The mapped display must look like the capture, and look more like it than any other display.
  if (!mapped || mapped.difference > 40 || probe.displays.some(d => !d.mapped && d.difference < mapped.difference))
    throw new Error(`Captured screen does not match the display input is sent to (${JSON.stringify(probe)})`);
  return probe;
}
try {
  const a = await launch('controller');
  await a.page.screenshot({ path: resolve(base, 'home.png') });
  const b = await launch('target');
  const c = await launch('second-target');
  const mapping = await checkDisplayMapping(b.page);
  // A technician connects to one computer, then to a second while the first session keeps running.
  const connect = async (to: { page: Page; id: string; pid: number }) => {
    await a.page.getByLabel('Remote computer ID').fill(to.id);
    if (relay) {
      await a.page.getByText('Options', { exact: true }).click();
      await a.page.getByLabel('Use relay only').check();
    }
    await a.page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(to.page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    await to.page.getByRole('button', { name: 'Accept & share' }).click();
    // Accepting shares the screen without a picker; the shared computer's window hides.
    await expect(to.page.getByText('Your screen is being shared')).toBeAttached({ timeout: 45000 });
    await expect(a.page.locator(`.tab[data-peer="${to.id}"][data-phase="connected"]`)).toBeVisible({ timeout: 45000 });
    await expect.poll(() => framesDecoded(a.page, to.id), { timeout: 20000 }).toBeGreaterThan(0);
    await expect.poll(() => hasVisibleWindow(to.pid), { timeout: 5000 }).toBe(false);
  };
  await a.page.getByLabel('Remote computer ID').fill(b.id);
  await a.page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(b.page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
  await b.page.screenshot({ path: resolve(base, 'consent.png') });
  await b.page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(a.page.getByText(`${spaced(b.id)} declined the request.`)).toBeVisible({ timeout: 10000 });
  await connect(b);
  await expect(a.page.locator('.session-stats')).toHaveText(relay ? /TURN (UDP|TCP|TLS)/ : /Direct|TURN/, { timeout: 10000 });
  const path = await a.page.locator('.session-stats').innerText();
  // The tab bar is the only chrome: the remote screen takes the rest of the window.
  const chrome = await a.page.evaluate(peer => innerHeight - document.querySelector(`.viewer[data-peer="${peer}"]`)!.getBoundingClientRect().height, b.id);
  if (chrome > 40) throw new Error(`Viewer chrome is ${chrome}px tall`);
  await a.page.getByRole('button', { name: 'Original size' }).click();
  await a.page.getByRole('button', { name: 'Fit to window' }).click();
  // Input is transmitted through real encrypted channels to the agent's dry-run injector.
  const viewer = a.page.locator(`.viewer[data-peer="${b.id}"]`);
  await viewer.click({ position: { x: 200, y: 150 } });
  await a.page.keyboard.press('a');
  await a.page.keyboard.press('ControlLeft');

  // Second session from the Home tab while the first stays connected.
  await a.page.getByRole('tab', { name: 'Home' }).click();
  await connect(c);
  await a.page.screenshot({ path: resolve(base, 'two-sessions.png') });
  await expect(a.page.locator(`.tab[data-peer="${b.id}"][data-phase="connected"]`)).toBeVisible();
  // The session in the background tab is paused at the source; the one on screen streams.
  await pause(2000);
  const [hiddenBefore, shownBefore] = [await framesDecoded(a.page, b.id), await framesDecoded(a.page, c.id)];
  await pause(3000);
  const [hiddenAfter, shownAfter] = [await framesDecoded(a.page, b.id), await framesDecoded(a.page, c.id)];
  if (hiddenAfter - hiddenBefore > 3) throw new Error(`Background session still streams (${hiddenAfter - hiddenBefore} frames in 3 s)`);
  if (shownAfter - shownBefore < 10) throw new Error(`Session on screen is not streaming (${shownAfter - shownBefore} frames in 3 s)`);
  // Switching tabs resumes the first session immediately and pauses the second.
  await a.page.getByRole('tab', { name: `Session with ${spaced(b.id)}` }).click();
  const resumed = await framesDecoded(a.page, b.id);
  await expect.poll(() => framesDecoded(a.page, b.id), { timeout: 5000 }).toBeGreaterThan(resumed + 10);
  await viewer.click({ position: { x: 150, y: 120 } });
  await a.page.keyboard.press('b');
  // Closing one tab ends only that session.
  await a.page.getByRole('button', { name: `Disconnect ${spaced(c.id)}` }).click();
  await expect(c.page.getByText('Ready to connect', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect.poll(() => hasVisibleWindow(c.pid), { timeout: 5000 }).toBe(true);
  await expect(a.page.locator(`.tab[data-peer="${c.id}"]`)).toHaveCount(0);
  const still = await framesDecoded(a.page, b.id);
  await expect.poll(() => framesDecoded(a.page, b.id), { timeout: 5000 }).toBeGreaterThan(still + 10);
  await a.page.screenshot({ path: resolve(base, 'connected.png') });

  // Dragging a tab out of the tab bar opens the session in its own window, like a browser tab. The
  // connection stays in the main window's page (the popout is a surface it draws into), so the
  // session carries on without renegotiating, and closing the window puts it back in the tab bar.
  const popoutPage = async () => {
    // A window opened later by the page is a new WebView2, which an existing CDP connection does not
    // pick up; a fresh connection lists it.
    for (let attempt = 0; attempt < 20; attempt++) {
      const browser = await chromium.connectOverCDP(`http://127.0.0.1:${a.port}`);
      browsers.push(browser);
      const found = browser.contexts().flatMap(context => context.pages()).find(p => p.url().startsWith('about:blank#asdesk-popout='));
      if (found) return found;
      await pause(250);
    }
    throw new Error('The popped-out session window did not open');
  };
  const tabBox = (await a.page.locator(`.tab[data-peer="${b.id}"] .tab-main`).boundingBox())!;
  await a.page.mouse.move(tabBox.x + tabBox.width / 2, tabBox.y + tabBox.height / 2);
  await a.page.mouse.down();
  await a.page.mouse.move(tabBox.x + 80, tabBox.y + 260, { steps: 12 });
  await a.page.mouse.up();
  const popout = await popoutPage();
  popout.on('pageerror', error => errors.push(`popout: ${error.message}`));
  await expect(a.page.locator(`.tab[data-peer="${b.id}"]`)).toHaveCount(0);
  const popped = popout.locator(`.viewer[data-peer="${b.id}"] video`);
  await expect.poll(() => popped.evaluate((v: HTMLVideoElement) => v.getVideoPlaybackQuality().totalVideoFrames), { timeout: 10000 }).toBeGreaterThan(10);
  await expect(b.page.getByText('Your screen is being shared')).toBeAttached();
  await popout.locator(`.viewer[data-peer="${b.id}"]`).click({ position: { x: 160, y: 120 } });
  await popout.keyboard.press('c');
  await popout.screenshot({ path: resolve(base, 'popout.png') });
  // Back to the tab bar: the window closes and the same session streams in the main window again.
  await popout.getByRole('button', { name: 'Back to the tab bar' }).click();
  await expect.poll(() => popout.isClosed(), { timeout: 5000 }).toBe(true);
  await expect(a.page.locator(`.tab[data-peer="${b.id}"][data-phase="connected"]`)).toBeVisible();
  const docked = await framesDecoded(a.page, b.id);
  await expect.poll(() => framesDecoded(a.page, b.id), { timeout: 5000 }).toBeGreaterThan(docked + 10);
  // The tab's own button pops out too, and closing that window also keeps the session.
  await a.page.getByRole('button', { name: `Open ${spaced(b.id)} in its own window` }).click();
  const again = await popoutPage();
  await again.getByRole('button', { name: 'Close', exact: true }).click();
  await expect.poll(() => again.isClosed(), { timeout: 5000 }).toBe(true);
  await expect(a.page.locator(`.tab[data-peer="${b.id}"][data-phase="connected"]`)).toBeVisible();
  await expect(b.page.getByText('Your screen is being shared')).toBeAttached();

  // The shared computer can end its session (its window, opened from the tray, has Disconnect).
  await b.page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(a.page.getByText('Ready to connect', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(b.page.getByText('Ready to connect', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect.poll(() => hasVisibleWindow(b.pid), { timeout: 5000 }).toBe(true);
  // Controlled computers are remembered; a request from a recent tile can be rejected.
  const recentName = `Connect to ${spaced(b.id)}`;
  await a.page.getByRole('button', { name: recentName }).click();
  await b.page.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(a.page.getByText(`${spaced(b.id)} declined the request.`)).toBeVisible({ timeout: 10000 });
  await a.page.screenshot({ path: resolve(base, 'recent.png') });
  await a.page.getByRole('button', { name: `Remove ${spaced(b.id)} from recent` }).click();
  await expect(a.page.getByRole('button', { name: recentName })).toHaveCount(0);
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ result: 'PASS', server, media: path, display: mapping, devices: enrolled, screenshots: base,
    checks: ['enrollment', 'DPAPI identity', 'display mapping', 'consent', 'reject', 'signed SDP', 'real desktop capture', 'WebRTC video', relay ? 'TURN relay' : 'ICE',
      'no picker', 'hidden while sharing', 'two concurrent sessions', 'background session paused', 'resume on tab switch', 'close one tab only',
      'tab dragged out to its own window', 'popout keeps the session', 'back to the tab bar', 'full-window viewer', 'encrypted data channels', 'dry-run input', 'target disconnect', 'recent connections'] }, null, 2));
} catch (error) {
  for (const [index, page] of pages.entries()) {
    console.log(`Failure state ${index}:`, await page.locator('body').innerText().catch(() => '(unavailable)'));
    await page.screenshot({ path: resolve(base, `failure-${index}.png`) }).catch(() => undefined);
  }
  console.log(JSON.stringify({ result: 'FAIL', devices: enrolled }));
  throw error;
} finally {
  for (const browser of browsers) await browser.close().catch(() => undefined);
  for (const child of processes) child.kill();
  await close();
}
