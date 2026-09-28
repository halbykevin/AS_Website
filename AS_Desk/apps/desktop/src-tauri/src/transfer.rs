//! Clipboard file transfer (controller → shared computer). When the technician copies files, the web
//! view streams them over an ordered data channel by index — the real paths never cross the boundary,
//! so the page can only stream what the user actually copied — and the shared computer writes them
//! under a per-transfer folder and puts them on its clipboard, so Ctrl+V drops the real files. Text
//! clipboard sync lives in platform.rs; this is the file half, and it mirrors AnyDesk/RustDesk.
use std::{collections::HashSet, fs, io::{Read, Seek, SeekFrom, Write}, path::PathBuf, time::UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Bounds a single transfer, so a peer cannot fill the disk or open unbounded handles.
pub const MAX_FILES: usize = 256;
pub const MAX_TOTAL: u64 = 2 * 1024 * 1024 * 1024; // 2 GiB
pub const MAX_CHUNK: usize = 64 * 1024;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FileInfo { pub name: String, pub size: u64 }

/// What the web view learns about the copied files: names and sizes only, plus a fingerprint that
/// changes whenever the clipboard selection does, so the sender streams a file set at most once.
#[derive(Serialize, Clone, Debug)]
pub struct Snapshot { pub fingerprint: String, pub files: Vec<FileInfo> }

/// The controller's copied files, captured from its clipboard. Paths stay here; callers read by index.
pub struct SendState { pub fingerprint: String, paths: Vec<PathBuf>, sizes: Vec<u64> }

impl SendState {
    /// Reads one bounded chunk of the copied file at `index`. Never reads past the size announced in
    /// the snapshot, so a shrinking file cannot desynchronise the receiver.
    pub fn read(&self, index: usize, offset: u64, len: usize) -> Result<Vec<u8>, String> {
        if len > MAX_CHUNK { return Err("Chunk too large".into()); }
        let path = self.paths.get(index).ok_or("No such file")?;
        let size = self.sizes[index];
        if offset >= size { return Ok(Vec::new()); }
        let take = len.min((size - offset) as usize);
        let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
        file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
        let mut buf = vec![0u8; take];
        let mut read = 0;
        while read < take {
            match file.read(&mut buf[read..]) { Ok(0) => break, Ok(n) => read += n, Err(e) => return Err(e.to_string()) }
        }
        buf.truncate(read);
        Ok(buf)
    }
}

/// Builds a snapshot from the clipboard's file list. Directories and unreadable entries are skipped
/// (whole folder trees are a later addition). Returns None when the clipboard holds no files.
pub fn capture(paths: Vec<PathBuf>) -> Option<(Snapshot, SendState)> {
    let (mut files, mut keep, mut sizes, mut fp) = (Vec::new(), Vec::new(), Vec::new(), String::new());
    for path in paths {
        let Ok(meta) = fs::metadata(&path) else { continue };
        if !meta.is_file() { continue; }
        let Some(name) = path.file_name().map(|n| n.to_string_lossy().to_string()).filter(|n| !n.is_empty()) else { continue };
        let modified = meta.modified().ok().and_then(|m| m.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
        fp.push_str(&format!("{}|{}|{};", path.to_string_lossy(), meta.len(), modified));
        files.push(FileInfo { name, size: meta.len() });
        sizes.push(meta.len());
        keep.push(path);
        if files.len() >= MAX_FILES { break; }
    }
    if files.is_empty() { return None; }
    let fingerprint = format!("{:016x}", fnv1a(fp.as_bytes()));
    Some((Snapshot { fingerprint: fingerprint.clone(), files }, SendState { fingerprint, paths: keep, sizes }))
}

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf29ce484222325u64, |hash, b| (hash ^ *b as u64).wrapping_mul(0x100000001b3))
}

/// Reduces a received name to a plain file name that cannot escape the transfer folder.
pub fn sanitize(name: &str) -> Option<String> {
    let base = name.rsplit(['/', '\\']).next().unwrap_or(name).trim().trim_end_matches('.');
    if base.is_empty() || base == "." || base == ".." || base.contains(':') || base.len() > 255 { return None; }
    // Characters CreateFile rejects, and control characters: drop the file rather than guess a name.
    if base.chars().any(|c| matches!(c, '<' | '>' | '"' | '|' | '?' | '*') || (c as u32) < 0x20) { return None; }
    Some(base.to_string())
}

fn split_ext(name: &str) -> (&str, &str) {
    match name.rfind('.') { Some(i) if i > 0 => name.split_at(i), _ => (name, "") }
}

/// Files arriving at the shared computer for one transfer.
pub struct RecvState {
    pub id: String,
    dir: PathBuf,
    files: Vec<FileInfo>,
    names: Vec<String>,
    written: Vec<PathBuf>,
    current: Option<fs::File>,
    index: Option<usize>,
    received: u64,
}

impl RecvState {
    /// Validates the manifest, resolves safe unique names and creates the transfer folder.
    pub fn begin(dir: PathBuf, id: &str, files: Vec<FileInfo>) -> Result<Self, String> {
        if files.is_empty() || files.len() > MAX_FILES { return Err("Invalid file list".into()); }
        if files.iter().map(|f| f.size).sum::<u64>() > MAX_TOTAL { return Err("Transfer too large".into()); }
        let mut names = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        for file in &files {
            let mut name = sanitize(&file.name).ok_or("Unsafe file name")?;
            if !seen.insert(name.to_lowercase()) {
                let (stem, ext) = split_ext(&name);
                let (stem, ext) = (stem.to_string(), ext.to_string());
                let mut n = 2;
                loop {
                    let candidate = format!("{stem} ({n}){ext}");
                    if seen.insert(candidate.to_lowercase()) { name = candidate; break; }
                    n += 1;
                }
            }
            names.push(name);
        }
        fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        Ok(Self { id: id.into(), dir, files, names, written: Vec::new(), current: None, index: None, received: 0 })
    }
    /// Opens the file at `index` for writing (creating/truncating it).
    pub fn open(&mut self, index: usize) -> Result<(), String> {
        let name = self.names.get(index).ok_or("No such file")?;
        let path = self.dir.join(name);
        let file = fs::File::create(&path).map_err(|e| e.to_string())?;
        self.current = Some(file);
        self.index = Some(index);
        self.received = 0;
        self.written.push(path);
        Ok(())
    }
    /// Appends one bounded chunk, never accepting more than the declared size of the open file.
    pub fn chunk(&mut self, bytes: &[u8]) -> Result<(), String> {
        if bytes.len() > MAX_CHUNK { return Err("Chunk too large".into()); }
        let index = self.index.ok_or("No file open")?;
        if self.received + bytes.len() as u64 > self.files[index].size { return Err("More data than declared".into()); }
        self.current.as_mut().ok_or("No file open")?.write_all(bytes).map_err(|e| e.to_string())?;
        self.received += bytes.len() as u64;
        Ok(())
    }
    /// Flushes and returns the written paths, for the clipboard.
    pub fn finish(mut self) -> Result<Vec<PathBuf>, String> {
        if let Some(mut file) = self.current.take() { file.flush().map_err(|e| e.to_string())?; }
        Ok(self.written)
    }
    /// Discards a partial transfer's files.
    pub fn cancel(self) { let _ = fs::remove_dir_all(&self.dir); }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_blocks_traversal_and_devices() {
        assert_eq!(sanitize("report.pdf"), Some("report.pdf".into()));
        assert_eq!(sanitize(r"..\..\Windows\System32\evil.dll"), Some("evil.dll".into()));
        assert_eq!(sanitize("/etc/passwd"), Some("passwd".into()));
        assert_eq!(sanitize(".."), None);
        assert_eq!(sanitize("C:file"), None);
        assert_eq!(sanitize("a\u{0007}b"), None);
        assert_eq!(sanitize("trailing..."), Some("trailing".into()));
    }

    #[test]
    fn receives_files_and_deduplicates_names() {
        let dir = std::env::temp_dir().join(format!("asdesk-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let files = vec![FileInfo { name: "a.txt".into(), size: 5 }, FileInfo { name: "a.txt".into(), size: 3 }];
        let mut recv = RecvState::begin(dir.clone(), "t1", files).unwrap();
        recv.open(0).unwrap();
        recv.chunk(b"hello").unwrap();
        recv.open(1).unwrap();
        recv.chunk(b"hi!").unwrap();
        let paths = recv.finish().unwrap();
        assert_eq!(paths.len(), 2);
        assert_eq!(fs::read(&paths[0]).unwrap(), b"hello");
        assert!(paths[1].file_name().unwrap().to_string_lossy().contains("(2)"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_more_data_than_declared_and_oversized_sets() {
        let dir = std::env::temp_dir().join(format!("asdesk-test-over-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let mut recv = RecvState::begin(dir.clone(), "t2", vec![FileInfo { name: "a".into(), size: 2 }]).unwrap();
        recv.open(0).unwrap();
        assert!(recv.chunk(b"too big").is_err());
        assert!(RecvState::begin(dir.clone(), "t3", vec![FileInfo { name: "a".into(), size: MAX_TOTAL + 1 }]).is_err());
        let _ = fs::remove_dir_all(&dir);
    }
}
