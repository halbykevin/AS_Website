# Desktop app

ASDesk's desktop app is a Tauri 2 application: a Rust core in a ~4.5 MB
executable and a React UI in the system's WebView2 (built into Windows 11,
installed on demand on Windows 10). The installer is about 1.6 MB. Windows 7 SP1
and 8.x (32- and 64-bit) get a separate **Windows 7 edition** with its own
WebView2; see [Windows 7 edition](windows7.md). Versions 0.3–0.5 were Electron
apps (~80–106 MB); see [Upgrading from 0.5](#upgrading-from-05). Versions before
0.6 were called Company Remote; the data folder (`%APPDATA%\Company Remote`),
the app identifier (`com.companyremote.desktop`) and the protocol names keep
that name so upgrades and mixed versions keep working.

```text
Rust core (trusted; apps/desktop/src-tauri)
  ├─ agent.rs      identity, signed rendezvous WebSocket, consent, session grants, one actor task
  ├─ security.rs   grant and SDP signature checks (byte-compatible with the server and 0.5)
  ├─ identity.rs   Ed25519 key under DPAPI in %APPDATA%\Company Remote, recent computers
  ├─ input.rs      SendInput: normalized coordinates, bounded wheel, physical scan codes
  ├─ platform.rs   DPAPI, clipboard, displays, start-up entry, lock/suspend/display events,
  │                notifications, APIs newer than Windows 7 (resolved at run time)
  ├─ tls.rs        rustls for every server connection: bundled Mozilla roots + Windows roots
  └─ main.rs       frameless window, sharing panel, tray, shortcut, Tauri commands
       │  Tauri commands (capabilities/main.json lists the only ones the page may call)
WebView2 (apps/desktop/src)
  ├─ bridge.ts     window.remote: typed commands and the agent's events
  ├─ media.ts      RTCPeerConnection, H.264, data channels, stats
  └─ App.tsx       home, consent, viewer, sharing panel
```

The web view never holds a key or decides anything about trust. It can only
invoke the commands in `capabilities/main.json`; every command is validated
again in Rust (strict serde types mirroring `packages/protocol`). The page is
served from the app bundle with a restrictive CSP (no remote scripts, no outside
connections), a frozen prototype, camera/microphone/geolocation disabled by
Permissions-Policy, and WebView2's browser accelerator keys, zoom, autofill,
swipe navigation and (in release builds) context menus and DevTools turned off.

## Sessions

The agent verifies each session grant's issuer, audience, expiry, participants,
capabilities and a one-use nonce. SDP descriptions carry a signature over
session, role and the exact SDP (including its DTLS fingerprint); a description
is rejected if the peer role or transport identity does not match. While TURN
credentials for an accepted session are fetched, later server messages are
queued so they are processed in order. Lock, suspend, a change to the shared
display, the emergency shortcut `Ctrl+Alt+Shift+F12` and loss of signaling end
the session; ending it releases every held key and button.

**Screen capture.** WebView2 does not let an app choose a screen silently, so
accepting a request opens Windows' "Choose what to share" dialog, straight from
the **Accept & share** click (capture needs that user gesture). The track's
`screen:<n>:0` id and frame size identify the display: the index is WebRTC's
EnumDisplayDevices index, cross-checked against the frame's aspect ratio, and
mouse/keyboard control is only granted for an entire screen whose display is
identified. The E2E suite compares the captured image with every display to
prove input goes to the one being shared. The sharing panel is excluded from
capture (`WDA_EXCLUDEFROMCAPTURE`).

## Unattended access

A password set on a computer (Home → **Unattended access to this computer**)
lets an authorised controller connect to it without anyone there clicking
**Accept**, the way AnyDesk does. It is built on top of the ordinary consent
flow, not beside it, so every existing safety property still holds: the session
shows the always-on-top sharing panel, the tray icon and a notification, and
`Ctrl+Alt+Shift+F12`, lock and suspend still end it.

- **The password never leaves the computer and is never stored in the clear.**
  The target keeps only an **Argon2id verifier** (salt + hash + cost),
  DPAPI-protected in `unattended.json`
  ([identity.rs](../apps/desktop/src-tauri/src/identity.rs) storage helpers,
  [unattended.rs](../apps/desktop/src-tauri/src/unattended.rs) the crypto).
- **Proof is a challenge-response relayed peer-to-peer.** On an incoming request
  the target, if unattended is on, sends `connection.challenge` (a fresh nonce
  plus the verifier's salt/cost); the controller derives the same key from the
  typed password and answers `connection.prove` with
  `HMAC-SHA256(key, transcript)`, where the transcript binds both device IDs,
  the request ID and the nonce. The rendezvous server only relays these opaque
  blobs between the request's two parties
  (`services/control-api/src/rendezvous.ts`); it cannot read the password, and a
  captured proof cannot be replayed to another computer, request or a second
  time.
- **A verified proof runs the normal accept.** The agent emits `AutoAccept` to
  its own web view, which captures the monitor (no picker, as with the Accept
  button) and calls `accept`, so the grant, signature checks, input and
  elevated-helper path are exactly those of an attended session. Full control
  including UAC prompts and elevated apps works because the SYSTEM helper (see
  below) is already injecting input; only _viewing_ the secure desktop/lock
  screen is limited (capture shows black there until it is unlocked).
- **Guessing is bounded.** Repeated wrong proofs lock the computer out of
  further unattended attempts for a while (the manual Accept dialog still
  works), and the server also rate-limits proofs.
- **The controller may remember the password** per computer (DPAPI,
  `remembered.json`), saved only after a connection actually succeeds, so a
  one-click reconnect from **Recent** is unattended too.

Rollout: because the two new protocol messages are additive, old apps simply
ignore them, but the **server must be deployed before** apps that use unattended
access (an old server drops a connection that sends an unknown message). The
normal release order — `server:deploy`, then `desktop:package` — already does
this.

## Several sessions at once

A technician's computer can control up to 8 computers at the same time (waiting
requests count), each in its own tab: **Home** starts another connection, a tab
per computer shows it, `×` ends only that session. Every session is independent
end to end: its own grant, signature checks and timers in the agent (`Session`
in `agent.rs`), its own `RTCPeerConnection`, video and input channels in the UI.
Server errors carry the ID of the message they answer, so a failure ends only
the session or request it concerns.

**Own windows.** Dragging a tab down out of the tab bar (or off the window), or
its ↗ button, opens that session in its own window where it is dropped; **Back
to the tab bar** or the window's close button puts it back, and only
**Disconnect** ends it. The session's peer connection, input and video stream
never move: the window is an about:blank page the main page opens
(`window.open`, allowed by `popout_window` in `main.rs` only for its own
`about:blank#asdesk-popout=<session id>` addresses) and renders the session into
through a React portal. So popping out is instant, nothing is renegotiated, the
other computer is not involved, and the agent's one-description-per-session rule
stays intact.

Background tabs cost almost nothing: the controller asks the other computer over
the session's control channel to **pause** its video
(`sender.encodings[0].active = false`, so nothing is encoded or sent) and
**resume** it when the tab is shown, which restarts with a key frame. Versions
before 0.6.2 ignore these messages and keep streaming.

The policy is enforced by the server (`MAX_CONTROLLER_SESSIONS` in
`rendezvous.ts`) and mirrored by the agent: a computer being helped has one
helper at a time and cannot control others meanwhile, and a computer that is
controlling others cannot be controlled. Lock, suspend, the emergency shortcut
and losing the server end every session; the tray's **End all sessions** does
the same.

## Build and test

```powershell
npm run desktop:check    # UI type check
npm run desktop:test     # Rust unit tests, incl. interop fixtures from the real server code
npm run desktop:debug    # test build (target/debug/ASDesk.exe)
npm run desktop:e2e      # two instances end to end (E2E_SERVER=... E2E_RELAY=1 for production)
npm run desktop:package  # release/ASDesk-<version>-x64-Setup.exe (Windows 10 and 11)
npm run desktop:package:win7  # release/ASDesk-<version>-win7-{x64,x86}-Setup.exe (Windows 7 SP1+)
```

`desktop:e2e` launches three debug builds (a technician and two computers,
controlled at the same time) with separate profiles (`COMPANY_REMOTE_PROFILE`,
honoured only by debug builds), attaches Playwright to each web view over CDP
and uses WebView2's `--use-fake-ui-for-media-stream` to pick the first screen
instead of the dialog. `E2E_REAL_PICKER=1` uses the real dialog instead and
clicks through it with UI Automation (`tools/pick-screen.ps1`). Input goes to a
dry-run injector (`COMPANY_REMOTE_DRY_INPUT=1`, debug builds only). Screenshots
land in `.local/e2e-*`.

The server installed copies register with on first run is
`companyRemote.defaultServer` in `apps/desktop/package.json` (override with
`COMPANY_REMOTE_SERVER` at build time); debug builds show the setup form
instead. The version shown and reported at enrollment is that file's `version`.
`npm run desktop:publish` uploads the newest installer to the server's
`/downloads/` (`ASDesk-Setup-x64.exe`); `npm run desktop:publish -- --win7`
uploads the Windows 7 edition's two (`ASDesk-Setup-win7-x64.exe`,
`ASDesk-Setup-win7-x86.exe`), the names the standard installer sends older PCs
to.

## Window behaviour

- The window is frameless; the title bar, the session toolbar and the sharing
  panel move it.
- Closing hides it to the notification area; the tray menu has Quit and **Start
  with Windows** (enabled on the first installed run, launched with `--hidden`).
- An incoming request shows the window, flashes the taskbar and posts a Windows
  notification.
- On the computer being shared, the window becomes a small always-on-top panel
  in the corner of the shared display, which collapses to a pill. On the
  controlling computer it maximizes for the session.

## Upgrading from 0.5

The installer (`src-tauri/windows/hooks.nsh`) finds the Electron version's
uninstall entry, copies its identity aside and runs its uninstaller with
`--updated`, which keeps app data. On first run the app adopts the identity from
`%APPDATA%\Company Remote` (0.3–0.4) or `%APPDATA%\ASDesk` (0.5), decrypts the
Electron safeStorage key with the DPAPI-protected key in `Local State`, and
re-protects it with DPAPI. The computer keeps its ID. Originals are never
deleted: the Electron file is kept as `identity.electron.json` (with
`Local State`), and an adopted source is renamed `identity.adopted.json`. Only
Chromium caches are removed.

## Installer

`src-tauri/windows/installer.nsi` is Tauri's NSIS template with a one-step flow
(changes are marked `ASDesk:`; re-apply them when upgrading `@tauri-apps/cli`):
**Welcome → Next** installs per user in `%LOCALAPPDATA%\ASDesk` without an
administrator prompt, creates the Start menu and desktop shortcuts, starts
ASDesk as the signed-in user and closes. An installed version is updated in
place (settings and the computer's ID are kept). Silent (`/S`) and passive
(`/P`) installs keep Tauri's behaviour: the app starts only with `/R`.

## Diagnostics

The app writes errors and connection events (never keys, tokens, clipboard text
or session descriptions) to `asdesk.log` in `%APPDATA%\Company Remote`; the tray
menu's **Show log file** opens it. It is capped at 1 MB, with one previous file
kept as `asdesk.old.log`.

## Windows signing

`desktop:package` produces an unsigned installer. Chrome and Edge (Safe
Browsing) then block it as a "suspicious download" and SmartScreen warns on
first run: an unsigned file's reputation belongs to its exact hash, so every new
version starts again with none. A signed file's reputation belongs to the
certificate, so it carries over from version to version. Signing is the fix;
renaming, zipping or otherwise disguising the installer is treated as evasion
and makes things worse.

`desktop:release` signs the app binary and the installer, and refuses to run
without one of:

- `WINDOWS_SIGN_COMMAND`: a cloud signing command with `%1` for the file, for
  example Azure Trusted Signing:
  `trusted-signing-cli -e <endpoint> -a <account> -c <certificate profile> -d ASDesk %1`.
- `WINDOWS_CERTIFICATE_THUMBPRINT`: a certificate in the user's certificate
  store (a hardware token or a CA's virtual smart card), signed with SHA-256 and
  timestamped (`WINDOWS_TIMESTAMP_URL`, default DigiCert).

It then checks each installer with Windows' own `Get-AuthenticodeSignature` and
deletes it unless the signature is valid, so an unsigned release never reaches
`release/`. `desktop:publish` warns when it uploads an unsigned installer.

Getting a certificate: since June 2023 publicly trusted code-signing keys must
live on a hardware token or in a cloud HSM, so the options are a managed service
such as Azure Trusted Signing, or an organization-validated (OV) certificate
from a CA (Certum, Sectigo, DigiCert, SSL.com, ...) delivered on a token or with
cloud signing. Check each one's eligibility for your country and whether it
validates an individual or a registered company; the validated name is what
Windows shows as the publisher. EV certificates no longer skip SmartScreen's
reputation check, so OV is enough.

Until then, and for each new unsigned build: report the false positive to Google
(https://safebrowsing.google.com/safebrowsing/report_error/) and Microsoft
(https://www.microsoft.com/en-us/wdsi/filesubmission, "Software developer"), and
scan it on VirusTotal. The website publishes each installer's SHA-256 so users
can check what they downloaded. This workspace has no code-signing certificate.
