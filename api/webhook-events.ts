// GET /api/webhook-events?verification_id=vs_... — the Vercel version of the
// route every backend in backends/ implements.
//
// Ninja delivers the verification.completed webhook to NINJA_WEBHOOK_URL. For
// the demo that's a webhook.site inbox, and webhook.site has a read API, so we
// fetch the deliveries from there and hand them to the browser.

const WEBHOOK_URL = process.env.NINJA_WEBHOOK_URL || ''

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const verificationId = String(req.query?.verification_id || '')
  const m = WEBHOOK_URL.match(/^https:\/\/webhook\.site\/([0-9a-f-]{36})/i)
  if (!m) {
    res.status(200).json({ source: 'unsupported', inbox_url: WEBHOOK_URL || null, events: [] })
    return
  }
  const token = m[1]

  try {
    const upstream = await fetch(`https://webhook.site/token/${token}/requests?sorting=newest&per_page=50`, {
      headers: { Accept: 'application/json' },
    })
    if (!upstream.ok) throw new Error(`webhook.site responded ${upstream.status}`)
    const inbox = (await upstream.json()) as { data?: any[] }

    const header = (r: any, name: string) => [].concat(r.headers?.[name] ?? [])[0] ?? null
    const events = []
    for (const r of inbox.data || []) {
      if (r.method !== 'POST') continue
      let payload: any
      try {
        payload = JSON.parse(r.content)
      } catch {
        continue
      }
      if (verificationId && payload?.data?.verification_id !== verificationId) continue
      events.push({
        delivery_id: header(r, 'x-ninja-delivery'),
        event: header(r, 'x-ninja-event') || payload.event || null,
        signature: header(r, 'x-ninja-signature'),
        received_at: r.created_at,
        payload,
      })
    }
    res.status(200).json({ source: 'webhook.site', inbox_url: `https://webhook.site/#!/view/${token}`, events })
  } catch (err: any) {
    res.status(502).json({ error: 'could not read webhook.site inbox', detail: err?.message })
  }
}
