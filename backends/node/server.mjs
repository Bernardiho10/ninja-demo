// Reference backend: Node.js (stdlib only, no framework).
//
// Implements the 3 endpoints the frontend needs for the real Ninja Flows
// integration. Holds NINJA_SANDBOX_SECRET_KEY server-side — it is never sent
// to the browser. Routes have no /api/ prefix because `ham proxy` strips
// API_PROXY_PREFIX ("/api/") before forwarding to this backend.
//
//   POST /flows                    -> POST   {NINJA_API_BASE}/api/flows
//   POST /flows/:flowId/links      -> POST   {NINJA_API_BASE}/api/flows/:flowId/links
//   GET  /verifications/:id        -> GET    {NINJA_API_BASE}/api/verifications/:id
//
// Run:
//   node backends/node/server.mjs
// Then, in another terminal, from the repo root:
//   ham proxy
// Open http://localhost:8082
//
// Config (reads repo-root .env, or real environment variables):
//   NINJA_API_BASE              default https://api.sandbox.ninja.boucloud.io
//   NINJA_SANDBOX_SECRET_KEY    required — your sk_sandbox_... key
//   API_PORT                    default 8080 (ham proxy's default API_ENDPOINT)

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const envPath = path.join(repoRoot, '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

const NINJA_API_BASE = process.env.NINJA_API_BASE || 'https://api.sandbox.ninja.boucloud.io'
const SECRET_KEY = process.env.NINJA_SANDBOX_SECRET_KEY
const PORT = Number(process.env.API_PORT) || 8080

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

// Forwards a request to the real Ninja sandbox API with the secret key
// attached, then relays its exact status and body back to the caller.
async function proxyToNinja(res, method, upstreamPath, body) {
  if (!SECRET_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'NINJA_SANDBOX_SECRET_KEY is not set' }))
    return
  }

  try {
    const upstream = await fetch(NINJA_API_BASE + upstreamPath, {
      method,
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    })
    const text = await upstream.text()
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' })
    res.end(text)
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'upstream request to Ninja sandbox failed', detail: String(err?.message || err) }))
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (req.method === 'POST' && url.pathname === '/flows') {
    const body = await readBody(req)
    return proxyToNinja(res, 'POST', '/api/flows', body)
  }

  let m = url.pathname.match(/^\/flows\/([^/]+)\/links$/)
  if (req.method === 'POST' && m) {
    const body = await readBody(req)
    return proxyToNinja(res, 'POST', `/api/flows/${encodeURIComponent(m[1])}/links`, body)
  }

  m = url.pathname.match(/^\/verifications\/([^/]+)$/)
  if (req.method === 'GET' && m) {
    return proxyToNinja(res, 'GET', `/api/verifications/${encodeURIComponent(m[1])}`)
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'no such route: ' + req.method + ' ' + url.pathname }))
})

server.listen(PORT, () => {
  console.log(`Node reference backend listening on http://localhost:${PORT}`)
  if (!SECRET_KEY) console.warn('warning: NINJA_SANDBOX_SECRET_KEY is not set — /flows calls will fail')
})
