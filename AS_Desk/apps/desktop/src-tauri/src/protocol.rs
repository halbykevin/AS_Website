//! Wire protocol v1, mirroring packages/protocol (Zod). Everything that crosses the network or the
//! web view boundary is parsed strictly and validated here before the agent acts on it.
use serde::{Deserialize, Serialize};

pub fn is_public_id(value: &str) -> bool {
    value.len() == 9 && value.as_bytes()[0] != b'0' && value.bytes().all(|b| b.is_ascii_digit())
}
pub fn is_uuid(value: &str) -> bool { uuid::Uuid::try_parse(value).is_ok() && value.len() == 36 }

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Capability { Screen, Mouse, Keyboard, Clipboard }

pub fn valid_capabilities(list: &[Capability]) -> bool {
    let unique = list.iter().enumerate().all(|(i, c)| !list[..i].contains(c));
    (1..=4).contains(&list.len()) && unique && list.contains(&Capability::Screen)
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionType { Direct, TurnUdp, TurnTcp, TurnTls }

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct IceCandidate {
    pub candidate: String,
    #[serde(rename = "sdpMid")]
    pub sdp_mid: Option<String>,
    #[serde(rename = "sdpMLineIndex")]
    pub sdp_m_line_index: Option<u32>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", deny_unknown_fields, rename_all_fields = "camelCase")]
pub enum ClientMessage {
    #[serde(rename = "connection.request")]
    ConnectionRequest { target_id: String, permissions: Vec<Capability> },
    #[serde(rename = "connection.accept")]
    ConnectionAccept { request_id: String, permissions: Vec<Capability> },
    #[serde(rename = "connection.reject")]
    ConnectionReject { request_id: String },
    #[serde(rename = "connection.cancel")]
    ConnectionCancel { request_id: String },
    #[serde(rename = "session.end")]
    SessionEnd { session_id: String },
    #[serde(rename = "session.connected")]
    SessionConnected { session_id: String, connection_type: ConnectionType },
    #[serde(rename = "webrtc.offer")]
    Offer { session_id: String, sdp: String, #[serde(default, skip_serializing_if = "Option::is_none")] signature: Option<String> },
    #[serde(rename = "webrtc.answer")]
    Answer { session_id: String, sdp: String, #[serde(default, skip_serializing_if = "Option::is_none")] signature: Option<String> },
    #[serde(rename = "webrtc.ice")]
    Ice { session_id: String, candidate: IceCandidate },
}

impl ClientMessage {
    pub fn session_id(&self) -> Option<&str> {
        match self {
            Self::SessionEnd { session_id } | Self::SessionConnected { session_id, .. } | Self::Offer { session_id, .. }
            | Self::Answer { session_id, .. } | Self::Ice { session_id, .. } => Some(session_id),
            _ => None,
        }
    }
    /// The same bounds the server enforces, so malformed input fails locally and early.
    pub fn validate(&self) -> Result<(), String> {
        let ok = match self {
            Self::ConnectionRequest { target_id, permissions } => is_public_id(target_id) && valid_capabilities(permissions),
            Self::ConnectionAccept { request_id, permissions } => is_uuid(request_id) && valid_capabilities(permissions),
            Self::ConnectionReject { request_id } | Self::ConnectionCancel { request_id } => is_uuid(request_id),
            Self::SessionEnd { session_id } | Self::SessionConnected { session_id, .. } => is_uuid(session_id),
            Self::Offer { session_id, sdp, signature } | Self::Answer { session_id, sdp, signature } =>
                is_uuid(session_id) && (1..=49152).contains(&sdp.len()) && signature.as_ref().is_none_or(|s| s.len() <= 128),
            Self::Ice { session_id, candidate } => is_uuid(session_id) && candidate.candidate.len() <= 2048
                && candidate.sdp_mid.as_ref().is_none_or(|m| m.len() <= 64) && candidate.sdp_m_line_index.is_none_or(|i| i <= 32),
        };
        if ok { Ok(()) } else { Err("Invalid message".into()) }
    }
}

/// Input events relayed from the controlling peer through the web view. Also serialized to the
/// elevated helper (elevation.rs), so it derives Serialize as well.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum InputEvent {
    Move { x: f64, y: f64 },
    Button { button: MouseButton, down: bool, #[serde(default)] x: Option<f64>, #[serde(default)] y: Option<f64> },
    Wheel { x: i32, y: i32 },
    Key { code: String, down: bool },
    Release,
    Clipboard { text: String },
}
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum MouseButton { Left, Right, Middle }

impl InputEvent {
    pub fn validate(&self) -> Result<(), String> {
        let unit = |v: f64| v.is_finite() && (0.0..=1.0).contains(&v);
        let ok = match self {
            Self::Move { x, y } => unit(*x) && unit(*y),
            Self::Button { x, y, .. } => x.is_none_or(unit) && y.is_none_or(unit),
            Self::Wheel { x, y } => x.abs() <= 1200 && y.abs() <= 1200,
            Self::Key { code, .. } => (1..=32).contains(&code.len()),
            Self::Release => true,
            Self::Clipboard { text } => text.encode_utf16().count() <= 65536,
        };
        if ok { Ok(()) } else { Err("Invalid input".into()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn messages_round_trip_in_wire_format() {
        let json = r#"{"type":"webrtc.ice","sessionId":"5f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11","candidate":{"candidate":"c","sdpMid":"0","sdpMLineIndex":0}}"#;
        let message: ClientMessage = serde_json::from_str(json).unwrap();
        assert!(message.validate().is_ok());
        assert_eq!(serde_json::to_string(&message).unwrap(), json);
        let request = ClientMessage::ConnectionRequest { target_id: "123456789".into(), permissions: vec![Capability::Screen, Capability::Mouse] };
        assert_eq!(serde_json::to_string(&request).unwrap(), r#"{"type":"connection.request","targetId":"123456789","permissions":["screen","mouse"]}"#);
    }
    #[test]
    fn rejects_unknown_fields_and_bad_values() {
        assert!(serde_json::from_str::<ClientMessage>(r#"{"type":"session.end","sessionId":"x","extra":1}"#).is_err());
        assert!(ClientMessage::SessionEnd { session_id: "x".into() }.validate().is_err());
        assert!(!valid_capabilities(&[Capability::Mouse]));
        assert!(!valid_capabilities(&[Capability::Screen, Capability::Screen]));
        assert!(!is_public_id("012345678") && !is_public_id("12345678") && is_public_id("123456789"));
    }
    #[test]
    fn input_boundary_constrains_positions_payloads_and_shape() {
        let parse = |s: &str| serde_json::from_str::<InputEvent>(s).map_err(|e| e.to_string()).and_then(|e| e.validate().map(|_| e));
        assert!(parse(r#"{"type":"move","x":1.1,"y":0}"#).is_err());
        assert!(parse(&format!(r#"{{"type":"clipboard","text":"{}"}}"#, "x".repeat(65537))).is_err());
        assert!(parse(r#"{"type":"key","code":"KeyA","down":true,"command":"shell"}"#).is_err());
        assert!(parse(r#"{"type":"button","button":"back","down":true}"#).is_err());
        assert_eq!(parse(r#"{"type":"release"}"#).unwrap(), InputEvent::Release);
    }
}
