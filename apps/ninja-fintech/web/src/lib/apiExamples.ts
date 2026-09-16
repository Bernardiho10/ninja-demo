// Generates accurate, multi-language reference snippets for a real Ninja
// API call — the same request/response shape verified live against the
// sandbox during this app's development (see tutor.md). Meant to be
// genuinely copy-pasteable integration reference: the two-step auth
// pattern (session token, then bearer-authenticated call) matches
// internal/ninja/client.go exactly.

const BASE_URL = 'https://api.sandbox.ninja.boucloud.io'

export interface CallExample {
  path: string
  body: Record<string, string>
}

function jsonBody(body: Record<string, string>, indent = 2): string {
  return JSON.stringify(body, null, indent)
}

function pythonDict(body: Record<string, string>): string {
  const lines = Object.entries(body).map(([k, v]) => `        "${k}": "${v}",`)
  return `{\n${lines.join('\n')}\n    }`
}

export function curlExample({ path, body }: CallExample): string {
  return `# 1. Get a short-lived session token (cache it — Ninja tokens last ~5 min)
curl -s -X POST ${BASE_URL}/auth/session \\
  -H "Content-Type: application/json" \\
  -d '{"client_key": "'"$NINJA_CLIENT_KEY"'", "client_secret": "'"$NINJA_CLIENT_SECRET"'"}'
# => { "token": "...", "expiry": "..." }

# 2. Call the endpoint with that token
curl -s -X POST ${BASE_URL}${path} \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body)}'`
}

export function javascriptExample({ path, body }: CallExample): string {
  return `const session = await fetch('${BASE_URL}/auth/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ client_key: NINJA_CLIENT_KEY, client_secret: NINJA_CLIENT_SECRET }),
}).then((r) => r.json())

const res = await fetch('${BASE_URL}${path}', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${session.token}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(${jsonBody(body)}),
})
const result = await res.json()`
}

export function nodeExample({ path, body }: CallExample): string {
  return `import axios from 'axios'

const { data: session } = await axios.post('${BASE_URL}/auth/session', {
  client_key: process.env.NINJA_CLIENT_KEY,
  client_secret: process.env.NINJA_CLIENT_SECRET,
})

const { data: result } = await axios.post(
  '${BASE_URL}${path}',
  ${jsonBody(body, 2).split('\n').join('\n  ')},
  { headers: { Authorization: \`Bearer \${session.token}\` } },
)`
}

// goExample mirrors this app's actual Go client (internal/ninja) rather
// than raw net/http — the struct fields below are exactly
// ninja.IdentifyRequest's real field names. Unlike ninja-bet's register
// flow (lookup, then verify against the lookup's DOB), ninja-fintech
// onboarding has no prior lookup step — the operator types the DOB
// directly, and it's verify-mode from the first call.
export function goExample(body: Record<string, string>): string {
  const fields: string[] = [
    `IDType:    "${body.idType}",`,
    `Mode:      "verify",`,
    `IDNumber:  "${body.idNumber}",`,
  ]
  if (body.firstName) fields.push(`FirstName: "${body.firstName}",`)
  if (body.lastName) fields.push(`LastName:  "${body.lastName}",`)
  if (body.dateOfBirth) fields.push(`DateOfBirth: "${body.dateOfBirth}", // typed at onboarding, not looked up first`)
  fields.push(`Reference: uuid.NewString(),`)
  return `result, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	${fields.join('\n\t')}
})
if err != nil {
	return err
}
// result.Found/Verified/Score/Recommendation/Fields — Fields is the
// per-field breakdown this app surfaces instead of a blunt pass/fail`
}

export function pythonExample({ path, body }: CallExample): string {
  return `import requests

session = requests.post(
    "${BASE_URL}/auth/session",
    json={"client_key": NINJA_CLIENT_KEY, "client_secret": NINJA_CLIENT_SECRET},
).json()

response = requests.post(
    "${BASE_URL}${path}",
    headers={"Authorization": f"Bearer {session['token']}"},
    json=${pythonDict(body)},
)
result = response.json()`
}

// The two real moments this app calls identity/identify — onboarding and
// re-KYC are the exact same call shape, just triggered at different
// moments (see apps/ninja-fintech/internal/api/customers.go).
export const ONBOARD_CALL: CallExample = {
  path: '/api/identity/identify',
  body: {
    idType: 'nin',
    mode: 'verify',
    idNumber: '77777777777',
    firstName: 'James',
    lastName: 'Bond',
    dateOfBirth: '1975-01-01',
  },
}

export function buildLanguageSnippets(example: CallExample) {
  return {
    curl: curlExample(example),
    javascript: javascriptExample(example),
    node: nodeExample(example),
    python: pythonExample(example),
    go: goExample(example.body),
  }
}
