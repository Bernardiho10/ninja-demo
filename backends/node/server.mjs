// Reference backend: Node.js (stdlib only, no framework).
//
// Implements the 3 endpoints the frontend needs for the real Ninja Flows
// integration. Holds NINJA_SANDBOX_SECRET_KEY server-side — it is never sent
// to the browser. Routes have no /api/ prefix because `ham proxy` strips
// API_PROXY_PREFIX ("/api/") before forwarding to this backend.
//
//   POST /identity/identify        -> POST   {NINJA_API_BASE}/api/identity/identify  (Steps 1-2: NIN / BVN)
//   POST /flows                    -> POST   {NINJA_API_BASE}/api/flows
//   POST /flows/:flowId/links      -> POST   {NINJA_API_BASE}/api/flows/:flowId/links
//   GET  /verifications/:id        -> GET    {NINJA_API_BASE}/api/verifications/:id
//   GET  /webhook-events?verification_id=vs_...
//                                  -> reads the webhook.site inbox (NINJA_WEBHOOK_URL) and returns
//                                     the verification.completed deliveries for that verification
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
//   NINJA_WEBHOOK_URL           where Ninja delivers webhooks; set on every flow this backend creates
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
const WEBHOOK_URL = process.env.NINJA_WEBHOOK_URL || ''
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
// If NINJA_SANDBOX_SECRET_KEY is omitted, it serves official sandbox fixtures
// so the demo works smoothly out of the box.
async function proxyToNinja(res, method, upstreamPath, body) {
  if (!SECRET_KEY) {
    const mock = getSandboxMock(upstreamPath, body)
    if (mock) {
      res.writeHead(mock.status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(mock.body))
      return
    }

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

// Built-in official sandbox fixtures matching backend/service/credit/credit_sandbox.go
function getSandboxMock(upstreamPath, body) {
  if (upstreamPath === '/api/identity/identify') {
    const bvnOrNin = String(body.number || body.idNumber || body.id_number || '')
    const fname = String(body.first_name || body.firstName || '').toLowerCase()
    const lname = String(body.last_name || body.lastName || '').toLowerCase()

    if (bvnOrNin === '77777777777' && fname.includes('james') && lname.includes('bond')) {
      return {
        status: 200,
        body: {
          status: 'verified',
          verified: true,
          score: 1.0,
          data: { first_name: 'JAMES', last_name: 'BOND', dob: '1975-01-01', age: 49 },
          matches: { first_name: 100, last_name: 100, dob: 100 },
          id_type: body.type || body.idType || 'bvn',
          number: bvnOrNin,
        },
      }
    }
    if (bvnOrNin === '77777777777') {
      return {
        status: 200,
        body: {
          status: 'failed',
          verified: false,
          score: 0.2,
          reasons: ['name_mismatch'],
          fields: [{ field: 'first_name', match: 'mismatch', provided: body.firstName || body.first_name, score: 0 }],
          id_type: body.type || body.idType || 'bvn',
          number: bvnOrNin,
        },
      }
    }
    if (bvnOrNin === '55555555555') {
      return {
        status: 200,
        body: { status: 'not_found', verified: false, found: false, reasons: ['id_not_found'], number: bvnOrNin },
      }
    }
    if (bvnOrNin === '00000000000') {
      return {
        status: 503,
        body: { error: 'upstream registry service unavailable', code: 'service_unavailable' },
      }
    }
    return {
      status: 200,
      body: {
        status: 'verified',
        verified: true,
        score: 1.0,
        data: {
          first_name: (body.first_name || body.firstName || 'JAMES').toUpperCase(),
          last_name: (body.last_name || body.lastName || 'BOND').toUpperCase(),
          dob: body.dob || body.dateOfBirth || '1975-01-01',
          age: 49,
        },
        matches: { first_name: 100, last_name: 100, dob: 100 },
        number: bvnOrNin,
      },
    }
  }

  if (upstreamPath === '/api/credit/check') {
    const bvn = String(body.bvn || '')
    const loanKobo = Number(body.loan_amount) || 50000000
    if (bvn === '00000000000') {
      return { status: 503, body: { error: 'upstream credit bureau service unavailable', code: 'service_unavailable' } }
    }
    if (bvn === '55555555555') {
      return { status: 404, body: { error: 'borrower not found in credit bureau registry', code: 'not_found' } }
    }
    if (bvn === '33333333333') {
      return {
        status: 200,
        body: {
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
        },
      }
    }
    if (bvn === '44444444444') {
      return {
        status: 200,
        body: {
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
        },
      }
    }
    const isOverLimit = loanKobo > 180000000
    return {
      status: 200,
      body: {
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
      },
    }
  }

  if (upstreamPath === '/api/credit/history') {
    const bvn = String(body.bvn || '')
    if (bvn === '00000000000') {
      return { status: 503, body: { error: 'upstream credit bureau service unavailable' } }
    }
    if (bvn === '55555555555') {
      return { status: 404, body: { error: 'borrower not found in credit bureau registry' } }
    }
    const checkResult = getSandboxMock('/api/credit/check', body).body.data
    return {
      status: 200,
      body: {
        status: 'success',
        data: {
          ...checkResult,
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
      },
    }
  }

  if (upstreamPath === '/api/kyb/check') {
    const rcInput = String(body?.rc_number || body?.rcNumber || body?.rc || body?.idNumber || '').replace(/[^0-9]/g, '')
    if (rcInput === '9999999') {
      return {
        status: 404,
        body: {
          status: 'error',
          code: 'not_found',
          message: 'Registration number not found in Corporate Affairs Commission (CAC) registry.',
          data: null,
        },
      }
    }
    if (rcInput === '2000002') {
      return {
        status: 200,
        body: {
          status: 'success',
          data: {
            id: 2000002,
            rc_number: 'RC-2000002',
            company_name: 'PRIME AGRO ALLIED FOODS LIMITED',
            company_type: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
            status: 'INACTIVE',
            registration_date: '2014-08-20',
            registered_address: 'KM 14, Old Ibadan-Lagos Expressway',
            city: 'Ibadan',
            state: 'Oyo State',
            email: 'contact@primeallied.com.ng',
            nature_of_business: 'Wholesale agricultural processing and packaging',
            annual_returns_up_to_date: false,
            last_annual_return_year: 2017,
          },
        },
      }
    }
    if (rcInput === '6666666') {
      return {
        status: 200,
        body: {
          status: 'success',
          data: {
            id: 6666666,
            rc_number: 'RC-6666666',
            company_name: 'GLOBAL HORIZONS CAPITAL LIMITED',
            company_type: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
            status: 'ACTIVE',
            registration_date: '2021-02-10',
            registered_address: '22 Constitution Avenue, Central Business District, Abuja',
            city: 'Abuja',
            state: 'FCT',
            email: 'legal@globalhorizons.ng',
            nature_of_business: 'Financial consultancy and project management',
            annual_returns_up_to_date: true,
            last_annual_return_year: 2025,
          },
        },
      }
    }
    return {
      status: 200,
      body: {
        status: 'success',
        data: {
          id: 1000001,
          rc_number: 'RC-1000001',
          company_name: 'NINJA TECH LOGISTICS LIMITED',
          company_type: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
          status: 'ACTIVE',
          registration_date: '2019-04-12',
          registered_address: 'Plot 14, Commercial Avenue, Victoria Island',
          city: 'Lagos',
          state: 'Lagos State',
          email: 'operations@ninjalogistics.ng',
          nature_of_business: 'Freight forwarding, logistics and haulage services',
          annual_returns_up_to_date: true,
          last_annual_return_year: 2025,
        },
      },
    }
  }

  if (upstreamPath === '/api/kyb/directors') {
    const rcInput = String(body?.rc_number || body?.rcNumber || body?.rc || '').replace(/[^0-9]/g, '')
    if (rcInput === '9999999') {
      return {
        status: 404,
        body: {
          status: 'error',
          code: 'not_found',
          message: 'Company not found or no directors on record.',
          data: [],
        },
      }
    }
    if (rcInput === '2000002') {
      return {
        status: 200,
        body: {
          status: 'success',
          company_name: 'PRIME AGRO ALLIED FOODS LIMITED',
          rc_number: 'RC-2000002',
          directors_count: 1,
          data: [
            {
              id: 601,
              name: 'Sunday Emmanuel Adekunle',
              role: 'DIRECTOR',
              nationality: 'Nigerian',
              address: '4 Ring Road, Ibadan, Oyo State',
              status: 'INACTIVE',
              id_type: 'NIN',
              id_number: '33333333333',
              shares_allotted: 500000,
              share_percentage: 100,
              aml_flag: false,
            },
          ],
        },
      }
    }
    if (rcInput === '6666666') {
      return {
        status: 200,
        body: {
          status: 'success',
          company_name: 'GLOBAL HORIZONS CAPITAL LIMITED',
          rc_number: 'RC-6666666',
          directors_count: 1,
          data: [
            {
              id: 701,
              name: 'Aliyu Ibrahim Danjuma',
              role: 'DIRECTOR',
              nationality: 'Nigerian',
              address: '34 Aso Drive, Asokoro, Abuja',
              status: 'ACTIVE',
              id_type: 'NIN',
              id_number: '99999999999',
              shares_allotted: 800000,
              share_percentage: 80,
              aml_flag: true,
            },
          ],
        },
      }
    }
    return {
      status: 200,
      body: {
        status: 'success',
        company_name: 'NINJA TECH LOGISTICS LIMITED',
        rc_number: 'RC-1000001',
        directors_count: 2,
        data: [
          {
            id: 501,
            name: 'James Babatunde Okafor',
            role: 'MANAGING_DIRECTOR',
            nationality: 'Nigerian',
            address: '12 Admiralty Way, Lekki Phase 1, Lagos',
            status: 'ACTIVE',
            id_type: 'NIN',
            id_number: '77777777777',
            shares_allotted: 600000,
            share_percentage: 60,
            aml_flag: false,
          },
          {
            id: 502,
            name: 'Fatima Amina Bello',
            role: 'DIRECTOR',
            nationality: 'Nigerian',
            address: '8 Gana Street, Maitama, Abuja',
            status: 'ACTIVE',
            id_type: 'NIN',
            id_number: '88888888888',
            shares_allotted: 400000,
            share_percentage: 40,
            aml_flag: false,
          },
        ],
      },
    }
  }

  return null
}

// Ninja delivers webhooks to a public URL, which a localhost backend can't be.
// For the demo that URL is a webhook.site inbox, and webhook.site has a read
// API, so we fetch the deliveries from there and hand them to the browser.
async function webhookEvents(res, verificationId) {
  const m = WEBHOOK_URL.match(/^https:\/\/webhook\.site\/([0-9a-f-]{36})/i)
  if (!m) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ source: 'unsupported', inbox_url: WEBHOOK_URL || null, events: [] }))
    return
  }
  const token = m[1]
  try {
    const upstream = await fetch(`https://webhook.site/token/${token}/requests?sorting=newest&per_page=50`, {
      headers: { Accept: 'application/json' },
    })
    if (!upstream.ok) throw new Error(`webhook.site responded ${upstream.status}`)
    const inbox = await upstream.json()
    const header = (r, name) => [].concat(r.headers?.[name] ?? [])[0] ?? null
    const events = []
    for (const r of inbox.data || []) {
      if (r.method !== 'POST') continue
      let payload
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
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ source: 'webhook.site', inbox_url: `https://webhook.site/#!/view/${token}`, events }))
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'could not read webhook.site inbox', detail: String(err?.message || err) }))
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (req.method === 'POST' && url.pathname === '/identity/identify') {
    const raw = await readBody(req)
    const normalized = {
      mode: raw.mode || 'verify',
      idType: raw.idType || raw.type || raw.id_type || 'bvn',
      idNumber: raw.idNumber || raw.number || raw.id_number || '',
      firstName: raw.firstName || raw.first_name || '',
      lastName: raw.lastName || raw.last_name || '',
    }
    if (raw.dateOfBirth || raw.dob) normalized.dateOfBirth = raw.dateOfBirth || raw.dob
    if (raw.phoneNumber || raw.phone) normalized.phoneNumber = raw.phoneNumber || raw.phone
    return proxyToNinja(res, 'POST', '/api/identity/identify', normalized)
  }

  if (req.method === 'POST' && url.pathname === '/credit/check') {
    return proxyToNinja(res, 'POST', '/api/credit/check', await readBody(req))
  }

  if (req.method === 'POST' && url.pathname === '/credit/history') {
    return proxyToNinja(res, 'POST', '/api/credit/history', await readBody(req))
  }

  if (req.method === 'POST' && url.pathname === '/kyb/check') {
    return proxyToNinja(res, 'POST', '/api/kyb/check', await readBody(req))
  }

  if (req.method === 'POST' && url.pathname === '/kyb/directors') {
    return proxyToNinja(res, 'POST', '/api/kyb/directors', await readBody(req))
  }

  if (req.method === 'POST' && url.pathname === '/flows') {
    const body = await readBody(req)
    if (WEBHOOK_URL) body.webhook_url = WEBHOOK_URL
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

  if (req.method === 'GET' && url.pathname === '/webhook-events') {
    return webhookEvents(res, url.searchParams.get('verification_id') || '')
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'no such route: ' + req.method + ' ' + url.pathname }))
})

server.listen(PORT, () => {
  console.log(`Node reference backend listening on http://localhost:${PORT}`)
  if (!SECRET_KEY) console.warn('warning: NINJA_SANDBOX_SECRET_KEY is not set — /flows calls will fail')
})
