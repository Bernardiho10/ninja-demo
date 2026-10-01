// Server-side proxy for POST /api/flows/:flowId/links — mints a real
// single-use hosted verification link on an already-created flow.

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

  const flowId = req.query?.flowId
  if (!flowId) {
    res.status(400).json({ error: 'flowId is required' })
    return
  }

  try {
    const upstream = await fetch(`${NINJA_API_BASE}/api/flows/${encodeURIComponent(flowId)}/links`, {
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
