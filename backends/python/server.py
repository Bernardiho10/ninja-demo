#!/usr/bin/env python3
"""
Reference backend: Python (standard library only, no pip install needed).

Implements the 3 endpoints the frontend needs for the real Ninja Flows
integration. Holds NINJA_SANDBOX_SECRET_KEY server-side -- it is never sent
to the browser. Routes have no /api/ prefix because `ham proxy` strips
API_PROXY_PREFIX ("/api/") before forwarding to this backend.

  POST /flows                  -> POST   {NINJA_API_BASE}/api/flows
  POST /flows/:flowId/links    -> POST   {NINJA_API_BASE}/api/flows/:flowId/links
  GET  /verifications/:id      -> GET    {NINJA_API_BASE}/api/verifications/:id

Run:
  python backends/python/server.py   (or `py backends/python/server.py` on Windows)
Then, in another terminal, from the repo root:
  ham proxy
Open http://localhost:8082

Config (reads repo-root .env, or real environment variables):
  NINJA_API_BASE              default https://api.sandbox.ninja.boucloud.io
  NINJA_SANDBOX_SECRET_KEY    required -- your sk_sandbox_... key
  API_PORT                    default 8080 (ham proxy's default API_ENDPOINT)
"""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

env_path = REPO_ROOT / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        m = re.match(r"^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$", line)
        if m and m.group(1) not in os.environ:
            os.environ[m.group(1)] = m.group(2).strip()

NINJA_API_BASE = os.environ.get("NINJA_API_BASE", "https://api.sandbox.ninja.boucloud.io")
SECRET_KEY = os.environ.get("NINJA_SANDBOX_SECRET_KEY")
PORT = int(os.environ.get("API_PORT", "8080"))

FLOWS_LINKS_RE = re.compile(r"^/flows/([^/]+)/links$")
VERIFICATIONS_RE = re.compile(r"^/verifications/([^/]+)$")


def proxy_to_ninja(handler, method, upstream_path, body=None):
    if not SECRET_KEY:
        send_json(handler, 500, {"error": "NINJA_SANDBOX_SECRET_KEY is not set"})
        return

    data = json.dumps(body or {}).encode("utf-8") if method != "GET" else None
    req = urllib.request.Request(
        NINJA_API_BASE + upstream_path,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {SECRET_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as upstream:
            send_raw(handler, upstream.status, upstream.read())
    except urllib.error.HTTPError as e:
        # Real Ninja error responses (4xx/5xx) land here -- relay them as-is
        # instead of letting urllib raise, so the frontend sees the real body.
        send_raw(handler, e.code, e.read())
    except Exception as e:  # noqa: BLE001 -- surfaced to the caller as JSON
        send_json(handler, 502, {"error": "upstream request to Ninja sandbox failed", "detail": str(e)})


def send_json(handler, status, obj):
    send_raw(handler, status, json.dumps(obj).encode("utf-8"))


def send_raw(handler, status, body_bytes):
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.end_headers()
    handler.wfile.write(body_bytes)


class Handler(BaseHTTPRequestHandler):
    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}

    def do_POST(self):
        if self.path == "/flows":
            return proxy_to_ninja(self, "POST", "/api/flows", self._read_json_body())

        m = FLOWS_LINKS_RE.match(self.path)
        if m:
            flow_id = urllib.parse.unquote(m.group(1))
            return proxy_to_ninja(self, "POST", f"/api/flows/{flow_id}/links", self._read_json_body())

        send_json(self, 404, {"error": f"no such route: POST {self.path}"})

    def do_GET(self):
        m = VERIFICATIONS_RE.match(self.path)
        if m:
            return proxy_to_ninja(self, "GET", f"/api/verifications/{m.group(1)}")

        send_json(self, 404, {"error": f"no such route: GET {self.path}"})

    def log_message(self, format, *args):  # noqa: A002 -- quiet, matches the other reference backends
        pass


if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Python reference backend listening on http://localhost:{PORT}")
    if not SECRET_KEY:
        print("warning: NINJA_SANDBOX_SECRET_KEY is not set -- /flows calls will fail")
    server.serve_forever()
