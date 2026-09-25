// Generates accurate, multi-language reference snippets for a real Ninja
// API call — the same request/response shapes verified live against the
// sandbox during this app's development (see tutor.md). These are meant to
// be genuinely copy-pasteable integration reference, not decoration: the
// two-step auth pattern (session token, then bearer-authenticated call)
// matches internal/ninja/client.go exactly.
const BASE_URL = 'https://api.ninja.ng';
function jsonBody(body, indent = 2) {
    return JSON.stringify(body, null, indent);
}
function pythonDict(body) {
    const lines = Object.entries(body).map(([k, v]) => `        "${k}": "${v}",`);
    return `{\n${lines.join('\n')}\n    }`;
}
function curlExample({ path, body }) {
    return `# 1. Get a short-lived session token (cache it — Ninja tokens last ~5 min)
curl -s -X POST ${BASE_URL}/auth/session \\
  -H "Content-Type: application/json" \\
  -d '{"client_key": "'"$NINJA_CLIENT_KEY"'", "client_secret": "'"$NINJA_CLIENT_SECRET"'"}'
# => { "token": "...", "expiry": "..." }

# 2. Call the endpoint with that token
curl -s -X POST ${BASE_URL}${path} \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(body)}'`;
}
function javascriptExample({ path, body }) {
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
const result = await res.json()`;
}
function nodeExample({ path, body }) {
    return `import axios from 'axios'

const { data: session } = await axios.post('${BASE_URL}/auth/session', {
  client_key: process.env.NINJA_CLIENT_KEY,
  client_secret: process.env.NINJA_CLIENT_SECRET,
})

const { data: result } = await axios.post(
  '${BASE_URL}${path}',
  ${jsonBody(body, 2).split('\n').join('\n  ')},
  { headers: { Authorization: \`Bearer \${session.token}\` } },
)`;
}
// goExample mirrors this app's actual Go client (internal/ninja) rather
// than raw net/http — the struct fields below are exactly
// ninja.IdentifyRequest's real field names.
function goExample(mode, body) {
    // Each entry carries its own trailing comma so a same-line "//" comment
    // (which extends to end of line) can never swallow it before the next field.
    const fields = [
        `IDType:    "${body.idType}",`,
        `Mode:      "${mode}",`,
        `IDNumber:  "${body.idNumber}",`,
    ];
    if (body.firstName)
        fields.push(`FirstName: "${body.firstName}",`);
    if (body.lastName)
        fields.push(`LastName:  "${body.lastName}",`);
    if (body.dateOfBirth)
        fields.push(`DateOfBirth: dob, // from the lookup response, never user-typed`);
    fields.push(`Reference: uuid.NewString(),`);
    return `result, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	${fields.join('\n\t')}
})
if err != nil {
	return err
}
// result.Data (lookup) or result.Found/Verified/Score/Fields (verify)`;
}
function pythonExample({ path, body }) {
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
result = response.json()`;
}
// The three real moments this app calls identity/identify — same bodies
// verified against the live sandbox during development (see tutor.md).
const LOOKUP_CALL = {
    path: '/api/identity/identify',
    body: { idType: 'nin', mode: 'lookup', idNumber: '77777777777' },
};
const VERIFY_REGISTRATION_CALL = {
    path: '/api/identity/identify',
    body: {
        idType: 'nin',
        mode: 'verify',
        idNumber: '77777777777',
        firstName: 'James',
        lastName: 'Bond',
        dateOfBirth: '1975-01-01',
    },
};
const VERIFY_PAYOUT_CALL = {
    path: '/api/identity/identify',
    body: {
        idType: 'nin',
        mode: 'verify',
        idNumber: '77777777777',
        firstName: 'James',
        lastName: 'Bond',
        dateOfBirth: '1975-01-01',
    },
};
// The second, independent payout check — same shape as VERIFY_PAYOUT_CALL,
// just idType: "bvn" against the destination bank account's BVN rather
// than the player's own NIN. Confirmed live: BVN mode=verify has the
// exact same request/response contract as NIN mode=verify.
const VERIFY_PAYOUT_BVN_CALL = {
    path: '/api/identity/identify',
    body: {
        idType: 'bvn',
        mode: 'verify',
        idNumber: '77777777777',
        firstName: 'James',
        lastName: 'Bond',
        dateOfBirth: '1975-01-01',
    },
};
function buildLanguageSnippets(example, mode) {
    return {
        curl: curlExample(example),
        javascript: javascriptExample(example),
        node: nodeExample(example),
        python: pythonExample(example),
        go: goExample(mode, example.body),
    };
}
function companyLookupCurlExample(rcNumber, advanced = false) {
    const path = advanced ? '/api/company/advanced-lookup' : '/api/company/lookup';
    return `# 1. Exchange keys for 5-minute session token
curl -s -X POST ${BASE_URL}/auth/session \\
  -H "Content-Type: application/json" \\
  -d '{"client_key": "'"$NINJA_CLIENT_KEY"'", "client_secret": "'"$NINJA_CLIENT_SECRET"'"}'

# 2. Corporate CAC Registry Lookup
curl -s -X POST ${BASE_URL}${path} \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"rc_number": "${rcNumber}"}'`;
}
function companyLookupTsExample(rcNumber, advanced = false) {
    const path = advanced ? '/api/company/advanced-lookup' : '/api/company/lookup';
    return `import axios from 'axios'

// 1. Session token
const { data: session } = await axios.post('${BASE_URL}/auth/session', {
  client_key: process.env.NINJA_CLIENT_KEY,
  client_secret: process.env.NINJA_CLIENT_SECRET,
})

// 2. Perform CAC corporate lookup
const { data: company } = await axios.post(
  '${BASE_URL}${path}',
  { rc_number: '${rcNumber}' },
  { headers: { Authorization: \`Bearer \${session.token}\` } }
)
console.log('Company Name:', company.data.name)
console.log('CAC Status:', company.data.status)
console.log('Directors:', company.data.directors)`;
}
function companyLookupGoExample(rcNumber, advanced = false) {
    if (advanced) {
        return `resp, err := ninjaClient.CompanyAdvancedLookup(ctx, ninja.CompanyAdvancedLookupRequest{
	RCNumber: "${rcNumber}",
})
if err != nil {
	return err
}
// resp.Data.Name, resp.Data.Directors, resp.Data.Shareholders`;
    }
    return `resp, err := ninjaClient.CompanyLookup(ctx, ninja.CompanyLookupRequest{
	RCNumber: "${rcNumber}",
})
if err != nil {
	return err
}
// resp.Data.Name, resp.Data.Status, resp.Data.Directors`;
}
function companyLookupPythonExample(rcNumber, advanced = false) {
    const path = advanced ? '/api/company/advanced-lookup' : '/api/company/lookup';
    return `import requests

session = requests.post(
    "${BASE_URL}/auth/session",
    json={"client_key": NINJA_CLIENT_KEY, "client_secret": NINJA_CLIENT_SECRET},
).json()

response = requests.post(
    "${BASE_URL}${path}",
    headers={"Authorization": f"Bearer {session['token']}"},
    json={"rc_number": "${rcNumber}"},
)
company = response.json()`;
}
function bulkIdentifyCurlExample() {
    return `# Bulk Identify up to 25 NINs/BVNs in one batch
curl -s -X POST ${BASE_URL}/api/identity/bulk-identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "idType": "nin",
    "idNumbers": "77777777777,66666666666,55555555555"
  }'`;
}
function bulkIdentifyTsExample() {
    return `import axios from 'axios'

const { data: result } = await axios.post(
  '${BASE_URL}/api/identity/bulk-identify',
  {
    idType: 'nin',
    idNumbers: '77777777777,66666666666,55555555555',
  },
  { headers: { Authorization: \`Bearer \${token}\` } }
)
result.data.forEach(item => console.log(item.id_number, item.first_name, item.last_name))`;
}

export { LOOKUP_CALL, VERIFY_PAYOUT_BVN_CALL, VERIFY_PAYOUT_CALL, VERIFY_REGISTRATION_CALL, buildLanguageSnippets, bulkIdentifyCurlExample, bulkIdentifyTsExample, companyLookupCurlExample, companyLookupGoExample, companyLookupPythonExample, companyLookupTsExample, curlExample, goExample, javascriptExample, nodeExample, pythonExample };
