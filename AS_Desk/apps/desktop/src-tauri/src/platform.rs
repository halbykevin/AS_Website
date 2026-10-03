//! Thin, audited wrappers over the Win32 APIs the app needs. Nothing here holds application state.
use std::{ffi::c_void, path::PathBuf, ptr::null_mut};
use windows_sys::Win32::{
    Foundation::{GlobalFree, HWND, LPARAM, LRESULT, LocalFree, POINT, RECT, WPARAM},
    Graphics::Gdi::*,
    Security::Cryptography::{CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN, CryptProtectData, CryptUnprotectData},
    System::{
        DataExchange::{CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, SetClipboardData},
        Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock},
        Ole::{CF_HDROP, CF_UNICODETEXT},
        Registry::{HKEY, HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SZ, RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW},
        RemoteDesktop::{NOTIFY_FOR_THIS_SESSION, WTSRegisterSessionNotification},
    },
    UI::{Shell::{DefSubclassProc, DragQueryFileW, DROPFILES, HDROP, SetWindowSubclass}, WindowsAndMessaging::{PBT_APMSUSPEND, WM_DISPLAYCHANGE, WM_POWERBROADCAST, WM_WTSSESSION_CHANGE, WTS_SESSION_LOCK}},
};

fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(std::iter::once(0)).collect() }

// ── Windows version compatibility ────────────────────────────────────────────────────────────
/// A system export that only newer Windows versions have, resolved at run time. Importing such a
/// function directly would stop the executable from loading at all on Windows 7 ("entry point not
/// found"), so everything newer than Windows 7 SP1 goes through here. `name` is NUL-terminated.
unsafe fn optional_export(module: &str, name: &[u8]) -> Option<unsafe extern "system" fn() -> isize> {
    use windows_sys::Win32::System::LibraryLoader::{GetModuleHandleW, GetProcAddress, LoadLibraryW};
    debug_assert_eq!(name.last(), Some(&0));
    let module = wide(module);
    let mut handle = unsafe { GetModuleHandleW(module.as_ptr()) };
    // Only system DLLs are named here, and LoadLibraryW searches the system directory before PATH
    // for KnownDLLs; the application directory holds no DLLs.
    if handle.is_null() { handle = unsafe { LoadLibraryW(module.as_ptr()) }; }
    if handle.is_null() { return None; }
    unsafe { GetProcAddress(handle, name.as_ptr()) }
}

/// Windows 7 builds only: Microsoft's WebView2 loader (WebView2LoaderStatic.lib) imports ETW's
/// EventSetInformation, which Windows 7 SP1 does not have, so the program would not load there. The
/// linker takes a symbol defined in the program over the one in advapi32.lib, so the loader's import
/// slot points here instead: the real function where Windows has it, else ERROR_NOT_SUPPORTED, which
/// TraceLogging treats as "no provider traits" (tools/win7-imports.mjs checks no such import remains).
#[cfg(target_vendor = "win7")]
mod event_set_information {
    type EventSetInformation = unsafe extern "system" fn(u64, i32, *const std::ffi::c_void, u32) -> u32;
    unsafe extern "system" fn shim(handle: u64, class: i32, data: *const std::ffi::c_void, len: u32) -> u32 {
        static REAL: std::sync::OnceLock<Option<EventSetInformation>> = std::sync::OnceLock::new();
        let real = REAL.get_or_init(|| unsafe { super::optional_export("advapi32.dll", b"EventSetInformation\0").map(|f| std::mem::transmute(f)) });
        match real { Some(real) => unsafe { real(handle, class, data, len) }, None => 50 } // ERROR_NOT_SUPPORTED
    }
    // x86: the stdcall-decorated name, verbatim (a leading \x01 stops LLVM adding its own underscore).
    #[cfg_attr(target_arch = "x86", unsafe(export_name = "\u{1}__imp__EventSetInformation@20"))]
    #[cfg_attr(not(target_arch = "x86"), unsafe(export_name = "__imp_EventSetInformation"))]
    #[used]
    static IMPORT: EventSetInformation = shim;
}

/// Physical-pixel coordinates everywhere in the process (and the elevated helper it becomes):
/// displays() reads physical pixels via EnumDisplaySettings, so mouse mapping must use physical pixels
/// too. Without this the remote cursor is offset on any scaled display (125%, 150%, …). Uses the best
/// mode the running Windows offers: per-monitor v2 (10 1703+), per-monitor (8.1), system-aware (7).
pub fn set_dpi_awareness() {
    const PER_MONITOR_AWARE_V2: isize = -4; // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
    const PER_MONITOR_AWARE: isize = -3;    // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE
    const PROCESS_PER_MONITOR_DPI_AWARE: i32 = 2;
    unsafe {
        if let Some(f) = optional_export("user32.dll", b"SetProcessDpiAwarenessContext\0") {
            let set: unsafe extern "system" fn(isize) -> i32 = std::mem::transmute(f);
            if set(PER_MONITOR_AWARE_V2) != 0 || set(PER_MONITOR_AWARE) != 0 { return; }
        }
        if let Some(f) = optional_export("shcore.dll", b"SetProcessDpiAwareness\0") {
            let set: unsafe extern "system" fn(i32) -> i32 = std::mem::transmute(f);
            if set(PROCESS_PER_MONITOR_DPI_AWARE) >= 0 { return; } // S_OK
        }
        windows_sys::Win32::UI::WindowsAndMessaging::SetProcessDPIAware();
    }
}

// ── Windows data protection (DPAPI, bound to the signed-in user) ─────────────────────────────
const ENTROPY: &[u8] = b"company-remote:device-key:v2";
fn dpapi(data: &[u8], entropy: Option<&[u8]>, protect: bool) -> Result<Vec<u8>, String> {
    let input = CRYPT_INTEGER_BLOB { cbData: data.len() as u32, pbData: data.as_ptr() as *mut u8 };
    let extra = entropy.map(|e| CRYPT_INTEGER_BLOB { cbData: e.len() as u32, pbData: e.as_ptr() as *mut u8 });
    let extra_ptr = extra.as_ref().map_or(std::ptr::null(), |e| e as *const _);
    let mut output = CRYPT_INTEGER_BLOB { cbData: 0, pbData: null_mut() };
    let ok = unsafe {
        if protect { CryptProtectData(&input, std::ptr::null(), extra_ptr, null_mut(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
        else { CryptUnprotectData(&input, null_mut(), extra_ptr, null_mut(), std::ptr::null(), CRYPTPROTECT_UI_FORBIDDEN, &mut output) }
    };
    if ok == 0 { return Err("Windows credential protection is unavailable".into()); }
    let result = unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe { LocalFree(output.pbData as *mut c_void) };
    Ok(result)
}
pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> { dpapi(data, Some(ENTROPY), true) }
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> { dpapi(data, Some(ENTROPY), false) }
/// Chromium's os_crypt key (Electron safeStorage) is protected without entropy.
pub fn unprotect_legacy(data: &[u8]) -> Result<Vec<u8>, String> { dpapi(data, None, false) }

// ── Clipboard (text only) ────────────────────────────────────────────────────────────────────
struct Clipboard;
impl Clipboard {
    fn open() -> Result<Self, String> {
        for _ in 0..10 {
            if unsafe { OpenClipboard(null_mut()) } != 0 { return Ok(Self); }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        Err("Clipboard is busy".into())
    }
}
impl Drop for Clipboard { fn drop(&mut self) { unsafe { CloseClipboard() }; } }

pub fn read_clipboard() -> Result<String, String> {
    let _guard = Clipboard::open()?;
    let handle = unsafe { GetClipboardData(CF_UNICODETEXT as u32) };
    if handle.is_null() { return Ok(String::new()); }
    let data = unsafe { GlobalLock(handle) } as *const u16;
    if data.is_null() { return Ok(String::new()); }
    let mut len = 0;
    while len < 1 << 20 && unsafe { *data.add(len) } != 0 { len += 1; }
    let text = String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(data, len) });
    unsafe { GlobalUnlock(handle) };
    Ok(text)
}
pub fn write_clipboard(text: &str) -> Result<(), String> {
    let units = wide(text);
    let _guard = Clipboard::open()?;
    unsafe {
        EmptyClipboard();
        let memory = GlobalAlloc(GMEM_MOVEABLE, units.len() * 2);
        if memory.is_null() { return Err("Clipboard unavailable".into()); }
        let target = GlobalLock(memory) as *mut u16;
        if target.is_null() { GlobalFree(memory); return Err("Clipboard unavailable".into()); }
        std::ptr::copy_nonoverlapping(units.as_ptr(), target, units.len());
        GlobalUnlock(memory);
        if SetClipboardData(CF_UNICODETEXT as u32, memory).is_null() { GlobalFree(memory); return Err("Clipboard unavailable".into()); }
    }
    Ok(())
}

// ── Clipboard files (CF_HDROP) ─────────────────────────────────────────────────────────────────
/// The file paths the clipboard currently holds (what the user copied in Explorer), or empty.
pub fn read_clipboard_files() -> Result<Vec<PathBuf>, String> {
    let _guard = Clipboard::open()?;
    let handle = unsafe { GetClipboardData(CF_HDROP as u32) };
    if handle.is_null() { return Ok(Vec::new()); }
    let hdrop = handle as HDROP;
    let count = unsafe { DragQueryFileW(hdrop, 0xFFFF_FFFF, null_mut(), 0) };
    let mut files = Vec::new();
    for i in 0..count {
        let len = unsafe { DragQueryFileW(hdrop, i, null_mut(), 0) };
        if len == 0 { continue; }
        let mut buffer = vec![0u16; len as usize + 1];
        let copied = unsafe { DragQueryFileW(hdrop, i, buffer.as_mut_ptr(), buffer.len() as u32) };
        if copied != 0 { files.push(PathBuf::from(String::from_utf16_lossy(&buffer[..copied as usize]))); }
    }
    Ok(files)
}
/// Puts `paths` on the clipboard as CF_HDROP, so a Ctrl+V in Explorer pastes the real files.
pub fn write_clipboard_files(paths: &[PathBuf]) -> Result<(), String> {
    // CF_HDROP is a DROPFILES header followed by a double-null-terminated list of wide paths.
    let mut list: Vec<u16> = Vec::new();
    for path in paths { list.extend(wide(&path.to_string_lossy())); } // wide() already appends a NUL per path
    list.push(0); // final terminator after the last path
    let header = std::mem::size_of::<DROPFILES>();
    let _guard = Clipboard::open()?;
    unsafe {
        EmptyClipboard();
        let memory = GlobalAlloc(GMEM_MOVEABLE, header + list.len() * 2);
        if memory.is_null() { return Err("Clipboard unavailable".into()); }
        let base = GlobalLock(memory) as *mut u8;
        if base.is_null() { GlobalFree(memory); return Err("Clipboard unavailable".into()); }
        let drop_files = base as *mut DROPFILES;
        (*drop_files).pFiles = header as u32;
        (*drop_files).pt = POINT { x: 0, y: 0 };
        (*drop_files).fNC = 0;
        (*drop_files).fWide = 1;
        std::ptr::copy_nonoverlapping(list.as_ptr(), base.add(header) as *mut u16, list.len());
        GlobalUnlock(memory);
        if SetClipboardData(CF_HDROP as u32, memory).is_null() { GlobalFree(memory); return Err("Clipboard unavailable".into()); }
    }
    Ok(())
}

// ── Displays ─────────────────────────────────────────────────────────────────────────────────
/// A monitor in physical desktop pixels (the process is per-monitor DPI aware).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect { pub x: i32, pub y: i32, pub width: i32, pub height: i32 }

/// An active display: its EnumDisplayDevices index and monitor handle (the two ids WebRTC's Windows
/// capturers put in a getDisplayMedia track's `screen:<id>:0`), and its desktop rectangle.
#[derive(Clone, Copy, Debug)]
pub struct Display { pub index: u32, pub monitor: isize, pub rect: Rect }

pub fn displays() -> Vec<Display> {
    // Monitor handles by device name (\\.\DISPLAY1...).
    unsafe extern "system" fn collect(monitor: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> windows_sys::core::BOOL {
        let list = unsafe { &mut *(data as *mut Vec<(isize, [u16; 32])>) };
        let mut info: MONITORINFOEXW = unsafe { std::mem::zeroed() };
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(monitor, &mut info as *mut _ as *mut _) } != 0 { list.push((monitor as isize, info.szDevice)); }
        1
    }
    let mut monitors: Vec<(isize, [u16; 32])> = Vec::new();
    unsafe { EnumDisplayMonitors(null_mut(), std::ptr::null(), Some(collect), &mut monitors as *mut _ as LPARAM) };
    let mut list = Vec::new();
    for index in 0..64u32 {
        let mut device: DISPLAY_DEVICEW = unsafe { std::mem::zeroed() };
        device.cb = std::mem::size_of::<DISPLAY_DEVICEW>() as u32;
        if unsafe { EnumDisplayDevicesW(std::ptr::null(), index, &mut device, 0) } == 0 { break; }
        if device.StateFlags & DISPLAY_DEVICE_ACTIVE == 0 { continue; }
        let mut mode: DEVMODEW = unsafe { std::mem::zeroed() };
        mode.dmSize = std::mem::size_of::<DEVMODEW>() as u16;
        if unsafe { EnumDisplaySettingsW(device.DeviceName.as_ptr(), ENUM_CURRENT_SETTINGS, &mut mode) } == 0 { continue; }
        let position = unsafe { mode.Anonymous1.Anonymous2.dmPosition };
        let monitor = monitors.iter().find(|(_, name)| name[..] == device.DeviceName[..]).map_or(0, |(handle, _)| *handle);
        list.push(Display { index, monitor, rect: Rect { x: position.x, y: position.y, width: mode.dmPelsWidth as i32, height: mode.dmPelsHeight as i32 } });
    }
    list
}

/// A 32×18 grayscale thumbnail of a screen region, to compare with a frame of the captured screen.
pub const THUMBNAIL: (i32, i32) = (32, 18);
pub fn thumbnail(rect: Rect) -> Vec<u8> {
    let (width, height) = THUMBNAIL;
    unsafe {
        let screen = GetDC(null_mut());
        let memory = CreateCompatibleDC(screen);
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        let old = SelectObject(memory, bitmap);
        SetStretchBltMode(memory, HALFTONE);
        StretchBlt(memory, 0, 0, width, height, screen, rect.x, rect.y, rect.width, rect.height, SRCCOPY);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = width; info.bmiHeader.biHeight = -height;
        info.bmiHeader.biPlanes = 1; info.bmiHeader.biBitCount = 32; info.bmiHeader.biCompression = BI_RGB;
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        GetDIBits(memory, bitmap, 0, height as u32, pixels.as_mut_ptr() as *mut _, &mut info, DIB_RGB_COLORS);
        SelectObject(memory, old); DeleteObject(bitmap); DeleteDC(memory); ReleaseDC(null_mut(), screen);
        pixels.chunks(4).map(|p| ((p[2] as u32 * 299 + p[1] as u32 * 587 + p[0] as u32 * 114) / 1000) as u8).collect()
    }
}
fn difference(a: &[u8], b: &[u8]) -> f64 {
    a.iter().zip(b).map(|(x, y)| (*x as f64 - *y as f64).abs()).sum::<f64>() / a.len().max(1) as f64
}

/// Maps the captured screen to the display it shows, so input lands there. `captured` is a thumbnail
/// of a frame of the capture (see THUMBNAIL). What the screen shows is the strongest evidence, since
/// capture backends number screens differently; the track id (display index or monitor handle) and
/// the frame's aspect ratio decide when the content is ambiguous. Returns why, for the log.
pub fn display_for_source(source_id: &str, frame_width: u32, frame_height: u32, captured: Option<&[u8]>) -> Result<(Rect, String), String> {
    let list = displays();
    let describe = || format!("source {source_id} {frame_width}x{frame_height}, displays {:?}", list.iter().map(|d| (d.index, d.monitor, d.rect)).collect::<Vec<_>>());
    if list.is_empty() || frame_width == 0 || frame_height == 0 { return Err(describe()); }
    let aspect = frame_width as f64 / frame_height as f64;
    let same_shape: Vec<Display> = list.iter().copied().filter(|d| d.rect.height > 0 && ((d.rect.width as f64 / d.rect.height as f64) / aspect - 1.0).abs() < 0.02).collect();
    let candidates = if same_shape.is_empty() { list.clone() } else { same_shape };
    if let Some(captured) = captured.filter(|c| c.len() == (THUMBNAIL.0 * THUMBNAIL.1) as usize && candidates.len() > 1) {
        let mut scored: Vec<(f64, Display)> = candidates.iter().map(|d| (difference(captured, &thumbnail(d.rect)), *d)).collect();
        scored.sort_by(|a, b| a.0.total_cmp(&b.0));
        let (best, second) = (scored[0].0, scored[1].0);
        if best < 45.0 && second - best >= 12.0 { return Ok((scored[0].1.rect, format!("by content ({best:.0} vs {second:.0}); {}", describe()))); }
    }
    let id = source_id.strip_prefix("screen:").and_then(|rest| rest.split(':').next()).and_then(|n| n.parse::<i64>().ok());
    if let Some(d) = id.and_then(|id| candidates.iter().find(|d| d.index as i64 == id || (d.monitor != 0 && d.monitor as i64 == id))) {
        return Ok((d.rect, format!("by id; {}", describe())));
    }
    if candidates.len() == 1 { return Ok((candidates[0].rect, format!("only display of that shape; {}", describe()))); }
    Err(describe())
}

// ── Start with Windows (per-user Run key) ────────────────────────────────────────────────────
const RUN_KEY: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Run";
// The value name earlier versions used, so the entry is replaced rather than duplicated.
const RUN_VALUE: &str = "com.companyremote.desktop";
fn run_key(access: u32) -> Option<HKEY> {
    let mut key: HKEY = null_mut();
    (unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, wide(RUN_KEY).as_ptr(), 0, access, &mut key) } == 0).then_some(key)
}
pub fn autostart_command() -> Option<String> {
    let key = run_key(KEY_QUERY_VALUE)?;
    let mut buffer = vec![0u16; 2048];
    let mut size = (buffer.len() * 2) as u32;
    let status = unsafe { RegQueryValueExW(key, wide(RUN_VALUE).as_ptr(), null_mut(), null_mut(), buffer.as_mut_ptr() as *mut u8, &mut size) };
    unsafe { RegCloseKey(key) };
    if status != 0 { return None; }
    let text = String::from_utf16_lossy(&buffer[..(size as usize / 2)]);
    Some(text.trim_end_matches('\0').to_string())
}
pub fn set_autostart(enabled: bool) -> Result<(), String> {
    let key = run_key(KEY_SET_VALUE).ok_or("Cannot open the Windows start-up settings")?;
    let status = if enabled {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let command = wide(&format!("\"{}\" --hidden", exe.display()));
        unsafe { RegSetValueExW(key, wide(RUN_VALUE).as_ptr(), 0, REG_SZ, command.as_ptr() as *const u8, (command.len() * 2) as u32) }
    } else {
        let status = unsafe { RegDeleteValueW(key, wide(RUN_VALUE).as_ptr()) };
        if status == 2 { 0 } else { status } // already absent
    };
    unsafe { RegCloseKey(key) };
    if status == 0 { Ok(()) } else { Err("Cannot change the Windows start-up settings".into()) }
}

// ── Links ────────────────────────────────────────────────────────────────────────────────────
/// Opens an https address in the default browser.
pub fn open_url(url: &str) -> Result<(), String> {
    use windows_sys::Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL};
    if !url.starts_with("https://") { return Err("Only https links can be opened".into()); }
    let result = unsafe { ShellExecuteW(null_mut(), wide("open").as_ptr(), wide(url).as_ptr(), std::ptr::null(), std::ptr::null(), SW_SHOWNORMAL) };
    // ShellExecute reports success as a value above 32.
    if result as usize > 32 { Ok(()) } else { Err("Cannot open the browser".into()) }
}

// ── Notifications ────────────────────────────────────────────────────────────────────────────
/// Toast notifications are WinRT (Windows 8 and later). Windows 7 has no WinRT at all, and the WinRT
/// imports are delay-loaded there (build.rs), so they must never be called; balloon() stands in.
pub fn toasts_supported() -> bool {
    static SUPPORTED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *SUPPORTED.get_or_init(|| unsafe { optional_export("combase.dll", b"RoGetActivationFactory\0") }.is_some())
}
/// A balloon tip on the notification-area icon: the Windows 7 notification. `tray` is the tray icon's
/// own hidden window (tray-icon gives each icon a window of its own, which owns only that icon); its
/// icon id is a small counter, so the first id the shell accepts is it.
pub fn balloon(tray: HWND, title: &str, body: &str) -> bool {
    use windows_sys::Win32::UI::Shell::{NIF_INFO, NIIF_INFO, NIM_MODIFY, NOTIFYICONDATAW, Shell_NotifyIconW};
    // Built outside the struct and assigned whole: on 32-bit Windows it is packed, so its fields
    // cannot be borrowed.
    fn fixed<const N: usize>(text: &str) -> [u16; N] {
        let mut out = [0u16; N];
        for (slot, unit) in out.iter_mut().zip(text.encode_utf16().take(N - 1)) { *slot = unit; }
        out
    }
    let mut data: NOTIFYICONDATAW = unsafe { std::mem::zeroed() };
    data.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
    data.hWnd = tray;
    data.uFlags = NIF_INFO;
    data.dwInfoFlags = NIIF_INFO;
    data.szInfoTitle = fixed(title);
    data.szInfo = fixed(body);
    (1..=16).any(|id| { data.uID = id; (unsafe { Shell_NotifyIconW(NIM_MODIFY, &data) }) != 0 })
}

// ── Session lock, suspend and display changes ────────────────────────────────────────────────
#[derive(Clone, Copy, Debug)]
pub enum SystemEvent { Locked, Suspending, DisplaysChanged }
type Handler = Box<dyn Fn(SystemEvent) + Send + Sync>;

unsafe extern "system" fn subclass(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, data: usize) -> LRESULT {
    let handler = unsafe { &*(data as *const Handler) };
    match message {
        WM_WTSSESSION_CHANGE if wparam as u32 == WTS_SESSION_LOCK => handler(SystemEvent::Locked),
        WM_POWERBROADCAST if wparam as u32 == PBT_APMSUSPEND => handler(SystemEvent::Suspending),
        WM_DISPLAYCHANGE => handler(SystemEvent::DisplaysChanged),
        _ => {}
    }
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}
/// Delivers lock, suspend and display-change notifications for the lifetime of the window.
pub fn watch_system(hwnd: HWND, handler: impl Fn(SystemEvent) + Send + Sync + 'static) {
    let data = Box::into_raw(Box::new(Box::new(handler) as Handler)) as usize; // lives as long as the process
    unsafe {
        WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION);
        SetWindowSubclass(hwnd, Some(subclass), 0x4352, data);
    }
}
