//! Unattended access, the way AnyDesk does it: a password set on the computer you want to reach
//! lets an authorised controller in without anyone there clicking Accept. The whole point is that
//! there is nobody at the keyboard, so the security has to stand on its own:
//!
//! - The password is never stored and never sent. The target keeps only an **Argon2id verifier**
//!   (a slow salted hash), DPAPI-protected for this Windows user, in `unattended.json`.
//! - Proof of the password travels peer-to-peer through the rendezvous as an opaque blob (the server
//!   relays it, see services/control-api/src/rendezvous.ts, but cannot read it): the target sends a
//!   fresh **challenge** (random nonce + the verifier's salt/params), the controller derives the same
//!   key from the typed password and answers with `HMAC-SHA256(key, transcript)`. The transcript binds
//!   both device IDs, the request ID and the nonce, so a captured proof cannot be replayed to another
//!   computer, another request or a second time.
//! - The verifier itself is the HMAC key, so the target never has to hold the password to check a
//!   proof, and a stolen `unattended.json` still needs the password brute-forced through Argon2id.
//!
//! The controller may optionally **remember** the password for a computer (`remembered.json`, also
//! DPAPI-protected) so later connections are one click, which is what "save the password" means here.
use std::{collections::BTreeMap, fs, path::Path};

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD, Engine};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use zeroize::Zeroizing;

use crate::{platform, protocol::is_public_id};

/// Shortest password we let someone set for unattended access. Low enough not to annoy, high enough
/// that the Argon2id cost below makes offline guessing impractical for anything but the weakest.
pub const MIN_PASSWORD_LEN: usize = 8;
const DOMAIN: &str = "asdesk:unattended:v1";
const HASH_LEN: usize = 32;

type HmacSha256 = Hmac<Sha256>;

/// The target's stored secret: enough to check a proof, never enough to recover the password.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Verifier {
    /// base64 random salt (16 bytes).
    salt: String,
    /// base64 Argon2id output over (password, salt) — also the HMAC key used to check proofs.
    hash: String,
    /// Argon2id cost, as sent to the controller so it derives an identical key: "m=..,t=..,p=..".
    params: String,
}

fn argon2(params: &Params) -> Argon2<'static> { Argon2::new(Algorithm::Argon2id, Version::V0x13, params.clone()) }
fn default_params() -> Params { Params::new(19_456, 2, 1, Some(HASH_LEN)).expect("valid Argon2 params") }
fn format_params(p: &Params) -> String { format!("m={},t={},p={}", p.m_cost(), p.t_cost(), p.p_cost()) }
fn parse_params(text: &str) -> Option<Params> {
    let (mut m, mut t, mut p) = (None, None, None);
    for part in text.split(',') {
        let (key, value) = part.split_once('=')?;
        let value: u32 = value.parse().ok()?;
        match key { "m" => m = Some(value), "t" => t = Some(value), "p" => p = Some(value), _ => return None }
    }
    Params::new(m?, t?, p?, Some(HASH_LEN)).ok()
}

/// The bytes a proof is computed over: nobody but the two named computers, for this one request and
/// nonce, can produce or reuse it. `\0` separates the fields so they cannot run together ambiguously.
fn transcript(controller_id: &str, target_id: &str, request_id: &str, nonce: &str) -> Vec<u8> {
    [DOMAIN, controller_id, target_id, request_id, nonce].join("\0").into_bytes()
}

impl Verifier {
    /// Derives a fresh verifier from a password. Rejects passwords that are too short.
    pub fn create(password: &str) -> Result<Verifier, String> {
        if password.chars().count() < MIN_PASSWORD_LEN {
            return Err(format!("Use a password of at least {MIN_PASSWORD_LEN} characters."));
        }
        let mut salt = [0u8; 16];
        getrandom::fill(&mut salt).map_err(|_| "Cannot generate a salt")?;
        let params = default_params();
        let mut hash = Zeroizing::new([0u8; HASH_LEN]);
        argon2(&params).hash_password_into(password.as_bytes(), &salt, &mut *hash).map_err(|_| "Cannot hash the password")?;
        Ok(Verifier { salt: STANDARD.encode(salt), hash: STANDARD.encode(&*hash), params: format_params(&params) })
    }
    pub fn salt(&self) -> &str { &self.salt }
    pub fn params(&self) -> &str { &self.params }
    /// Checks a controller's proof in constant time against this verifier's key.
    pub fn verify(&self, controller_id: &str, target_id: &str, request_id: &str, nonce: &str, proof: &str) -> bool {
        let (Ok(key), Ok(proof)) = (STANDARD.decode(&self.hash), STANDARD.decode(proof)) else { return false };
        let Ok(mut mac) = HmacSha256::new_from_slice(&key) else { return false };
        mac.update(&transcript(controller_id, target_id, request_id, nonce));
        mac.verify_slice(&proof).is_ok()
    }
}

/// A fresh challenge nonce (base64, 32 bytes). Each incoming unattended request gets its own.
pub fn nonce() -> Result<String, String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|_| "Cannot generate a nonce")?;
    Ok(STANDARD.encode(bytes))
}

/// The controller side: derive the same key from the typed password and the challenge's salt/params,
/// then answer the transcript. Returns None if the challenge is malformed.
pub fn prove(password: &str, salt: &str, params: &str, controller_id: &str, target_id: &str, request_id: &str, nonce: &str) -> Option<String> {
    let salt = STANDARD.decode(salt).ok()?;
    let params = parse_params(params)?;
    let mut key = Zeroizing::new([0u8; HASH_LEN]);
    argon2(&params).hash_password_into(password.as_bytes(), &salt, &mut *key).ok()?;
    let mut mac = HmacSha256::new_from_slice(&*key).ok()?;
    mac.update(&transcript(controller_id, target_id, request_id, nonce));
    Some(STANDARD.encode(mac.finalize().into_bytes()))
}

// ── Target-side storage: the verifier, DPAPI-protected for this Windows user ─────────────────────
fn verifier_path(dir: &Path) -> std::path::PathBuf { dir.join("unattended.json") }

pub fn load(dir: &Path) -> Option<Verifier> {
    let protected = fs::read(verifier_path(dir)).ok()?;
    let json = platform::unprotect(&protected).ok()?;
    serde_json::from_slice(&json).ok()
}
pub fn save(dir: &Path, verifier: &Verifier) -> Result<(), String> {
    let json = serde_json::to_vec(verifier).map_err(|_| "Cannot serialize the verifier")?;
    let protected = platform::protect(&json)?;
    crate::identity::write_atomic(dir, "unattended.json", &protected).map_err(|e| format!("Cannot save the unattended password: {e}"))
}
pub fn clear(dir: &Path) { let _ = fs::remove_file(verifier_path(dir)); }

// ── Controller-side storage: passwords the user chose to remember, per computer ──────────────────
fn remembered_path(dir: &Path) -> std::path::PathBuf { dir.join("remembered.json") }

fn read_remembered(dir: &Path) -> BTreeMap<String, String> {
    (|| {
        let protected = fs::read(remembered_path(dir)).ok()?;
        let json = platform::unprotect(&protected).ok()?;
        serde_json::from_slice::<BTreeMap<String, String>>(&json).ok()
    })().unwrap_or_default()
}
fn write_remembered(dir: &Path, map: &BTreeMap<String, String>) {
    let Ok(json) = serde_json::to_vec(map) else { return };
    if let Ok(protected) = platform::protect(&json) {
        let _ = crate::identity::write_atomic(dir, "remembered.json", &protected);
    }
}
/// The remembered password for a computer, if any. Returned zeroizing so it is not left in memory.
pub fn remembered(dir: &Path, target: &str) -> Option<Zeroizing<String>> {
    read_remembered(dir).remove(target).map(Zeroizing::new)
}
pub fn remember(dir: &Path, target: &str, password: &str) {
    if !is_public_id(target) { return; }
    let mut map = read_remembered(dir);
    map.insert(target.to_string(), password.to_string());
    write_remembered(dir, &map);
}
pub fn forget(dir: &Path, target: &str) {
    let mut map = read_remembered(dir);
    if map.remove(target).is_some() { write_remembered(dir, &map); }
}

#[cfg(test)]
mod tests {
    use super::*;
    const C: &str = "111111111";
    const T: &str = "222222222";
    const R: &str = "5f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11";

    // Keep the tests fast: a tiny Argon2 cost, so CI does not grind.
    fn weak(password: &str) -> Verifier {
        let params = Params::new(32, 1, 1, Some(HASH_LEN)).unwrap();
        let mut hash = [0u8; HASH_LEN];
        let mut salt = [0u8; 16];
        getrandom::fill(&mut salt).unwrap();
        argon2(&params).hash_password_into(password.as_bytes(), &salt, &mut hash).unwrap();
        Verifier { salt: STANDARD.encode(salt), hash: STANDARD.encode(hash), params: format_params(&params) }
    }

    #[test]
    fn right_password_proves_and_wrong_one_does_not() {
        let v = weak("correct horse");
        let proof = prove("correct horse", v.salt(), v.params(), C, T, R, "nonce-a").unwrap();
        assert!(v.verify(C, T, R, "nonce-a", &proof));
        let wrong = prove("Correct Horse", v.salt(), v.params(), C, T, R, "nonce-a").unwrap();
        assert!(!v.verify(C, T, R, "nonce-a", &wrong));
    }

    #[test]
    fn a_proof_is_bound_to_the_computers_request_and_nonce() {
        let v = weak("correct horse");
        let proof = prove("correct horse", v.salt(), v.params(), C, T, R, "nonce-a").unwrap();
        assert!(!v.verify(C, T, R, "nonce-b", &proof), "replay with a new nonce");
        assert!(!v.verify("999999999", T, R, "nonce-a", &proof), "replay to another controller");
        assert!(!v.verify(C, "999999999", R, "nonce-a", &proof), "replay to another target");
        assert!(!v.verify(C, T, "6f0a4a4e-2f5b-4bb4-9d7c-0f4f7b9b8f11", "nonce-a", &proof), "replay to another request");
        assert!(!v.verify(C, T, R, "nonce-a", "not base64 @@@"));
    }

    #[test]
    fn params_round_trip_and_short_passwords_are_refused() {
        assert_eq!(parse_params(&format_params(&default_params())).unwrap().m_cost(), 19_456);
        assert!(parse_params("m=1,t=1").is_none() && parse_params("x=1,t=1,p=1").is_none());
        assert!(Verifier::create("short").is_err());
        assert!(Verifier::create("longenough").is_ok());
    }
}
