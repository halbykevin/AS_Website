# Windows 7 edition

ASDesk ships in two editions built from the same code:

| Edition | Installers | Runs on | WebView2 |
| --- | --- | --- | --- |
| Standard | `ASDesk-<v>-x64-Setup.exe` | Windows 10 and 11, 64-bit | the system's, kept current by Windows (downloaded by the installer if missing) |
| Windows 7 | `ASDesk-<v>-win7-x64-Setup.exe`, `ASDesk-<v>-win7-x86-Setup.exe` | Windows 7 SP1, 8, 8.1, 10 and 11; 64- and 32-bit | a private copy of 109.0.1518.78, installed next to the app |

```powershell
npm run desktop:package:win7          # both Windows 7 installers into release/
npm run desktop:release:win7          # the same, Authenticode-signed (WINDOWS_CERTIFICATE_THUMBPRINT)
npm run desktop:publish              # uploads both (with any newer standard/Mac build); -- --win7 for these alone
```

The first build downloads the WebView2 runtime (about 200 MB per architecture) and a pinned nightly
Rust toolchain; later builds reuse both. Needs the Visual Studio Build Tools with the x64/x86 C++
tools, like the standard build.

## Why a separate edition

A standard build cannot start on Windows 7 at all, for three independent reasons:

1. **WebView2.** Microsoft's last WebView2 for Windows 7 and 8 is version 109. The installer's
   WebView2 bootstrapper always fetches the newest version, whose updater (`MicrosoftEdgeUpdate.exe`)
   fails on Windows 7 with *"The procedure entry point PackageIdFromFullName could not be located in
   KERNEL32.dll"*. The Windows 7 edition embeds the 109 fixed-version runtime instead (Tauri's
   `fixedRuntime` mode) and never touches the system's WebView2 or Edge Update.
2. **Rust.** Since Rust 1.78 the standard `*-pc-windows-msvc` targets need Windows 10: the standard
   library calls `ProcessPrng`, `WaitOnAddress`, `GetSystemTimePreciseAsFileTime` and more. The
   `x86_64-win7-windows-msvc` and `i686-win7-windows-msvc` targets keep Windows 7 support; they are
   tier 3, so they build the standard library from source (`-Zbuild-std`) on a pinned nightly
   (`TOOLCHAIN` in `tools/desktop.mjs`).
3. **The C runtime.** Tauri links the Visual C++ runtime statically but the Universal CRT
   dynamically; Windows 7 has the UCRT only after an optional update. The Windows 7 edition links
   everything statically (`+crt-static`), so there is nothing to install first.

WebView2 109 no longer receives security updates, which is why the Windows 7 edition is only for
PCs that cannot run the standard one. Its installer says so on 64-bit Windows 10/11 (and lets the
person continue). 32-bit Windows 10 has only this edition.

## What makes the code Windows 7-safe

Windows refuses to start a program if any function it imports is missing. Everything newer than
Windows 7 SP1 is therefore resolved at run time or kept out of the import table:

| Newer API | Used by | Handling |
| --- | --- | --- |
| `SetProcessDpiAwarenessContext` (10) | DPI awareness | `platform::set_dpi_awareness`: per-monitor v2 → per-monitor (8.1) → system-aware (7), looked up at run time |
| `RoGetActivationFactory`, `CoIncrementMTAUsage` (8) | toast notifications (WinRT) | delay-loaded in Windows 7 builds (`build.rs`); toasts only where WinRT exists (`platform::toasts_supported`), otherwise a balloon tip on the tray icon (`platform::balloon`) |
| `EventSetInformation` (8) | Microsoft's WebView2 loader (TraceLogging) | Windows 7 builds define the import slot themselves (`platform.rs`, `event_set_information`): the real function where it exists, else `ERROR_NOT_SUPPORTED` |

`tools/win7-imports.mjs` proves it for every build: it reads the executable's import tables and checks
each DLL and function against Windows 7 (the Windows SDK headers compiled for Windows 7 versus
Windows 10, plus known exceptions). `desktop:package:win7` refuses to produce an installer that fails
it. Run it by hand with `node tools/win7-imports.mjs <exe> x64|x86`; run against a standard build it
lists exactly the imports above plus the UCRT DLLs.

`ctor` 0.8.0 (used by tauri-utils) only knows Windows as target vendor `pc`; a copy patched to also
accept `win7` is in `src-tauri/vendor/ctor` (see `ASDESK-PATCH.md` there).

## Also improved for every edition

- **TLS** (`tls.rs`): rustls instead of Windows SChannel for the API and the WebSocket. Windows 7's
  SChannel has no TLS 1.3 and few current cipher suites. Trust is the Mozilla root set built into the
  app (a PC whose root store has not been updated in years still trusts Let's Encrypt) plus the
  Windows root stores (company CAs and TLS-inspecting proxies keep working). Connection failures now
  log the underlying reason (for example a wrong clock or an unknown CA) to `asdesk.log`.
- **App manifest** (`windows/app.manifest`): declares Windows 7 to 11 so Windows applies no
  compatibility shims and reports its real version.
- **UI**: built for Chromium 109 (`tools/build-desktop.mjs`), with fallbacks where a newer browser
  feature is used (tab-strip scrollbar, the captured surface type).
- **Installer** (`windows/hooks.nsh`): each edition checks the Windows version before installing and
  offers the right download instead of failing midway: the standard installer on Windows 7/8 or
  32-bit Windows points to the Windows 7 edition; the Windows 7 edition needs Windows 7 SP1.
  Replacing the Windows 7 edition with the standard one removes the private WebView2.

## Testing

- `npm run desktop:test` and the import check run on any Windows.
- The full E2E suite runs on the edition's WebView2 by pointing the debug build at it:
  `WEBVIEW2_BROWSER_EXECUTABLE_FOLDER=<src-tauri>\Microsoft.WebView2.FixedVersionRuntime.109.0.1518.78.x64 npm run desktop:e2e`
  (the folder exists after the first `desktop:package:win7`).
- `cargo test -- --ignored` includes a real TLS handshake with the configured server.
- Before a release, install both Windows 7 installers on Windows 7 SP1 virtual machines (x64 and
  x86) with no updates beyond SP1, and connect in both directions.

## Updating

- **Toolchain:** change `TOOLCHAIN` in `tools/desktop.mjs` to a newer nightly that still builds the
  win7 targets; the import check catches a standard library that starts using newer APIs.
- **WebView2:** there will be no newer runtime for Windows 7. The CABs' SHA-256 hashes are pinned in
  `tools/desktop.mjs`, and both the CAB and `msedgewebview2.exe` must carry a valid Microsoft
  signature, so the download mirror is not trusted.
- **Tauri / wry:** wry falls back for every WebView2 interface newer than 109 that it uses; after an
  upgrade, run the E2E suite on the 109 runtime as above.
