//! Reference backend: Rust (tiny_http + ureq -- both synchronous, no async
//! runtime needed).
//!
//! Implements the 3 endpoints the frontend needs for the real Ninja Flows
//! integration. Holds NINJA_SANDBOX_SECRET_KEY server-side -- it is never
//! sent to the browser. Routes have no /api/ prefix because `ham proxy`
//! strips API_PROXY_PREFIX ("/api/") before forwarding to this backend.
//!
//!   POST /identity/identify      -> POST   {NINJA_API_BASE}/api/identity/identify  (Steps 1-2: NIN / BVN)
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

use serde_json::{json, Value};
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

/// Sets webhook_url to NINJA_WEBHOOK_URL on a flow-creation body. A missing or
/// malformed body becomes {} like the other reference backends.
fn with_webhook_url(body: &str) -> String {
    let mut v: Value = serde_json::from_str(body).unwrap_or_else(|_| json!({}));
    if !v.is_object() {
        v = json!({});
    }
    if let Ok(url) = env::var("NINJA_WEBHOOK_URL") {
        if !url.is_empty() {
            v["webhook_url"] = Value::String(url);
        }
    }
    v.to_string()
}

/// Returns the webhook.site token if NINJA_WEBHOOK_URL is a webhook.site inbox.
fn webhook_site_token(url: &str) -> Option<String> {
    let token = url.strip_prefix("https://webhook.site/")?.get(..36)?;
    token
        .chars()
        .all(|c| c.is_ascii_hexdigit() || c == '-')
        .then(|| token.to_string())
}

/// Ninja delivers webhooks to a public URL, which a localhost backend can't be.
/// For the demo that URL is a webhook.site inbox, and webhook.site has a read
/// API, so we fetch the deliveries from there and hand them to the browser.
fn webhook_events(verification_id: &str) -> (u16, String) {
    let webhook_url = env::var("NINJA_WEBHOOK_URL").unwrap_or_default();
    let token = match webhook_site_token(&webhook_url) {
        Some(t) => t,
        None => {
            let inbox = if webhook_url.is_empty() { Value::Null } else { Value::String(webhook_url) };
            return (200, json!({"source": "unsupported", "inbox_url": inbox, "events": []}).to_string());
        }
    };

    let url = format!("https://webhook.site/token/{}/requests?sorting=newest&per_page=50", token);
    let inbox: Value = match ureq::get(&url).set("Accept", "application/json").call() {
        Ok(resp) => match resp.into_string().ok().and_then(|t| serde_json::from_str(&t).ok()) {
            Some(v) => v,
            None => return (502, json!({"error": "could not read webhook.site inbox", "detail": "invalid JSON"}).to_string()),
        },
        Err(e) => return (502, json!({"error": "could not read webhook.site inbox", "detail": e.to_string()}).to_string()),
    };

    let header = |r: &Value, name: &str| r["headers"][name].get(0).cloned().unwrap_or(Value::Null);
    let mut events = Vec::new();
    for r in inbox["data"].as_array().into_iter().flatten() {
        if r["method"] != "POST" {
            continue;
        }
        let payload: Value = match r["content"].as_str().and_then(|c| serde_json::from_str(c).ok()) {
            Some(p) => p,
            None => continue,
        };
        if !verification_id.is_empty() && payload["data"]["verification_id"] != verification_id {
            continue;
        }
        let mut event = header(r, "x-ninja-event");
        if event.is_null() {
            event = payload["event"].clone();
        }
        events.push(json!({
            "delivery_id": header(r, "x-ninja-delivery"),
            "event": event,
            "signature": header(r, "x-ninja-signature"),
            "received_at": r["created_at"],
            "payload": payload,
        }));
    }
    (
        200,
        json!({
            "source": "webhook.site",
            "inbox_url": format!("https://webhook.site/#!/view/{}", token),
            "events": events,
        })
        .to_string(),
    )
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

        let (path_only, query) = url.split_once('?').unwrap_or((url.as_str(), ""));

        let (status, resp_body) = match (&method, path_only) {
            (Method::Post, "/identity/identify") => {
                proxy_to_ninja("POST", "/api/identity/identify", Some(body))
            }

            (Method::Post, "/flows") => {
                proxy_to_ninja("POST", "/api/flows", Some(with_webhook_url(&body)))
            }

            (Method::Get, "/webhook-events") => {
                let vid = query
                    .split('&')
                    .find_map(|kv| kv.strip_prefix("verification_id="))
                    .unwrap_or("");
                webhook_events(vid)
            }

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
