//! The device identity and small per-user files in %APPDATA%\Company Remote (the product's former
//! name; kept so upgrades never move the identity) — the same folder
//! earlier (Electron) versions used, so an upgrade keeps the computer's ID.
use std::{fs, io, path::{Path, PathBuf}};

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::SigningKey;
use serde::{Deserialize, Serialize};

use crate::{platform, protocol::is_public_id, security};

pub struct Identity { pub device_id: String, pub server: String, pub signing_public_key: String, pub key: SigningKey }

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    device_id: String,
    server: String,
    signing_public_key: String,
    /// The 32-byte Ed25519 seed, protected with DPAPI for this Windows user.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    protected_key: Option<String>,
    /// Earlier versions: a PKCS#8 PEM encrypted with Electron safeStorage (Chromium os_crypt).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    encrypted_key: Option<String>,
}

pub(crate) fn write_atomic(dir: &Path, name: &str, data: &[u8]) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    let temp = dir.join(format!("{name}.tmp"));
    fs::write(&temp, data)?;
    fs::rename(temp, dir.join(name))
}

pub fn save(dir: &Path, identity: &Identity) -> Result<(), String> {
    let protected = platform::protect(identity.key.as_bytes())?;
    let stored = Stored { device_id: identity.device_id.clone(), server: identity.server.clone(), signing_public_key: identity.signing_public_key.clone(),
        protected_key: Some(STANDARD.encode(protected)), encrypted_key: None };
    write_atomic(dir, "identity.json", &serde_json::to_vec(&stored).unwrap()).map_err(|e| format!("Cannot save this computer's identity: {e}"))
}

/// `Ok(None)` when this computer has not been set up yet. `legacy` lists folders an earlier version
/// may have left an identity in; the first one found is adopted when `dir` has none.
pub fn load(dir: &Path, legacy: &[PathBuf]) -> Result<Option<Identity>, String> {
    adopt_legacy(dir, legacy);
    let bytes = match fs::read(dir.join("identity.json")) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };
    let stored: Stored = serde_json::from_slice(&bytes).map_err(|_| "Stored identity is damaged")?;
    if !is_public_id(&stored.device_id) { return Err("Stored identity is damaged".into()); }
    security::parse_spki(&stored.signing_public_key)?;
    let server = security::server_url(&stored.server)?;
    let (key, migrated) = if let Some(protected) = &stored.protected_key {
        let seed = platform::unprotect(&STANDARD.decode(protected).map_err(|_| "Stored identity is damaged")?)?;
        (SigningKey::from_bytes(seed.as_slice().try_into().map_err(|_| "Stored identity is damaged")?), false)
    } else if let Some(encrypted) = &stored.encrypted_key {
        (decrypt_electron(dir, encrypted)?, true)
    } else { return Err("Stored identity is damaged".into()) };
    let identity = Identity { device_id: stored.device_id, server, signing_public_key: stored.signing_public_key, key };
    if migrated {
        // The original stays next to the new file (with "Local State", which can decrypt it), so the
        // previous version's identity is never lost; only Chromium caches are removed.
        fs::copy(dir.join("identity.json"), dir.join("identity.electron.json")).map_err(|e| format!("Cannot keep a copy of the previous identity: {e}"))?;
        save(dir, &identity)?;
        remove_electron_leftovers(dir);
    }
    Ok(Some(identity))
}

/// Chromium os_crypt v10: AES-256-GCM with a key that "Local State" holds under DPAPI.
fn decrypt_electron(dir: &Path, encrypted: &str) -> Result<SigningKey, String> {
    let damaged = || "The identity from the previous version could not be opened. Contact your administrator.".to_string();
    let state: serde_json::Value = serde_json::from_slice(&fs::read(dir.join("Local State")).map_err(|_| damaged())?).map_err(|_| damaged())?;
    let wrapped = STANDARD.decode(state["os_crypt"]["encrypted_key"].as_str().ok_or_else(damaged)?).map_err(|_| damaged())?;
    let aes_key = platform::unprotect_legacy(wrapped.strip_prefix(b"DPAPI").ok_or_else(damaged)?)?;
    let blob = STANDARD.decode(encrypted).map_err(|_| damaged())?;
    let body = blob.strip_prefix(b"v10").filter(|b| b.len() > 12 + 16).ok_or_else(damaged)?;
    let cipher = Aes256Gcm::new_from_slice(&aes_key).map_err(|_| damaged())?;
    let pem = cipher.decrypt(Nonce::from_slice(&body[..12]), &body[12..]).map_err(|_| damaged())?;
    security::parse_pkcs8_pem(std::str::from_utf8(&pem).map_err(|_| damaged())?)
}

// Chromium caches the Electron runtime left in the data folder; none of it is used any more.
// "Local State" is kept: it holds the key that decrypts identity.electron.json.
const ELECTRON_LEFTOVERS: &[&str] = &["Cache", "Code Cache", "DIPS", "DIPS-wal", "DawnGraphiteCache", "DawnWebGPUCache", "DevToolsActivePort",
    "GPUCache", "GPUPersistentCache", "GrShaderCache", "Local Storage", "Network", "Preferences", "Session Storage", "ShaderCache",
    "Shared Dictionary", "SharedStorage", "blob_storage", "Crashpad", "Dictionaries", "Trust Tokens", "Trust Tokens-journal",
    "declarative_performance_observer.db", "declarative_performance_observer.db-journal"];
fn remove_electron_leftovers(dir: &Path) {
    for name in ELECTRON_LEFTOVERS {
        let path = dir.join(name);
        let _ = if path.is_dir() { fs::remove_dir_all(&path) } else { fs::remove_file(&path) };
    }
}

/// Earlier versions kept their identity in %APPDATA%\ASDesk (0.5) or in a copy the installer makes
/// before removing the old version. Adopt it (with its encryption key and history) once. The source
/// is only copied, never deleted: it is renamed to identity.adopted.json so it is not adopted twice.
fn adopt_legacy(dir: &Path, legacy: &[PathBuf]) {
    if dir.join("identity.json").exists() { return; }
    let Some(source) = legacy.iter().find(|d| d.as_path() != dir && d.join("identity.json").exists()) else { return };
    let _ = fs::create_dir_all(dir);
    for name in ["identity.json", "Local State", "recent.json", "settings.json"] {
        let _ = fs::copy(source.join(name), dir.join(name));
    }
    let adopted = fs::read(dir.join("identity.json")).ok().and_then(|b| serde_json::from_slice::<Stored>(&b).ok()).is_some();
    if adopted { let _ = fs::rename(source.join("identity.json"), source.join("identity.adopted.json")); }
}

// ── Recent connections and settings ───────────────────────────────────────────────────────────
/// A computer this one has controlled. `name` is the user's own label for it, kept only on this computer.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Recent { pub id: String, pub at: i64, #[serde(default, skip_serializing_if = "Option::is_none")] pub name: Option<String> }
pub const RECENT_LIMIT: usize = 12;
pub const RECENT_NAME_MAX: usize = 40;

/// A label as the user typed it, made safe to store and show: one line, trimmed, at most
/// RECENT_NAME_MAX characters. Empty means no label.
pub fn clean_recent_name(name: &str) -> Option<String> {
    let flat: String = name.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let name: String = flat.split_whitespace().collect::<Vec<_>>().join(" ").chars().take(RECENT_NAME_MAX).collect();
    let name = name.trim_end().to_owned();
    (!name.is_empty()).then_some(name)
}

pub fn load_recent(dir: &Path) -> Vec<Recent> {
    let list: Vec<Recent> = fs::read(dir.join("recent.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    list.into_iter().filter(|r| is_public_id(&r.id)).take(RECENT_LIMIT).collect()
}
pub fn save_recent(dir: &Path, list: &[Recent]) { let _ = write_atomic(dir, "recent.json", &serde_json::to_vec(list).unwrap()); }

#[derive(Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings { #[serde(default)] pub auto_start_configured: bool }
pub fn load_settings(dir: &Path) -> Settings { fs::read(dir.join("settings.json")).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default() }
pub fn save_settings(dir: &Path, settings: &Settings) { let _ = write_atomic(dir, "settings.json", &serde_json::to_vec(settings).unwrap()); }

pub fn data_dir(roaming: PathBuf) -> PathBuf { roaming.join("Company Remote") }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_round_trips_through_dpapi() {
        let dir = std::env::temp_dir().join(format!("company-remote-test-{}", uuid::Uuid::new_v4()));
        let key = SigningKey::from_bytes(&[7; 32]);
        let identity = Identity { device_id: "123456789".into(), server: "https://remote.example.com".into(),
            signing_public_key: security::public_key_spki(&SigningKey::from_bytes(&[8; 32]).verifying_key()), key };
        save(&dir, &identity).unwrap();
        let loaded = load(&dir, &[]).unwrap().unwrap();
        assert_eq!(loaded.key.to_bytes(), [7; 32]);
        assert_eq!(loaded.device_id, "123456789");
        assert!(!String::from_utf8(fs::read(dir.join("identity.json")).unwrap()).unwrap().contains(&STANDARD.encode([7u8; 32])));
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn adopting_a_legacy_identity_never_deletes_it() {
        let root = std::env::temp_dir().join(format!("company-remote-test-{}", uuid::Uuid::new_v4()));
        let (dir, legacy) = (root.join("current"), root.join("legacy"));
        let identity = Identity { device_id: "987654321".into(), server: "https://remote.example.com".into(),
            signing_public_key: security::public_key_spki(&SigningKey::from_bytes(&[8; 32]).verifying_key()), key: SigningKey::from_bytes(&[9; 32]) };
        save(&legacy, &identity).unwrap();
        assert_eq!(load(&dir, std::slice::from_ref(&legacy)).unwrap().unwrap().device_id, "987654321");
        assert!(legacy.join("identity.adopted.json").exists() && !legacy.join("identity.json").exists());
        assert_eq!(load(&dir, &[legacy]).unwrap().unwrap().key.to_bytes(), [9; 32]);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn recent_names_are_one_trimmed_line() {
        assert_eq!(clean_recent_name("  Mum's	laptop 
"), Some("Mum's laptop".into()));
        assert_eq!(clean_recent_name("   "), None);
        assert_eq!(clean_recent_name(&"x".repeat(60)).unwrap().chars().count(), RECENT_NAME_MAX);
        assert_eq!(clean_recent_name("Büro-PC 🖥"), Some("Büro-PC 🖥".into()));
    }
    #[test]
    fn recent_lists_without_names_still_load_and_names_round_trip() {
        let dir = std::env::temp_dir().join(format!("company-remote-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("recent.json"), r#"[{"id":"123456789","at":1}]"#).unwrap();
        assert_eq!(load_recent(&dir), vec![Recent { id: "123456789".into(), at: 1, name: None }]);
        save_recent(&dir, &[Recent { id: "123456789".into(), at: 2, name: Some("Office".into()) }]);
        assert_eq!(load_recent(&dir)[0].name.as_deref(), Some("Office"));
        fs::remove_dir_all(dir).unwrap();
    }
}
