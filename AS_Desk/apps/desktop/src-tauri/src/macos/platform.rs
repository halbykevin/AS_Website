//! The macOS side of platform.rs: the same functions over the keychain, AppKit and Core Graphics.
//! Nothing here holds application state beyond the cached device key.
use std::{ffi::c_void, fs, path::{Path, PathBuf}, ptr::NonNull, sync::{Arc, Mutex}};

use aes_gcm::{aead::{Aead, Payload}, Aes256Gcm, KeyInit, Nonce};
use block2::RcBlock;
use objc2::{rc::{autoreleasepool, Retained}, runtime::ProtocolObject};
use objc2_app_kit::{NSPasteboard, NSPasteboardTypeFileURL, NSPasteboardTypeString, NSPasteboardWriting, NSWorkspace,
    NSWorkspaceSessionDidResignActiveNotification, NSWorkspaceWillSleepNotification};
use objc2_foundation::{ns_string, NSDistributedNotificationCenter, NSNotification, NSNotificationName, NSString, NSURL};
use security_framework::passwords::{get_generic_password, set_generic_password};

use crate::sys;

// ── Data protection (the keychain, bound to the signed-in user) ──────────────────────────────
// The counterpart of DPAPI: a random AES-256 key kept in the login keychain encrypts what Windows
// protects with DPAPI. Signed builds keep access to it across updates; macOS asks once more after an
// update only when the app's signature changed (unsigned builds). Development builds and tests keep a
// key of their own, so they never touch (or make macOS ask about) the installed app's.
const KEYCHAIN_SERVICE: &str = if cfg!(debug_assertions) { "ASDesk (development)" } else { "ASDesk" };
const KEYCHAIN_ACCOUNT: &str = "device-key";
const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;
const ENTROPY: &[u8] = b"company-remote:device-key:v2";

fn keychain_key() -> Result<[u8; 32], String> {
    static KEY: Mutex<Option<[u8; 32]>> = Mutex::new(None);
    let mut cached = KEY.lock().unwrap();
    if let Some(key) = *cached { return Ok(key); }
    let key = match get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
        Ok(stored) => <[u8; 32]>::try_from(stored.as_slice()).map_err(|_| "The ASDesk key in the keychain is damaged")?,
        Err(error) if error.code() == ERR_SEC_ITEM_NOT_FOUND => {
            let mut key = [0u8; 32];
            getrandom::fill(&mut key).map_err(|_| "Cannot create a device key")?;
            set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, &key).map_err(|e| format!("Cannot store the device key in the keychain: {e}"))?;
            key
        }
        Err(error) => return Err(format!("The macOS keychain is unavailable: {error}")),
    };
    *cached = Some(key);
    Ok(key)
}
pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(&keychain_key()?).map_err(|_| "Cannot protect data")?;
    let mut nonce = [0u8; 12];
    getrandom::fill(&mut nonce).map_err(|_| "Cannot protect data")?;
    let sealed = cipher.encrypt(Nonce::from_slice(&nonce), Payload { msg: data, aad: ENTROPY }).map_err(|_| "Cannot protect data")?;
    Ok([nonce.as_slice(), &sealed].concat())
}
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    if data.len() < 12 + 16 { return Err("Protected data is damaged".into()); }
    let cipher = Aes256Gcm::new_from_slice(&keychain_key()?).map_err(|_| "Cannot read protected data")?;
    cipher.decrypt(Nonce::from_slice(&data[..12]), Payload { msg: &data[12..], aad: ENTROPY }).map_err(|_| "Protected data is damaged".into())
}
/// Electron's safeStorage key existed only in Windows versions.
pub fn unprotect_legacy(_data: &[u8]) -> Result<Vec<u8>, String> { Err("Not available on macOS".into()) }

// ── Clipboard (the general pasteboard) ───────────────────────────────────────────────────────
pub fn read_clipboard() -> Result<String, String> {
    autoreleasepool(|_| unsafe {
        let text = NSPasteboard::generalPasteboard().stringForType(NSPasteboardTypeString);
        Ok(text.map(|t| t.to_string()).unwrap_or_default())
    })
}
pub fn write_clipboard(text: &str) -> Result<(), String> {
    autoreleasepool(|_| unsafe {
        let board = NSPasteboard::generalPasteboard();
        board.clearContents();
        if board.setString_forType(&NSString::from_str(text), NSPasteboardTypeString) { Ok(()) } else { Err("Clipboard unavailable".into()) }
    })
}

/// The files the pasteboard holds (what the user copied in Finder), or empty.
pub fn read_clipboard_files() -> Result<Vec<PathBuf>, String> {
    autoreleasepool(|_| unsafe {
        let Some(items) = NSPasteboard::generalPasteboard().pasteboardItems() else { return Ok(Vec::new()) };
        let mut files = Vec::new();
        for item in items.iter() {
            // Finder writes file reference URLs (file:///.file/id=...); filePathURL resolves them.
            let Some(url) = item.stringForType(NSPasteboardTypeFileURL).and_then(|s| NSURL::URLWithString(&s)) else { continue };
            if let Some(path) = url.filePathURL().and_then(|u| u.path()) { files.push(PathBuf::from(path.to_string())); }
        }
        Ok(files)
    })
}
/// Puts `paths` on the pasteboard as file URLs, so ⌘V in Finder pastes the real files.
pub fn write_clipboard_files(paths: &[PathBuf]) -> Result<(), String> {
    autoreleasepool(|_| {
        let urls: Vec<Retained<NSURL>> = paths.iter().map(|p| NSURL::fileURLWithPath(&NSString::from_str(&p.to_string_lossy()))).collect();
        let objects: Vec<&ProtocolObject<dyn NSPasteboardWriting>> = urls.iter().map(|u| ProtocolObject::from_ref(&**u)).collect();
        let board = NSPasteboard::generalPasteboard();
        board.clearContents();
        if board.writeObjects(&objc2_foundation::NSArray::from_slice(&objects)) { Ok(()) } else { Err("Clipboard unavailable".into()) }
    })
}

// ── Displays ─────────────────────────────────────────────────────────────────────────────────
/// A display in global screen coordinates (points, origin at the top left of the main display): the
/// space Quartz mouse events use, so input maps onto it directly.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rect { pub x: i32, pub y: i32, pub width: i32, pub height: i32 }

/// An active display: its CGDirectDisplayID and bounds.
#[derive(Clone, Copy, Debug)]
pub struct Display { pub id: u32, pub rect: Rect }

pub fn displays() -> Vec<Display> {
    let mut ids = [0u32; 32];
    let mut count = 0u32;
    if unsafe { sys::CGGetActiveDisplayList(ids.len() as u32, ids.as_mut_ptr(), &mut count) } != 0 { return Vec::new(); }
    ids[..count as usize].iter().map(|&id| {
        let bounds = unsafe { sys::CGDisplayBounds(id) };
        Display { id, rect: Rect { x: bounds.origin.x.round() as i32, y: bounds.origin.y.round() as i32,
            width: bounds.size.width.round() as i32, height: bounds.size.height.round() as i32 } }
    }).collect()
}

/// A 32×18 grayscale thumbnail of a display, to compare with a frame of the captured screen. Empty
/// unless this app may read the screen itself (Screen Recording), which macOS checks without asking.
pub const THUMBNAIL: (i32, i32) = (32, 18);
fn thumbnail_of(display: u32) -> Vec<u8> {
    let (width, height) = (THUMBNAIL.0 as usize, THUMBNAIL.1 as usize);
    let Some(create) = sys::display_create_image().filter(|_| unsafe { sys::CGPreflightScreenCaptureAccess() }) else { return Vec::new() };
    unsafe {
        let image = create(display);
        if image.is_null() { return Vec::new(); }
        let mut pixels = vec![0u8; width * height * 4];
        let space = sys::CGColorSpaceCreateDeviceRGB();
        let context = sys::CGBitmapContextCreate(pixels.as_mut_ptr() as *mut c_void, width, height, 8, width * 4, space,
            sys::kCGImageAlphaNoneSkipLast | sys::kCGBitmapByteOrder32Big);
        if !context.is_null() {
            sys::CGContextSetInterpolationQuality(context, sys::kCGInterpolationMedium);
            sys::CGContextDrawImage(context, sys::CGRect { origin: sys::CGPoint::default(), size: sys::CGSize { width: width as f64, height: height as f64 } }, image);
            sys::CGContextRelease(context);
        }
        sys::CGColorSpaceRelease(space);
        sys::CGImageRelease(image);
        if context.is_null() { return Vec::new(); }
        pixels.chunks(4).map(|p| ((p[0] as u32 * 299 + p[1] as u32 * 587 + p[2] as u32 * 114) / 1000) as u8).collect()
    }
}
pub fn thumbnail(rect: Rect) -> Vec<u8> {
    displays().iter().find(|d| d.rect == rect).map_or_else(Vec::new, |d| thumbnail_of(d.id))
}
fn difference(a: &[u8], b: &[u8]) -> f64 {
    a.iter().zip(b).map(|(x, y)| (*x as f64 - *y as f64).abs()).sum::<f64>() / a.len().max(1) as f64
}

/// Maps the captured screen to the display it shows, so input lands there. macOS's own picker chose
/// the screen and the page cannot name it, so the frame's shape decides; when several displays share
/// it, what the screen shows (if this app may read the screen) or a display id in the track does.
/// A capture that matches no display's shape is a window, which control must never be mapped onto.
pub fn display_for_source(source_id: &str, frame_width: u32, frame_height: u32, captured: Option<&[u8]>) -> Result<(Rect, String), String> {
    let list = displays();
    let describe = || format!("source {source_id} {frame_width}x{frame_height}, displays {:?}", list.iter().map(|d| (d.id, d.rect)).collect::<Vec<_>>());
    if list.is_empty() || frame_width == 0 || frame_height == 0 { return Err(describe()); }
    let aspect = frame_width as f64 / frame_height as f64;
    let candidates: Vec<Display> = list.iter().copied().filter(|d| d.rect.height > 0 && ((d.rect.width as f64 / d.rect.height as f64) / aspect - 1.0).abs() < 0.02).collect();
    if candidates.len() == 1 { return Ok((candidates[0].rect, format!("only display of that shape; {}", describe()))); }
    if let Some(captured) = captured.filter(|c| c.len() == (THUMBNAIL.0 * THUMBNAIL.1) as usize && candidates.len() > 1) {
        let mut scored: Vec<(f64, Display)> = candidates.iter().filter_map(|d| {
            let own = thumbnail_of(d.id);
            (own.len() == captured.len()).then(|| (difference(captured, &own), *d))
        }).collect();
        scored.sort_by(|a, b| a.0.total_cmp(&b.0));
        if let [(best, display), (second, _), ..] = scored.as_slice() {
            if *best < 45.0 && second - best >= 12.0 { return Ok((display.rect, format!("by content ({best:.0} vs {second:.0}); {}", describe()))); }
        }
    }
    let id = source_id.trim_start_matches("screen:").split(':').next().and_then(|n| n.parse::<u32>().ok());
    if let Some(d) = id.and_then(|id| candidates.iter().find(|d| d.id == id)) { return Ok((d.rect, format!("by id; {}", describe()))); }
    Err(describe())
}

// ── Open at login (a per-user launch agent) ──────────────────────────────────────────────────
// The label earlier Windows versions used for their Run value, for one name everywhere.
const LAUNCH_AGENT: &str = "com.companyremote.desktop";
fn launch_agent_path() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Library/LaunchAgents").join(format!("{LAUNCH_AGENT}.plist")))
}
fn xml_escape(text: &str) -> String { text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;") }
/// The program the launch agent starts, if there is one.
pub fn autostart_command() -> Option<String> {
    let plist = fs::read_to_string(launch_agent_path()?).ok()?;
    let arguments = &plist[plist.find("<key>ProgramArguments</key>")?..];
    let program = &arguments[arguments.find("<string>")? + "<string>".len()..];
    Some(program[..program.find("</string>")?].replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&"))
}
/// Only a copy in an Applications folder starts at login: one opened from the disk image or from
/// Downloads (where macOS runs it from a temporary location) would not be there next time.
fn installed(exe: &Path) -> bool {
    let home_apps = std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Applications"));
    exe.starts_with("/Applications") || home_apps.is_some_and(|apps| exe.starts_with(apps))
}
pub fn set_autostart(enabled: bool) -> Result<(), String> {
    let path = launch_agent_path().ok_or("Cannot find your home folder")?;
    if !enabled {
        return match fs::remove_file(&path) { Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(format!("Cannot change the login items: {e}")), _ => Ok(()) };
    }
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    if !installed(&exe) { return Err("Move ASDesk to the Applications folder first".into()); }
    let plist = format!(r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>{LAUNCH_AGENT}</string>
  <key>ProgramArguments</key><array><string>{}</string><string>--hidden</string></array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
  <key>AssociatedBundleIdentifiers</key><string>{LAUNCH_AGENT}</string>
</dict>
</plist>
"#, xml_escape(&exe.to_string_lossy()));
    fs::create_dir_all(path.parent().expect("LaunchAgents")).and_then(|_| fs::write(&path, plist)).map_err(|e| format!("Cannot change the login items: {e}"))
}

// ── Links ────────────────────────────────────────────────────────────────────────────────────
/// Opens an https address in the default browser.
pub fn open_url(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") { return Err("Only https links can be opened".into()); }
    autoreleasepool(|_| {
        let url = NSURL::URLWithString(&NSString::from_str(url)).ok_or("Invalid link")?;
        if NSWorkspace::sharedWorkspace().openURL(&url) { Ok(()) } else { Err("Cannot open the browser".into()) }
    })
}

// ── Screen lock, sleep and display changes ───────────────────────────────────────────────────
#[derive(Clone, Copy, Debug)]
pub enum SystemEvent { Locked, Suspending, DisplaysChanged }
type Handler = Arc<dyn Fn(SystemEvent) + Send + Sync>;

unsafe extern "C" fn displays_changed(_display: u32, flags: u32, info: *mut c_void) {
    if flags & sys::kCGDisplayBeginConfigurationFlag != 0 { return; } // the change is not done yet
    let handler = unsafe { &*(info as *const Handler) };
    handler(SystemEvent::DisplaysChanged);
}
/// Delivers screen lock (and switching to another user), sleep and display-change notifications for
/// the lifetime of the process. Call on the main thread, whose run loop delivers them.
pub fn watch_system(handler: impl Fn(SystemEvent) + Send + Sync + 'static) {
    let handler: Handler = Arc::new(handler);
    let observe = |center: &objc2_foundation::NSNotificationCenter, name: &NSNotificationName, event: SystemEvent| {
        let handler = handler.clone();
        let block = RcBlock::new(move |_: NonNull<NSNotification>| handler(event));
        // The observer lives as long as the process, like the window subclass on Windows.
        std::mem::forget(unsafe { center.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block) });
    };
    unsafe {
        observe(&NSDistributedNotificationCenter::defaultCenter(), ns_string!("com.apple.screenIsLocked"), SystemEvent::Locked);
        let workspace = NSWorkspace::sharedWorkspace().notificationCenter();
        observe(&workspace, NSWorkspaceSessionDidResignActiveNotification, SystemEvent::Locked);
        observe(&workspace, NSWorkspaceWillSleepNotification, SystemEvent::Suspending);
        sys::CGDisplayRegisterReconfigurationCallback(displays_changed, Box::into_raw(Box::new(handler)) as *mut c_void);
    }
}
