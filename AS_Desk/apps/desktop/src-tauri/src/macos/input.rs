//! Keyboard and mouse injection with Quartz events: the macOS side of input.rs, under the same rules.
//! Only normalized coordinates inside the shared display, bounded wheel values and physical key codes
//! are accepted; every held key and button is released and the local user's input unblocked when a
//! session stops. macOS delivers posted events only once the person here has allowed ASDesk under
//! Privacy & Security → Accessibility, so inject.rs asks (`permitted`) before any control is accepted.
use std::{collections::HashSet, sync::Mutex, time::{Duration, Instant}};

use crate::{blocker::{Blocker, INJECTED_MARK}, platform::Rect, protocol::{InputEvent, MouseButton}, sys::{self, CGPoint, Owned}};

// macOS virtual key codes (Carbon's kVK_*), which are physical positions like KeyboardEvent.code:
// the layout is applied by the receiving Mac, as for a real keyboard.
const CODES: &[(&str, u16)] = &[
    ("KeyA", 0x00), ("KeyS", 0x01), ("KeyD", 0x02), ("KeyF", 0x03), ("KeyH", 0x04), ("KeyG", 0x05), ("KeyZ", 0x06), ("KeyX", 0x07),
    ("KeyC", 0x08), ("KeyV", 0x09), ("IntlBackslash", 0x0A), ("KeyB", 0x0B), ("KeyQ", 0x0C), ("KeyW", 0x0D), ("KeyE", 0x0E), ("KeyR", 0x0F),
    ("KeyY", 0x10), ("KeyT", 0x11), ("Digit1", 0x12), ("Digit2", 0x13), ("Digit3", 0x14), ("Digit4", 0x15), ("Digit6", 0x16), ("Digit5", 0x17),
    ("Equal", 0x18), ("Digit9", 0x19), ("Digit7", 0x1A), ("Minus", 0x1B), ("Digit8", 0x1C), ("Digit0", 0x1D), ("BracketRight", 0x1E),
    ("KeyO", 0x1F), ("KeyU", 0x20), ("BracketLeft", 0x21), ("KeyI", 0x22), ("KeyP", 0x23), ("Enter", 0x24), ("KeyL", 0x25), ("KeyJ", 0x26),
    ("Quote", 0x27), ("KeyK", 0x28), ("Semicolon", 0x29), ("Backslash", 0x2A), ("Comma", 0x2B), ("Slash", 0x2C), ("KeyN", 0x2D),
    ("KeyM", 0x2E), ("Period", 0x2F), ("Tab", 0x30), ("Space", 0x31), ("Backquote", 0x32), ("Backspace", 0x33), ("Escape", 0x35),
    ("MetaRight", 0x36), ("MetaLeft", 0x37), ("ShiftLeft", 0x38), ("CapsLock", 0x39), ("AltLeft", 0x3A), ("ControlLeft", 0x3B),
    ("ShiftRight", 0x3C), ("AltRight", 0x3D), ("ControlRight", 0x3E), ("F17", 0x40), ("NumpadDecimal", 0x41), ("NumpadMultiply", 0x43),
    ("NumpadAdd", 0x45), ("NumLock", 0x47), ("NumpadDivide", 0x4B), ("NumpadEnter", 0x4C), ("NumpadSubtract", 0x4E), ("F18", 0x4F),
    ("F19", 0x50), ("NumpadEqual", 0x51), ("Numpad0", 0x52), ("Numpad1", 0x53), ("Numpad2", 0x54), ("Numpad3", 0x55), ("Numpad4", 0x56),
    ("Numpad5", 0x57), ("Numpad6", 0x58), ("Numpad7", 0x59), ("F20", 0x5A), ("Numpad8", 0x5B), ("Numpad9", 0x5C), ("IntlYen", 0x5D),
    ("IntlRo", 0x5E), ("NumpadComma", 0x5F), ("F5", 0x60), ("F6", 0x61), ("F7", 0x62), ("F3", 0x63), ("F8", 0x64), ("F9", 0x65),
    ("Lang2", 0x66), ("F11", 0x67), ("Lang1", 0x68), ("F13", 0x69), ("F16", 0x6A), ("F14", 0x6B), ("F10", 0x6D), ("ContextMenu", 0x6E),
    ("F12", 0x6F), ("F15", 0x71), ("Insert", 0x72), ("Home", 0x73), ("PageUp", 0x74), ("Delete", 0x75), ("F4", 0x76), ("End", 0x77),
    ("F2", 0x78), ("PageDown", 0x79), ("F1", 0x7A), ("ArrowLeft", 0x7B), ("ArrowRight", 0x7C), ("ArrowDown", 0x7D), ("ArrowUp", 0x7E),
];
pub fn key_code(code: &str) -> Option<u16> { CODES.iter().find(|(name, _)| *name == code).map(|(_, key)| *key) }

/// The modifier flag a modifier key sets while it is held; Caps Lock toggles its flag instead.
fn modifier(key: u16) -> Option<u64> {
    Some(match key {
        0x38 | 0x3C => sys::kCGEventFlagMaskShift,
        0x3B | 0x3E => sys::kCGEventFlagMaskControl,
        0x3A | 0x3D => sys::kCGEventFlagMaskAlternate,
        0x36 | 0x37 => sys::kCGEventFlagMaskCommand,
        0x39 => sys::kCGEventFlagMaskAlphaShift,
        _ => return None,
    })
}

/// What a double click needs: macOS apps count clicks from the event, not from timing.
const DOUBLE_CLICK: Duration = Duration::from_millis(500);
struct Click { button: MouseButton, at: Instant, position: CGPoint, count: i64 }

struct State { keys: HashSet<u16>, buttons: HashSet<MouseButton>, display: Option<Rect>, caps_lock: bool, last_click: Option<Click> }
pub struct Input { state: Mutex<State>, dry_run: bool, source: Option<Owned>, blocker: Mutex<Blocker>, blocked: Mutex<bool> }

impl Input {
    /// `dry_run` validates and tracks everything but never touches the real desktop (tests).
    pub fn new(dry_run: bool) -> Self {
        // Events from a source of their own, which is told never to hold back the local user's
        // mouse after an injected event (the default suppresses it for a quarter of a second).
        let source = if dry_run { None } else { Owned::new(unsafe { sys::CGEventSourceCreate(sys::kCGEventSourceStateHIDSystemState) }) };
        if let Some(source) = &source { unsafe { sys::CGEventSourceSetLocalEventsSuppressionInterval(source.0, 0.0) }; }
        Self { state: Mutex::new(State { keys: HashSet::new(), buttons: HashSet::new(), display: None, caps_lock: false, last_click: None }),
            dry_run, source, blocker: Mutex::default(), blocked: Mutex::new(false) }
    }
    pub fn check(display: Rect) -> Result<(), String> {
        if display.width < 1 || display.height < 1 || display.width > 32768 || display.height > 32768 { return Err("Invalid display".into()); }
        Ok(())
    }
    /// Whether the person here allowed control (Accessibility). If not, macOS shows its prompt, which
    /// leads to the setting, and the error says what to do.
    pub fn permitted() -> Result<(), String> {
        if sys::accessibility_trusted(false) || sys::accessibility_trusted(true) { return Ok(()); }
        Err("To be controlled, allow ASDesk in System Settings → Privacy & Security → Accessibility, then accept again. To share the view only, untick Control mouse and Use keyboard.".into())
    }
    pub fn start(&self, display: Rect) -> Result<(), String> {
        Self::check(display)?;
        let _ = self.block_local(false);
        self.release();
        self.state.lock().unwrap().display = Some(display);
        Ok(())
    }
    pub fn stop(&self) { let _ = self.block_local(false); self.release(); self.state.lock().unwrap().display = None; }
    /// Blocks or unblocks the keyboard and mouse of the person at this computer (blocker.rs); what
    /// this struct injects still goes through.
    pub fn block_local(&self, block: bool) -> Result<(), String> {
        let mut blocked = self.blocked.lock().unwrap();
        if *blocked == block { return Ok(()); }
        if !self.dry_run { self.blocker.lock().unwrap().set(block)?; }
        *blocked = block;
        Ok(())
    }
    #[cfg(test)]
    pub fn blocked(&self) -> bool { *self.blocked.lock().unwrap() }
    pub fn active(&self) -> bool { self.state.lock().unwrap().display.is_some() }
    pub fn display(&self) -> Option<Rect> { self.state.lock().unwrap().display }

    /// Posts an event made by `make` from this app's source. Everything injected is marked, so
    /// blocking the local user's input never blocks the controller.
    fn post(&self, make: impl FnOnce(sys::CGEventSourceRef) -> sys::CGEventRef, adjust: impl FnOnce(sys::CGEventRef)) {
        let Some(source) = &self.source else { return };
        let Some(event) = Owned::new(make(source.0)) else { return };
        unsafe { sys::CGEventSetIntegerValueField(event.0, sys::kCGEventSourceUserData, INJECTED_MARK) };
        adjust(event.0);
        unsafe { sys::CGEventPost(sys::kCGHIDEventTap, event.0) };
    }
    /// The modifiers held now, for every event: macOS reads them from the event, not from key state.
    fn flags(state: &State) -> u64 {
        state.keys.iter().filter_map(|&key| modifier(key).filter(|_| key != 0x39)).fold(if state.caps_lock { sys::kCGEventFlagMaskAlphaShift } else { 0 }, |a, f| a | f)
    }
    fn key(&self, key: u16, down: bool, flags: u64) {
        let is_modifier = modifier(key).is_some();
        self.post(|source| unsafe { sys::CGEventCreateKeyboardEvent(source, key, down) }, |event| unsafe {
            if is_modifier { sys::CGEventSetType(event, sys::kCGEventFlagsChanged); }
            sys::CGEventSetFlags(event, flags);
        });
    }
    /// Where the pointer is now (the tests' dry run never asks the real desktop).
    fn cursor(&self) -> CGPoint {
        if self.dry_run { return CGPoint::default(); }
        Owned::new(unsafe { sys::CGEventCreate(std::ptr::null_mut()) }).map_or_else(CGPoint::default, |event| unsafe { sys::CGEventGetLocation(event.0) })
    }
    fn button(&self, button: MouseButton, down: bool, position: CGPoint) {
        let (kind, number) = match (button, down) {
            (MouseButton::Left, true) => (sys::kCGEventLeftMouseDown, sys::kCGMouseButtonLeft), (MouseButton::Left, false) => (sys::kCGEventLeftMouseUp, sys::kCGMouseButtonLeft),
            (MouseButton::Right, true) => (sys::kCGEventRightMouseDown, sys::kCGMouseButtonRight), (MouseButton::Right, false) => (sys::kCGEventRightMouseUp, sys::kCGMouseButtonRight),
            (MouseButton::Middle, true) => (sys::kCGEventOtherMouseDown, sys::kCGMouseButtonCenter), (MouseButton::Middle, false) => (sys::kCGEventOtherMouseUp, sys::kCGMouseButtonCenter),
        };
        let (count, flags) = {
            let mut s = self.state.lock().unwrap();
            let count = match &s.last_click {
                // A release belongs to the press before it; a press soon after one nearby counts on.
                Some(last) if last.button == button && !down => last.count,
                Some(last) if last.button == button && last.at.elapsed() < DOUBLE_CLICK
                    && (last.position.x - position.x).abs() < 5.0 && (last.position.y - position.y).abs() < 5.0 => last.count + 1,
                _ => 1,
            };
            if down { s.last_click = Some(Click { button, at: Instant::now(), position, count }); }
            (count, Self::flags(&s))
        };
        self.post(|source| unsafe { sys::CGEventCreateMouseEvent(source, kind, position, number) }, |event| unsafe {
            sys::CGEventSetIntegerValueField(event, sys::kCGMouseEventClickState, count);
            sys::CGEventSetIntegerValueField(event, sys::kCGMouseEventButtonNumber, number as i64);
            sys::CGEventSetFlags(event, flags);
        });
    }
    fn point(display: Rect, x: f64, y: f64) -> CGPoint {
        CGPoint { x: display.x as f64 + x * (display.width - 1).max(0) as f64, y: display.y as f64 + y * (display.height - 1).max(0) as f64 }
    }
    fn move_to(&self, position: CGPoint) {
        let (kind, number, flags) = {
            let s = self.state.lock().unwrap();
            // With a button held, a move is a drag: that is what selects text and moves windows.
            let (kind, number) = if s.buttons.contains(&MouseButton::Left) { (sys::kCGEventLeftMouseDragged, sys::kCGMouseButtonLeft) }
                else if s.buttons.contains(&MouseButton::Right) { (sys::kCGEventRightMouseDragged, sys::kCGMouseButtonRight) }
                else if s.buttons.contains(&MouseButton::Middle) { (sys::kCGEventOtherMouseDragged, sys::kCGMouseButtonCenter) }
                else { (sys::kCGEventMouseMoved, sys::kCGMouseButtonLeft) };
            (kind, number, Self::flags(&s))
        };
        self.post(|source| unsafe { sys::CGEventCreateMouseEvent(source, kind, position, number) }, |event| unsafe { sys::CGEventSetFlags(event, flags) });
    }
    pub fn release(&self) {
        let (keys, buttons) = { let mut s = self.state.lock().unwrap(); (s.keys.drain().collect::<Vec<_>>(), s.buttons.drain().collect::<Vec<_>>()) };
        let caps_lock = if self.state.lock().unwrap().caps_lock { sys::kCGEventFlagMaskAlphaShift } else { 0 };
        for key in keys { self.key(key, false, caps_lock); }
        if !buttons.is_empty() {
            let position = self.cursor();
            for button in buttons { self.button(button, false, position); }
        }
    }
    /// Applies a validated event. Callers have already checked the session's permissions.
    pub fn send(&self, event: &InputEvent) -> Result<(), String> {
        event.validate()?;
        let display = self.display().ok_or("Input is not active")?;
        match event {
            InputEvent::Move { x, y } => self.move_to(Self::point(display, *x, *y)),
            InputEvent::Button { button, down, x, y } => {
                let position = match (x, y) {
                    (Some(x), Some(y)) => { let position = Self::point(display, *x, *y); self.move_to(position); position }
                    _ => self.cursor(),
                };
                {
                    let mut s = self.state.lock().unwrap();
                    if *down { s.buttons.insert(*button); } else { s.buttons.remove(button); }
                }
                self.button(*button, *down, position);
            }
            InputEvent::Wheel { x, y } => {
                // Pixel deltas, positive up and left (Quartz) from positive up and right (the page).
                let flags = Self::flags(&self.state.lock().unwrap());
                self.post(|source| unsafe { sys::CGEventCreateScrollWheelEvent2(source, sys::kCGScrollEventUnitPixel, 2, *y, -*x, 0) },
                    |event| unsafe { sys::CGEventSetFlags(event, flags) });
            }
            InputEvent::Key { code, down } => {
                let Some(key) = key_code(code) else { return Ok(()) };
                let flags = {
                    let mut s = self.state.lock().unwrap();
                    if key == 0x39 && *down && !s.keys.contains(&key) { s.caps_lock = !s.caps_lock; }
                    if *down { s.keys.insert(key); } else { s.keys.remove(&key); }
                    Self::flags(&s)
                };
                self.key(key, *down, flags);
            }
            InputEvent::Release => self.release(),
            InputEvent::Clipboard { .. } => {}
        }
        Ok(())
    }
}
impl Drop for Input { fn drop(&mut self) { let _ = self.block_local(false); self.release(); } }

#[cfg(test)]
mod tests {
    use super::*;
    const SCREEN: Rect = Rect { x: 0, y: 0, width: 1440, height: 900 };
    #[test]
    fn maps_physical_key_codes() {
        assert_eq!(key_code("KeyA"), Some(0x00));
        assert_eq!(key_code("MetaLeft"), Some(0x37));
        assert_eq!(key_code("Unknown"), None);
        assert_eq!(modifier(0x3E), Some(sys::kCGEventFlagMaskControl));
    }
    #[test]
    fn rejects_input_outside_bounds_or_before_start() {
        let input = Input::new(true);
        assert!(input.send(&InputEvent::Move { x: 0.5, y: 0.5 }).is_err());
        input.start(SCREEN).unwrap();
        assert!(input.send(&InputEvent::Move { x: 1.1, y: 0.5 }).is_err());
        assert!(input.send(&InputEvent::Wheel { x: 0, y: 5000 }).is_err());
        assert!(input.start(Rect { x: 0, y: 0, width: 0, height: 10 }).is_err());
    }
    #[test]
    fn releases_all_held_inputs() {
        let input = Input::new(true); input.start(SCREEN).unwrap();
        input.send(&InputEvent::Key { code: "ShiftLeft".into(), down: true }).unwrap();
        input.send(&InputEvent::Button { button: MouseButton::Left, down: true, x: Some(0.2), y: Some(0.3) }).unwrap();
        assert_eq!(Input::flags(&input.state.lock().unwrap()), sys::kCGEventFlagMaskShift);
        input.stop();
        let s = input.state.lock().unwrap();
        assert!(s.keys.is_empty() && s.buttons.is_empty() && s.display.is_none());
    }
    #[test]
    fn counts_clicks_for_double_click() {
        let input = Input::new(true); input.start(SCREEN).unwrap();
        let click = |down| InputEvent::Button { button: MouseButton::Left, down, x: Some(0.5), y: Some(0.5) };
        for down in [true, false, true] { input.send(&click(down)).unwrap(); }
        assert_eq!(input.state.lock().unwrap().last_click.as_ref().map(|c| c.count), Some(2));
    }
    #[test]
    fn a_session_never_outlives_its_block() {
        let input = Input::new(true); input.start(SCREEN).unwrap();
        input.block_local(true).unwrap();
        assert!(input.blocked());
        input.stop();
        assert!(!input.blocked(), "stopping the session unblocks the local user");
        input.block_local(true).unwrap();
        input.start(SCREEN).unwrap();
        assert!(!input.blocked(), "a new session starts unblocked");
    }
}
