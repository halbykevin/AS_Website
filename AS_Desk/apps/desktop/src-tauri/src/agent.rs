//! The trusted core: identity, signaling, consent and session authority. One actor task owns all
//! state; the UI, the WebSocket, HTTP calls and timers talk to it through messages, so every state
//! change is serialized exactly like the server's rendezvous.
//!
//! Sessions: a technician's computer can control several computers at once (each session has its
//! own grant, verification state, timers and peer connection); a computer being helped has at most
//! one incoming request and one session, and does not control others at the same time. The server
//! enforces the same policy (services/control-api/src/rendezvous.ts).
use std::{collections::{HashMap, VecDeque}, path::PathBuf, sync::{Arc, Mutex}, time::{Duration, SystemTime, UNIX_EPOCH}};

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::{client::IntoClientRequest, http::HeaderValue, protocol::WebSocketConfig, Message};

use zeroize::Zeroizing;

use crate::{identity::{self, Identity, Recent, RECENT_LIMIT}, input::Input, log, platform::{self, Rect},
    protocol::{is_public_id, is_uuid, valid_capabilities, Capability, ClientMessage, InputEvent}, security,
    transfer::{self, FileInfo}, unattended};

/// Sessions (including waiting requests) one computer may control at once; matches the server.
pub const MAX_SESSIONS: usize = 8;

// ── State shared with the UI (same shape as apps/desktop/src/contracts.ts) ──────────────────────
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug, Default)]
#[serde(rename_all = "lowercase")]
pub enum Status { Setup, Offline, #[default] Connecting, Ready }
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Role { Controller, Target }
#[derive(Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Phase { Negotiating, Connected }
#[derive(Serialize, Clone, Debug)]
pub struct IceServer { pub urls: Vec<String>, pub username: String, pub credential: String }
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSession { pub session_id: String, pub role: Role, pub peer_id: String, pub permissions: Vec<Capability>, pub expires_at: i64, pub ice_servers: Vec<IceServer>, pub relay_only: bool, pub phase: Phase,
    /// This session was approved by the unattended password, not by someone clicking Accept.
    pub unattended: bool }
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Incoming { pub request_id: String, pub source_id: String, pub permissions: Vec<Capability>, pub expires_at: i64 }
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Outgoing { pub target_id: String, #[serde(skip_serializing_if = "Option::is_none")] pub request_id: Option<String> }
#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DesktopState {
    #[serde(skip_serializing_if = "Option::is_none")] pub device_id: Option<String>,
    pub recent: Vec<Recent>,
    #[serde(skip_serializing_if = "Option::is_none")] pub server: Option<String>,
    pub status: Status,
    #[serde(skip_serializing_if = "Option::is_none")] pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] pub incoming: Option<Incoming>,
    /// Requests this computer sent that are waiting for the other side.
    pub outgoing: Vec<Outgoing>,
    /// Established sessions, in the order they started.
    pub sessions: Vec<ActiveSession>,
    pub native_available: bool,
    /// Unattended access is configured on this computer (a password is set). The password itself is
    /// never sent to the UI — only whether one exists.
    pub unattended_enabled: bool,
    pub app_version: String,
}
impl DesktopState {
    pub fn target_session(&self) -> Option<&ActiveSession> { self.sessions.iter().find(|s| s.role == Role::Target) }
    pub fn controlling(&self) -> usize { self.sessions.iter().filter(|s| s.role == Role::Controller).count() }
}
#[derive(Serialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum DesktopEvent {
    State { state: DesktopState },
    Signal { message: ClientMessage },
    /// A session ended (its media must stop); `session_id` is absent when all sessions ended.
    Stop { #[serde(rename = "sessionId", skip_serializing_if = "Option::is_none")] session_id: Option<String>, reason: String },
    /// Unattended access: the controller proved the password, so the UI should capture the screen and
    /// accept this request automatically — the same capture+accept the Accept button runs, no click.
    AutoAccept { #[serde(rename = "requestId")] request_id: String, permissions: Vec<Capability> },
    /// A window was maximized or restored ("main", or a popped-out session's "session-<id>").
    Window { label: String, maximized: bool },
    /// A popped-out session's window was closed from outside the page (Alt+F4, the taskbar): the page
    /// puts the session back into the main window. The session itself continues.
    Popout { #[serde(rename = "sessionId")] session_id: String },
}

/// What the agent needs from the application shell.
pub trait Host: Send + Sync + 'static {
    fn emit(&self, event: DesktopEvent);
    /// Called after every state change; `shared` is the display being shared, if any.
    fn state_changed(&self, previous: &DesktopState, state: &DesktopState, shared: Option<Rect>);
}

type Reply<T> = oneshot::Sender<Result<T, String>>;
enum Cmd {
    Setup { server: String, token: Option<String>, reply: Reply<()> },
    Connect { target: String, clipboard: bool, relay: bool, password: Option<String>, remember: bool, reply: Reply<()> },
    SetUnattended { password: String, reply: Reply<()> },
    ClearUnattended { reply: Reply<()> },
    Accept { request_id: String, permissions: Vec<Capability>, source_id: String, width: u32, height: u32, thumbnail: Option<Vec<u8>>, reply: Reply<()> },
    Reject { request_id: String, reply: Reply<()> },
    Cancel { target: String, reply: Reply<()> },
    /// One session, or every session and request when `session_id` is None.
    Disconnect { session_id: Option<String>, reason: String, reply: Option<Reply<()>> },
    Signal { message: Value, reply: Reply<()> },
    Input { session_id: String, event: Value, reply: Reply<()> },
    ReadClipboard { session_id: String, reply: Reply<String> },
    // Clipboard file transfer (transfer.rs): the controller offers and streams, the shared computer receives.
    ClipboardFiles { session_id: String, reply: Reply<Option<transfer::Snapshot>> },
    FileRead { session_id: String, fingerprint: String, index: usize, offset: u64, len: usize, reply: Reply<Vec<u8>> },
    FileRecvBegin { session_id: String, transfer_id: String, files: Vec<FileInfo>, reply: Reply<()> },
    FileRecvOpen { session_id: String, transfer_id: String, index: usize, reply: Reply<()> },
    FileRecvChunk { session_id: String, transfer_id: String, bytes: Vec<u8>, reply: Reply<()> },
    FileRecvFinish { session_id: String, transfer_id: String, reply: Reply<usize> },
    FileCancel { session_id: String, reply: Reply<()> },
    Forget { id: String, reply: Reply<()> },
    RenameRecent { id: String, name: Option<String>, reply: Reply<()> },
    DismissError { reply: Reply<()> },
    DisplaysChanged,
    Shutdown { reply: Reply<()> },
    // Internal
    AutoSetup { server: String },
    SocketOpened { generation: u64, out: mpsc::UnboundedSender<String> },
    SocketFailed { generation: u64, error: String },
    SocketMessage { generation: u64, text: String, received: i64 },
    SocketClosed { generation: u64 },
    Retry { generation: u64 },
    Turn { session_id: String, result: Result<Vec<IceServer>, String> },
    Expire { session_id: String, generation: u64, reason: &'static str },
}

#[derive(Clone)]
pub struct AgentHandle { tx: mpsc::UnboundedSender<Cmd>, snapshot: Arc<Mutex<DesktopState>> }
impl AgentHandle {
    async fn call<T>(&self, make: impl FnOnce(Reply<T>) -> Cmd) -> Result<T, String> {
        let (reply, response) = oneshot::channel();
        self.tx.send(make(reply)).map_err(|_| "The application is closing")?;
        response.await.map_err(|_| "The application is closing".to_string())?
    }
    pub fn state(&self) -> DesktopState { self.snapshot.lock().unwrap().clone() }
    pub async fn setup(&self, server: String, token: Option<String>) -> Result<(), String> { self.call(|reply| Cmd::Setup { server, token, reply }).await }
    pub async fn connect(&self, target: String, clipboard: bool, relay: bool, password: Option<String>, remember: bool) -> Result<(), String> {
        self.call(|reply| Cmd::Connect { target, clipboard, relay, password, remember, reply }).await
    }
    pub async fn set_unattended(&self, password: String) -> Result<(), String> { self.call(|reply| Cmd::SetUnattended { password, reply }).await }
    pub async fn clear_unattended(&self) -> Result<(), String> { self.call(|reply| Cmd::ClearUnattended { reply }).await }
    pub async fn accept(&self, request_id: String, permissions: Vec<Capability>, source_id: String, width: u32, height: u32, thumbnail: Option<Vec<u8>>) -> Result<(), String> {
        self.call(|reply| Cmd::Accept { request_id, permissions, source_id, width, height, thumbnail, reply }).await
    }
    pub async fn reject(&self, request_id: String) -> Result<(), String> { self.call(|reply| Cmd::Reject { request_id, reply }).await }
    pub async fn cancel(&self, target: String) -> Result<(), String> { self.call(|reply| Cmd::Cancel { target, reply }).await }
    pub async fn disconnect(&self, session_id: Option<String>, reason: &str) -> Result<(), String> {
        self.call(|reply| Cmd::Disconnect { session_id, reason: reason.into(), reply: Some(reply) }).await
    }
    /// End every session and request without waiting (shortcuts, window and system events).
    pub fn stop_all(&self, reason: &str) { let _ = self.tx.send(Cmd::Disconnect { session_id: None, reason: reason.into(), reply: None }); }
    pub async fn signal(&self, message: Value) -> Result<(), String> { self.call(|reply| Cmd::Signal { message, reply }).await }
    pub async fn input(&self, session_id: String, event: Value) -> Result<(), String> { self.call(|reply| Cmd::Input { session_id, event, reply }).await }
    pub async fn read_clipboard(&self, session_id: String) -> Result<String, String> { self.call(|reply| Cmd::ReadClipboard { session_id, reply }).await }
    pub async fn clipboard_files(&self, session_id: String) -> Result<Option<transfer::Snapshot>, String> { self.call(|reply| Cmd::ClipboardFiles { session_id, reply }).await }
    /// File bytes cross the web view boundary as base64 (compact, unlike a JSON number array).
    pub async fn file_read(&self, session_id: String, fingerprint: String, index: usize, offset: u64, len: usize) -> Result<String, String> {
        let bytes = self.call(|reply| Cmd::FileRead { session_id, fingerprint, index, offset, len, reply }).await?;
        Ok(STANDARD.encode(bytes))
    }
    pub async fn file_recv_begin(&self, session_id: String, transfer_id: String, files: Vec<FileInfo>) -> Result<(), String> {
        self.call(|reply| Cmd::FileRecvBegin { session_id, transfer_id, files, reply }).await
    }
    pub async fn file_recv_open(&self, session_id: String, transfer_id: String, index: usize) -> Result<(), String> {
        self.call(|reply| Cmd::FileRecvOpen { session_id, transfer_id, index, reply }).await
    }
    pub async fn file_recv_chunk(&self, session_id: String, transfer_id: String, data: String) -> Result<(), String> {
        if data.len() > transfer::MAX_CHUNK * 4 / 3 + 4 { return Err("Chunk too large".into()); }
        let bytes = STANDARD.decode(data).map_err(|_| "Invalid chunk")?;
        self.call(|reply| Cmd::FileRecvChunk { session_id, transfer_id, bytes, reply }).await
    }
    pub async fn file_recv_finish(&self, session_id: String, transfer_id: String) -> Result<usize, String> {
        self.call(|reply| Cmd::FileRecvFinish { session_id, transfer_id, reply }).await
    }
    pub async fn file_cancel(&self, session_id: String) -> Result<(), String> { self.call(|reply| Cmd::FileCancel { session_id, reply }).await }
    pub async fn forget(&self, id: String) -> Result<(), String> { self.call(|reply| Cmd::Forget { id, reply }).await }
    pub async fn dismiss_error(&self) -> Result<(), String> { self.call(|reply| Cmd::DismissError { reply }).await }
    pub async fn rename_recent(&self, id: String, name: Option<String>) -> Result<(), String> {
        self.call(|reply| Cmd::RenameRecent { id, name, reply }).await
    }
    pub fn displays_changed(&self) { let _ = self.tx.send(Cmd::DisplaysChanged); }
    pub async fn shutdown(&self) { let _ = self.call(|reply| Cmd::Shutdown { reply }).await; }
}

pub struct Options { pub dir: PathBuf, pub legacy: Vec<PathBuf>, pub version: String, pub auto_server: Option<String>, pub dry_input: bool }

pub fn start(options: Options, host: Arc<dyn Host>) -> AgentHandle {
    let (tx, mut rx) = mpsc::unbounded_channel();
    let snapshot = Arc::new(Mutex::new(DesktopState { native_available: true, app_version: options.version.clone(), ..Default::default() }));
    let http = reqwest::Client::builder().timeout(Duration::from_secs(10)).connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none()).user_agent(format!("ASDesk/{}", options.version))
        .use_preconfigured_tls((*crate::tls::client_config()).clone()).build().expect("HTTP client");
    let state = snapshot.lock().unwrap().clone();
    let mut agent = Agent {
        previous: state.clone(), state, snapshot: snapshot.clone(), host, tx: tx.clone(), http, input: Arc::new(Input::new(options.dry_input)),
        dir: options.dir, legacy: options.legacy, version: options.version, identity: None, socket: None, socket_generation: 0,
        stopped: false, backoff: 1000, retry_generation: 0, timer_generation: 0, clock_offset: 0, used_nonces: VecDeque::new(),
        consent: None, shared: None, requests: Vec::new(), sessions: HashMap::new(), deferred: VecDeque::new(), sent: VecDeque::new(),
        file_send: HashMap::new(), file_recv: HashMap::new(), elevated: None,
        unattended: None, challenge: None, auth_failures: VecDeque::new(), auto_accept: None,
    };
    // Received files stay pasteable for the rest of the run (also after the session ends); the next
    // start reclaims the space, since no transfer can be in flight then.
    let _ = std::fs::remove_dir_all(agent.dir.join("transfers"));
    let auto_server = options.auto_server;
    tauri::async_runtime::spawn(async move {
        agent.load(auto_server).await;
        while let Some(cmd) = rx.recv().await { agent.handle(cmd).await; }
    });
    AgentHandle { tx, snapshot }
}

/// Command results the user sees are also written to the diagnostics log when they fail.
fn logged<T>(what: &str, result: Result<T, String>) -> Result<T, String> {
    if let Err(error) = &result { log::write(format!("{what} failed: {error}")); }
    result
}
fn now_ms() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0) }
fn jitter(max: u64) -> u64 { let mut b = [0u8; 2]; let _ = getrandom::fill(&mut b); u16::from_le_bytes(b) as u64 % max }
fn format_id(id: &str) -> String { id.as_bytes().chunks(3).map(|c| String::from_utf8_lossy(c).into_owned()).collect::<Vec<_>>().join(" ") }

fn server_error(code: &str) -> String {
    match code {
        "target_unavailable" => "That computer is offline, busy, or the ID is wrong.",
        "device_busy" => "This computer is being helped right now, so it cannot connect to others.",
        "session_limit" => "You are connected to the maximum number of computers. End a session to connect to another.",
        "self_connection" => "Enter another computer’s ID.",
        "rate_limited" => "Too many requests. Wait a minute and try again.",
        "request_unavailable" => "That request is no longer available.",
        "session_unavailable" => "The session has ended.",
        "stale_message" => "This computer’s clock is wrong. Turn on “Set time automatically” in Windows Settings.",
        "identity_unavailable" => "One of the computers is no longer allowed on the server.",
        "capacity" => "The server is at capacity. Try again later.",
        other => return other.replace('_', " "),
    }.into()
}
fn http_error(status: u16, path: &str) -> String {
    match status {
        401 | 403 if path == "/v1/devices/register" => "This server needs an enrollment token. Enter the token from your administrator.".into(),
        401 => "This computer is no longer allowed on the server. Contact your administrator.".into(),
        429 => "Too many attempts. Wait a minute and try again.".into(),
        s if s >= 500 => "The server is temporarily unavailable. Try again shortly.".into(),
        s => format!("Server request failed ({s})"),
    }
}
async fn post(http: &reqwest::Client, server: &str, path: &str, body: Value, token: Option<&str>) -> Result<Value, String> {
    let mut request = http.post(format!("{server}{path}")).json(&body);
    if let Some(token) = token { request = request.bearer_auth(token); }
    let response = request.send().await.map_err(|e| {
        log::write(format!("{path}: {}", error_chain(&e)));
        "Cannot reach the ASDesk server. Check your internet connection.".to_string()
    })?;
    if !response.status().is_success() { return Err(http_error(response.status().as_u16(), path)); }
    response.json().await.map_err(|_| "The server sent an invalid response.".into())
}
/// An error and its causes on one line (the TLS or network reason is usually a few levels down).
fn error_chain(error: &dyn std::error::Error) -> String {
    let mut text = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source { text.push_str(": "); text.push_str(&cause.to_string()); source = cause.source(); }
    text
}
fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> { value[key].as_str().ok_or_else(|| "The server sent an invalid response.".into()) }

async fn authenticate(http: &reqwest::Client, server: &str, device_id: &str, key: &SigningKey) -> Result<String, String> {
    let challenge = post(http, server, "/v1/devices/auth/challenge", json!({ "deviceId": device_id }), None).await?;
    let (id, message) = (text(&challenge, "challengeId")?, text(&challenge, "message")?);
    if !is_uuid(id) || message.len() > 512 { return Err("The server sent an invalid response.".into()); }
    let signature = STANDARD.encode(key.sign(message.as_bytes()).to_bytes());
    let verified = post(http, server, "/v1/devices/auth/verify", json!({ "challengeId": id, "signature": signature }), None).await?;
    Ok(text(&verified, "accessToken")?.to_string())
}

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;
async fn open_socket(http: &reqwest::Client, server: &str, device_id: &str, key: &SigningKey) -> Result<Socket, String> {
    let token = authenticate(http, server, device_id, key).await?;
    let ticket = post(http, server, "/v1/ws-ticket", json!({}), Some(&token)).await?;
    let ticket = text(&ticket, "ticket")?;
    let url = format!("{}/ws", server.replacen("https://", "wss://", 1).replacen("http://", "ws://", 1));
    let mut request = url.into_client_request().map_err(|e| e.to_string())?;
    request.headers_mut().insert("Sec-WebSocket-Protocol", HeaderValue::from_str(&format!("company-remote.v1, ticket.{ticket}")).map_err(|e| e.to_string())?);
    let config = WebSocketConfig::default().max_message_size(Some(65536)).max_frame_size(Some(65536));
    let connector = tokio_tungstenite::Connector::Rustls(crate::tls::client_config());
    let (socket, _) = tokio::time::timeout(Duration::from_secs(10), tokio_tungstenite::connect_async_tls_with_config(request, Some(config), false, Some(connector))).await
        .map_err(|_| "Cannot reach the ASDesk server.".to_string())?
        .map_err(|e| { log::write(format!("/ws: {}", error_chain(&e))); "Cannot reach the ASDesk server.".to_string() })?;
    Ok(socket)
}

/// A request this computer sent. For unattended access it carries the password to answer a challenge
/// with (held only until the request is accepted or dropped) and whether to remember it on success.
struct Request { target: String, request_id: Option<String>, permissions: Vec<Capability>, relay_only: bool,
    unattended_secret: Option<Zeroizing<String>>, remember: bool }
/// A challenge this computer (the target) sent for an incoming unattended request, awaiting its proof.
struct Challenge { request_id: String, nonce: String, controller_id: String, expires_at: i64 }
/// An accepted session: authority (grant) and verification state. `active` is set once its relay
/// credentials are known and the UI may start media.
struct Session {
    claims: security::Claims, role: Role, relay_only: bool, active: bool,
    peer_verified: bool, signal_sent: bool, connected_media: bool, timer: u64, unattended: bool,
}
/// What a sent message was about, so a server error answering it affects only that.
#[derive(Clone)]
enum Subject { Request(String), Incoming, Session(String) }

struct Agent {
    state: DesktopState, previous: DesktopState, snapshot: Arc<Mutex<DesktopState>>, host: Arc<dyn Host>, tx: mpsc::UnboundedSender<Cmd>,
    http: reqwest::Client, input: Arc<Input>,
    dir: PathBuf, legacy: Vec<PathBuf>, version: String, identity: Option<Identity>,
    socket: Option<mpsc::UnboundedSender<String>>, socket_generation: u64,
    stopped: bool, backoff: u64, retry_generation: u64, timer_generation: u64,
    // Server clock minus local clock, from every server envelope. Timestamps, grant expiry and request
    // deadlines use server time, so a PC whose clock is minutes off still works.
    clock_offset: i64,
    used_nonces: VecDeque<String>,
    // Being helped: the request the user accepted and the display that is shared.
    consent: Option<(String, Vec<Capability>)>, shared: Option<Rect>,
    requests: Vec<Request>,
    sessions: HashMap<String, Session>,
    // While relay credentials for an accepted session are fetched, later server messages wait here so
    // they are handled in order.
    deferred: VecDeque<(String, i64)>,
    sent: VecDeque<(String, Subject)>,
    // Clipboard file transfer per session: files this controller copied, files arriving at this shared computer.
    file_send: HashMap<String, transfer::SendState>,
    file_recv: HashMap<String, transfer::RecvState>,
    // While sharing this screen, input is sent to the SYSTEM helper (full access) when it is running;
    // absent means in-process injection (normal-desktop control only). See elevation.rs.
    elevated: Option<crate::elevation::ElevatedInput>,
    // Unattended access (unattended.rs). The verifier is this computer's stored password secret; the
    // challenge is the one outstanding for an incoming request; auth_failures throttles guessing; and
    // auto_accept names a request whose proof verified, so its session is tagged unattended.
    unattended: Option<unattended::Verifier>,
    challenge: Option<Challenge>,
    auth_failures: VecDeque<i64>,
    auto_accept: Option<String>,
}

impl Agent {
    fn server_now(&self) -> i64 { now_ms() + self.clock_offset }
    fn publish(&mut self) {
        // An accepted session still fetching its relay credentials stays listed as waiting, so the UI
        // never sees that computer disappear between the request and the session.
        self.state.outgoing = self.requests.iter().map(|r| Outgoing { target_id: r.target.clone(), request_id: r.request_id.clone() })
            .chain(self.sessions.values().filter(|s| s.role == Role::Controller && !s.active)
                .map(|s| Outgoing { target_id: s.claims.target_device_id.clone(), request_id: None }))
            .collect();
        *self.snapshot.lock().unwrap() = self.state.clone();
        self.host.emit(DesktopEvent::State { state: self.state.clone() });
        let shared = self.shared.filter(|_| self.state.target_session().is_some());
        self.host.state_changed(&self.previous, &self.state, shared);
        self.previous = self.state.clone();
    }
    fn after(&self, delay: Duration, cmd: Cmd) {
        let tx = self.tx.clone();
        tauri::async_runtime::spawn(async move { tokio::time::sleep(delay).await; let _ = tx.send(cmd); });
    }
    fn awaiting_relay(&self) -> bool { self.sessions.values().any(|s| !s.active) }

    async fn load(&mut self, auto_server: Option<String>) {
        self.state.recent = identity::load_recent(&self.dir);
        self.unattended = unattended::load(&self.dir);
        self.state.unattended_enabled = self.unattended.is_some();
        match identity::load(&self.dir, &self.legacy) {
            Ok(Some(identity)) => {
                self.state.device_id = Some(identity.device_id.clone()); self.state.server = Some(identity.server.clone());
                self.state.status = Status::Offline; self.identity = Some(identity);
                self.publish(); self.open();
            }
            Ok(None) => match auto_server {
                Some(server) => self.auto_setup(server).await,
                None => { self.state.status = Status::Setup; self.publish(); }
            },
            Err(error) => {
                log::write(format!("identity could not be opened: {error}"));
                self.state.status = Status::Offline; self.state.error = Some(format!("Stored identity could not be opened: {error}")); self.publish();
            }
        }
    }
    // First run: register without asking, so the ID appears straight after installation. A computer
    // that is offline keeps retrying; a server that wants a token falls back to the setup form.
    async fn auto_setup(&mut self, server: String) {
        if self.stopped || self.identity.is_some() { return; }
        if let Err(error) = self.setup(&server, None).await {
            if self.identity.is_none() && !self.stopped && error.starts_with("Cannot reach") { self.after(Duration::from_secs(30), Cmd::AutoSetup { server }); }
        }
    }
    async fn setup(&mut self, server: &str, token: Option<&str>) -> Result<(), String> {
        if self.identity.is_some() { return Err("Device is already configured".into()); }
        let result = self.register(server, token).await;
        if let Err(error) = &result {
            if self.identity.is_none() { self.state.status = Status::Setup; self.state.server = None; self.state.error = Some(error.clone()); self.publish(); }
        }
        result
    }
    async fn register(&mut self, server: &str, token: Option<&str>) -> Result<(), String> {
        let server = security::server_url(server)?;
        self.state.status = Status::Connecting; self.state.server = Some(server.clone()); self.state.error = None; self.publish();
        let mut seed = [0u8; 32];
        getrandom::fill(&mut seed).map_err(|_| "Cannot create a device key")?;
        let key = SigningKey::from_bytes(&seed);
        let body = json!({ "publicKey": security::public_key_spki(&key.verifying_key()), "platform": "windows", "agentVersion": self.version });
        let registered = post(&self.http, &server, "/v1/devices/register", body, token.filter(|t| !t.trim().is_empty()).map(str::trim)).await?;
        let (device_id, signing_public_key) = (text(&registered, "deviceId")?, text(&registered, "signingPublicKey")?);
        if !is_public_id(device_id) { return Err("The server sent an invalid response.".into()); }
        security::parse_spki(signing_public_key)?;
        let identity = Identity { device_id: device_id.into(), server: server.clone(), signing_public_key: signing_public_key.into(), key };
        identity::save(&self.dir, &identity)?;
        self.state.device_id = Some(identity.device_id.clone()); self.state.error = None; self.identity = Some(identity);
        self.publish(); self.open();
        Ok(())
    }

    fn open(&mut self) {
        let Some((server, device_id, key)) = self.identity.as_ref().map(|i| (i.server.clone(), i.device_id.clone(), i.key.clone())) else { return };
        if self.stopped { return; }
        self.state.status = Status::Connecting; self.publish();
        self.socket_generation += 1;
        let generation = self.socket_generation;
        let (http, tx) = (self.http.clone(), self.tx.clone());
        tauri::async_runtime::spawn(async move {
            let socket = match open_socket(&http, &server, &device_id, &key).await {
                Ok(socket) => socket,
                Err(error) => { let _ = tx.send(Cmd::SocketFailed { generation, error }); return; }
            };
            let (mut sink, mut stream) = socket.split();
            let (out, mut outgoing) = mpsc::unbounded_channel::<String>();
            if tx.send(Cmd::SocketOpened { generation, out }).is_err() { return; }
            tauri::async_runtime::spawn(async move {
                while let Some(text) = outgoing.recv().await { if sink.send(Message::Text(text.into())).await.is_err() { break; } }
                let _ = sink.close().await;
            });
            while let Some(Ok(message)) = stream.next().await {
                match message {
                    Message::Text(text) => { if tx.send(Cmd::SocketMessage { generation, text: text.to_string(), received: now_ms() }).is_err() { return; } }
                    Message::Binary(_) | Message::Close(_) => break,
                    _ => {}
                }
            }
            let _ = tx.send(Cmd::SocketClosed { generation });
        });
    }
    fn schedule_retry(&mut self) {
        if self.stopped { return; }
        self.retry_generation += 1;
        self.after(Duration::from_millis(self.backoff + jitter(500)), Cmd::Retry { generation: self.retry_generation });
        self.backoff = (self.backoff * 2).min(30000);
    }
    fn send(&mut self, message: ClientMessage, subject: Option<Subject>) -> Result<(), String> {
        message.validate()?;
        let out = self.socket.as_ref().ok_or("This computer is offline.")?;
        let id = uuid::Uuid::new_v4().to_string();
        let envelope = json!({ "protocolVersion": 1, "id": id, "timestamp": self.server_now(), "payload": message });
        out.send(envelope.to_string()).map_err(|_| "This computer is offline.".to_string())?;
        if let Some(subject) = subject {
            self.sent.push_back((id, subject));
            if self.sent.len() > 256 { self.sent.pop_front(); }
        }
        Ok(())
    }
    fn set_timer(&mut self, session_id: &str, delay_ms: i64, reason: &'static str) {
        self.timer_generation += 1;
        let generation = self.timer_generation;
        if let Some(session) = self.sessions.get_mut(session_id) { session.timer = generation; }
        self.after(Duration::from_millis(delay_ms.max(1) as u64), Cmd::Expire { session_id: session_id.into(), generation, reason });
    }

    /// Ends one session: tells the server (unless it already knows), stops input for a shared screen
    /// and tells the UI to stop that session's media.
    fn end_session(&mut self, session_id: &str, reason: &str, notify_server: bool) {
        let Some(session) = self.sessions.remove(session_id) else { return };
        if notify_server { let _ = self.send(ClientMessage::SessionEnd { session_id: session_id.into() }, None); }
        if session.role == Role::Target { self.input.stop(); self.elevated = None; self.consent = None; self.shared = None; self.state.incoming = None; self.challenge = None; self.auto_accept = None; }
        self.file_send.remove(session_id);
        if let Some(partial) = self.file_recv.remove(session_id) { partial.cancel(); }
        self.state.sessions.retain(|s| s.session_id != session_id);
        if !self.awaiting_relay() {
            while let Some((text, received)) = self.deferred.pop_front() { self.process(&text, received); }
        }
        log::write(format!("session with {} ended: {reason}", format_id(if session.role == Role::Controller { &session.claims.target_device_id } else { &session.claims.controller_device_id })));
        self.host.emit(DesktopEvent::Stop { session_id: Some(session_id.into()), reason: reason.into() });
        self.publish();
    }
    /// Ends every session and request (lock, suspend, emergency stop, quitting, losing the server).
    fn end_all(&mut self, reason: &str, notify_server: bool) {
        let active = !self.sessions.is_empty() || !self.requests.is_empty() || self.state.incoming.is_some();
        if notify_server {
            let ids: Vec<String> = self.sessions.keys().cloned().collect();
            for id in ids { let _ = self.send(ClientMessage::SessionEnd { session_id: id }, None); }
            let pending: Vec<String> = self.requests.iter().filter_map(|r| r.request_id.clone()).collect();
            for request_id in pending { let _ = self.send(ClientMessage::ConnectionCancel { request_id }, None); }
        }
        if active { log::write(format!("all sessions and requests ended: {reason}")); }
        self.sessions.clear(); self.requests.clear(); self.deferred.clear();
        self.file_send.clear();
        for (_, partial) in self.file_recv.drain() { partial.cancel(); }
        self.input.stop(); self.elevated = None; self.consent = None; self.shared = None;
        self.challenge = None; self.auto_accept = None;
        self.state.sessions.clear(); self.state.incoming = None;
        self.host.emit(DesktopEvent::Stop { session_id: None, reason: reason.into() });
        self.publish();
    }
    fn clear_incoming(&mut self) {
        self.state.incoming = None;
        self.challenge = None; self.auto_accept = None;
        if self.state.target_session().is_none() && !self.sessions.values().any(|s| s.role == Role::Target) { self.input.stop(); self.elevated = None; self.consent = None; self.shared = None; }
    }
    fn save_recent(&mut self, list: Vec<Recent>) {
        identity::save_recent(&self.dir, &list);
        self.state.recent = list; self.publish();
    }

    async fn handle(&mut self, cmd: Cmd) {
        match cmd {
            Cmd::Setup { server, token, reply } => { let _ = reply.send(logged("setup", self.setup(&server, token.as_deref()).await)); }
            Cmd::AutoSetup { server } => self.auto_setup(server).await,
            Cmd::Connect { target, clipboard, relay, password, remember, reply } => {
                log::write(format!("request to {target} (clipboard {clipboard}, relay only {relay}, unattended {})", password.is_some()));
                let _ = reply.send(logged("connect", self.connect(target, clipboard, relay, password.map(Zeroizing::new), remember)));
            }
            Cmd::SetUnattended { password, reply } => { let _ = reply.send(logged("set unattended access", self.set_unattended(&password))); }
            Cmd::ClearUnattended { reply } => {
                unattended::clear(&self.dir);
                self.unattended = None; self.challenge = None; self.auth_failures.clear();
                self.state.unattended_enabled = false; self.publish();
                log::write("unattended access turned off");
                let _ = reply.send(Ok(()));
            }
            Cmd::Accept { request_id, permissions, source_id, width, height, thumbnail, reply } => {
                let _ = reply.send(logged("accept", self.accept(request_id, permissions, &source_id, width, height, thumbnail.as_deref())));
            }
            Cmd::Reject { request_id, reply } => {
                let result = if self.state.incoming.as_ref().is_some_and(|i| i.request_id == request_id) { self.send(ClientMessage::ConnectionReject { request_id }, Some(Subject::Incoming)) }
                    else { Err("No matching request".into()) };
                let _ = reply.send(logged("reject", result));
            }
            Cmd::Cancel { target, reply } => {
                let request = self.requests.iter().position(|r| r.target == target);
                let result = match request.map(|i| self.requests.remove(i)) {
                    Some(Request { request_id: Some(request_id), .. }) => self.send(ClientMessage::ConnectionCancel { request_id }, None),
                    // Not acknowledged yet: the server's reply is ignored once the request is gone.
                    _ => Ok(()),
                };
                self.publish();
                let _ = reply.send(result);
            }
            Cmd::Disconnect { session_id, reason, reply } => {
                match session_id { Some(id) => self.end_session(&id, &reason, true), None => self.end_all(&reason, true) }
                if let Some(reply) = reply { let _ = reply.send(Ok(())); }
            }
            Cmd::Signal { message, reply } => { let _ = reply.send(logged("signal", self.signal(message))); }
            Cmd::Input { session_id, event, reply } => { let _ = reply.send(self.relay_input(&session_id, event)); }
            Cmd::ReadClipboard { session_id, reply } => {
                let allowed = self.sessions.get(&session_id).is_some_and(|s| s.connected_media)
                    && self.state.sessions.iter().any(|a| a.session_id == session_id && a.permissions.contains(&Capability::Clipboard));
                let result = if allowed { platform::read_clipboard().map(|t| String::from_utf16_lossy(&t.encode_utf16().take(65536).collect::<Vec<_>>())) }
                    else { Err("Clipboard permission denied".into()) };
                let _ = reply.send(result);
            }
            Cmd::ClipboardFiles { session_id, reply } => {
                let result = if !self.clipboard_allowed(&session_id, Role::Controller) { Err("Clipboard permission denied".into()) } else {
                    platform::read_clipboard_files().map(|paths| match transfer::capture(paths) {
                        Some((snapshot, send)) => { self.file_send.insert(session_id.clone(), send); Some(snapshot) }
                        None => { self.file_send.remove(&session_id); None }
                    })
                };
                let _ = reply.send(result);
            }
            Cmd::FileRead { session_id, fingerprint, index, offset, len, reply } => {
                let result = if !self.clipboard_allowed(&session_id, Role::Controller) { Err("Clipboard permission denied".into()) } else {
                    // Only the file set announced under this fingerprint can be read, and only by index.
                    match self.file_send.get(&session_id).filter(|s| s.fingerprint == fingerprint) {
                        Some(send) => send.read(index, offset, len),
                        None => Err("The copied files changed".into()),
                    }
                };
                let _ = reply.send(result);
            }
            Cmd::FileRecvBegin { session_id, transfer_id, files, reply } => {
                let result = if !self.clipboard_allowed(&session_id, Role::Target) || !is_uuid(&transfer_id) { Err("Clipboard permission denied".into()) } else {
                    if let Some(previous) = self.file_recv.remove(&session_id) { previous.cancel(); }
                    let dir = self.dir.join("transfers").join(&session_id).join(&transfer_id);
                    let count = files.len();
                    transfer::RecvState::begin(dir, &transfer_id, files).map(|recv| {
                        log::write(format!("receiving {count} copied file(s)"));
                        self.file_recv.insert(session_id.clone(), recv);
                    })
                };
                let _ = reply.send(result);
            }
            Cmd::FileRecvOpen { session_id, transfer_id, index, reply } => {
                let result = match self.receiving(&session_id, &transfer_id) { Ok(recv) => recv.open(index), Err(e) => Err(e) };
                let _ = reply.send(result);
            }
            Cmd::FileRecvChunk { session_id, transfer_id, bytes, reply } => {
                let result = match self.receiving(&session_id, &transfer_id) { Ok(recv) => recv.chunk(&bytes), Err(e) => Err(e) };
                if result.is_err() { if let Some(partial) = self.file_recv.remove(&session_id) { partial.cancel(); } }
                let _ = reply.send(result);
            }
            Cmd::FileRecvFinish { session_id, transfer_id, reply } => {
                let result = match self.receiving(&session_id, &transfer_id) {
                    Err(e) => Err(e),
                    Ok(_) => {
                        let recv = self.file_recv.remove(&session_id).expect("checked above");
                        recv.finish().and_then(|paths| platform::write_clipboard_files(&paths).map(|_| paths.len()))
                    }
                };
                if let Ok(count) = &result { log::write(format!("{count} copied file(s) ready to paste")); }
                let _ = reply.send(result);
            }
            Cmd::FileCancel { session_id, reply } => {
                self.file_send.remove(&session_id);
                if let Some(partial) = self.file_recv.remove(&session_id) { partial.cancel(); }
                let _ = reply.send(Ok(()));
            }
            Cmd::Forget { id, reply } => {
                let list = self.state.recent.iter().filter(|r| r.id != id).cloned().collect();
                self.save_recent(list); let _ = reply.send(Ok(()));
            }
            Cmd::DismissError { reply } => {
                // The user closed the message; a later failure sets a new one.
                if self.state.error.take().is_some() { self.publish(); }
                let _ = reply.send(Ok(()));
            }
            Cmd::RenameRecent { id, name, reply } => {
                let name = name.as_deref().and_then(identity::clean_recent_name);
                let mut list = self.state.recent.clone();
                let Some(recent) = list.iter_mut().find(|r| r.id == id) else {
                    let _ = reply.send(Err("That computer is no longer in your recent connections".into())); return;
                };
                recent.name = name;
                self.save_recent(list); let _ = reply.send(Ok(()));
            }
            Cmd::DisplaysChanged => {
                // Input is mapped to the shared display's position and size, so it must not change.
                let shared = self.shared.zip(self.state.target_session().map(|s| s.session_id.clone()));
                if let Some((rect, session_id)) = shared {
                    if !platform::displays().iter().any(|d| d.rect == rect) { self.end_session(&session_id, "Display changed", true); }
                }
            }
            Cmd::Shutdown { reply } => {
                self.stopped = true; self.retry_generation += 1;
                self.end_all("Application closed", true);
                self.socket = None; self.socket_generation += 1;
                let _ = reply.send(Ok(()));
            }
            Cmd::SocketOpened { generation, out } => {
                if generation != self.socket_generation || self.stopped { return; }
                log::write("connected to the server");
                self.socket = Some(out); self.backoff = 1000;
                self.state.status = Status::Ready; self.state.error = None; self.publish();
            }
            Cmd::SocketFailed { generation, error } => {
                if generation != self.socket_generation { return; }
                log::write(format!("cannot connect to the server: {error}"));
                self.state.status = Status::Offline; self.state.error = Some(format!("{error} Retrying…")); self.publish();
                self.schedule_retry();
            }
            Cmd::SocketClosed { generation } => {
                if generation != self.socket_generation { return; }
                log::write("server connection closed");
                // The server ends every session of a disconnected device, so all local authority ends too.
                self.socket = None; self.end_all("Signaling disconnected", false);
                self.state.status = Status::Offline; self.publish();
                self.schedule_retry();
            }
            Cmd::SocketMessage { generation, text, received } => {
                if generation != self.socket_generation { return; }
                if self.awaiting_relay() { self.deferred.push_back((text, received)); } else { self.process(&text, received); }
            }
            Cmd::Retry { generation } => { if generation == self.retry_generation && self.socket.is_none() { self.open(); } }
            Cmd::Turn { session_id, result } => self.relay_ready(session_id, result),
            Cmd::Expire { session_id, generation, reason } => {
                if self.sessions.get(&session_id).is_some_and(|s| s.timer == generation) { self.end_session(&session_id, reason, true); }
            }
        }
    }

    fn connect(&mut self, target: String, clipboard: bool, relay: bool, password: Option<Zeroizing<String>>, remember: bool) -> Result<(), String> {
        if self.state.status != Status::Ready { return Err("This computer is not connected to the server yet.".into()); }
        if !is_public_id(&target) { return Err("Enter a nine-digit computer ID".into()); }
        if self.identity.as_ref().is_some_and(|i| i.device_id == target) { return Err("Enter another computer’s ID".into()); }
        if self.state.incoming.is_some() || self.sessions.values().any(|s| s.role == Role::Target) {
            return Err("This computer is being helped right now, so it cannot connect to others.".into());
        }
        let peer = |s: &Session| s.claims.target_device_id == target;
        if self.requests.iter().any(|r| r.target == target) || self.sessions.values().any(peer) { return Err(format!("You are already connected to {}.", format_id(&target))); }
        if self.requests.len() + self.sessions.len() >= MAX_SESSIONS { return Err(server_error("session_limit")); }
        let mut permissions = vec![Capability::Screen, Capability::Mouse, Capability::Keyboard];
        if clipboard { permissions.push(Capability::Clipboard); }
        // No password typed: fall back to one saved for this computer, so a remembered unattended
        // connection is one click. An explicit password always wins and is the one remembered.
        let secret = password.or_else(|| unattended::remembered(&self.dir, &target));
        self.send(ClientMessage::ConnectionRequest { target_id: target.clone(), permissions: permissions.clone() }, Some(Subject::Request(target.clone())))?;
        self.requests.push(Request { target, request_id: None, permissions, relay_only: relay, unattended_secret: secret, remember });
        self.state.error = None; self.publish();
        Ok(())
    }
    fn set_unattended(&mut self, password: &str) -> Result<(), String> {
        let verifier = unattended::Verifier::create(password)?;
        unattended::save(&self.dir, &verifier)?;
        self.unattended = Some(verifier); self.auth_failures.clear();
        self.state.unattended_enabled = true; self.publish();
        log::write("unattended access turned on");
        Ok(())
    }
    /// True when too many wrong proofs have arrived recently, so new attempts are refused for a while.
    /// This is what stops an opportunistic attacker from grinding passwords against an idle computer.
    fn auth_locked(&mut self) -> bool {
        let cutoff = now_ms() - 10 * 60 * 1000;
        while self.auth_failures.front().is_some_and(|&t| t < cutoff) { self.auth_failures.pop_front(); }
        self.auth_failures.len() >= 5
    }
    fn record_auth_failure(&mut self) {
        self.auth_failures.push_back(now_ms());
        if self.auth_failures.len() > 32 { self.auth_failures.pop_front(); }
    }
    fn accept(&mut self, request_id: String, permissions: Vec<Capability>, source_id: &str, width: u32, height: u32, thumbnail: Option<&[u8]>) -> Result<(), String> {
        let incoming = self.state.incoming.clone().filter(|i| i.request_id == request_id && self.consent.is_none()).ok_or("That request is no longer available.")?;
        if incoming.expires_at <= now_ms() { return Err("The request expired before it was accepted. Ask them to connect again.".into()); }
        if !valid_capabilities(&permissions) || permissions.iter().any(|p| !incoming.permissions.contains(p)) { return Err("Permission was not requested".into()); }
        let mapped = platform::display_for_source(source_id, width, height, thumbnail);
        log::write(match &mapped { Ok((rect, why)) => format!("shared display {rect:?} {why}"), Err(detail) => format!("shared display not identified: {detail}") });
        let display = mapped.ok().map(|(rect, _)| rect);
        let control = permissions.contains(&Capability::Mouse) || permissions.contains(&Capability::Keyboard);
        if control {
            let display = display.ok_or("This screen could not be identified for mouse and keyboard control. Untick Control mouse and Use keyboard to share the view only.")?;
            self.input.start(display)?;
            // Full access (elevated apps, UAC prompt, lock screen) when the SYSTEM helper is running;
            // otherwise input is injected in-process, which controls only the normal desktop.
            self.elevated = crate::elevation::ElevatedInput::connect().filter(|helper| helper.bind(display));
            log::write(if self.elevated.is_some() { "input via elevated helper (full access)" } else { "input in-process (no elevation service)" });
        }
        self.consent = Some((request_id.clone(), permissions.clone())); self.shared = display;
        if let Err(error) = self.send(ClientMessage::ConnectionAccept { request_id, permissions }, Some(Subject::Incoming)) {
            self.input.stop(); self.consent = None; self.shared = None;
            return Err(error);
        }
        Ok(())
    }
    fn signal(&mut self, raw: Value) -> Result<(), String> {
        let mut message: ClientMessage = serde_json::from_value(raw).map_err(|_| "Invalid signaling command")?;
        message.validate()?;
        let session_id = message.session_id().ok_or("Invalid signaling command")?.to_string();
        let key = self.identity.as_ref().map(|i| i.key.clone()).ok_or("Device not configured")?;
        let session = self.sessions.get_mut(&session_id).filter(|s| s.active).ok_or("No authorized session")?;
        let role = match session.role { Role::Controller => "controller", Role::Target => "target" };
        let offer = matches!(message, ClientMessage::Offer { .. });
        let mut connected = false;
        match &mut message {
            ClientMessage::Offer { sdp, signature, .. } | ClientMessage::Answer { sdp, signature, .. } => {
                if offer != (session.role == Role::Controller) || session.signal_sent { return Err("Invalid description state".into()); }
                if !offer && !session.peer_verified { return Err("Peer not verified".into()); }
                *signature = Some(security::sign_description(&session_id, role, sdp, &key));
                session.signal_sent = true;
            }
            ClientMessage::SessionConnected { .. } => {
                if !session.peer_verified || !session.signal_sent { return Err("Peer not verified".into()); }
                connected = !session.connected_media;
                session.connected_media = true;
            }
            ClientMessage::Ice { .. } => {}
            _ => return Err("Invalid signaling command".into()),
        }
        if connected {
            self.set_timer(&session_id, 8 * 60 * 60 * 1000, "Session time limit");
            if let Some(active) = self.state.sessions.iter_mut().find(|s| s.session_id == session_id) { active.phase = Phase::Connected; }
            self.publish();
        }
        self.send(message, Some(Subject::Session(session_id)))
    }
    /// Clipboard transfer is allowed in a connected session in which the shared computer granted
    /// Clipboard; files flow from the controller to the shared computer only.
    fn clipboard_allowed(&self, session_id: &str, role: Role) -> bool {
        self.sessions.get(session_id).is_some_and(|s| s.connected_media && s.role == role)
            && self.state.sessions.iter().any(|a| a.session_id == session_id && a.permissions.contains(&Capability::Clipboard))
    }
    fn receiving(&mut self, session_id: &str, transfer_id: &str) -> Result<&mut transfer::RecvState, String> {
        if !self.clipboard_allowed(session_id, Role::Target) { return Err("Clipboard permission denied".into()); }
        self.file_recv.get_mut(session_id).filter(|r| r.id == transfer_id).ok_or_else(|| "No active file transfer".into())
    }
    fn relay_input(&mut self, session_id: &str, raw: Value) -> Result<(), String> {
        let connected = self.sessions.get(session_id).is_some_and(|s| s.connected_media);
        let active = self.state.sessions.iter().find(|a| a.session_id == session_id).filter(|_| connected).ok_or("Input outside an active session")?;
        let event: InputEvent = serde_json::from_value(raw).map_err(|_| "Invalid input")?;
        event.validate()?;
        if let InputEvent::Clipboard { text } = &event {
            if !active.permissions.contains(&Capability::Clipboard) { return Err("Clipboard permission denied".into()); }
            return platform::write_clipboard(text);
        }
        if active.role != Role::Target { return Err("Only the shared computer accepts input".into()); }
        let needed = if matches!(event, InputEvent::Key { .. }) { Capability::Keyboard } else { Capability::Mouse };
        if event != InputEvent::Release && !active.permissions.contains(&needed) { return Err("Input permission denied".into()); }
        // The elevated helper injects everywhere (elevated windows, secure desktop); fall back to
        // in-process injection if it has gone away mid-session.
        let elevated = self.elevated.as_ref().map(|helper| if event == InputEvent::Release { helper.release(); true } else { helper.send(&event) });
        match elevated {
            Some(true) => Ok(()),
            other => { if other == Some(false) { self.elevated = None; } if self.input.active() { self.input.send(&event)?; } Ok(()) }
        }
    }

    fn process(&mut self, text: &str, received: i64) {
        let Ok(envelope) = serde_json::from_str::<Value>(text) else { log::write("protocol failure: invalid server message"); return };
        if let Some(timestamp) = envelope["timestamp"].as_f64() { self.clock_offset = timestamp as i64 - received; }
        let payload = &envelope["payload"];
        if let Err(error) = self.receive(payload) {
            // A failure concerns the session or request the message was about, never the others.
            log::write(format!("protocol failure: {error}"));
            if let Some(session_id) = payload["sessionId"].as_str().filter(|id| is_uuid(id)) {
                if self.sessions.contains_key(session_id) { self.end_session(session_id, "Peer verification or protocol failed", true); }
                else { let _ = self.send(ClientMessage::SessionEnd { session_id: session_id.into() }, None); }
            }
            if let Some(request_id) = payload["requestId"].as_str() { self.requests.retain(|r| r.request_id.as_deref() != Some(request_id)); }
            self.state.error = Some(error); self.publish();
        }
    }
    fn receive(&mut self, m: &Value) -> Result<(), String> {
        let kind = m["type"].as_str().ok_or("Invalid server message")?;
        match kind {
            "device.online" => {}
            "connection.pending" => {
                let (request_id, target) = (text(m, "requestId")?, text(m, "targetId")?);
                if !is_uuid(request_id) { return Err("Invalid server message".into()); }
                if let Some(request) = self.requests.iter_mut().find(|r| r.target == target && r.request_id.is_none()) {
                    request.request_id = Some(request_id.into());
                    self.publish();
                }
            }
            "connection.incoming" => {
                // The server only offers requests to a computer that is idle; stay defensive anyway.
                if self.state.status != Status::Ready || self.state.incoming.is_some() || !self.sessions.is_empty() || !self.requests.is_empty() { return Ok(()); }
                let (request_id, source_id) = (text(m, "requestId")?, text(m, "sourceId")?);
                let permissions: Vec<Capability> = serde_json::from_value(m["permissions"].clone()).map_err(|_| "Invalid server message")?;
                let expires_at = m["expiresAt"].as_f64().ok_or("Invalid server message")? as i64;
                if !is_uuid(request_id) || !is_public_id(source_id) || !valid_capabilities(&permissions) { return Err("Invalid server message".into()); }
                log::write(format!("incoming request from {source_id}"));
                let (request_id, source_id) = (request_id.to_string(), source_id.to_string());
                // Deadlines shown and checked locally are converted to this computer's clock.
                let local_expiry = expires_at - self.clock_offset;
                self.state.incoming = Some(Incoming { request_id: request_id.clone(), source_id: source_id.clone(), permissions, expires_at: local_expiry });
                self.challenge = None;
                self.publish();
                // Unattended access: offer the controller a challenge straight away. If it proves the
                // password, the request is accepted with no one here; if not (or it is a human-to-human
                // request), the normal Accept dialog above still works. A recent run of wrong guesses
                // withholds the challenge entirely, so there is no oracle to grind against.
                if self.unattended.is_some() {
                    if self.auth_locked() {
                        log::write("unattended challenge withheld: too many recent failures");
                    } else if let (Ok(nonce), Some((salt, params))) = (unattended::nonce(),
                        self.unattended.as_ref().map(|v| (v.salt().to_string(), v.params().to_string()))) {
                        self.challenge = Some(Challenge { request_id: request_id.clone(), nonce: nonce.clone(), controller_id: source_id, expires_at: local_expiry });
                        let _ = self.send(ClientMessage::ConnectionChallenge { request_id, nonce, salt, params }, Some(Subject::Incoming));
                    }
                }
            }
            // Controller side: the target asked us to prove the unattended password. If the user gave
            // one for this request, derive the proof and send it; otherwise ignore and wait (a person
            // at the other end may still accept by hand).
            "connection.challenge" => {
                let (request_id, nonce, salt, params) = (text(m, "requestId")?, text(m, "nonce")?, text(m, "salt")?, text(m, "params")?);
                if !is_uuid(request_id) { return Err("Invalid server message".into()); }
                let device_id = self.identity.as_ref().map(|i| i.device_id.clone());
                let found = self.requests.iter().find(|r| r.request_id.as_deref() == Some(request_id))
                    .and_then(|r| r.unattended_secret.as_ref().map(|s| (r.target.clone(), s.clone())));
                if let (Some(controller_id), Some((target_id, secret))) = (device_id, found) {
                    match unattended::prove(&secret, salt, params, &controller_id, &target_id, request_id, nonce) {
                        Some(proof) => { log::write(format!("answering unattended challenge from {}", format_id(&target_id))); let _ = self.send(ClientMessage::ConnectionProve { request_id: request_id.into(), proof }, Some(Subject::Request(target_id))); }
                        None => log::write("could not compute an unattended proof (bad challenge)"),
                    }
                }
            }
            // Target side: a controller answered our challenge. Verify it against the stored password
            // and, if it holds, accept the request automatically (the UI captures and accepts, exactly
            // as the Accept button does). A wrong proof is counted toward the lockout and declines.
            "connection.prove" => {
                let (request_id, proof) = (text(m, "requestId")?.to_string(), text(m, "proof")?.to_string());
                let for_incoming = self.state.incoming.as_ref().is_some_and(|i| i.request_id == request_id);
                let valid = for_incoming && self.challenge.as_ref().zip(self.unattended.as_ref()).zip(self.identity.as_ref())
                    .is_some_and(|((challenge, verifier), identity)| challenge.request_id == request_id && challenge.expires_at > now_ms()
                        && verifier.verify(&challenge.controller_id, &identity.device_id, &request_id, &challenge.nonce, &proof));
                if valid {
                    log::write("unattended proof verified — accepting automatically");
                    self.challenge = None;
                    let permissions = self.state.incoming.as_ref().map(|i| i.permissions.clone()).unwrap_or_default();
                    self.auto_accept = Some(request_id.clone());
                    self.host.emit(DesktopEvent::AutoAccept { request_id, permissions });
                } else if self.challenge.as_ref().is_some_and(|c| c.request_id == request_id) {
                    self.record_auth_failure();
                    log::write("unattended proof rejected");
                    self.challenge = None;
                    let _ = self.send(ClientMessage::ConnectionReject { request_id }, Some(Subject::Incoming));
                    self.clear_incoming();
                    self.publish();
                }
            }
            "connection.accepted" => self.accepted(m)?,
            kind if kind.starts_with("webrtc.") => {
                let signal: ClientMessage = serde_json::from_value(m.clone()).map_err(|_| "Unexpected peer signal")?;
                signal.validate()?;
                let session_id = signal.session_id().ok_or("Unexpected peer signal")?.to_string();
                let session = self.sessions.get_mut(&session_id).filter(|s| s.active).ok_or("Unexpected peer signal")?;
                match &signal {
                    ClientMessage::Offer { sdp, signature, .. } | ClientMessage::Answer { sdp, signature, .. } => {
                        let (peer_role, expected_offer) = if session.role == Role::Controller { ("target", false) } else { ("controller", true) };
                        if session.peer_verified || matches!(signal, ClientMessage::Offer { .. }) != expected_offer { return Err("Unexpected description".into()); }
                        let peer_key = if peer_role == "controller" { &session.claims.controller_public_key } else { &session.claims.target_public_key };
                        security::verify_description(&session_id, peer_role, sdp, signature.as_deref(), peer_key)?;
                        session.peer_verified = true;
                    }
                    ClientMessage::Ice { .. } => {}
                    _ => return Err("Unexpected peer signal".into()),
                }
                self.host.emit(DesktopEvent::Signal { message: signal });
            }
            "connection.cancelled" | "connection.expired" | "connection.rejected" => {
                let request_id = text(m, "requestId")?;
                if let Some(index) = self.requests.iter().position(|r| r.request_id.as_deref() == Some(request_id)) {
                    let request = self.requests.remove(index);
                    let who = format_id(&request.target);
                    log::write(format!("request to {who}: {kind}"));
                    match kind {
                        "connection.rejected" => self.state.error = Some(format!("{who} declined the request.")),
                        "connection.expired" => self.state.error = Some(format!("No one answered at {who} in time.")),
                        _ => {}
                    }
                    self.publish();
                } else if self.state.incoming.as_ref().is_some_and(|i| i.request_id == request_id) {
                    log::write(format!("incoming request: {kind}"));
                    self.clear_incoming();
                    self.publish();
                }
            }
            "session.ended" => {
                let session_id = text(m, "sessionId")?.to_string();
                let reason = m["reason"].as_str().unwrap_or("ended").replace('_', " ");
                self.end_session(&session_id, &reason, false);
            }
            "error" => {
                let code = text(m, "code")?.to_string();
                log::write(format!("server error: {code}"));
                let subject = m["correlationId"].as_str().and_then(|id| self.sent.iter().find(|(sent, _)| sent == id)).map(|(_, s)| s.clone());
                match subject {
                    Some(Subject::Request(target)) => { self.requests.retain(|r| r.target != target); }
                    Some(Subject::Incoming) => { self.clear_incoming(); }
                    Some(Subject::Session(session_id)) => { self.end_session(&session_id, &code, true); }
                    None => {}
                }
                self.state.error = Some(server_error(&code)); self.publish();
            }
            _ => {}
        }
        Ok(())
    }
    fn accepted(&mut self, m: &Value) -> Result<(), String> {
        let identity = self.identity.as_ref().ok_or("Device not configured")?;
        let (server, device_id, key) = (identity.server.clone(), identity.device_id.clone(), identity.key.clone());
        let grant = security::verify_grant(text(m, "grant")?, &identity.signing_public_key, &device_id, self.server_now())?;
        if self.used_nonces.contains(&grant.nonce) { return Err("Repeated grant".into()); }
        let role = if grant.controller_device_id == device_id { Role::Controller } else { Role::Target };
        if m["sessionId"].as_str() != Some(grant.session_id.as_str()) || self.sessions.contains_key(&grant.session_id) { return Err("Unexpected session".into()); }
        let request_id = m["requestId"].as_str();
        let (relay_only, unattended) = match role {
            Role::Target => {
                let consent = self.consent.as_ref().filter(|(id, _)| Some(id.as_str()) == request_id).ok_or("Local consent required")?;
                if grant.capabilities.iter().any(|p| !consent.1.contains(p)) || self.sessions.values().any(|s| s.role == Role::Target) { return Err("Local consent required".into()); }
                // The request stays until its session is running (see relay_ready), so the UI keeps
                // the captured screen for it in between. It is an unattended session only if its proof
                // is what accepted it (not a person clicking Accept on an unattended-enabled computer).
                let unattended = self.auto_accept.as_deref() == request_id;
                if unattended { self.auto_accept = None; }
                (false, unattended)
            }
            Role::Controller => {
                let index = self.requests.iter().position(|r| r.request_id.as_deref() == request_id && r.target == grant.target_device_id)
                    .ok_or("Unexpected authorization")?;
                if grant.capabilities.iter().any(|p| !self.requests[index].permissions.contains(p)) { return Err("Unexpected authorization".into()); }
                let request = self.requests.remove(index);
                // The target accepted, so an unattended password it answered with was correct: now it
                // is safe to save the one the user asked to remember.
                if request.remember { if let Some(secret) = &request.unattended_secret { unattended::remember(&self.dir, &request.target, secret); } }
                (request.relay_only, request.unattended_secret.is_some())
            }
        };
        self.used_nonces.push_back(grant.nonce.clone());
        if self.used_nonces.len() > 1000 { self.used_nonces.pop_front(); }
        let session_id = grant.session_id.clone();
        let deadline = grant.exp * 1000 - self.server_now();
        self.sessions.insert(session_id.clone(), Session { claims: grant, role, relay_only, active: false, peer_verified: false, signal_sent: false, connected_media: false, timer: 0, unattended });
        self.set_timer(&session_id, deadline, "Connection timed out");
        self.publish();
        let (http, tx) = (self.http.clone(), self.tx.clone());
        tauri::async_runtime::spawn(async move {
            let result = async {
                let token = authenticate(&http, &server, &device_id, &key).await?;
                let turn = post(&http, &server, "/v1/turn/credentials", json!({ "sessionId": session_id }), Some(&token)).await?;
                let servers = turn["iceServers"].as_array().ok_or("Invalid relay configuration")?;
                servers.iter().map(|s| Ok(IceServer {
                    urls: s["urls"].as_array().ok_or("Invalid relay configuration")?.iter().filter_map(|u| u.as_str().map(str::to_string)).collect(),
                    username: text(s, "username")?.into(), credential: text(s, "credential")?.into(),
                })).collect::<Result<Vec<_>, String>>()
            }.await;
            let _ = tx.send(Cmd::Turn { session_id, result });
        });
        Ok(())
    }
    fn relay_ready(&mut self, session_id: String, result: Result<Vec<IceServer>, String>) {
        let Some(session) = self.sessions.get_mut(&session_id).filter(|s| !s.active) else { return };
        session.active = true;
        let (claims, role, relay_only, unattended) = (session.claims.clone(), session.role, session.relay_only, session.unattended);
        if let Err(error) = &result { log::write(format!("relay credentials unavailable: {error}")); }
        let ice_servers = match result {
            Ok(servers) => servers,
            Err(_) if relay_only => {
                self.end_session(&session_id, "Relay server is unavailable", true);
                self.state.error = Some("Relay server is unavailable".into()); self.publish();
                return;
            }
            Err(_) => Vec::new(),
        };
        let peer_id = if role == Role::Controller { claims.target_device_id.clone() } else { claims.controller_device_id.clone() };
        if role == Role::Target { self.state.incoming = None; }
        log::write(format!("session started as {role:?} with {} (relay only {relay_only}, {} relay servers, {} sessions)", format_id(&peer_id), ice_servers.len(), self.sessions.len()));
        self.state.sessions.push(ActiveSession { session_id, role, peer_id: peer_id.clone(), permissions: claims.capabilities.clone(),
            expires_at: claims.exp * 1000, ice_servers, relay_only, phase: Phase::Negotiating, unattended });
        self.publish();
        if role == Role::Controller {
            // Computers this one has controlled, newest first, like AnyDesk's recent sessions.
            // A reconnect keeps the name the user gave this computer.
            let name = self.state.recent.iter().find(|r| r.id == peer_id).and_then(|r| r.name.clone());
            let mut list = vec![Recent { id: peer_id.clone(), at: now_ms(), name }];
            list.extend(self.state.recent.iter().filter(|r| r.id != peer_id).cloned());
            list.truncate(RECENT_LIMIT);
            self.save_recent(list);
        }
        while !self.awaiting_relay() {
            let Some((text, received)) = self.deferred.pop_front() else { break };
            self.process(&text, received);
        }
    }
}
