//! Keyboard and mouse injection with SendInput. Only normalized coordinates inside the shared display,
//! bounded wheel values and physical scan codes are accepted; every held key and button is released
//! and the local user's input unblocked when a session stops.
use std::{collections::HashSet, sync::Mutex};
use windows_sys::Win32::UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*};

use crate::{blocker::{Blocker, INJECTED_MARK}, platform::Rect, protocol::{InputEvent, MouseButton}};

// Physical Set-1 scan codes, independent of the keyboard layout (KeyboardEvent.code → scan code).
const CODES: &[(&str, u16)] = &[
    ("Escape", 1), ("Digit1", 2), ("Digit2", 3), ("Digit3", 4), ("Digit4", 5), ("Digit5", 6), ("Digit6", 7), ("Digit7", 8), ("Digit8", 9),
    ("Digit9", 10), ("Digit0", 11), ("Minus", 12), ("Equal", 13), ("Backspace", 14), ("Tab", 15), ("KeyQ", 16), ("KeyW", 17), ("KeyE", 18),
    ("KeyR", 19), ("KeyT", 20), ("KeyY", 21), ("KeyU", 22), ("KeyI", 23), ("KeyO", 24), ("KeyP", 25), ("BracketLeft", 26), ("BracketRight", 27),
    ("Enter", 28), ("ControlLeft", 29), ("KeyA", 30), ("KeyS", 31), ("KeyD", 32), ("KeyF", 33), ("KeyG", 34), ("KeyH", 35), ("KeyJ", 36),
    ("KeyK", 37), ("KeyL", 38), ("Semicolon", 39), ("Quote", 40), ("Backquote", 41), ("ShiftLeft", 42), ("Backslash", 43), ("KeyZ", 44),
    ("KeyX", 45), ("KeyC", 46), ("KeyV", 47), ("KeyB", 48), ("KeyN", 49), ("KeyM", 50), ("Comma", 51), ("Period", 52), ("Slash", 53),
    ("ShiftRight", 54), ("NumpadMultiply", 55), ("AltLeft", 56), ("Space", 57), ("CapsLock", 58), ("F1", 59), ("F2", 60), ("F3", 61),
    ("F4", 62), ("F5", 63), ("F6", 64), ("F7", 65), ("F8", 66), ("F9", 67), ("F10", 68), ("NumLock", 69), ("ScrollLock", 70), ("Numpad7", 71),
    ("Numpad8", 72), ("Numpad9", 73), ("NumpadSubtract", 74), ("Numpad4", 75), ("Numpad5", 76), ("Numpad6", 77), ("NumpadAdd", 78),
    ("Numpad1", 79), ("Numpad2", 80), ("Numpad3", 81), ("Numpad0", 82), ("NumpadDecimal", 83), ("IntlBackslash", 86), ("F11", 87), ("F12", 88),
];
const EXTENDED: &[(&str, u16)] = &[
    ("NumpadEnter", 28), ("ControlRight", 29), ("NumpadDivide", 53), ("AltRight", 56), ("Home", 71), ("ArrowUp", 72), ("PageUp", 73),
    ("ArrowLeft", 75), ("ArrowRight", 77), ("End", 79), ("ArrowDown", 80), ("PageDown", 81), ("Insert", 82), ("Delete", 83),
    ("MetaLeft", 91), ("MetaRight", 92), ("ContextMenu", 93),
];
pub fn scan_code(code: &str) -> Option<(u16, bool)> {
    let find = |table: &[(&str, u16)]| table.iter().find(|(name, _)| *name == code).map(|(_, scan)| *scan);
    find(EXTENDED).map(|s| (s, true)).or_else(|| find(CODES).map(|s| (s, false)))
}

struct State { keys: HashSet<(u16, bool)>, buttons: HashSet<MouseButton>, display: Option<Rect> }
pub struct Input { state: Mutex<State>, dry_run: bool, blocker: Mutex<Blocker>, blocked: Mutex<bool> }

impl Input {
    /// `dry_run` validates and tracks everything but never touches the real desktop (tests).
    pub fn new(dry_run: bool) -> Self {
        Self { state: Mutex::new(State { keys: HashSet::new(), buttons: HashSet::new(), display: None }), dry_run, blocker: Mutex::default(), blocked: Mutex::new(false) }
    }
    pub fn check(display: Rect) -> Result<(), String> {
        if display.width < 1 || display.height < 1 || display.width > 32768 || display.height > 32768 { return Err("Invalid display".into()); }
        Ok(())
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

    fn emit(&self, input: INPUT) {
        // Windows refuses injection into UAC prompts, the lock screen and elevated windows. That is
        // expected during a session and is not an error.
        if !self.dry_run { unsafe { SendInput(1, &input, std::mem::size_of::<INPUT>() as i32) }; }
    }
    // Everything injected is marked, so blocking the local user's input never blocks the controller.
    fn mouse(&self, flags: u32, dx: i32, dy: i32, data: i32) {
        self.emit(INPUT { r#type: INPUT_MOUSE, Anonymous: INPUT_0 { mi: MOUSEINPUT { dx, dy, mouseData: data as u32, dwFlags: flags, time: 0, dwExtraInfo: INJECTED_MARK } } });
    }
    fn key(&self, scan: u16, extended: bool, down: bool) {
        let flags = KEYEVENTF_SCANCODE | if extended { KEYEVENTF_EXTENDEDKEY } else { 0 } | if down { 0 } else { KEYEVENTF_KEYUP };
        self.emit(INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: 0, wScan: scan, dwFlags: flags, time: 0, dwExtraInfo: INJECTED_MARK } } });
    }
    fn button(&self, button: MouseButton, down: bool) {
        let flags = match (button, down) {
            (MouseButton::Left, true) => MOUSEEVENTF_LEFTDOWN, (MouseButton::Left, false) => MOUSEEVENTF_LEFTUP,
            (MouseButton::Right, true) => MOUSEEVENTF_RIGHTDOWN, (MouseButton::Right, false) => MOUSEEVENTF_RIGHTUP,
            (MouseButton::Middle, true) => MOUSEEVENTF_MIDDLEDOWN, (MouseButton::Middle, false) => MOUSEEVENTF_MIDDLEUP,
        };
        self.mouse(flags, 0, 0, 0);
    }
    fn move_to(&self, display: Rect, x: f64, y: f64) {
        let (vx, vy, vw, vh) = if self.dry_run { (0, 0, 1920, 1080) } else { unsafe {
            (GetSystemMetrics(SM_XVIRTUALSCREEN), GetSystemMetrics(SM_YVIRTUALSCREEN), GetSystemMetrics(SM_CXVIRTUALSCREEN), GetSystemMetrics(SM_CYVIRTUALSCREEN))
        } };
        if vw < 2 || vh < 2 { return; }
        let dx = (((display.x - vx) as f64 + x * (display.width - 1) as f64) * 65535.0 / (vw - 1) as f64).round().clamp(0.0, 65535.0) as i32;
        let dy = (((display.y - vy) as f64 + y * (display.height - 1) as f64) * 65535.0 / (vh - 1) as f64).round().clamp(0.0, 65535.0) as i32;
        self.mouse(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_VIRTUALDESK, dx, dy, 0);
    }
    pub fn release(&self) {
        let (keys, buttons) = { let mut s = self.state.lock().unwrap(); (s.keys.drain().collect::<Vec<_>>(), s.buttons.drain().collect::<Vec<_>>()) };
        for (scan, extended) in keys { self.key(scan, extended, false); }
        for button in buttons { self.button(button, false); }
    }
    /// Applies a validated event. Callers have already checked the session's permissions.
    pub fn send(&self, event: &InputEvent) -> Result<(), String> {
        event.validate()?;
        let display = self.display().ok_or("Input is not active")?;
        match event {
            InputEvent::Move { x, y } => self.move_to(display, *x, *y),
            InputEvent::Button { button, down, x, y } => {
                if let (Some(x), Some(y)) = (x, y) { self.move_to(display, *x, *y); }
                self.button(*button, *down);
                let mut s = self.state.lock().unwrap();
                if *down { s.buttons.insert(*button); } else { s.buttons.remove(button); }
            }
            InputEvent::Wheel { x, y } => {
                if *y != 0 { self.mouse(MOUSEEVENTF_WHEEL, 0, 0, *y); }
                if *x != 0 { self.mouse(MOUSEEVENTF_HWHEEL, 0, 0, *x); }
            }
            InputEvent::Key { code, down } => {
                let Some((scan, extended)) = scan_code(code) else { return Ok(()) };
                self.key(scan, extended, *down);
                let mut s = self.state.lock().unwrap();
                if *down { s.keys.insert((scan, extended)); } else { s.keys.remove(&(scan, extended)); }
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
    const SCREEN: Rect = Rect { x: 0, y: 0, width: 1920, height: 1080 };
    #[test]
    fn maps_physical_key_codes() {
        assert_eq!(scan_code("KeyA"), Some((30, false)));
        assert_eq!(scan_code("ControlRight"), Some((29, true)));
        assert_eq!(scan_code("Unknown"), None);
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
        input.send(&InputEvent::Key { code: "KeyA".into(), down: true }).unwrap();
        input.send(&InputEvent::Button { button: MouseButton::Left, down: true, x: Some(0.2), y: Some(0.3) }).unwrap();
        input.stop();
        let s = input.state.lock().unwrap();
        assert!(s.keys.is_empty() && s.buttons.is_empty() && s.display.is_none());
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
