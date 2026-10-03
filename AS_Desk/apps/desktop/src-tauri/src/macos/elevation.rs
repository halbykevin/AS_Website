//! Full access through a SYSTEM helper (elevation.rs) exists only on Windows, where an ordinary
//! process cannot reach elevated windows, UAC prompts or the lock screen. On macOS the app's own
//! events reach everything the Accessibility permission covers, so there is never a helper: this type
//! has no values, and inject.rs always injects in-process.
use crate::{platform::Rect, protocol::InputEvent};

pub enum ElevatedInput {}
impl ElevatedInput {
    pub fn connect() -> Option<Self> { None }
    pub fn bind(&self, _display: Rect) -> bool { match *self {} }
    pub fn send(&self, _event: &InputEvent) -> bool { match *self {} }
    pub fn release(&self) { match *self {} }
    pub fn block(&self, _block: bool) -> bool { match *self {} }
}
impl Drop for ElevatedInput { fn drop(&mut self) { match *self {} } }
