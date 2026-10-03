//! Full-access control, the way AnyDesk/RustDesk do it. A normal per-user process (this app runs at
//! medium integrity) cannot inject input into elevated windows, UAC prompts or the lock screen, because
//! of Windows' UI privilege isolation and the separate "secure" desktop. So the actual injection is
//! done by a *helper* that runs as SYSTEM on the interactive session's input desktop; the helper
//! follows the input desktop, so it also reaches the secure desktop. A LocalSystem service (Phase B)
//! supervises that helper across logon, lock and UAC switches.
//!
//! The app forwards input to the helper over a named pipe. That pipe is the sensitive part: if any
//! local program could use it, ASDesk would be a UAC-bypass tool. Two things prevent that — the pipe's
//! DACL only lets interactive users open it, and the helper verifies every client is the installed
//! ASDesk binary (same image path, which lives in an admin-only directory) before accepting input.
use std::{fs::File, io::{Read, Write}, mem::ManuallyDrop, os::windows::io::FromRawHandle, ptr::null_mut,
    sync::{atomic::{AtomicIsize, Ordering::Relaxed}, Mutex}, time::Duration};

use serde::{Deserialize, Serialize};
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, LocalFree, ERROR_PIPE_CONNECTED, HANDLE, INVALID_HANDLE_VALUE},
    Security::{Authorization::ConvertStringSecurityDescriptorToSecurityDescriptorW, DuplicateTokenEx,
        SetTokenInformation, SecurityImpersonation, TokenPrimary, TokenSessionId, PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES},
    Storage::FileSystem::{CreateFileW, OPEN_EXISTING, PIPE_ACCESS_DUPLEX},
    System::{
        Pipes::{ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, GetNamedPipeClientProcessId,
            PIPE_READMODE_BYTE, PIPE_TYPE_BYTE, PIPE_WAIT},
        RemoteDesktop::WTSGetActiveConsoleSessionId,
        Services::{CloseServiceHandle, ControlService, CreateServiceW, DeleteService, OpenSCManagerW, OpenServiceW,
            RegisterServiceCtrlHandlerExW, SetServiceStatus, StartServiceCtrlDispatcherW, StartServiceW,
            SERVICE_ACCEPT_SESSIONCHANGE, SERVICE_ACCEPT_SHUTDOWN, SERVICE_ACCEPT_STOP, SERVICE_AUTO_START,
            SERVICE_CONTROL_SESSIONCHANGE, SERVICE_CONTROL_SHUTDOWN, SERVICE_CONTROL_STOP, SERVICE_ERROR_NORMAL,
            SERVICE_RUNNING, SERVICE_STATUS, SERVICE_STOPPED, SERVICE_STOP_PENDING, SERVICE_TABLE_ENTRYW,
            SERVICE_WIN32_OWN_PROCESS},
        StationsAndDesktops::{CloseDesktop, GetUserObjectInformationW, OpenInputDesktop, SetThreadDesktop, UOI_NAME},
        Threading::{CreateEventW, CreateProcessAsUserW, GetCurrentProcess, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
            SetEvent, TerminateProcess, WaitForMultipleObjects, WaitForSingleObject, PROCESS_INFORMATION,
            PROCESS_QUERY_LIMITED_INFORMATION, STARTUPINFOW},
    },
};

use crate::{input::Input, log, platform::Rect, protocol::InputEvent};

const PIPE_NAME: &str = r"\\.\pipe\ASDesk-elevation";
const SERVICE_NAME: &str = "ASDeskElevation";
const SERVICE_DISPLAY: &str = "ASDesk Elevation Service";
// Token and process-creation rights (stable Windows values; kept local to avoid a wider import surface).
const TOKEN_ASSIGN_PRIMARY: u32 = 0x0001;
const TOKEN_DUPLICATE: u32 = 0x0002;
const TOKEN_QUERY: u32 = 0x0008;
const TOKEN_ADJUST_DEFAULT: u32 = 0x0080;
const TOKEN_ADJUST_SESSIONID: u32 = 0x0100;
const TOKEN_ALL_ACCESS: u32 = 0x000f_01ff;
const CREATE_UNICODE_ENVIRONMENT: u32 = 0x0000_0400;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
const SC_MANAGER_ALL_ACCESS: u32 = 0x000f_003f;
const SERVICE_ALL_ACCESS: u32 = 0x000f_01ff;
const NO_SESSION: u32 = 0xFFFF_FFFF;
const GENERIC_READ: u32 = 0x8000_0000;
const GENERIC_WRITE: u32 = 0x4000_0000;
// Every DESKTOP_* right, so the helper thread can attach to (and inject on) the input desktop.
const DESKTOP_ALL: u32 = 0x01ff;
const SDDL_REVISION_1: u32 = 1;
const MAX_FRAME: usize = 1 << 20;

fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(std::iter::once(0)).collect() }

/// Messages the app sends the helper. Input is pre-validated by the app before it is forwarded.
#[derive(Serialize, Deserialize, Debug)]
enum Worker {
    Bind { x: i32, y: i32, width: i32, height: i32 },
    Input(InputEvent),
    Release,
    /// Block (or unblock) the keyboard and mouse of the person at this computer. Done here rather
    /// than in the app because only SYSTEM's hooks also cover elevated windows (blocker.rs).
    Block(bool),
    Stop,
}

fn read_frame(file: &mut File) -> Option<Worker> {
    let mut header = [0u8; 4];
    file.read_exact(&mut header).ok()?;
    let len = u32::from_le_bytes(header) as usize;
    if len == 0 || len > MAX_FRAME { return None; }
    let mut body = vec![0u8; len];
    file.read_exact(&mut body).ok()?;
    serde_json::from_slice(&body).ok()
}
fn write_frame(file: &mut File, message: &Worker) -> std::io::Result<()> {
    let bytes = serde_json::to_vec(message).unwrap_or_default();
    file.write_all(&(bytes.len() as u32).to_le_bytes())?;
    file.write_all(&bytes)?;
    file.flush()
}

// ── Helper (runs as SYSTEM on the interactive session; started with --elevated-helper) ──────────
/// Confirms the connected client is the same on-disk binary as this helper — the installed ASDesk in
/// an admin-only directory — so no other local process can drive input through the pipe.
unsafe fn client_is_trusted(pipe: HANDLE) -> bool {
    let Ok(expected) = std::env::current_exe() else { return false };
    let mut pid = 0u32;
    if unsafe { GetNamedPipeClientProcessId(pipe, &mut pid) } == 0 { return false; }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() { return false; }
    let mut buffer = vec![0u16; 32768];
    let mut len = buffer.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut len) };
    unsafe { CloseHandle(process) };
    if ok == 0 { return false; }
    let path = String::from_utf16_lossy(&buffer[..len as usize]);
    expected.as_os_str().to_string_lossy().eq_ignore_ascii_case(&path)
}

unsafe fn create_pipe() -> HANDLE {
    // Interactive users may open it (they need to, to talk to the helper); SYSTEM and Administrators
    // get full control. The per-client identity check above is what actually authorises input.
    let sddl = wide("D:(A;;GRGW;;;IU)(A;;FA;;;SY)(A;;FA;;;BA)");
    let mut descriptor: PSECURITY_DESCRIPTOR = null_mut();
    if unsafe { ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl.as_ptr(), SDDL_REVISION_1, &mut descriptor, null_mut()) } == 0 {
        return INVALID_HANDLE_VALUE;
    }
    let mut attributes = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: descriptor,
        bInheritHandle: 0,
    };
    let pipe = unsafe {
        CreateNamedPipeW(wide(PIPE_NAME).as_ptr(), PIPE_ACCESS_DUPLEX, PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
            1, 64 * 1024, 64 * 1024, 0, &attributes)
    };
    unsafe { LocalFree(descriptor as _) };
    let _ = &mut attributes;
    pipe
}

/// Keeps the calling thread attached to whichever desktop currently has user input, so injection
/// reaches the secure desktop (UAC prompt, lock screen) as it appears and disappears.
struct DesktopGuard { current: String, handle: isize }
impl DesktopGuard {
    fn new() -> Self { Self { current: String::new(), handle: 0 } }
    fn follow_input(&mut self) {
        unsafe {
            let desktop = OpenInputDesktop(0, 0, DESKTOP_ALL);
            if desktop.is_null() { return; }
            let mut name = [0u16; 256];
            let mut needed = 0u32;
            let named = GetUserObjectInformationW(desktop, UOI_NAME, name.as_mut_ptr() as _, std::mem::size_of_val(&name) as u32, &mut needed) != 0;
            let label = if named { String::from_utf16_lossy(&name).trim_end_matches('\0').to_string() } else { String::new() };
            if named && label == self.current { CloseDesktop(desktop); return; } // already on this desktop
            if SetThreadDesktop(desktop) != 0 {
                if self.handle != 0 { CloseDesktop(self.handle as *mut _); }
                self.handle = desktop as isize;
                self.current = label;
            } else {
                CloseDesktop(desktop);
            }
        }
    }
}
impl Drop for DesktopGuard { fn drop(&mut self) { if self.handle != 0 { unsafe { CloseDesktop(self.handle as *mut _) }; } } }

fn serve(pipe: HANDLE, dry_run: bool) {
    let input = Input::new(dry_run);
    let mut desktop = DesktopGuard::new();
    let mut file = ManuallyDrop::new(unsafe { File::from_raw_handle(pipe as _) }); // handle closed by the caller
    while let Some(message) = read_frame(&mut file) {
        match message {
            Worker::Bind { x, y, width, height } => { let _ = input.start(Rect { x, y, width, height }); }
            Worker::Input(event) => { desktop.follow_input(); let _ = input.send(&event); }
            Worker::Release => input.release(),
            Worker::Block(block) => { if let Err(error) = input.block_local(block) { log::write(format!("helper: {error}")); } }
            Worker::Stop => break,
        }
    }
    // Also when the app went away without a word (its end of the pipe closed): never leave the
    // person here blocked.
    input.stop();
}

/// Serves elevated input for the lifetime of the process (one client at a time).
pub fn run_helper() {
    let dry_run = cfg!(debug_assertions) && std::env::var("COMPANY_REMOTE_DRY_INPUT").as_deref() == Ok("1");
    log::write("elevated helper started");
    loop {
        let pipe = unsafe { create_pipe() };
        if pipe == INVALID_HANDLE_VALUE || pipe.is_null() { std::thread::sleep(Duration::from_millis(500)); continue; }
        let connected = unsafe { ConnectNamedPipe(pipe, null_mut()) } != 0 || unsafe { GetLastError() } == ERROR_PIPE_CONNECTED;
        if connected && unsafe { client_is_trusted(pipe) } { serve(pipe, dry_run); }
        unsafe { DisconnectNamedPipe(pipe); CloseHandle(pipe); }
    }
}

// ── Client (the app; forwards input to the helper instead of injecting locally) ─────────────────
/// A connection to the elevated helper. Absent when no service/helper is running, in which case the
/// caller injects locally (normal-desktop control only).
pub struct ElevatedInput { file: Mutex<File> }
impl ElevatedInput {
    /// Connects to the helper if one is listening; returns None immediately otherwise.
    pub fn connect() -> Option<Self> {
        let handle = unsafe {
            CreateFileW(wide(PIPE_NAME).as_ptr(), GENERIC_READ | GENERIC_WRITE, 0, null_mut(), OPEN_EXISTING, 0, null_mut())
        };
        if handle == INVALID_HANDLE_VALUE || handle.is_null() { return None; }
        Some(Self { file: Mutex::new(unsafe { File::from_raw_handle(handle as _) }) })
    }
    fn write(&self, message: &Worker) -> bool { write_frame(&mut self.file.lock().unwrap(), message).is_ok() }
    pub fn bind(&self, display: Rect) -> bool { self.write(&Worker::Bind { x: display.x, y: display.y, width: display.width, height: display.height }) }
    pub fn send(&self, event: &InputEvent) -> bool { self.write(&Worker::Input(event.clone())) }
    pub fn release(&self) { let _ = self.write(&Worker::Release); }
    pub fn block(&self, block: bool) -> bool { self.write(&Worker::Block(block)) }
}
impl Drop for ElevatedInput { fn drop(&mut self) { let _ = self.write(&Worker::Stop); } }

// ── LocalSystem service: supervises the helper in the interactive session ───────────────────────
// The control handler is a bare C callback, so it reaches the running state through these statics.
static STATUS_HANDLE: AtomicIsize = AtomicIsize::new(0);
static STOP_EVENT: AtomicIsize = AtomicIsize::new(0);
static RECHECK_EVENT: AtomicIsize = AtomicIsize::new(0);

fn set_status(state: u32, accepts: u32) {
    let handle = STATUS_HANDLE.load(Relaxed);
    if handle == 0 { return; }
    let mut status: SERVICE_STATUS = unsafe { std::mem::zeroed() };
    status.dwServiceType = SERVICE_WIN32_OWN_PROCESS;
    status.dwCurrentState = state;
    status.dwControlsAccepted = accepts;
    unsafe { SetServiceStatus(handle as _, &status) };
}

unsafe extern "system" fn handler(control: u32, _event: u32, _data: *mut std::ffi::c_void, _ctx: *mut std::ffi::c_void) -> u32 {
    match control {
        SERVICE_CONTROL_STOP | SERVICE_CONTROL_SHUTDOWN => {
            set_status(SERVICE_STOP_PENDING, 0);
            let stop = STOP_EVENT.load(Relaxed);
            if stop != 0 { unsafe { SetEvent(stop as _) }; }
        }
        SERVICE_CONTROL_SESSIONCHANGE => { let recheck = RECHECK_EVENT.load(Relaxed); if recheck != 0 { unsafe { SetEvent(recheck as _) }; } }
        _ => {}
    }
    0 // NO_ERROR
}

/// Launches the helper as SYSTEM in the given interactive session, on the default desktop; the helper
/// then follows the input desktop itself (so it also covers the secure desktop).
unsafe fn spawn_helper(session: u32) -> Option<HANDLE> {
    let exe = std::env::current_exe().ok()?;
    let mut token: HANDLE = null_mut();
    let access = TOKEN_DUPLICATE | TOKEN_QUERY | TOKEN_ASSIGN_PRIMARY | TOKEN_ADJUST_DEFAULT | TOKEN_ADJUST_SESSIONID;
    if unsafe { OpenProcessToken(GetCurrentProcess(), access, &mut token) } == 0 { return None; }
    let mut duplicate: HANDLE = null_mut();
    let duplicated = unsafe { DuplicateTokenEx(token, TOKEN_ALL_ACCESS, null_mut(), SecurityImpersonation, TokenPrimary, &mut duplicate) };
    unsafe { CloseHandle(token) };
    if duplicated == 0 { return None; }
    let mut session = session;
    unsafe { SetTokenInformation(duplicate, TokenSessionId, &mut session as *mut u32 as _, 4) };
    let mut command = wide(&format!("\"{}\" --elevated-helper", exe.display()));
    let desktop = wide(r"winsta0\default");
    let mut startup: STARTUPINFOW = unsafe { std::mem::zeroed() };
    startup.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    startup.lpDesktop = desktop.as_ptr() as *mut u16;
    let mut info: PROCESS_INFORMATION = unsafe { std::mem::zeroed() };
    let created = unsafe {
        CreateProcessAsUserW(duplicate, null_mut(), command.as_mut_ptr(), null_mut(), null_mut(), 0,
            CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT, null_mut(), null_mut(), &startup, &mut info)
    };
    unsafe { CloseHandle(duplicate) };
    if created == 0 { return None; }
    unsafe { CloseHandle(info.hThread) };
    Some(info.hProcess)
}

/// Keeps one helper alive in whichever session currently has the console, restarting it on session
/// change (fast user switching, RDP, logoff) or if it exits. Returns when the service is stopped.
fn supervise(stop: HANDLE, recheck: HANDLE) {
    let mut helper: HANDLE = null_mut();
    let mut helper_session = NO_SESSION;
    loop {
        let session = unsafe { WTSGetActiveConsoleSessionId() };
        let helper_dead = helper.is_null() || unsafe { WaitForSingleObject(helper, 0) } == 0; // WAIT_OBJECT_0
        let want = session != NO_SESSION && session != 0;
        if want && (helper_dead || session != helper_session) {
            if !helper.is_null() { unsafe { TerminateProcess(helper, 0); CloseHandle(helper) }; helper = null_mut(); }
            if let Some(started) = unsafe { spawn_helper(session) } { helper = started; helper_session = session; }
        } else if !want && !helper.is_null() {
            unsafe { TerminateProcess(helper, 0); CloseHandle(helper) };
            helper = null_mut(); helper_session = NO_SESSION;
        }
        let handles = [stop, recheck];
        let waited = unsafe { WaitForMultipleObjects(2, handles.as_ptr(), 0, 2000) };
        if waited == 0 { break; } // WAIT_OBJECT_0 == stop
    }
    if !helper.is_null() { unsafe { TerminateProcess(helper, 0); CloseHandle(helper) }; }
}

unsafe extern "system" fn service_main(_argc: u32, _argv: *mut windows_sys::core::PWSTR) {
    let name = wide(SERVICE_NAME);
    let status = unsafe { RegisterServiceCtrlHandlerExW(name.as_ptr(), Some(handler), null_mut()) };
    if status.is_null() { return; }
    STATUS_HANDLE.store(status as isize, Relaxed);
    let stop = unsafe { CreateEventW(null_mut(), 1, 0, null_mut()) };   // manual reset
    let recheck = unsafe { CreateEventW(null_mut(), 0, 0, null_mut()) }; // auto reset
    STOP_EVENT.store(stop as isize, Relaxed);
    RECHECK_EVENT.store(recheck as isize, Relaxed);
    set_status(SERVICE_RUNNING, SERVICE_ACCEPT_STOP | SERVICE_ACCEPT_SHUTDOWN | SERVICE_ACCEPT_SESSIONCHANGE);
    supervise(stop, recheck);
    set_status(SERVICE_STOPPED, 0);
}

/// Entry point for `--service`: hands the process to the service control manager.
pub fn run_service() {
    let name = wide(SERVICE_NAME);
    let table = [
        SERVICE_TABLE_ENTRYW { lpServiceName: name.as_ptr() as *mut u16, lpServiceProc: Some(service_main) },
        SERVICE_TABLE_ENTRYW { lpServiceName: null_mut(), lpServiceProc: None },
    ];
    unsafe { StartServiceCtrlDispatcherW(table.as_ptr()) };
}

/// Registers (or re-registers) the auto-start LocalSystem service and starts it. Run elevated.
pub fn install_service() -> bool {
    let Ok(exe) = std::env::current_exe() else { return false };
    let bin = wide(&format!("\"{}\" --service", exe.display()));
    unsafe {
        let manager = OpenSCManagerW(null_mut(), null_mut(), SC_MANAGER_ALL_ACCESS);
        if manager.is_null() { return false; }
        let existing = OpenServiceW(manager, wide(SERVICE_NAME).as_ptr(), SERVICE_ALL_ACCESS);
        if !existing.is_null() {
            let mut status: SERVICE_STATUS = std::mem::zeroed();
            ControlService(existing, SERVICE_CONTROL_STOP, &mut status);
            DeleteService(existing);
            CloseServiceHandle(existing);
        }
        let service = CreateServiceW(manager, wide(SERVICE_NAME).as_ptr(), wide(SERVICE_DISPLAY).as_ptr(), SERVICE_ALL_ACCESS,
            SERVICE_WIN32_OWN_PROCESS, SERVICE_AUTO_START, SERVICE_ERROR_NORMAL, bin.as_ptr(),
            null_mut(), null_mut(), null_mut(), null_mut(), null_mut());
        let ok = !service.is_null();
        if ok { StartServiceW(service, 0, null_mut()); CloseServiceHandle(service); }
        CloseServiceHandle(manager);
        ok
    }
}

/// Stops and removes the service. Run elevated. Missing service counts as success (idempotent).
pub fn uninstall_service() -> bool {
    unsafe {
        let manager = OpenSCManagerW(null_mut(), null_mut(), SC_MANAGER_ALL_ACCESS);
        if manager.is_null() { return false; }
        let service = OpenServiceW(manager, wide(SERVICE_NAME).as_ptr(), SERVICE_ALL_ACCESS);
        let ok = if service.is_null() { true } else {
            let mut status: SERVICE_STATUS = std::mem::zeroed();
            ControlService(service, SERVICE_CONTROL_STOP, &mut status);
            let deleted = DeleteService(service) != 0;
            CloseServiceHandle(service);
            deleted
        };
        CloseServiceHandle(manager);
        ok
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::MouseButton;
    #[test]
    fn frames_round_trip_through_a_pipe_pair() {
        // A byte pipe backed by a temp file is enough to exercise the length-prefixed framing.
        let path = std::env::temp_dir().join(format!("asdesk-frames-{}", std::process::id()));
        let mut writer = File::create(&path).unwrap();
        for message in [Worker::Bind { x: 0, y: 0, width: 1920, height: 1080 },
            Worker::Input(InputEvent::Button { button: MouseButton::Left, down: true, x: Some(0.5), y: Some(0.5) }),
            Worker::Release, Worker::Block(true), Worker::Stop] {
            write_frame(&mut writer, &message).unwrap();
        }
        drop(writer);
        let mut reader = File::open(&path).unwrap();
        assert!(matches!(read_frame(&mut reader), Some(Worker::Bind { width: 1920, .. })));
        assert!(matches!(read_frame(&mut reader), Some(Worker::Input(InputEvent::Button { down: true, .. }))));
        assert!(matches!(read_frame(&mut reader), Some(Worker::Release)));
        assert!(matches!(read_frame(&mut reader), Some(Worker::Block(true))));
        assert!(matches!(read_frame(&mut reader), Some(Worker::Stop)));
        assert!(read_frame(&mut reader).is_none());
        let _ = std::fs::remove_file(&path);
    }
}
