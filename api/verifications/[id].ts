// Server-side proxy for GET /api/verifications/:id — used to poll a hosted
// verification session for completion. The real verification.completed
// webhook fires to NINJA_WEBHOOK_URL (webhook.site) for external inspection,
// not back into this app, so the frontend polls this endpoint to find out
// when a session finishes and what the outcome was.

const NINJA_API_BASE = process.env.NINJA_API_BASE || 'https://api.sandbox.ninja.boucloud.io'

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const secretKey = process.env.NINJA_SANDBOX_SECRET_KEY
  if (!secretKey) {
    res.status(500).json({ error: 'NINJA_SANDBOX_SECRET_KEY is not configured on the server' })
    return
  }

  const id = req.query?.id
  if (!id) {
    res.status(400).json({ error: 'id is required' })
    return
  }

  try {
    const upstream = await fetch(`${NINJA_API_BASE}/api/verifications/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (err: any) {
    res.status(502).json({ error: 'upstream request to Ninja sandbox failed', detail: err?.message })
  }
}
