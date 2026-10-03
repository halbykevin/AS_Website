//! "Block user input", as in AnyDesk: while a controller works, the keyboard and mouse of the person
//! at this computer do nothing. Low-level hooks on a dedicated thread swallow physical input; input
//! this app injects carries INJECTED_MARK in dwExtraInfo (input.rs) and passes, so the controller keeps
//! full control.
//!
//! Hooks rather than BlockInput: BlockInput needs an elevated caller, lets through only SendInput from
//! the very thread that blocked, and Ctrl+Alt+Del lifts it without telling anyone. Hooks work at any
//! integrity level — in the SYSTEM helper (elevation.rs) they also cover elevated windows; in-process
//! they cannot reach windows above the app's own integrity — and they go away with their thread, so
//! a crash can never leave this computer locked.
//!
//! The person here always has a way out: Ctrl+Alt+Del is never hookable (locking the computer ends
//! the session), and Ctrl+Alt+Shift+F12 lifts the block and fires the app's stop-sharing shortcut.
use std::{cell::RefCell, ptr::null_mut, sync::{atomic::{AtomicBool, Ordering::Relaxed}, mpsc}, thread::JoinHandle};
use windows_sys::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    System::{LibraryLoader::GetModuleHandleW, Threading::{GetCurrentThread, GetCurrentThreadId, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL}},
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};

/// dwExtraInfo of every event this app injects; anything without it comes from the person here.
pub const INJECTED_MARK: usize = 0x4153_4453; // "ASDS"
/// Posted to the hook thread by its own hook when the person here presses the stop shortcut.
const WM_ESCAPE: u32 = WM_APP + 1;

/// Read by the hook procedures (plain callbacks, so they reach state through statics).
static BLOCKING: AtomicBool = AtomicBool::new(false);

/// Hook-thread state: keys and buttons held when the block began (their release still passes, or
/// they would stay stuck down) and the physical keys held now (to spot the stop shortcut).
struct Keys { held_at_start: [bool; 256], held: [bool; 256] }
thread_local! { static KEYS: RefCell<Keys> = const { RefCell::new(Keys { held_at_start: [false; 256], held: [false; 256] }) }; }

/// Owns the hook thread while input is blocked. One per process.
#[derive(Default)]
pub struct Blocker { thread: Option<(u32, JoinHandle<()>)> }

impl Blocker {
    pub fn set(&mut self, block: bool) -> Result<(), String> {
        if block == self.thread.is_some() {
            // Blocking again after the stop shortcut lifted it: the hooks are still installed.
            BLOCKING.store(block, Relaxed);
            return Ok(());
        }
        if !block {
            BLOCKING.store(false, Relaxed);
            if let Some((id, thread)) = self.thread.take() {
                unsafe { PostThreadMessageW(id, WM_QUIT, 0, 0) };
                let _ = thread.join();
            }
            return Ok(());
        }
        let (ready, started) = mpsc::channel();
        let thread = std::thread::Builder::new().name("input-block".into()).spawn(move || run(ready))
            .map_err(|_| "Cannot block input on this computer".to_string())?;
        match started.recv() {
            Ok(Ok(id)) => { self.thread = Some((id, thread)); Ok(()) }
            Ok(Err(error)) => { let _ = thread.join(); Err(error) }
            Err(_) => Err("Cannot block input on this computer".into()),
        }
    }
}
impl Drop for Blocker { fn drop(&mut self) { let _ = self.set(false); } }

fn run(ready: mpsc::Sender<Result<u32, String>>) {
    unsafe {
        // Create this thread's message queue before anyone can post to it.
        let mut message: MSG = std::mem::zeroed();
        PeekMessageW(&mut message, null_mut(), WM_USER, WM_USER, PM_NOREMOVE);
        // Every key press and mouse move on the desktop waits for these hooks: never let them queue.
        SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
        KEYS.with(|keys| {
            let mut keys = keys.borrow_mut();
            keys.held = [false; 256];
            for vk in 1..255 { keys.held_at_start[vk] = GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0; }
        });
        let module = GetModuleHandleW(std::ptr::null());
        let keyboard = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), module, 0);
        let mouse = SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), module, 0);
        if keyboard.is_null() || mouse.is_null() {
            if !keyboard.is_null() { UnhookWindowsHookEx(keyboard); }
            if !mouse.is_null() { UnhookWindowsHookEx(mouse); }
            let _ = ready.send(Err("Cannot block input on this computer".into()));
            return;
        }
        BLOCKING.store(true, Relaxed);
        let _ = ready.send(Ok(GetCurrentThreadId()));
        while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
            if message.message == WM_ESCAPE { replay_stop_shortcut(); }
        }
        BLOCKING.store(false, Relaxed);
        UnhookWindowsHookEx(keyboard);
        UnhookWindowsHookEx(mouse);
    }
}

unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let info = unsafe { &*(lparam as *const KBDLLHOOKSTRUCT) };
        if info.dwExtraInfo != INJECTED_MARK && BLOCKING.load(Relaxed) && swallow_key(info.vkCode as usize & 0xff, info.flags & LLKHF_UP != 0) { return 1; }
    }
    unsafe { CallNextHookEx(null_mut(), code, wparam, lparam) }
}

unsafe extern "system" fn mouse_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let info = unsafe { &*(lparam as *const MSLLHOOKSTRUCT) };
        if info.dwExtraInfo != INJECTED_MARK && BLOCKING.load(Relaxed) && swallow_mouse(wparam as u32, info.mouseData) { return 1; }
    }
    unsafe { CallNextHookEx(null_mut(), code, wparam, lparam) }
}

fn swallow_key(vk: usize, up: bool) -> bool {
    KEYS.with(|keys| {
        let mut keys = keys.borrow_mut();
        keys.held[vk] = !up;
        if up { return !std::mem::take(&mut keys.held_at_start[vk]); }
        let held = |codes: [VIRTUAL_KEY; 2]| codes.iter().any(|&code| keys.held[code as usize]);
        if vk == VK_F12 as usize && held([VK_LCONTROL, VK_RCONTROL]) && held([VK_LMENU, VK_RMENU]) && held([VK_LSHIFT, VK_RSHIFT]) {
            BLOCKING.store(false, Relaxed);
            unsafe { PostThreadMessageW(GetCurrentThreadId(), WM_ESCAPE, 0, 0) };
        }
        true
    })
}

fn swallow_mouse(message: u32, data: u32) -> bool {
    let released = match message {
        WM_LBUTTONUP => VK_LBUTTON, WM_RBUTTONUP => VK_RBUTTON, WM_MBUTTONUP => VK_MBUTTON,
        WM_XBUTTONUP => if (data >> 16) as u16 == 1 { VK_XBUTTON1 } else { VK_XBUTTON2 },
        _ => return true,
    };
    KEYS.with(|keys| !std::mem::take(&mut keys.borrow_mut().held_at_start[released as usize]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{thread::sleep, time::Duration};

    fn press(vk: VIRTUAL_KEY, up: bool, mark: usize) {
        let input = INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: mark } } };
        unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) };
        sleep(Duration::from_millis(60));
    }
    fn down(vk: VIRTUAL_KEY) -> bool { unsafe { GetAsyncKeyState(vk as i32) as u16 & 0x8000 != 0 } }

    /// Drives the real input stack (F13, which nothing uses): `cargo test -- --ignored blocker`.
    #[test]
    #[ignore = "injects keystrokes into this desktop"]
    fn blocks_the_person_here_but_never_the_controller() {
        let mut blocker = Blocker::default();
        blocker.set(true).unwrap();
        press(VK_F13, false, 0);
        assert!(!down(VK_F13), "unmarked input is swallowed while blocked");
        press(VK_F13, false, INJECTED_MARK);
        assert!(down(VK_F13), "the controller's marked input passes");
        press(VK_F13, true, INJECTED_MARK);
        blocker.set(false).unwrap();
        press(VK_F13, false, 0);
        assert!(down(VK_F13), "input flows again once unblocked");
        press(VK_F13, true, 0);
    }
}

/// The block is already lifted; press the stop-sharing shortcut on the person's behalf, since the keys
/// they pressed were swallowed before the shortcut was complete.
fn replay_stop_shortcut() {
    let key = |vk: VIRTUAL_KEY, up: bool| INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT {
        wVk: vk, wScan: unsafe { MapVirtualKeyW(vk as u32, MAPVK_VK_TO_VSC) } as u16, dwFlags: if up { KEYEVENTF_KEYUP } else { 0 }, time: 0, dwExtraInfo: INJECTED_MARK } } };
    let keys = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_F12];
    let inputs: Vec<INPUT> = keys.iter().map(|&vk| key(vk, false)).chain(keys.iter().rev().map(|&vk| key(vk, true))).collect();
    unsafe { SendInput(inputs.len() as u32, inputs.as_ptr(), std::mem::size_of::<INPUT>() as i32) };
}
