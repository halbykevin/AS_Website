//! Session grants, signed session descriptions and key encodings. Byte-compatible with the server
//! (services/control-api/src/auth.ts) and with earlier desktop versions, so mixed versions interoperate.
use base64::{engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD}, Engine};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::Deserialize;

use crate::protocol::{is_public_id, is_uuid, valid_capabilities, Capability};

// DER prefixes of an Ed25519 SubjectPublicKeyInfo and PKCS#8 private key (RFC 8410).
const SPKI_PREFIX: [u8; 12] = [0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00];
const PKCS8_PREFIX: [u8; 16] = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

pub fn public_key_spki(key: &VerifyingKey) -> String {
    STANDARD.encode([SPKI_PREFIX.as_slice(), key.as_bytes()].concat())
}
pub fn parse_spki(encoded: &str) -> Result<VerifyingKey, String> {
    let der = STANDARD.decode(encoded).map_err(|_| "Invalid public key")?;
    if der.len() != 44 || der[..12] != SPKI_PREFIX { return Err("Invalid public key".into()); }
    VerifyingKey::from_bytes(der[12..].try_into().unwrap()).map_err(|_| "Invalid public key".into())
}
/// Reads the PKCS#8 PEM that earlier (Electron) versions stored.
pub fn parse_pkcs8_pem(pem: &str) -> Result<SigningKey, String> {
    let body: String = pem.lines().filter(|l| !l.starts_with("-----")).collect();
    let der = STANDARD.decode(body.trim()).map_err(|_| "Invalid private key")?;
    if der.len() != 48 || der[..16] != PKCS8_PREFIX { return Err("Invalid private key".into()); }
    Ok(SigningKey::from_bytes(der[16..].try_into().unwrap()))
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Claims {
    pub iss: String,
    pub aud: String,
    pub session_id: String,
    pub controller_device_id: String,
    pub target_device_id: String,
    pub controller_public_key: String,
    pub target_public_key: String,
    pub capabilities: Vec<Capability>,
    pub exp: i64,
    pub iat: i64,
    pub nonce: String,
}

pub fn verify_grant(grant: &str, server_key: &str, device_id: &str, now_ms: i64) -> Result<Claims, String> {
    let (data, signature) = grant.split_once('.').ok_or("Invalid session grant")?;
    if data.is_empty() || signature.is_empty() || signature.contains('.') || data.len() > 8192 { return Err("Invalid session grant".into()); }
    let signature = URL_SAFE_NO_PAD.decode(signature).ok().and_then(|s| Signature::from_slice(&s).ok()).ok_or("Session signature invalid")?;
    parse_spki(server_key)?.verify_strict(data.as_bytes(), &signature).map_err(|_| "Session signature invalid")?;
    let claims: Claims = URL_SAFE_NO_PAD.decode(data).ok().and_then(|b| serde_json::from_slice(&b).ok()).ok_or("Invalid session grant")?;
    let valid = claims.iss == "company-remote" && claims.aud == "company-remote-agent" && is_uuid(&claims.session_id) && is_uuid(&claims.nonce)
        && is_public_id(&claims.controller_device_id) && is_public_id(&claims.target_device_id) && valid_capabilities(&claims.capabilities)
        && parse_spki(&claims.controller_public_key).is_ok() && parse_spki(&claims.target_public_key).is_ok();
    if !valid { return Err("Invalid session grant".into()); }
    if claims.exp * 1000 <= now_ms || claims.iat * 1000 > now_ms + 30000 || claims.exp - claims.iat > 120 || claims.exp <= claims.iat {
        return Err("Session grant expired or invalid".into());
    }
    if claims.controller_device_id != device_id && claims.target_device_id != device_id { return Err("Session is for another device".into()); }
    Ok(claims)
}

// JSON.stringify(['company-remote:sdp:v1', sessionId, role, sdp]); serde_json escapes identically.
fn signed_description(session_id: &str, role: &str, sdp: &str) -> Vec<u8> {
    serde_json::to_vec(&["company-remote:sdp:v1", session_id, role, sdp]).expect("strings serialize")
}
pub fn sign_description(session_id: &str, role: &str, sdp: &str, key: &SigningKey) -> String {
    STANDARD.encode(key.sign(&signed_description(session_id, role, sdp)).to_bytes())
}
pub fn verify_description(session_id: &str, role: &str, sdp: &str, signature: Option<&str>, public_key: &str) -> Result<(), String> {
    let signature = signature.filter(|_| sdp.contains("a=fingerprint:sha-256 ")).ok_or("Unsigned peer transport")?;
    let signature = STANDARD.decode(signature).ok().and_then(|s| Signature::from_slice(&s).ok()).ok_or("Peer transport signature invalid")?;
    parse_spki(public_key)?.verify_strict(&signed_description(session_id, role, sdp), &signature).map_err(|_| "Peer transport signature invalid".into())
}

/// The server origin: HTTPS, or HTTP on loopback for development. No path, query or credentials.
pub fn server_url(value: &str) -> Result<String, String> {
    let url = tauri::Url::parse(value.trim()).map_err(|_| "Enter a valid server address")?;
    if !url.username().is_empty() || url.password().is_some() || url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        return Err("Use the server origin without a path or credentials".into());
    }
    let loopback = matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"));
    if url.scheme() != "https" && !(url.scheme() == "http" && loopback) { return Err("HTTPS is required".into()); }
    Ok(url.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn key(seed: u8) -> SigningKey { SigningKey::from_bytes(&[seed; 32]) }
    fn grant(server: &SigningKey, claims: serde_json::Value) -> String {
        let data = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        format!("{data}.{}", URL_SAFE_NO_PAD.encode(server.sign(data.as_bytes()).to_bytes()))
    }
    #[test]
    fn verifies_grant_participants_signature_and_expiry() {
        let server = key(1); let peer = public_key_spki(&key(2).verifying_key());
        let now = 1_800_000_000i64;
        let token = grant(&server, serde_json::json!({ "iss": "company-remote", "aud": "company-remote-agent",
            "sessionId": "5f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11", "controllerDeviceId": "111111111", "targetDeviceId": "222222222",
            "controllerPublicKey": peer, "targetPublicKey": peer, "capabilities": ["screen"], "iat": now, "exp": now + 60,
            "nonce": "6f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11" }));
        let server_key = public_key_spki(&server.verifying_key());
        assert_eq!(verify_grant(&token, &server_key, "111111111", now * 1000).unwrap().target_device_id, "222222222");
        assert!(verify_grant(&token, &server_key, "333333333", now * 1000).is_err());
        assert!(verify_grant(&token, &server_key, "111111111", (now + 61) * 1000).is_err());
        let (data, signature) = token.split_once('.').unwrap();
        assert!(verify_grant(&format!("{data}a.{signature}"), &server_key, "111111111", now * 1000).is_err());
        assert!(verify_grant(&token, &public_key_spki(&key(3).verifying_key()), "111111111", now * 1000).is_err());
    }
    #[test]
    fn peer_signatures_bind_fingerprint_role_and_session() {
        let peer = key(4); let public = public_key_spki(&peer.verifying_key());
        let session = "5f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11"; let sdp = "v=0\r\na=fingerprint:sha-256 A1:B2\r\n";
        let signature = sign_description(session, "controller", sdp, &peer);
        assert!(verify_description(session, "controller", sdp, Some(&signature), &public).is_ok());
        assert!(verify_description("6f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11", "controller", sdp, Some(&signature), &public).is_err());
        assert!(verify_description(session, "target", sdp, Some(&signature), &public).is_err());
        assert!(verify_description(session, "controller", &sdp.replace("A1", "FF"), Some(&signature), &public).is_err());
        assert!(verify_description(session, "controller", sdp, None, &public).is_err());
    }
    #[test]
    fn description_encoding_matches_json_stringify() {
        // JSON.stringify(['company-remote:sdp:v1', 's', 'controller', 'a"\\\r\n\u0001/é'])
        assert_eq!(String::from_utf8(signed_description("s", "controller", "a\"\\\r\n\u{1}/é")).unwrap(),
            r#"["company-remote:sdp:v1","s","controller","a\"\\\r\n\u0001/é"]"#);
    }
    #[test]
    fn server_configuration_requires_tls_outside_loopback() {
        assert_eq!(server_url("http://127.0.0.1:3000").unwrap(), "http://127.0.0.1:3000");
        assert_eq!(server_url("https://remote.example.com").unwrap(), "https://remote.example.com");
        for url in ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "file:///tmp/a"] { assert!(server_url(url).is_err(), "{url}"); }
    }
    #[test]
    fn interoperates_with_the_server_and_earlier_desktop_versions() {
        // fixtures.json comes from the real server code (Grants in services/control-api/src/auth.ts)
        // and the Electron desktop's signing, so any encoding drift fails here.
        let f: serde_json::Value = serde_json::from_str(include_str!("fixtures.json")).unwrap();
        let s = |k: &str| f[k].as_str().unwrap();
        let claims = verify_grant(s("grant"), s("serverKey"), "222222222", f["iat"].as_i64().unwrap() * 1000).unwrap();
        assert_eq!(claims.capabilities, vec![Capability::Screen, Capability::Mouse]);
        verify_description("5f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11", "target", s("sdp"), Some(s("signature")), s("peerKey")).unwrap();
        let key = parse_pkcs8_pem(s("pem")).unwrap();
        assert_eq!(public_key_spki(&key.verifying_key()), s("peerKey"));
        assert_eq!(sign_description("5f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11", "target", s("sdp"), &key), s("signature"));
    }
    #[test]
    fn key_encodings_round_trip() {
        let signing = key(5);
        assert_eq!(parse_spki(&public_key_spki(&signing.verifying_key())).unwrap(), signing.verifying_key());
        let pem = format!("-----BEGIN PRIVATE KEY-----\n{}\n-----END PRIVATE KEY-----\n", STANDARD.encode([PKCS8_PREFIX.as_slice(), &[5u8; 32]].concat()));
        assert_eq!(parse_pkcs8_pem(&pem).unwrap().to_bytes(), signing.to_bytes());
    }
}
