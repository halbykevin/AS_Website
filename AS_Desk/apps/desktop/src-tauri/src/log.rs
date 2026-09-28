//! A small local diagnostics log (asdesk.log in the data folder; the tray's "Show log file" opens
//! it) so a failure on someone's computer can be understood. Errors and connection events only:
//! never keys, tokens, clipboard text or session descriptions.
use std::{fs::{self, OpenOptions}, io::Write, path::{Path, PathBuf}, sync::{Mutex, OnceLock}, time::{SystemTime, UNIX_EPOCH}};

static FILE: OnceLock<Mutex<PathBuf>> = OnceLock::new();
const LIMIT: u64 = 1 << 20;

pub fn init(dir: &Path) {
    let _ = fs::create_dir_all(dir);
    let path = dir.join("asdesk.log");
    // One previous log is kept, so the file never grows without bound.
    if fs::metadata(&path).is_ok_and(|m| m.len() > LIMIT) { let _ = fs::rename(&path, dir.join("asdesk.old.log")); }
    let _ = FILE.set(Mutex::new(path));
}
pub fn path() -> Option<PathBuf> { FILE.get().map(|f| f.lock().unwrap().clone()) }

pub fn write(message: impl AsRef<str>) {
    let line = format!("{} {}\n", timestamp(), message.as_ref().replace(['\r', '\n'], " "));
    if cfg!(debug_assertions) { eprint!("{line}"); }
    let Some(file) = FILE.get() else { return };
    let path = file.lock().unwrap();
    if let Ok(mut out) = OpenOptions::new().create(true).append(true).open(&*path) { let _ = out.write_all(line.as_bytes()); }
}

/// UTC, ISO 8601 (civil-from-days, H. Hinnant), without pulling in a date library.
fn timestamp() -> String {
    let millis = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0);
    let (days, rest) = (millis.div_euclid(86_400_000), millis.rem_euclid(86_400_000));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z", rest / 3_600_000, rest / 60_000 % 60, rest / 1000 % 60, rest % 1000)
}

#[cfg(test)]
mod tests {
    #[test]
    fn timestamps_are_iso_8601() {
        let t = super::timestamp();
        assert_eq!(t.len(), 24);
        assert!(t.starts_with("20") && t.ends_with('Z') && &t[10..11] == "T");
    }
}
