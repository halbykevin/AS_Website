# ctor 0.8.0 (vendored, patched)

Unmodified crates.io `ctor` 0.8.0 except for one change in `src/macros/mod.rs`: every
`target_vendor = "pc"` check also accepts `target_vendor = "win7"`.

Why: tauri-utils requires `ctor ^0.8` and 0.8.0 recognises Windows only as vendor `pc`, so it refuses
to compile for the Windows 7 targets (`x86_64-win7-windows-msvc`, `i686-win7-windows-msvc`) that the
legacy ASDesk build uses (see docs/windows7.md). Those targets are ordinary MSVC Windows targets and
use the same `.CRT$XCU` constructor section. Builds for `*-pc-windows-msvc` are unaffected.

Remove this directory and the `[patch.crates-io]` entry in ../../Cargo.toml once tauri-utils moves to
a ctor release that handles the win7 vendor.
