// Server-side proxy for POST /api/flows against the real Ninja sandbox API.
// The sk_ secret key must never reach the browser, so this Vercel function
// holds it and forwards the request. Origin-header'd browser calls to the
// real API are refused with 403 anyway — this is the only way to call it
// from a static frontend.

const NINJA_API_BASE = process.env.NINJA_API_BASE || 'https://api.sandbox.ninja.boucloud.io'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const secretKey = process.env.NINJA_SANDBOX_SECRET_KEY
  if (!secretKey) {
    res.status(500).json({ error: 'NINJA_SANDBOX_SECRET_KEY is not configured on the server' })
    return
  }

  try {
    const upstream = await fetch(`${NINJA_API_BASE}/api/flows`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req.body || {}),
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (err: any) {
    res.status(502).json({ error: 'upstream request to Ninja sandbox failed', detail: err?.message })
  }
}
