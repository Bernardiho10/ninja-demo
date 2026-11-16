// Server-side proxy for POST /api/credit/check.
// Holds NINJA_SANDBOX_SECRET_KEY server-side and relays Ninja's response.

const NINJA_API_BASE = process.env.NINJA_API_BASE || 'https://api.sandbox.ninja.boucloud.io'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }

  const secretKey = process.env.NINJA_SANDBOX_SECRET_KEY
  if (!secretKey) {
    const bvn = String(req.body?.bvn || '')
    const loanKobo = Number(req.body?.loan_amount) || 50000000

    if (bvn === '00000000000') {
      res.status(503).json({ error: 'upstream credit bureau service unavailable' })
      return
    }
    if (bvn === '55555555555') {
      res.status(404).json({ error: 'borrower not found in credit bureau registry' })
      return
    }
    if (bvn === '33333333333') {
      res.status(200).json({
        status: 'success',
        data: {
          score: 480,
          band: 'poor',
          recommendation: 'deny',
          reasons: ['open_non_performing_loan', 'missed_repayments'],
          eligible_amount: 0,
          summary: {
            institutions: 2,
            total_loans: 3,
            open_loans: 1,
            closed_loans: 2,
            performing_loans: 2,
            non_performing_loans: 1,
            open_non_performing_loans: 1,
            missed_repayments: 3,
            total_credit_value: 120000000,
            highest_credit: 60000000,
            open_credit_value: 45000000,
          },
        },
      })
      return
    }
    if (bvn === '44444444444') {
      res.status(200).json({
        status: 'success',
        data: {
          score: null,
          band: null,
          recommendation: 'review',
          reasons: ['no_credit_history'],
          eligible_amount: 0,
          summary: {
            institutions: 0,
            total_loans: 0,
            open_loans: 0,
            closed_loans: 0,
            performing_loans: 0,
            non_performing_loans: 0,
            open_non_performing_loans: 0,
            missed_repayments: 0,
            total_credit_value: 0,
            highest_credit: 0,
            open_credit_value: 0,
          },
        },
      })
      return
    }
    const isOverLimit = loanKobo > 180000000
    res.status(200).json({
      status: 'success',
      data: {
        score: 690,
        band: 'good',
        recommendation: isOverLimit ? 'review' : 'approve',
        reasons: isOverLimit ? ['amount_above_eligible'] : ['clean_record'],
        eligible_amount: 180000000,
        summary: {
          institutions: 3,
          total_loans: 3,
          open_loans: 1,
          closed_loans: 2,
          performing_loans: 3,
          non_performing_loans: 0,
          open_non_performing_loans: 0,
          missed_repayments: 0,
          total_credit_value: 230000000,
          highest_credit: 120000000,
          open_credit_value: 35000000,
        },
      },
    })
    return
  }

  try {
    const upstream = await fetch(`${NINJA_API_BASE}/api/credit/check`, {
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
