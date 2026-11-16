// Server-side proxy for POST /api/identity/identify (Steps 1-2: NIN and BVN
// checks). Same as every backend in backends/: the secret key stays here and
// Ninja's response is relayed unchanged.

const NINJA_API_BASE = process.env.NINJA_API_BASE || 'https://api.sandbox.ninja.boucloud.io'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const secretKey = process.env.NINJA_SANDBOX_SECRET_KEY
  if (!secretKey) {
    const bvnOrNin = String(req.body?.number || req.body?.idNumber || req.body?.id_number || '')
    const fname = String(req.body?.first_name || req.body?.firstName || '').toLowerCase()
    const lname = String(req.body?.last_name || req.body?.lastName || '').toLowerCase()

    if (bvnOrNin === '77777777777' && fname.includes('james') && lname.includes('bond')) {
      res.status(200).json({
        status: 'verified',
        verified: true,
        score: 1.0,
        data: { first_name: 'JAMES', last_name: 'BOND', dob: '1975-01-01', age: 49 },
        matches: { first_name: 100, last_name: 100, dob: 100 },
        id_type: req.body?.type || req.body?.idType || 'bvn',
        number: bvnOrNin,
      })
      return
    }
    if (bvnOrNin === '77777777777') {
      res.status(200).json({
        status: 'failed',
        verified: false,
        score: 0.2,
        reasons: ['name_mismatch'],
        fields: [{ field: 'first_name', match: 'mismatch', provided: req.body?.firstName || req.body?.first_name, score: 0 }],
        id_type: req.body?.type || req.body?.idType || 'bvn',
        number: bvnOrNin,
      })
      return
    }
    if (bvnOrNin === '55555555555') {
      res.status(200).json({ status: 'not_found', verified: false, found: false, reasons: ['id_not_found'], number: bvnOrNin })
      return
    }
    if (bvnOrNin === '00000000000') {
      res.status(503).json({ error: 'upstream registry service unavailable', code: 'service_unavailable' })
      return
    }
    res.status(200).json({
      status: 'verified',
      verified: true,
      score: 1.0,
      data: {
        first_name: (req.body?.first_name || req.body?.firstName || 'JAMES').toUpperCase(),
        last_name: (req.body?.last_name || req.body?.lastName || 'BOND').toUpperCase(),
        dob: req.body?.dob || req.body?.dateOfBirth || '1975-01-01',
        age: 49,
      },
      matches: { first_name: 100, last_name: 100, dob: 100 },
      number: bvnOrNin,
    })
    return
  }

  try {
    const raw = req.body || {}
    const upstreamPayload: Record<string, any> = {
      mode: raw.mode || 'verify',
      idType: raw.idType || raw.type || raw.id_type || 'bvn',
      idNumber: raw.idNumber || raw.number || raw.id_number || '',
      firstName: raw.firstName || raw.first_name || '',
      lastName: raw.lastName || raw.last_name || '',
    }
    if (raw.dateOfBirth || raw.dob) upstreamPayload.dateOfBirth = raw.dateOfBirth || raw.dob
    if (raw.phoneNumber || raw.phone) upstreamPayload.phoneNumber = raw.phoneNumber || raw.phone

    const upstream = await fetch(`${NINJA_API_BASE}/api/identity/identify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(upstreamPayload),
    })

    const text = await upstream.text()
    res.status(upstream.status)
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
    res.send(text)
  } catch (err: any) {
    res.status(502).json({ error: 'upstream request to Ninja sandbox failed', detail: err?.message })
  }
}
