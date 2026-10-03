# ASDesk

Attended remote desktop for Windows, on your own server. Install the app on two
computers, share one computer's ID, and the person at that computer approves the
request before anything is shown or controlled. Video goes directly between the
computers when the network allows, otherwise through your own TURN relay;
everything is encrypted in transit.

- **Desktop app** (`apps/desktop`): Tauri 2 on the system WebView2 (a 1.6 MB
  installer). A Rust core holds the device key, signaling, consent and
  `SendInput`; the web view runs the React UI and WebRTC (H.264 video, encrypted
  data channels for mouse, keyboard and optional text clipboard).
- **Control server** (`services/control-api`): Fastify + WebSocket rendezvous,
  Ed25519 device authentication, consent state machine, signed session grants,
  TURN credentials, PostgreSQL audit.
- **Deployment** (`deploy/`): one-command provisioning and deploys to a Linux
  host, with automatic rollback. See [docs/deployment.md](docs/deployment.md).

Production: `https://asdesk-api.raiapp.dev` · installer:
`https://asdesk-api.raiapp.dev/downloads/ASDesk-Setup-x64.exe`

## Using it

1. Download and run the installer on each computer. Windows SmartScreen may warn
   because the installer is not code-signed yet: choose **More info → Run
   anyway**.
2. The app registers itself with the server on first launch and shows this
   computer's permanent nine-digit ID; there is nothing to type. (If the
   server's enrollment is set to `token`, the app asks for the enrollment token
   instead; `npm run server:token` shows it.)
3. On the computer you want to control from, enter the other computer's ID and
   choose **Connect** (or pick it under **Recent**). The other computer shows
   who is asking and which permissions; its user chooses **Accept & share**,
   then picks the screen in Windows' "Choose what to share" dialog (**Entire
   screen** is needed for mouse and keyboard control).
4. The controlling computer shows each remote screen in a tab (up to 8 at once;
   **Home** connects to another, background tabs pause their video) under one
   compact toolbar: **1:1 / Fit** scaling, **Full screen** (the toolbar then
   hides at the top edge until the pointer reaches it) and **Disconnect**. The
   shared computer shows a small always-on-top panel, which collapses to a
   **Sharing** pill; `Ctrl+Alt+Shift+F12` stops sharing instantly, and locking
   or sleeping the computer ends the session.

For a computer you own and want to reach when no one is sitting at it, set an
**unattended access** password on that computer (Home → _Unattended access to
this computer_). A connection then needs the password instead of someone
clicking Accept; enter it under _Options_ when you connect (optionally
**Remember** it for next time). The password is stored only as a hash and is
proved to the other computer without the server ever seeing it; the session is
still shown there and `Ctrl+Alt+Shift+F12` still stops it. See
[docs/desktop.md](docs/desktop.md#unattended-access).

The app starts with Windows and stays in the notification area when its window
is closed, so the computer can receive requests; use the tray icon's menu to
quit or turn off start-up. Clicks cannot reach UAC prompts or apps running as
administrator (a Windows restriction for non-elevated input); the session
continues and those windows can still be seen.

## Develop

Requires Node 22.12+, npm, Rust (MSVC toolchain) and the WebView2 runtime (built
into Windows 11).

```powershell
npm ci
npm run check; npm test                     # server type check and tests
npm run desktop:check; npm run desktop:test # desktop UI type check, Rust core tests
npm run desktop:debug; npm run desktop:e2e  # test build, then two real app instances end to end
npm run server:smoke                        # bundled server against a disposable PostgreSQL
npm run desktop:package                     # installer in release/
```

Run the server locally with a `.env` (see `.env.example`; generate the keys as
described there), then `npm run db:migrate` and `npm run dev`. Set
`TEST_DATABASE_URL` to run the PostgreSQL integration test against a real
database.

## Release

```powershell
npm run server:deploy       # server: test, build, upload, migrate, switch, health-check
npm run desktop:package     # bump apps/desktop/package.json version first (desktop:release signs)
npm run desktop:publish     # upload the installer to the server's downloads
npm run desktop:publish -- --mac   # the macOS disk image, built on a Mac or by the "ASDesk macOS" workflow
```

The macOS edition: `npm run desktop:package:mac` (or `desktop:release:mac` to
sign and notarize) builds it on a Mac, and from Windows builds it on GitHub's
Macs with the **ASDesk macOS** workflow and downloads the disk image into
`release/`; see [docs/macos.md](docs/macos.md).

Existing installations are not updated automatically; install the new version
over the old one (the device ID and enrollment are kept).

## Website

The public landing page lives in `apps/website` and is a static Vite build. It
reads the current installer targets from `apps/website/public/releases.json`, so
it can be hosted by any static site provider.

```powershell
npm install --prefix apps/website
npm run website:dev
npm run website:build
npm run website:publish -- --version 0.7.1
```

The site offers the small standard installer (Windows 10/11 x64) by default,
the legacy Windows 7 edition (x64/x86) to visitors on Windows 7/8 or 32-bit
Windows, and the macOS disk image to Mac visitors (as soon as
`desktop:publish -- --mac` uploads it; `website:publish` lists it too). Publish the installers first (`npm run desktop:publish`, plus
`-- --win7` for the legacy edition), then run `website:publish`: it reads the
standard installer and, if built for that version (or `--legacy-version`), both
legacy installers from `release/`, otherwise keeps the legacy entries already
listed. It checks every link against the download server
(`https://asdesk-api.raiapp.dev/downloads` by default) and refuses to write
links that would 404. Pass `--base-url` for another package host, or `--copy` to
place the installers under `apps/website/public/downloads/` for a self-contained
static deployment. Brand assets come from `apps/desktop/assets` via
`python tools/generate-website-brand.py`.

## Documentation

- [docs/deployment.md](docs/deployment.md) — server layout, commands, deploy
  mechanics, security
- [docs/protocol.md](docs/protocol.md) — wire protocol v1
- [docs/desktop.md](docs/desktop.md) — desktop architecture, security boundary
  and upgrades from 0.5
- [docs/implementation-status.md](docs/implementation-status.md) — what is done
  and what is not
- [docs/architecture-review.md](docs/architecture-review.md),
  [company-remote-architecture-plan.md](company-remote-architecture-plan.md) —
  original design
