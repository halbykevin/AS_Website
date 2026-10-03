//! The one TLS configuration for every connection to the ASDesk server (HTTP API and WebSocket).
//!
//! rustls rather than Windows SChannel, so every Windows version speaks the same modern TLS: Windows 7's
//! SChannel has no TLS 1.3, few of today's cipher suites, and TLS 1.2 only when an update enabled it.
//! Trust comes from two sources, either of which may vouch for the server:
//! - the Mozilla root set built into the app, so a PC whose root store has not been updated for years
//!   (typical of Windows 7) still trusts public CAs such as Let's Encrypt, and
//! - the Windows root stores, so a company root (a TLS-inspecting proxy, a private CA) keeps working.
use std::sync::{Arc, OnceLock};

use rustls::{ClientConfig, RootCertStore};

use crate::log;

/// Built once per process; cheap to clone into each client.
pub fn client_config() -> Arc<ClientConfig> {
    static CONFIG: OnceLock<Arc<ClientConfig>> = OnceLock::new();
    CONFIG.get_or_init(|| {
        let mut roots = RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.to_vec() };
        let native = rustls_native_certs::load_native_certs();
        let (added, ignored) = roots.add_parsable_certificates(native.certs);
        if !native.errors.is_empty() || ignored > 0 {
            log::write(format!("tls: {added} system roots added, {ignored} unusable, {} store errors", native.errors.len()));
        }
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let config = ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions().expect("TLS 1.2 and 1.3 are supported by ring")
            .with_root_certificates(roots)
            .with_no_client_auth();
        // No ALPN: both the API client and the WebSocket speak HTTP/1.1 only.
        Arc::new(config)
    }).clone()
}

#[cfg(test)]
mod tests {
    #[test]
    fn builds_with_bundled_and_windows_roots() {
        let config = super::client_config();
        assert!(config.alpn_protocols.is_empty());
        assert!(std::sync::Arc::ptr_eq(&config, &super::client_config()));
    }
    /// Network: a real TLS handshake with the built-in server, through the same client the agent uses.
    /// `cargo test -- --ignored` (also on a Windows 7 PC with the win7 build's test binary).
    #[test]
    #[ignore]
    fn reaches_the_default_server() {
        let server = option_env!("COMPANY_REMOTE_DEFAULT_SERVER").filter(|s| !s.is_empty()).expect("a default server");
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let status = runtime.block_on(async {
            let http = reqwest::Client::builder().use_preconfigured_tls((*super::client_config()).clone()).build().unwrap();
            http.get(format!("{server}/health")).send().await.map(|r| r.status())
        });
        assert_eq!(status.map_err(|e| format!("{e:?}")).unwrap(), 200);
    }
}
