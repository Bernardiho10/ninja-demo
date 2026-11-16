// Server-side proxy for POST /api/credit/history.
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
    if (bvn === '00000000000') {
      res.status(503).json({ error: 'upstream credit bureau service unavailable' })
      return
    }
    if (bvn === '55555555555') {
      res.status(404).json({ error: 'borrower not found in credit bureau registry' })
      return
    }

    res.status(200).json({
      status: 'success',
      data: {
        score: bvn === '33333333333' ? 480 : bvn === '44444444444' ? null : 690,
        band: bvn === '33333333333' ? 'poor' : bvn === '44444444444' ? null : 'good',
        recommendation: bvn === '33333333333' ? 'deny' : bvn === '44444444444' ? 'review' : 'approve',
        reasons: bvn === '33333333333' ? ['open_non_performing_loan', 'missed_repayments'] : bvn === '44444444444' ? ['no_credit_history'] : ['clean_record'],
        eligible_amount: bvn === '77777777777' ? 180000000 : 0,
        summary: {
          institutions: bvn === '44444444444' ? 0 : bvn === '33333333333' ? 2 : 3,
          total_loans: bvn === '44444444444' ? 0 : 3,
          open_loans: bvn === '44444444444' ? 0 : 1,
          closed_loans: bvn === '44444444444' ? 0 : 2,
          performing_loans: bvn === '33333333333' ? 2 : bvn === '44444444444' ? 0 : 3,
          non_performing_loans: bvn === '33333333333' ? 1 : 0,
          open_non_performing_loans: bvn === '33333333333' ? 1 : 0,
          missed_repayments: bvn === '33333333333' ? 3 : 0,
          total_credit_value: bvn === '44444444444' ? 0 : bvn === '33333333333' ? 120000000 : 230000000,
          highest_credit: bvn === '44444444444' ? 0 : bvn === '33333333333' ? 60000000 : 120000000,
          open_credit_value: bvn === '44444444444' ? 0 : bvn === '33333333333' ? 45000000 : 35000000,
        },
        profile: {
          full_name: 'JAMES BOND',
          gender: 'male',
          address_history: [
            { address: '1 Demo Close, Wuse II, Abuja, FCT', type: 'Residential', date_reported: '2024-03-18' },
            { address: '14 Marina, Lagos Island, Lagos', type: 'Previous Residential', date_reported: '2022-07-10' },
          ],
          identifications: [{ type: 'BVN', number: bvn || '77777777777' }],
        },
        accounts: bvn === '44444444444' ? [] : [
          {
            institution: 'Access Bank PLC',
            loans: [
              {
                account_number: 'acc_01h8x9j2k3m4n5p6q7r8s9t0',
                status: 'open',
                performance: bvn === '33333333333' ? 'lost' : 'performing',
                opening_balance: 120000000,
                repayment_amount: 11500000,
                tenor: 12,
                repayment_frequency: 'monthly',
                date_opened: '2023-08-15',
                repayment_schedule: [
                  { period: '2024-01', status: 'paid' },
                  { period: '2024-02', status: 'paid' },
                  { period: '2024-03', status: bvn === '33333333333' ? 'missed' : 'paid' },
                  { period: '2024-04', status: bvn === '33333333333' ? 'missed' : 'pending' },
                ],
              },
            ],
          },
          {
            institution: 'FairMoney MFB',
            loans: [
              {
                account_number: 'acc_01h8x9j2k3m4n5p6q7r8s9t1',
                status: 'closed',
                performance: 'performing',
                opening_balance: 60000000,
                repayment_amount: 12000000,
                tenor: 6,
                repayment_frequency: 'monthly',
                date_opened: '2022-11-10',
                repayment_schedule: [
                  { period: '2022-12', status: 'paid' },
                  { period: '2023-01', status: 'paid' },
                  { period: '2023-02', status: 'paid' },
                ],
              },
            ],
          },
          {
            institution: 'Carbon Finance',
            loans: [
              {
                account_number: 'acc_01h8x9j2k3m4n5p6q7r8s9t2',
                status: 'closed',
                performance: 'performing',
                opening_balance: 50000000,
                repayment_amount: 10000000,
                tenor: 6,
                repayment_frequency: 'monthly',
                date_opened: '2021-06-01',
                repayment_schedule: [
                  { period: '2021-07', status: 'paid' },
                  { period: '2021-08', status: 'paid' },
                ],
              },
            ],
          },
        ],
      },
    })
    return
  }

  try {
    const upstream = await fetch(`${NINJA_API_BASE}/api/credit/history`, {
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
