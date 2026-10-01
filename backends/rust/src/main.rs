//! Reference backend: Rust (tiny_http + ureq -- both synchronous, no async
//! runtime needed).
//!
//! Implements the 3 endpoints the frontend needs for the real Ninja Flows
//! integration. Holds NINJA_SANDBOX_SECRET_KEY server-side -- it is never
//! sent to the browser. Routes have no /api/ prefix because `ham proxy`
//! strips API_PROXY_PREFIX ("/api/") before forwarding to this backend.
//!
//!   POST /flows                  -> POST   {NINJA_API_BASE}/api/flows
//!   POST /flows/:flowId/links    -> POST   {NINJA_API_BASE}/api/flows/:flowId/links
//!   GET  /verifications/:id      -> GET    {NINJA_API_BASE}/api/verifications/:id
//!
//! Run:
//!   cargo run --manifest-path backends/rust/Cargo.toml
//! Then, in another terminal, from the repo root:
//!   ham proxy
//! Open http://localhost:8082
//!
//! Config (reads repo-root .env, or real environment variables):
//!   NINJA_API_BASE              default https://api.sandbox.ninja.boucloud.io
//!   NINJA_SANDBOX_SECRET_KEY    required -- your sk_sandbox_... key
//!   API_PORT                    default 8080 (ham proxy's default API_ENDPOINT)

use std::env;
use std::fs;
use std::path::PathBuf;

use tiny_http::{Header, Method, Response, Server};

fn load_env() {
    let repo_root: PathBuf = [env!("CARGO_MANIFEST_DIR"), "..", ".."].iter().collect();
    let env_path = repo_root.join(".env");

    if let Ok(contents) = fs::read_to_string(&env_path) {
        for line in contents.lines() {
            let line = line.trim();
            if let Some(idx) = line.find('=') {
                let key = line[..idx].trim();
                let val = line[idx + 1..].trim();
                if env::var(key).is_err() {
                    env::set_var(key, val);
                }
            }
        }
    }
}

fn json_header() -> Header {
    Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap()
}

/// Forwards a request to the real Ninja sandbox API with the secret key
/// attached, then relays its exact status and body back as-is.
fn proxy_to_ninja(method: &str, upstream_path: &str, body: Option<String>) -> (u16, String) {
    let api_base = env::var("NINJA_API_BASE")
        .unwrap_or_else(|_| "https://api.sandbox.ninja.boucloud.io".to_string());
    let secret_key = match env::var("NINJA_SANDBOX_SECRET_KEY") {
        Ok(k) if !k.is_empty() => k,
        _ => {
            return (
                500,
                r#"{"error":"NINJA_SANDBOX_SECRET_KEY is not set"}"#.to_string(),
            )
        }
    };

    let url = format!("{}{}", api_base, upstream_path);
    let request = match method {
        "POST" => ureq::post(&url),
        _ => ureq::get(&url),
    }
    .set("Authorization", &format!("Bearer {}", secret_key))
    .set("Content-Type", "application/json");

    let result = if method == "POST" {
        request.send_string(&body.unwrap_or_else(|| "{}".to_string()))
    } else {
        request.call()
    };

    match result {
        Ok(resp) => {
            let status = resp.status();
            let text = resp.into_string().unwrap_or_default();
            (status, text)
        }
        // ureq treats non-2xx as Err(Status(..)) -- unwrap the real upstream
        // body instead of losing it, so 4xx/5xx from Ninja still reach the caller.
        Err(ureq::Error::Status(status, resp)) => {
            let text = resp.into_string().unwrap_or_default();
            (status, text)
        }
        Err(e) => (
            502,
            format!(
                r#"{{"error":"upstream request to Ninja sandbox failed","detail":"{}"}}"#,
                e.to_string().replace('"', "'")
            ),
        ),
    }
}

fn main() {
    load_env();

    let port = env::var("API_PORT").unwrap_or_else(|_| "8080".to_string());
    let server = Server::http(format!("0.0.0.0:{}", port)).expect("failed to bind port");

    println!("Rust reference backend listening on http://localhost:{}", port);
    if env::var("NINJA_SANDBOX_SECRET_KEY").unwrap_or_default().is_empty() {
        println!("warning: NINJA_SANDBOX_SECRET_KEY is not set -- /flows calls will fail");
    }

    for mut request in server.incoming_requests() {
        let method = request.method().clone();
        let url = request.url().to_string();

        let mut body = String::new();
        let _ = request.as_reader().read_to_string(&mut body);

        let (status, resp_body) = match (&method, url.as_str()) {
            (Method::Post, "/flows") => proxy_to_ninja("POST", "/api/flows", Some(body)),

            (Method::Post, path) if path.starts_with("/flows/") && path.ends_with("/links") => {
                let flow_id = &path["/flows/".len()..path.len() - "/links".len()];
                proxy_to_ninja(
                    "POST",
                    &format!("/api/flows/{}/links", flow_id),
                    Some(body),
                )
            }

            (Method::Get, path) if path.starts_with("/verifications/") => {
                let id = &path["/verifications/".len()..];
                proxy_to_ninja("GET", &format!("/api/verifications/{}", id), None)
            }

            _ => (
                404,
                format!(r#"{{"error":"no such route: {:?} {}"}}"#, method, url),
            ),
        };

        let response = Response::from_string(resp_body)
            .with_status_code(status)
            .with_header(json_header());
        let _ = request.respond(response);
    }
}
