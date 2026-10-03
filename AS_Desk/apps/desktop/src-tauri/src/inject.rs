//! The shared screen's input path, kept off the agent's task. The agent opens the gate for a session
//! once its media is connected (`allow`); from then on the UI's input goes straight to one dedicated
//! thread, so a file transfer, a clipboard read or a burst of signaling never delays a keystroke, and
//! events are applied in exactly the order they arrive. The thread injects through the SYSTEM helper
//! when it runs (full access, elevation.rs) and in-process otherwise, and it also owns blocking the
//! local user's keyboard and mouse (blocker.rs), which must follow input wherever it goes.
use std::sync::{mpsc, Mutex};

use tokio::sync::oneshot;

use crate::{elevation::ElevatedInput, input::Input, log, platform::Rect, protocol::{Capability, InputEvent}};

enum Job { Start(Rect), Stop, Events(Vec<InputEvent>), Block(bool, oneshot::Sender<Result<(), String>>) }

/// The one session whose input is accepted, and what it may do.
#[derive(Default)]
struct Gate { session: Option<String>, mouse: bool, keyboard: bool }

pub struct Injector { jobs: mpsc::Sender<Job>, gate: Mutex<Gate>, #[cfg_attr(windows, allow(dead_code))] dry_run: bool }

impl Injector {
    /// `dry_run` validates and tracks everything but never touches the real desktop (tests).
    pub fn new(dry_run: bool) -> Self {
        let (jobs, queue) = mpsc::channel();
        std::thread::Builder::new().name("input".into()).spawn(move || run(queue, dry_run)).expect("input thread");
        Self { jobs, gate: Mutex::default(), dry_run }
    }
    /// A request was accepted with control: input will go to `display` once `allow` opens the session.
    pub fn start(&self, display: Rect) -> Result<(), String> {
        Input::check(display)?;
        // macOS delivers injected input only with the Accessibility permission: ask now, while the
        // person accepting can still be told, rather than drop every event later.
        #[cfg(target_os = "macos")]
        if !self.dry_run { Input::permitted()?; }
        *self.gate.lock().unwrap() = Gate::default();
        let _ = self.jobs.send(Job::Start(display));
        Ok(())
    }
    /// The session's media is connected: accept its input from now on, within what was granted.
    pub fn allow(&self, session_id: &str, permissions: &[Capability]) {
        *self.gate.lock().unwrap() = Gate { session: Some(session_id.into()), mouse: permissions.contains(&Capability::Mouse),
            keyboard: permissions.contains(&Capability::Keyboard) };
    }
    /// Nothing more is accepted; held keys are released and the local user's input is unblocked.
    pub fn stop(&self) {
        *self.gate.lock().unwrap() = Gate::default();
        let _ = self.jobs.send(Job::Stop);
    }
    fn granted(&self, session_id: &str) -> Result<(bool, bool), String> {
        let gate = self.gate.lock().unwrap();
        if gate.session.as_deref() != Some(session_id) { return Err("Input outside an active session".into()); }
        Ok((gate.mouse, gate.keyboard))
    }
    /// Validated events from the controller, in order. Clipboard text is not input (see the agent).
    pub fn send(&self, session_id: &str, events: Vec<InputEvent>) -> Result<(), String> {
        let (mouse, keyboard) = self.granted(session_id)?;
        for event in &events {
            event.validate()?;
            let allowed = match event { InputEvent::Key { .. } => keyboard, InputEvent::Release => true, InputEvent::Clipboard { .. } => false, _ => mouse };
            if !allowed { return Err("Input permission denied".into()); }
        }
        self.jobs.send(Job::Events(events)).map_err(|_| "Input is unavailable".into())
    }
    /// Blocks or unblocks the keyboard and mouse of the person at this computer. Only a session that
    /// was granted control may do this; it lasts until it is undone or the session ends.
    pub async fn block(&self, session_id: &str, block: bool) -> Result<(), String> {
        let (mouse, keyboard) = self.granted(session_id)?;
        if block && !mouse && !keyboard { return Err("Blocking needs permission to control this computer".into()); }
        let (reply, result) = oneshot::channel();
        self.jobs.send(Job::Block(block, reply)).map_err(|_| "Input is unavailable".to_string())?;
        result.await.map_err(|_| "Input is unavailable".to_string())?
    }
}

fn run(jobs: mpsc::Receiver<Job>, dry_run: bool) {
    let input = Input::new(dry_run);
    let mut helper: Option<ElevatedInput> = None;
    // What the controller asked for this session, wherever it is carried out.
    let mut blocked = false;
    let lost = |helper: &mut Option<ElevatedInput>, blocked: bool| {
        // The helper went away mid-session: carry on in-process (normal desktop only), with the
        // local user's input still blocked if it was.
        *helper = None;
        log::write("elevated helper unavailable; input continues in-process");
        if blocked { if let Err(error) = input.block_local(true) { log::write(format!("block input: {error}")); } }
    };
    while let Ok(job) = jobs.recv() {
        match job {
            Job::Start(display) => {
                // The helper's pipe takes one client: close the previous connection before opening one.
                drop(helper.take());
                blocked = false;
                let _ = input.start(display);
                // Full access (elevated apps, UAC prompt, lock screen) when the SYSTEM helper is running;
                // otherwise input is injected in-process, which controls only the normal desktop.
                helper = if dry_run { None } else { ElevatedInput::connect().filter(|helper| helper.bind(display)) };
                log::write(if helper.is_some() { "input via elevated helper (full access)" } else { "input in-process (no elevation service)" });
            }
            // Dropping the helper connection tells it to stop, which releases and unblocks over there.
            Job::Stop => { helper = None; blocked = false; input.stop(); }
            Job::Events(events) => for event in events {
                if let Some(elevated) = &helper {
                    if if event == InputEvent::Release { elevated.release(); true } else { elevated.send(&event) } { continue; }
                    lost(&mut helper, blocked);
                }
                if input.active() { let _ = input.send(&event); }
            },
            Job::Block(block, reply) => {
                let result = match &helper {
                    Some(elevated) if elevated.block(block) => Ok(()),
                    Some(_) => { lost(&mut helper, false); input.block_local(block) }
                    None => input.block_local(block),
                };
                match &result {
                    Ok(()) => { blocked = block; log::write(if block { "local input blocked by the controller" } else { "local input unblocked" }); }
                    Err(error) => log::write(format!("block input: {error}")),
                }
                let _ = reply.send(result);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const SCREEN: Rect = Rect { x: 0, y: 0, width: 1920, height: 1080 };
    const SESSION: &str = "5f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11";

    #[test]
    fn input_is_accepted_only_for_the_allowed_session_and_permissions() {
        let injector = Injector::new(true);
        let key = || vec![InputEvent::Key { code: "KeyA".into(), down: true }];
        let click = || vec![InputEvent::Button { button: crate::protocol::MouseButton::Left, down: true, x: Some(0.5), y: Some(0.5) }];
        injector.start(SCREEN).unwrap();
        assert!(injector.send(SESSION, key()).is_err(), "nothing before media is connected");
        injector.allow(SESSION, &[Capability::Screen, Capability::Keyboard]);
        assert!(injector.send(SESSION, key()).is_ok());
        assert!(injector.send(SESSION, click()).is_err(), "no mouse permission");
        assert!(injector.send("6f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11", key()).is_err(), "another session");
        assert!(injector.send(SESSION, vec![InputEvent::Move { x: 2.0, y: 0.0 }]).is_err(), "out of bounds");
        injector.stop();
        assert!(injector.send(SESSION, key()).is_err(), "nothing after the session ends");
    }

    #[test]
    fn only_a_session_with_control_can_block() {
        let injector = Injector::new(true);
        let block = |injector: &Injector, value| tauri::async_runtime::block_on(injector.block(SESSION, value));
        injector.start(SCREEN).unwrap();
        injector.allow(SESSION, &[Capability::Screen]);
        assert!(block(&injector, true).is_err(), "view-only sessions cannot block");
        injector.allow(SESSION, &[Capability::Screen, Capability::Mouse]);
        assert!(block(&injector, true).is_ok());
        assert!(block(&injector, false).is_ok());
        injector.stop();
        assert!(block(&injector, true).is_err());
    }
}
