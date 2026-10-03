# macOS edition

ASDesk for Mac is the same app as on Windows: the same agent, UI, protocol and server, built as one
**universal** app for Apple silicon and Intel Macs, running on **macOS 13 Ventura or later**, and
shipped as a disk image:

```text
release/ASDesk-<version>-macos-universal.dmg        the disk image (drag ASDesk to Applications)
release/ASDesk-<version>-macos-universal.dmg.json   who signed it and whether it is notarized
```

A Mac can control Windows PCs and other Macs, and be controlled by either.

```bash
npm run desktop:package:mac     # the disk image, signed ad hoc (not notarized)
npm run desktop:release:mac     # signed with a Developer ID, notarized and stapled
npm run desktop:publish -- --mac   # upload it (ASDesk-macOS.dmg on the server)
```

A Mac app can only be built on macOS. On a Mac the first two build locally; anywhere else they build
on GitHub's Macs with the **ASDesk macOS** workflow
([.github/workflows/asdesk-macos.yml](../../.github/workflows/asdesk-macos.yml)) and download the
result: see [Building without a Mac](#building-without-a-mac).

## What is different on a Mac

Only the system layer differs. On macOS, `src-tauri/src/main.rs` takes these modules from
`src-tauri/src/macos/` instead:

| Module | Windows | macOS |
| --- | --- | --- |
| `platform` | DPAPI, Win32 clipboard, `EnumDisplayDevices`, the `Run` key, WTS/power messages | a random AES-256 key in the login keychain, `NSPasteboard`, `CGGetActiveDisplayList`, a launch agent, workspace and distributed notifications |
| `input` | `SendInput` with scan codes | Quartz events (`CGEventPost`) with macOS key codes, drag events and click counts |
| `blocker` | low-level keyboard and mouse hooks | an event tap where hardware events enter the window server |
| `elevation` | the SYSTEM service and helper (UAC prompts, elevated apps) | none: the app's own events reach everything Accessibility covers |
| `sys` | | the Core Graphics, Core Foundation and Accessibility C functions, declared by hand |

What a person notices:

- **Choosing the screen.** macOS shows its own picker after **Accept & share**, and the person at the
  Mac chooses a display (or a window, which allows viewing only). WebView2's `--use-fake-ui-for-media-stream`
  has no macOS equivalent, by design.
- **No unattended access.** For the same reason: the picker needs someone at the Mac, so the agent
  refuses to set an unattended password and the menu does not offer it. A Mac can still connect *to*
  a Windows PC with unattended access.
- **Window and menu bar.** The system's traffic lights sit at the left of the tab bar instead of the
  app's own buttons. The app lives in the menu bar while its window is closed (a template icon in the
  bar's own colour; the coloured mark with an orange dot while this Mac is shared). Clicking the Dock
  icon brings the window back. **Open at Login** is a launch agent
  (`~/Library/LaunchAgents/com.companyremote.desktop.plist`), offered once ASDesk is in an
  Applications folder.
- **The stop shortcut** is **Control+Option+Shift+F12** (with **fn** on keyboards whose top row is
  media keys). It also lifts a keyboard and mouse block, which swallows everything else.
- **Data** lives in `~/Library/Application Support/Company Remote` (`asdesk.log` included; the menu's
  **Show Log File** reveals it in Finder). Development builds and tests use their own keychain entry,
  **ASDesk (development)**, so they never touch the installed app's.

### Permissions

macOS asks for two permissions, each the first time it is needed:

- **Screen Recording** (System Settings → Privacy & Security → Screen & System Audio Recording), if
  macOS asks for it the first time the Mac shares its screen.
- **Accessibility**, before the Mac can be controlled: macOS delivers posted events, and allows the
  event tap that blocks input, only to apps allowed under System Settings → Privacy & Security →
  Accessibility. If it is not allowed yet, accepting with mouse or keyboard control opens macOS's
  prompt and fails with an explanation; allow ASDesk and accept again, or untick control to share the
  view only.

Both are tied to the app's signature. A Developer ID build keeps them across updates; an ad hoc build
loses them with every update (each build is a new identity to macOS), and the keychain asks once
whether the new build may read the device key. That is the main practical reason to sign.

## Building on a Mac

Needs Xcode's command line tools (`xcode-select --install`), Node 22.12+, npm and Rust through
rustup (the build adds the `aarch64-apple-darwin` and `x86_64-apple-darwin` targets itself).

```bash
npm ci
npm run desktop:check && npm run desktop:build && npm run desktop:test
npm run desktop:package:mac
```

`tools/desktop.mjs` builds `universal-apple-darwin` (both architectures, merged), bundles the app
and the disk image with the icon, window layout and `minimumSystemVersion` from `tauri.conf.json`,
checks the app's signature and copies the image to `release/`. The macOS icons
(`src-tauri/icons/icon.icns`, the menu bar's `assets/tray-template@2x.png` and
`assets/tray-sharing-mac@2x.png`) come from the same artwork as Windows' via
`python tools/generate-macos-icons.py`.

## Building without a Mac

On Windows (or Linux), `npm run desktop:package:mac` (`desktop:release:mac` to sign and notarize,
which needs the secrets below) runs the same commands on a GitHub-hosted Mac, through
`tools/desktop-mac-remote.mjs`:

1. It checks that this branch is pushed (GitHub builds its copy, not this computer's) and starts the
   **ASDesk macOS** workflow for it, or picks up a build already running or finished for the same
   commit and mode, so pressing Ctrl+C and running it again loses nothing.
2. It prints each step as it finishes (the build takes a while: tests, then two architectures), and on
   a failure the end of the failed step's log.
3. It downloads the disk image and its `.json` into `release/`, ready for
   `npm run desktop:publish -- --mac`.

It signs in to GitHub as `GITHUB_TOKEN` (or `GH_TOKEN`) if set, else with the login `git push` uses.
`node tools/desktop-mac-remote.mjs --run <id>` fetches the disk image of any finished run. The
workflow can also be started by hand (Actions → **ASDesk macOS** → **Run workflow**); it type-checks
the UI and runs the agent's tests on macOS before building, and keeps the artifact for 30 days.

A Windows machine can type-check the macOS code without a Mac (not build it: AppKit's headers and the
linker's frameworks come only with Xcode). With the `aarch64-apple-darwin` target, Zig
(`pip install ziglang`) and `cargo install cargo-zigbuild`, point `CC_aarch64_apple_darwin` at
`cargo-zigbuild zig cc -- -target aarch64-macos-none` (with `mac-notification-sys`'s one Objective-C
file replaced by an empty one) and run `cargo check --target aarch64-apple-darwin`.

## Signing

`desktop:package:mac` signs ad hoc, which Apple silicon needs to run the app at all. Gatekeeper still
blocks it when downloaded: macOS 15 and later say Apple could not verify ASDesk, and the person must
open System Settings → Privacy & Security and choose **Open Anyway** (the old Control-click shortcut
is gone). `desktop:publish -- --mac` warns when it uploads such an image.

`desktop:release:mac` produces what a download should be: the app and the disk image signed with a
**Developer ID Application** certificate under the hardened runtime, both notarized by Apple and
stapled (so they open without a warning even offline). It refuses to write anything unless macOS's own
Gatekeeper check (`spctl`) accepts both as *Notarized Developer ID*. It needs an Apple Developer
Program membership (99 USD a year, for an individual or a company; a company is shown by its name)
and these variables (the workflow takes them from repository secrets of the same names):

| Variable | What |
| --- | --- |
| `APPLE_CERTIFICATE` | the Developer ID Application certificate and key, exported from Keychain Access as `.p12`, base64-encoded (`base64 -i cert.p12`) |
| `APPLE_CERTIFICATE_PASSWORD` | the password chosen when exporting it |
| `APPLE_SIGNING_IDENTITY` | its name, `Developer ID Application: <Name> (<TEAMID>)` |
| `APPLE_API_ISSUER`, `APPLE_API_KEY` | an App Store Connect API key (Users and Access → Integrations, role Developer): issuer ID and key ID |
| `APPLE_API_KEY_P8` (workflow) or `APPLE_API_KEY_PATH` (on a Mac) | that key's `.p8` file: its contents as a secret, or its path |

On a Mac whose keychain already holds the certificate, `APPLE_SIGNING_IDENTITY` alone replaces the
first two. An Apple ID with an app-specific password (`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`)
can notarize instead of the API key. No entitlements are needed: the app is not sandboxed (a
sandboxed app cannot post input to other apps), and WebKit's JavaScript and capture run in its own
Apple-signed processes.

## Publishing

`npm run desktop:publish -- --mac` uploads the newest `release/ASDesk-*-macos-universal.dmg`, points
`ASDesk-macOS.dmg` at it and writes `latest-macos.json` next to the Windows `latest.json`. The
website reads that pointer (proxied as `/latest-macos.json`), so Mac visitors get **Download for
macOS** as soon as the upload finishes; Windows visitors see **On a Mac?** under their button, and
the other way round. `npm run website:publish -- --version <v>` also lists the disk image in
`releases.json` when it is in `release/` (`--mac-version` if the Mac build is of another version),
and otherwise keeps the one already listed.
