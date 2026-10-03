#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
//! ASDesk desktop shell: window, tray, shortcuts and the bridge between the web UI and the
//! trusted agent. See docs/desktop.md for the security boundary.
//!
//! Windows and macOS share everything but the system layer: platform, input, blocker and elevation
//! come from src/macos/ on a Mac (docs/macos.md).
#[cfg(not(any(windows, target_os = "macos")))]
compile_error!("ASDesk builds for Windows and macOS");

mod agent;
#[cfg_attr(target_os = "macos", path = "macos/blocker.rs")]
mod blocker;
#[cfg_attr(target_os = "macos", path = "macos/elevation.rs")]
mod elevation;
mod identity;
mod inject;
#[cfg_attr(target_os = "macos", path = "macos/input.rs")]
mod input;
mod log;
#[cfg_attr(target_os = "macos", path = "macos/platform.rs")]
mod platform;
#[cfg(target_os = "macos")]
#[path = "macos/sys.rs"]
mod sys;
mod protocol;
mod security;
mod tls;
mod transfer;
mod unattended;

use std::{path::PathBuf, sync::{Arc, Mutex}};

use agent::{AgentHandle, DesktopEvent, DesktopState, Host, Status};
use platform::Rect;
use protocol::Capability;
use serde_json::Value;
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::PageLoadEvent,
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, State, UserAttentionType, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_notification::NotificationExt;

const NORMAL: (f64, f64) = (720.0, 440.0);
const NORMAL_MIN: (f64, f64) = (540.0, 380.0);

/// What the person here is told, in each system's own words.
#[cfg(windows)]
mod words {
    pub const TRAY: &str = "the notification area";
    pub const STOP_KEYS: &str = "Ctrl+Alt+Shift+F12";
    pub const BLOCKED: &str = "The person helping you blocked them for this session. Press Ctrl+Alt+Shift+F12 to stop sharing, or Ctrl+Alt+Del to lock this computer.";
    pub const STILL_RUNNING: &str = "It stays in the notification area so others can request access. Right-click the icon to quit.";
    pub const AUTOSTART: &str = "Start with Windows";
}
#[cfg(target_os = "macos")]
mod words {
    pub const TRAY: &str = "the menu bar";
    pub const STOP_KEYS: &str = "Control+Option+Shift+F12";
    pub const BLOCKED: &str = "The person helping you blocked them for this session. Press Control+Option+Shift+F12 to stop sharing.";
    pub const STILL_RUNNING: &str = "It stays in the menu bar so others can request access. Quit from its menu there.";
    pub const AUTOSTART: &str = "Open at Login";
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode { Normal, Sharing, Viewing }
struct Layout { mode: Mode, saved: Option<(PhysicalPosition<i32>, PhysicalSize<u32>, bool)> }
struct Tray { id: MenuItem<Wry>, end: MenuItem<Wry>, autostart: CheckMenuItem<Wry> }

struct Shell { app: AppHandle, layout: Mutex<Layout>, tray: Mutex<Option<Tray>>, close_notice_shown: Mutex<bool>, icons: TrayIcons }
struct TrayIcons { normal: tauri::image::Image<'static>, sharing: tauri::image::Image<'static> }

fn format_id(id: &str) -> String { id.as_bytes().chunks(3).map(|c| String::from_utf8_lossy(c).into_owned()).collect::<Vec<_>>().join(" ") }
fn status_label(status: Status) -> &'static str {
    match status {
        Status::Setup => "Setup required", Status::Offline => "Offline", Status::Connecting => "Connecting", Status::Ready => "Ready",
    }
}

impl Shell {
    fn window(&self) -> Option<WebviewWindow> { self.app.get_webview_window("main") }
    fn show(&self) {
        if let Some(w) = self.window() { let _ = w.unminimize(); let _ = w.show(); let _ = w.set_focus(); }
    }
    fn set_mode(&self, next: Mode, peer: Option<&str>) {
        let Some(w) = self.window() else { return };
        let mut layout = self.layout.lock().unwrap();
        if next == layout.mode { return; }
        if layout.mode == Mode::Normal {
            if let (Ok(position), Ok(size)) = (w.outer_position(), w.inner_size()) { layout.saved = Some((position, size, w.is_maximized().unwrap_or(false))); }
        }
        let was_sharing = layout.mode == Mode::Sharing;
        if was_sharing { let _ = w.set_content_protected(false); }
        if w.is_fullscreen().unwrap_or(false) { let _ = w.set_fullscreen(false); }
        layout.mode = next;
        match next {
            Mode::Sharing => {
                // Nothing stays on the shared screen, so nothing can cover what the helper works on. The
                // person here is told by a notification and the tray icon (with End session); if they
                // open the window anyway it is left out of the shared image (WDA_EXCLUDEFROMCAPTURE).
                let _ = w.set_content_protected(true);
                let _ = w.hide();
                drop(layout);
                let peer = peer.map(format_id).unwrap_or_default();
                self.notify("Your screen is being shared", &format!("with {peer}. To stop, choose End all sessions from the ASDesk icon in {}, or press {}.", words::TRAY, words::STOP_KEYS));
            }
            Mode::Viewing => { let _ = w.set_min_size(Some(LogicalSize::new(NORMAL_MIN.0, NORMAL_MIN.1))); let _ = w.maximize(); drop(layout); self.show(); }
            Mode::Normal => {
                let _ = w.set_min_size(Some(LogicalSize::new(NORMAL_MIN.0, NORMAL_MIN.1)));
                if let Some((position, size, maximized)) = layout.saved.take() {
                    if w.is_maximized().unwrap_or(false) { let _ = w.unmaximize(); }
                    let _ = w.set_position(position); let _ = w.set_size(size);
                    if maximized { let _ = w.maximize(); }
                }
                drop(layout);
                // After sharing, bring the window back so the person sees that the session ended.
                if was_sharing { self.show(); }
            }
        }
    }
    fn refresh_tray(&self, state: &DesktopState) {
        let sharing = state.target_session();
        let controlling = state.controlling();
        if let Some(tray) = self.app.tray_by_id("main") {
            let id = state.device_id.as_deref().map(|id| format!(" · ID {}", format_id(id))).unwrap_or_default();
            let tooltip = match (sharing, controlling) {
                (Some(a), _) => format!("ASDesk — sharing this screen with {}", format_id(&a.peer_id)),
                (None, 0) => format!("ASDesk — {}{id}", status_label(state.status)),
                (None, 1) => format!("ASDesk — controlling 1 computer{id}"),
                (None, n) => format!("ASDesk — controlling {n} computers{id}"),
            };
            let _ = tray.set_tooltip(Some(tooltip));
            // macOS: the menu bar draws a template icon in its own colour; sharing stays in brand colours.
            let _ = tray.set_icon_as_template(cfg!(target_os = "macos") && sharing.is_none());
            let _ = tray.set_icon(Some(if sharing.is_some() { self.icons.sharing.clone() } else { self.icons.normal.clone() }));
        }
        if let Some(tray) = self.tray.lock().unwrap().as_ref() {
            let _ = tray.id.set_text(state.device_id.as_deref().map(|id| format!("This computer: {}", format_id(id))).unwrap_or_else(|| "Not set up yet".into()));
            let _ = tray.end.set_enabled(!state.sessions.is_empty() || !state.outgoing.is_empty());
            let _ = tray.autostart.set_checked(platform::autostart_command().is_some());
        }
    }
    fn notify(&self, title: &str, body: &str) {
        #[cfg(windows)]
        if !platform::toasts_supported() {
            // Windows 7: a balloon on the tray icon (see platform::balloon).
            let (title, body) = (title.to_string(), body.to_string());
            if let Some(tray) = self.app.tray_by_id("main") {
                let _ = tray.with_inner_tray_icon(move |icon| { if !platform::balloon(icon.window_handle(), &title, &body) { log::write("notification: no tray icon for a balloon"); } });
            }
            return;
        }
        let _ = self.app.notification().builder().title(title).body(body).show();
    }
}

impl Host for Shell {
    fn emit(&self, event: DesktopEvent) { let _ = self.app.emit_to("main", "remote:event", event); }
    fn state_changed(&self, previous: &DesktopState, state: &DesktopState, _shared: Option<Rect>) {
        // Being shared hides the window; controlling any computer uses the maximized viewer.
        let target = state.target_session();
        let mode = if target.is_some() { Mode::Sharing } else if state.controlling() > 0 { Mode::Viewing } else { Mode::Normal };
        self.set_mode(mode, target.map(|a| a.peer_id.as_str()));
        if let Some(w) = self.window() {
            let request = |s: &DesktopState| s.incoming.as_ref().map(|i| i.request_id.clone());
            if state.incoming.is_some() && request(previous) != request(state) {
                self.show();
                let _ = w.request_user_attention(Some(UserAttentionType::Critical));
                if let Some(incoming) = &state.incoming { self.notify("Connection request", &format!("{} wants to access this computer.", format_id(&incoming.source_id))); }
            }
            if state.incoming.is_none() { let _ = w.request_user_attention(None); }
            let title = match target { Some(a) => format!("SHARING — {} — ASDesk", format_id(&a.peer_id)), None => "ASDesk".into() };
            let _ = w.set_title(&title);
        }
        self.refresh_tray(state);
    }
}

// ── Commands (the web UI's only access to the agent; see capabilities/main.json) ──────────────
type Result<T> = std::result::Result<T, String>;
#[tauri::command] fn get_state(agent: State<'_, AgentHandle>) -> DesktopState { agent.state() }
#[tauri::command] async fn setup(agent: State<'_, AgentHandle>, server: String, enrollment_token: Option<String>) -> Result<()> { agent.setup(server, enrollment_token).await }
#[tauri::command] async fn connect(agent: State<'_, AgentHandle>, target_id: String, clipboard: bool, relay_only: bool, password: Option<String>, remember: bool) -> Result<()> { agent.connect(target_id, clipboard, relay_only, password, remember).await }
/// Turn unattended access on for this computer (set or replace the password) or off (no password).
#[tauri::command] async fn set_unattended(agent: State<'_, AgentHandle>, password: String) -> Result<()> { agent.set_unattended(password).await }
#[tauri::command] async fn clear_unattended(agent: State<'_, AgentHandle>) -> Result<()> { agent.clear_unattended().await }
#[tauri::command] async fn forget(agent: State<'_, AgentHandle>, target_id: String) -> Result<()> { agent.forget(target_id).await }
#[tauri::command] async fn dismiss_error(agent: State<'_, AgentHandle>) -> Result<()> { agent.dismiss_error().await }
#[tauri::command] async fn rename_recent(agent: State<'_, AgentHandle>, target_id: String, name: Option<String>) -> Result<()> { agent.rename_recent(target_id, name).await }
#[tauri::command]
async fn accept(agent: State<'_, AgentHandle>, request_id: String, permissions: Vec<Capability>, source_id: String, width: u32, height: u32, thumbnail: Option<Vec<u8>>) -> Result<()> {
    agent.accept(request_id, permissions, source_id, width, height, thumbnail).await
}
#[tauri::command] async fn reject(agent: State<'_, AgentHandle>, request_id: String) -> Result<()> { agent.reject(request_id).await }
#[tauri::command] async fn cancel(agent: State<'_, AgentHandle>, target_id: String) -> Result<()> { agent.cancel(target_id).await }
/// Ends one session, or all of them when no session is named.
#[tauri::command] async fn disconnect(agent: State<'_, AgentHandle>, session_id: Option<String>) -> Result<()> { agent.disconnect(session_id, "Session ended").await }
#[tauri::command] async fn signal(agent: State<'_, AgentHandle>, message: Value) -> Result<()> { agent.signal(message).await }
/// The peer's input, batched by the page (one call in flight per session keeps it in order).
#[tauri::command] async fn input(agent: State<'_, AgentHandle>, session_id: String, events: Vec<Value>) -> Result<()> { agent.input(session_id, events).await }
/// The controller blocked (or unblocked) the keyboard and mouse of the person at this computer. They
/// are told, and how to get them back, every time.
#[tauri::command]
async fn block_input(agent: State<'_, AgentHandle>, shell: State<'_, Arc<Shell>>, session_id: String, block: bool) -> Result<()> {
    agent.block_input(session_id, block).await?;
    if block { shell.notify("Your keyboard and mouse are blocked", words::BLOCKED); }
    else { shell.notify("Your keyboard and mouse work again", "The person helping you unblocked them."); }
    Ok(())
}
/// The unattended password for a computer that asked for one while the request waits.
#[tauri::command] async fn prove_password(agent: State<'_, AgentHandle>, target_id: String, password: String, remember: bool) -> Result<()> { agent.prove(target_id, password, remember).await }
#[tauri::command] async fn read_clipboard(agent: State<'_, AgentHandle>, session_id: String) -> Result<String> { agent.read_clipboard(session_id).await }
// Clipboard file transfer (see transfer.rs). File bytes cross as base64; the data channel carries binary.
#[tauri::command] async fn clipboard_files(agent: State<'_, AgentHandle>, session_id: String) -> Result<Option<transfer::Snapshot>> { agent.clipboard_files(session_id).await }
#[tauri::command]
async fn file_read(agent: State<'_, AgentHandle>, session_id: String, fingerprint: String, index: usize, offset: u64, len: usize) -> Result<String> {
    agent.file_read(session_id, fingerprint, index, offset, len).await
}
#[tauri::command]
async fn file_recv_begin(agent: State<'_, AgentHandle>, session_id: String, transfer_id: String, files: Vec<transfer::FileInfo>) -> Result<()> {
    agent.file_recv_begin(session_id, transfer_id, files).await
}
#[tauri::command] async fn file_recv_open(agent: State<'_, AgentHandle>, session_id: String, transfer_id: String, index: usize) -> Result<()> { agent.file_recv_open(session_id, transfer_id, index).await }
#[tauri::command] async fn file_recv_chunk(agent: State<'_, AgentHandle>, session_id: String, transfer_id: String, data: String) -> Result<()> { agent.file_recv_chunk(session_id, transfer_id, data).await }
#[tauri::command] async fn file_recv_finish(agent: State<'_, AgentHandle>, session_id: String, transfer_id: String) -> Result<usize> { agent.file_recv_finish(session_id, transfer_id).await }
#[tauri::command] async fn file_cancel(agent: State<'_, AgentHandle>, session_id: String) -> Result<()> { agent.file_cancel(session_id).await }
#[tauri::command]
fn copy_id(agent: State<'_, AgentHandle>) -> Result<()> {
    agent.state().device_id.map_or(Ok(()), |id| platform::write_clipboard(&id))
}
/// Frameless window controls for the main window or, with `target`, a popped-out session's window
/// (whose page is driven by the main window's script, so it cannot call this itself).
#[tauri::command]
fn window_action(app: AppHandle, window: WebviewWindow, action: String, target: Option<String>) -> Result<bool> {
    let window = match target {
        Some(label) if label.starts_with(POPOUT) => app.get_webview_window(&label).ok_or("That window is closed")?,
        Some(_) => return Err("Unknown window".into()),
        None => window,
    };
    match action.as_str() {
        "state" => {}
        "minimize" => { if window.is_minimizable().unwrap_or(false) { let _ = window.minimize(); } }
        "maximize" => { if window.is_maximizable().unwrap_or(false) { let _ = if window.is_maximized().unwrap_or(false) { window.unmaximize() } else { window.maximize() }; } }
        "fullscreen" => { let _ = window.set_fullscreen(!window.is_fullscreen().unwrap_or(false)); }
        "drag" => { let _ = window.start_dragging(); }
        "focus" => { let _ = window.unminimize(); let _ = window.set_focus(); }
        // A popout closes for good (the page has already taken its session back); main hides to the tray.
        "close" => { let _ = if window.label().starts_with(POPOUT) { window.destroy() } else { window.close() }; }
        _ => return Err("Unknown window action".into()),
    }
    Ok(window.is_maximized().unwrap_or(false))
}

/// Popped-out sessions. A session torn out of the tab bar keeps its one peer connection in the main
/// window's page; the new window is only a surface that page renders into (`window.open` of
/// about:blank, same origin, so the page reaches into its document). Nothing is renegotiated, so
/// popping out and back is instant and needs nothing from the other computer.
const POPOUT: &str = "session-";
fn popout_window(app: &AppHandle, url: tauri::Url, features: tauri::webview::NewWindowFeatures) -> tauri::webview::NewWindowResponse<Wry> {
    use tauri::webview::NewWindowResponse;
    // Only the page's own popouts: about:blank#asdesk-popout=<session id>&at=<x>,<y> (where to put
    // it, in logical screen pixels; may be negative). Anything else (a link the page never shows, an
    // injected window.open) is refused.
    let fields = url.as_str().strip_prefix("about:blank#").and_then(|f| f.strip_prefix("asdesk-popout="));
    let (id, at) = fields.map(|f| f.split_once("&at=").unwrap_or((f, ""))).unwrap_or_default();
    if !protocol::is_uuid(id) { log::write(format!("refused a new window for {}", url.as_str().chars().take(80).collect::<String>())); return NewWindowResponse::Deny }
    let at = at.split_once(',').and_then(|(x, y)| Some((x.parse::<i32>().ok()?, y.parse::<i32>().ok()?)))
        .filter(|(x, y)| x.abs() < 100_000 && y.abs() < 100_000);
    let label = format!("{POPOUT}{id}");
    if app.get_webview_window(&label).is_some() { return NewWindowResponse::Deny; }
    let mut builder = chrome(WebviewWindowBuilder::new(app, &label, WebviewUrl::External("about:blank".parse().expect("about:blank")))
        .title("ASDesk").inner_size(1024.0, 680.0).min_inner_size(420.0, 280.0).shadow(true)
        .window_features(features).focused(true));
    if let Some((x, y)) = at { builder = builder.position(x as f64, y as f64); }
    let built = builder.build();
    match built {
        // The same browser behaviour as the main window: F5 would otherwise reload the empty surface.
        Ok(window) => { tune_webview(&window); NewWindowResponse::Create { window } }
        Err(error) => { log::write(format!("popout window failed: {error}")); NewWindowResponse::Deny }
    }
}
/// Test builds only: where input for a captured screen would go, and thumbnails of every display.
#[tauri::command]
fn probe_display(source_id: String, width: u32, height: u32) -> Result<(Rect, Vec<(Rect, Vec<u8>)>)> {
    if !cfg!(debug_assertions) { return Err("Unavailable".into()); }
    let (rect, _) = platform::display_for_source(&source_id, width, height, None)?;
    Ok((rect, platform::displays().into_iter().map(|d| (d.rect, platform::thumbnail(d.rect))).collect()))
}
/// Errors the UI shows (for example from the screen picker) also go to the diagnostics log.
#[tauri::command]
fn report(message: String) { log::write(format!("ui: {}", message.chars().take(500).collect::<String>())); }
/// The developer's website, in the default browser (the status bar's credit). The address is fixed
/// here, so the page can open this one site and nothing else.
const DEVELOPER_SITE: &str = "https://www.raione.net";
#[tauri::command]
fn open_website() -> Result<()> { platform::open_url(DEVELOPER_SITE) }
impl serde::Serialize for Rect {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> { (self.x, self.y, self.width, self.height).serialize(s) }
}

/// Lock, suspend, the emergency shortcut: stop sharing immediately and reload the UI, which ends
/// capture and the peer connection even if the page is misbehaving.
fn emergency_stop(app: &AppHandle) {
    if let Some(agent) = app.try_state::<AgentHandle>() {
        if agent.state().sessions.is_empty() { return; }
        agent.stop_all("Stopped locally");
    }
    if let Some(w) = app.get_webview_window("main") { let _ = w.reload(); }
}

/// The window frame. Windows: none, the page draws the title bar and its buttons. macOS: the system's
/// traffic lights over the page's tab bar (which leaves room for them), centred in its 36 px.
fn chrome<'a, M: Manager<Wry>>(builder: WebviewWindowBuilder<'a, Wry, M>) -> WebviewWindowBuilder<'a, Wry, M> {
    #[cfg(windows)]
    return builder.decorations(false);
    #[cfg(target_os = "macos")]
    return builder.title_bar_style(tauri::TitleBarStyle::Overlay).hidden_title(true).traffic_light_position(tauri::LogicalPosition::new(12.0, 18.0));
}

#[cfg(target_os = "macos")]
fn tune_webview(_window: &WebviewWindow) {
    // WKWebView has no browser keys or zoom of its own to turn off, and macOS's
    // inactiveSchedulingPolicy is already set by background_throttling.
}
#[cfg(windows)]
fn tune_webview(window: &WebviewWindow) {
    // Browser behaviour that makes no sense in an app and would swallow keys meant for the remote
    // computer (F5, Ctrl+F, Ctrl+P, Alt+Left, Ctrl+wheel zoom...).
    let _ = window.with_webview(|webview| unsafe {
        use webview2_com::Microsoft::Web::WebView2::Win32::*;
        use windows_core::Interface;
        let Ok(core) = webview.controller().CoreWebView2() else { return };
        let Ok(settings) = core.Settings() else { return };
        let _ = settings.SetIsStatusBarEnabled(false);
        let _ = settings.SetIsZoomControlEnabled(false);
        let _ = settings.SetAreDefaultContextMenusEnabled(cfg!(debug_assertions));
        if let Ok(s) = settings.cast::<ICoreWebView2Settings3>() { let _ = s.SetAreBrowserAcceleratorKeysEnabled(false); }
        if let Ok(s) = settings.cast::<ICoreWebView2Settings4>() { let _ = s.SetIsGeneralAutofillEnabled(false); let _ = s.SetIsPasswordAutosaveEnabled(false); }
        if let Ok(s) = settings.cast::<ICoreWebView2Settings5>() { let _ = s.SetIsPinchZoomEnabled(false); }
        if let Ok(s) = settings.cast::<ICoreWebView2Settings6>() { let _ = s.SetIsSwipeNavigationEnabled(false); }
    });
}

fn main() {
    #[cfg(windows)]
    {
        // Before any window exists, in every mode (see platform::set_dpi_awareness).
        platform::set_dpi_awareness();

        // Full-access control: these worker modes never start the UI. The service registers itself elevated
        // from the installer; it then runs the helper as SYSTEM in the interactive session.
        let args: Vec<String> = std::env::args().collect();
        if args.iter().any(|a| a == "--service") { elevation::run_service(); return; }
        if args.iter().any(|a| a == "--elevated-helper") { elevation::run_helper(); return; }
        if args.iter().any(|a| a == "--install-service") { std::process::exit(if elevation::install_service() { 0 } else { 1 }); }
        if args.iter().any(|a| a == "--uninstall-service") { std::process::exit(if elevation::uninstall_service() { 0 } else { 1 }); }
    }

    // Test builds can run several isolated instances side by side (tools/desktop-e2e.ts).
    let profile = std::env::var_os("COMPANY_REMOTE_PROFILE").filter(|_| cfg!(debug_assertions)).map(PathBuf::from);
    let dry_input = cfg!(debug_assertions) && std::env::var("COMPANY_REMOTE_DRY_INPUT").as_deref() == Ok("1");
    let hidden = std::env::args().any(|a| a == "--hidden");
    let installed = !cfg!(debug_assertions);

    let mut builder = tauri::Builder::default();
    if profile.is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _, _| { if let Some(shell) = app.try_state::<Arc<Shell>>() { shell.show(); } }));
    }
    let app = builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _, event| { if event.state == ShortcutState::Pressed { emergency_stop(app); } })
            .build())
        .invoke_handler(tauri::generate_handler![get_state, setup, connect, forget, rename_recent, dismiss_error, accept, reject, cancel, disconnect, signal, input, block_input, prove_password, read_clipboard,
            clipboard_files, file_read, file_recv_begin, file_recv_open, file_recv_chunk, file_recv_finish, file_cancel,
            set_unattended, clear_unattended, copy_id, window_action, probe_display, report, open_website])
        .setup(move |app| {
            let handle = app.handle().clone();
            let roaming = app.path().data_dir().expect("roaming app data");
            let dir = profile.clone().unwrap_or_else(|| identity::data_dir(roaming.clone()));
            log::init(&dir);
            log::write(format!("ASDesk {} starting", app.package_info().version));
            // Where earlier versions may have left this computer's identity (see identity::load).
            let legacy = if profile.is_some() { Vec::new() } else {
                app.path().app_local_data_dir().ok().map(|d| d.join("legacy")).into_iter().chain([roaming.join("ASDesk")]).collect()
            };

            let mut window = chrome(WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("ASDesk").inner_size(NORMAL.0, NORMAL.1).min_inner_size(NORMAL_MIN.0, NORMAL_MIN.1)
                .shadow(true).visible(false).use_https_scheme(true))
                .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
                .on_page_load(move |w, payload| {
                    if payload.event() != PageLoadEvent::Finished { return; }
                    // Popouts are drawn by this page; a reload (the emergency stop) leaves them empty.
                    for (label, popout) in w.app_handle().webview_windows() { if label.starts_with(POPOUT) { let _ = popout.destroy(); } }
                    if !hidden { let _ = w.show(); }
                })
                .on_new_window({ let app = app.handle().clone(); move |url, features| popout_window(&app, url, features) });
            // WebView2 would otherwise ask which screen to share and show its own "is sharing your
            // screen" bar naming the page's origin. This app shares the primary screen only after
            // the user accepts in its own consent dialog, which the agent verifies; the page runs
            // only the app's own code, and Permissions-Policy blocks camera and microphone. (macOS
            // always shows its own screen picker, which is how the person there chooses what to share.)
            #[cfg(windows)]
            { window = window.additional_browser_args("--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection --use-fake-ui-for-media-stream"); }
            if let Some(profile) = &profile { window = window.data_directory(profile.join("webview")); }
            let window = window.build()?;
            tune_webview(&window);

            #[cfg(windows)]
            let icons = TrayIcons { normal: tauri::image::Image::from_bytes(include_bytes!("../../assets/tray@2x.png"))?,
                sharing: tauri::image::Image::from_bytes(include_bytes!("../../assets/tray-sharing@2x.png"))? };
            // The menu bar is 22 pt tall: 18 pt artwork at 2x (tools/generate-macos-icons.py).
            #[cfg(target_os = "macos")]
            let icons = TrayIcons { normal: tauri::image::Image::from_bytes(include_bytes!("../../assets/tray-template@2x.png"))?,
                sharing: tauri::image::Image::from_bytes(include_bytes!("../../assets/tray-sharing-mac@2x.png"))? };
            let shell = Arc::new(Shell { app: handle.clone(), layout: Mutex::new(Layout { mode: Mode::Normal, saved: None }), tray: Mutex::new(None),
                close_notice_shown: Mutex::new(false), icons });
            app.manage(shell.clone());

            // First installed run: start with Windows (hidden in the tray) so the computer is reachable
            // like a support tool. Later runs keep the user's choice but repair a path from an older install.
            if installed && profile.is_none() {
                let mut settings = identity::load_settings(&dir);
                let exe = std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default();
                if !settings.auto_start_configured {
                    if platform::set_autostart(true).is_ok() { settings.auto_start_configured = true; identity::save_settings(&dir, &settings); }
                } else if platform::autostart_command().is_some_and(|c| !c.contains(&exe)) { let _ = platform::set_autostart(true); }
            }

            let auto_server = option_env!("COMPANY_REMOTE_DEFAULT_SERVER").filter(|s| !s.is_empty() && installed).map(str::to_string);
            let agent = agent::start(agent::Options { dir, legacy, version: app.package_info().version.to_string(), auto_server, dry_input }, shell.clone());
            app.manage(agent.clone());

            // Tray: the app keeps running there so this computer can receive requests.
            let open = MenuItem::with_id(app, "open", "Open ASDesk", true, None::<&str>)?;
            let id = MenuItem::with_id(app, "id", "Not set up yet", false, None::<&str>)?;
            let autostart = CheckMenuItem::with_id(app, "autostart", words::AUTOSTART, installed, platform::autostart_command().is_some(), None::<&str>)?;
            let end = MenuItem::with_id(app, "end", "End all sessions", false, None::<&str>)?;
            let show_log = MenuItem::with_id(app, "log", "Show log file", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &id, &PredefinedMenuItem::separator(app)?, &autostart, &end, &show_log, &PredefinedMenuItem::separator(app)?, &quit])?;
            *shell.tray.lock().unwrap() = Some(Tray { id, end, autostart });
            // A left click opens the window on Windows; on macOS every menu bar icon opens its menu.
            TrayIconBuilder::with_id("main").icon(shell.icons.normal.clone()).icon_as_template(cfg!(target_os = "macos"))
                .tooltip("ASDesk").menu(&menu).show_menu_on_left_click(cfg!(target_os = "macos"))
                .on_tray_icon_event(|tray, event| {
                    if !cfg!(windows) { return; }
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        if let Some(shell) = tray.app_handle().try_state::<Arc<Shell>>() { shell.show(); }
                    }
                })
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => { if let Some(shell) = app.try_state::<Arc<Shell>>() { shell.show(); } }
                    "log" => {
                        #[cfg(windows)]
                        if let Some(path) = log::path() { let _ = std::process::Command::new("explorer.exe").arg(format!("/select,{}", path.display())).spawn(); }
                        #[cfg(target_os = "macos")]
                        if let Some(path) = log::path() { let _ = std::process::Command::new("/usr/bin/open").arg("-R").arg(path).spawn(); }
                    }
                    "autostart" => {
                        let enable = platform::autostart_command().is_none();
                        let _ = platform::set_autostart(enable);
                        if let Some(shell) = app.try_state::<Arc<Shell>>() { if let Some(agent) = app.try_state::<AgentHandle>() { shell.refresh_tray(&agent.state()); } }
                    }
                    "end" => { if let Some(agent) = app.try_state::<AgentHandle>() { agent.stop_all("Stopped locally"); } }
                    "quit" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Some(agent) = app.try_state::<AgentHandle>() {
                                let _ = tokio::time::timeout(std::time::Duration::from_secs(2), agent.shutdown()).await;
                            }
                            app.exit(0);
                        });
                    }
                    _ => {}
                })
                .build(app)?;

            // Ctrl+Alt+Shift+F12 stops sharing instantly. Another program (or a second test instance) may
            // own the hotkey; the panel's Disconnect button and the tray still work then.
            let _ = app.global_shortcut().register("ctrl+alt+shift+F12");

            // Locking or sleeping this computer ends a session; a display change ends sharing only if
            // the shared display moved or changed size.
            let events = handle.clone();
            let on_event = move |event| match event {
                platform::SystemEvent::Locked | platform::SystemEvent::Suspending => emergency_stop(&events),
                platform::SystemEvent::DisplaysChanged => { if let Some(agent) = events.try_state::<AgentHandle>() { agent.displays_changed(); } }
            };
            #[cfg(windows)]
            platform::watch_system(window.hwnd()?.0 as _, on_event);
            #[cfg(target_os = "macos")]
            platform::watch_system(on_event);
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing hides to the tray so this computer stays reachable; Quit is in the tray menu.
            WindowEvent::CloseRequested { api, .. } => {
                let app = window.app_handle();
                api.prevent_close();
                // A popped-out session (Alt+F4, the taskbar): the page takes the session back into the
                // main window and then closes this one. The session continues.
                if let Some(session_id) = window.label().strip_prefix(POPOUT) {
                    let _ = app.emit_to("main", "remote:event", DesktopEvent::Popout { session_id: session_id.to_string() });
                    return;
                }
                if let Some(agent) = app.try_state::<AgentHandle>() { if !agent.state().sessions.is_empty() { agent.stop_all("Window closed"); } }
                let _ = window.hide();
                if let Some(shell) = app.try_state::<Arc<Shell>>() {
                    let mut shown = shell.close_notice_shown.lock().unwrap();
                    if !*shown { *shown = true; shell.notify("ASDesk is still running", words::STILL_RUNNING); }
                }
            }
            WindowEvent::Resized(_) => {
                if let Some(w) = window.app_handle().get_webview_window(window.label()) {
                    let _ = w.emit_to("main", "remote:event", DesktopEvent::Window { label: w.label().to_string(), maximized: w.is_maximized().unwrap_or(false) });
                }
            }
            _ => {}
        })
        .build(tauri::generate_context!())
        .expect("failed to start ASDesk");
    #[cfg(windows)]
    app.run(|_, _| {});
    // Clicking the Dock icon brings back the window that was closed to the menu bar.
    #[cfg(target_os = "macos")]
    app.run(|app, event| {
        if let tauri::RunEvent::Reopen { .. } = event { if let Some(shell) = app.try_state::<Arc<Shell>>() { shell.show(); } }
    });
}
