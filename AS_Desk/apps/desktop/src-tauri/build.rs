const COMMANDS: &[&str] = &["get_state", "setup", "connect", "forget", "rename_recent", "dismiss_error", "accept", "reject", "cancel", "disconnect", "signal", "input",
    "block_input", "prove_password", "read_clipboard", "clipboard_files", "file_read", "file_recv_begin", "file_recv_open", "file_recv_chunk", "file_recv_finish", "file_cancel",
    "set_unattended", "clear_unattended", "copy_id", "window_action", "probe_display", "report", "open_website"];

fn main() {
    // The server installed copies register with on first run: COMPANY_REMOTE_SERVER, else
    // companyRemote.defaultServer in apps/desktop/package.json.
    println!("cargo:rerun-if-changed=../package.json");
    println!("cargo:rerun-if-env-changed=COMPANY_REMOTE_SERVER");
    let package: serde_json::Value = serde_json::from_str(&std::fs::read_to_string("../package.json").expect("apps/desktop/package.json")).expect("valid package.json");
    let server = std::env::var("COMPANY_REMOTE_SERVER").ok()
        .or_else(|| package["companyRemote"]["defaultServer"].as_str().map(str::to_string)).unwrap_or_default();
    assert!(server.is_empty() || (server.starts_with("https://") && server[8..].bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')),
        "invalid default server: {server}");
    println!("cargo:rustc-env=COMPANY_REMOTE_DEFAULT_SERVER={server}");
    // Windows 7 builds (x86_64/i686-win7-windows-msvc, see docs/windows7.md). Two imports that
    // windows-core's WinRT activation path pulls in do not exist on Windows 7; a plain import of either
    // stops the program from loading there at all. Delay-loaded, they are resolved only if called, and
    // on Windows 7 they never are: WinRT (toast notifications) is used only when it exists
    // (platform::toasts_supported). tools/win7-imports.mjs verifies the result.
    if std::env::var("CARGO_CFG_TARGET_VENDOR").as_deref() == Ok("win7") {
        for dll in ["api-ms-win-core-winrt-l1-1-0.dll", "ole32.dll"] { println!("cargo:rustc-link-arg-bins=/DELAYLOAD:{dll}"); }
        println!("cargo:rustc-link-arg-bins=delayimp.lib");
    }
    println!("cargo:rerun-if-changed=windows/app.manifest");
    let windows = tauri_build::WindowsAttributes::new().app_manifest(include_str!("windows/app.manifest"));
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows)
        .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS))).expect("tauri build");
}
