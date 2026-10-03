//! "Block user input" on macOS: the counterpart of blocker.rs. While a controller works, an event tap
//! where hardware events enter the window server swallows the keyboard, mouse and trackpad of the
//! person at this Mac; events this app posts carry INJECTED_MARK (input.rs) and pass, so the
//! controller keeps full control. Taps need the Accessibility permission that control already needs.
//!
//! The person here always has a way out: Control+Option+Shift+F12 lifts the block and reaches the
//! app's stop-sharing shortcut, and locking the Mac (Touch ID or the power button) ends the session.
//! The tap belongs to its thread's run loop, so it ends with the thread: a crash never leaves the Mac
//! locked.
use std::{cell::RefCell, ffi::c_void, sync::{atomic::{AtomicBool, AtomicPtr, Ordering::Relaxed}, mpsc, Arc}, thread::JoinHandle};

use crate::sys::{self, CGPoint};

/// kCGEventSourceUserData of every event this app posts; anything without it comes from the person here.
pub const INJECTED_MARK: i64 = 0x4153_4453; // "ASDS"
const F12: usize = 0x6F;
const STOP_FLAGS: u64 = sys::kCGEventFlagMaskControl | sys::kCGEventFlagMaskAlternate | sys::kCGEventFlagMaskShift;

/// Read by the tap callback (a plain function, so it reaches state through statics).
static BLOCKING: AtomicBool = AtomicBool::new(false);
/// The tap itself, so the callback can turn it back on when macOS disables it.
static TAP: AtomicPtr<c_void> = AtomicPtr::new(std::ptr::null_mut());

/// Tap-thread state: keys and buttons held when the block began (their release still passes, or they
/// would stay stuck down), and where the controller last put the cursor (it is kept there).
struct Keys { held_at_start: [bool; 128], buttons_at_start: [bool; 3], cursor: Option<CGPoint> }
thread_local! { static KEYS: RefCell<Keys> = const { RefCell::new(Keys { held_at_start: [false; 128], buttons_at_start: [false; 3], cursor: None }) }; }

/// The tap thread's run loop and stop flag.
struct Running { run_loop: usize, stop: Arc<AtomicBool>, thread: JoinHandle<()> }

/// Owns the tap thread while input is blocked. One per process.
#[derive(Default)]
pub struct Blocker { thread: Option<Running> }

impl Blocker {
    pub fn set(&mut self, block: bool) -> Result<(), String> {
        if block == self.thread.is_some() {
            // Blocking again after the stop shortcut lifted it: the tap is still installed.
            BLOCKING.store(block, Relaxed);
            return Ok(());
        }
        if !block {
            BLOCKING.store(false, Relaxed);
            if let Some(running) = self.thread.take() {
                running.stop.store(true, Relaxed);
                unsafe { sys::CFRunLoopStop(running.run_loop as sys::CFRunLoopRef) };
                let _ = running.thread.join();
            }
            return Ok(());
        }
        let (ready, started) = mpsc::channel();
        let stop = Arc::new(AtomicBool::new(false));
        let thread = std::thread::Builder::new().name("input-block".into()).spawn({ let stop = stop.clone(); move || run(ready, stop) })
            .map_err(|_| "Cannot block input on this Mac".to_string())?;
        match started.recv() {
            Ok(Ok(run_loop)) => { self.thread = Some(Running { run_loop, stop, thread }); Ok(()) }
            Ok(Err(error)) => { let _ = thread.join(); Err(error) }
            Err(_) => Err("Cannot block input on this Mac".into()),
        }
    }
}
impl Drop for Blocker { fn drop(&mut self) { let _ = self.set(false); } }

fn mask() -> u64 {
    let mut kinds = vec![sys::kCGEventLeftMouseDown, sys::kCGEventLeftMouseUp, sys::kCGEventRightMouseDown, sys::kCGEventRightMouseUp,
        sys::kCGEventMouseMoved, sys::kCGEventLeftMouseDragged, sys::kCGEventRightMouseDragged, sys::kCGEventKeyDown, sys::kCGEventKeyUp,
        sys::kCGEventFlagsChanged, sys::kCGEventScrollWheel, sys::kCGEventOtherMouseDown, sys::kCGEventOtherMouseUp, sys::kCGEventOtherMouseDragged];
    kinds.extend(sys::TRACKPAD_EVENTS);
    kinds.iter().fold(0, |mask, kind| mask | 1u64 << kind)
}

fn run(ready: mpsc::Sender<Result<usize, String>>, stop: Arc<AtomicBool>) {
    let state = sys::kCGEventSourceStateHIDSystemState;
    KEYS.with(|keys| {
        let mut keys = keys.borrow_mut();
        for key in 0..128u16 { keys.held_at_start[key as usize] = unsafe { sys::CGEventSourceKeyState(state, key) }; }
        for button in 0..3u32 { keys.buttons_at_start[button as usize] = unsafe { sys::CGEventSourceButtonState(state, button) }; }
        keys.cursor = None;
    });
    unsafe {
        let tap = sys::CGEventTapCreate(sys::kCGHIDEventTap, sys::kCGHeadInsertEventTap, sys::kCGEventTapOptionDefault, mask(), callback, std::ptr::null_mut());
        if tap.is_null() {
            let _ = ready.send(Err("Cannot block input: allow ASDesk in System Settings → Privacy & Security → Accessibility".into()));
            return;
        }
        let source = sys::CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
        let run_loop = sys::CFRunLoopGetCurrent();
        sys::CFRunLoopAddSource(run_loop, source, sys::kCFRunLoopDefaultMode);
        TAP.store(tap, Relaxed);
        sys::CGEventTapEnable(tap, true);
        BLOCKING.store(true, Relaxed);
        let _ = ready.send(Ok(run_loop as usize));
        // Woken by CFRunLoopStop; the timeout covers a stop that came before the loop first ran.
        while !stop.load(Relaxed) { sys::CFRunLoopRunInMode(sys::kCFRunLoopDefaultMode, 1.0, 0); }
        BLOCKING.store(false, Relaxed);
        sys::CGEventTapEnable(tap, false);
        TAP.store(std::ptr::null_mut(), Relaxed);
        sys::CFRunLoopRemoveSource(run_loop, source, sys::kCFRunLoopDefaultMode);
        sys::CFMachPortInvalidate(tap);
        sys::CFRelease(source);
        sys::CFRelease(tap);
    }
}

unsafe extern "C" fn callback(_proxy: sys::CGEventTapProxy, kind: u32, event: sys::CGEventRef, _info: *mut c_void) -> sys::CGEventRef {
    // macOS turns a tap off when a callback is slow, or for secure input: turn it straight back on.
    if kind == sys::kCGEventTapDisabledByTimeout || kind == sys::kCGEventTapDisabledByUserInput {
        let tap = TAP.load(Relaxed);
        if !tap.is_null() { unsafe { sys::CGEventTapEnable(tap, true) }; }
        return event;
    }
    if unsafe { sys::CGEventGetIntegerValueField(event, sys::kCGEventSourceUserData) } == INJECTED_MARK {
        if matches!(kind, sys::kCGEventMouseMoved | sys::kCGEventLeftMouseDragged | sys::kCGEventRightMouseDragged | sys::kCGEventOtherMouseDragged) {
            let at = unsafe { sys::CGEventGetLocation(event) };
            KEYS.with(|keys| keys.borrow_mut().cursor = Some(at));
        }
        return event;
    }
    if !BLOCKING.load(Relaxed) { return event; }
    let pass = KEYS.with(|keys| {
        let mut keys = keys.borrow_mut();
        let key = unsafe { sys::CGEventGetIntegerValueField(event, sys::kCGKeyboardEventKeycode) } as usize & 0x7f;
        match kind {
            sys::kCGEventKeyDown => {
                let flags = unsafe { sys::CGEventGetFlags(event) };
                if key == F12 && flags & STOP_FLAGS == STOP_FLAGS {
                    // Lift the block and let this key through: with the modifiers it carries, it is the
                    // app's stop-sharing shortcut.
                    BLOCKING.store(false, Relaxed);
                    return true;
                }
                false
            }
            sys::kCGEventKeyUp => std::mem::take(&mut keys.held_at_start[key]),
            // A modifier held when the block began passes once, on its release.
            sys::kCGEventFlagsChanged => std::mem::take(&mut keys.held_at_start[key]),
            sys::kCGEventLeftMouseUp => std::mem::take(&mut keys.buttons_at_start[0]),
            sys::kCGEventRightMouseUp => std::mem::take(&mut keys.buttons_at_start[1]),
            sys::kCGEventOtherMouseUp => std::mem::take(&mut keys.buttons_at_start[2]),
            sys::kCGEventMouseMoved | sys::kCGEventLeftMouseDragged | sys::kCGEventRightMouseDragged | sys::kCGEventOtherMouseDragged => {
                // Swallowed, and the pointer goes back to where the controller left it.
                if let Some(at) = keys.cursor { unsafe { sys::CGWarpMouseCursorPosition(at) }; }
                false
            }
            _ => false,
        }
    });
    if pass { event } else { std::ptr::null_mut() }
}
