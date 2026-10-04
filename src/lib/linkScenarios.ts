// =============================================================================
// ninja-bet: Hosted Verification Link Scenarios (KYC Flows & Link Generation)
// =============================================================================

// Where Ninja sends the player after the hosted check, e.g.
// https://ninja-demo-pink.vercel.app/?vs_id=vs_...&status=failed
// It's this page's own address, so it's right on Vercel and on localhost.
// index.ts reads vs_id on load and shows that verification's result.
import type { Thresholds } from './state'

const FLOW_ID_PLACEHOLDER = '{flow_id}'

// Face match and liveness minimums (0-100) each scenario's flow is created with.
// Pre-filled and Blank Form are fixed; Custom comes from the user's inputs.
export function scenarioThresholds(scenario: 'prefilled' | 'unfilled' | 'custom', custom?: Thresholds): Thresholds {
  if (scenario === 'custom') return { face: custom?.face ?? 90, liveness: custom?.liveness ?? 90 }
  return { face: 85, liveness: 85 }
}

const REDIRECT_URL = typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://ninja-demo-pink.vercel.app/'

export interface LinkScenarioConfig {
  id: 'prefilled' | 'unfilled' | 'custom'
  name: string
  badge: string
  description: string
  flowId: string
  flowName: string
  flowRequestPayload: Record<string, any>
  flowResponsePayload: Record<string, any>
  flowCurl: string
  flowTs: string
  flowPython: string
  flowGo: string
  flowRust: string
  requestPayload: Record<string, any>
  curl: string
  ts: string
  python: string
  go: string
  rust: string
}

export function getLinkScenarioConfig(
  scenario: 'prefilled' | 'unfilled' | 'custom',
  playerName: string,
  playerId: string,
  withdrawalRef: string,
  firstName: string,
  lastName: string,
  dateOfBirth: string = '1975-01-01',
  // The id Ninja returned from POST /api/flows. Until a flow exists, snippets
  // show {flow_id} — there is no preset flow.
  createdFlowId?: string,
  customThresholds?: Thresholds
): LinkScenarioConfig {
  const t = scenarioThresholds(scenario, customThresholds)
  if (scenario === 'prefilled') {
    const flowId = createdFlowId || FLOW_ID_PLACEHOLDER
    const flowName = 'Sportsbook Payout Face Verification (Pre-filled)'
    const flowPayload = {
      name: flowName,
      id_types: ['nin'],
      rules: {
        allow_transposed_names: true,
        accept_score: 0.90,
        review_score: 0.60,
        min_age: 18,
        fields: [
          { field: 'first_name', match: 'name', required: true, source: 'business' },
          { field: 'last_name', match: 'name', required: true, source: 'business' },
          { field: 'date_of_birth', match: 'date', required: true, source: 'business' },
        ],
      },
      selfie_required: true,
      selfie_threshold: t.face,
      liveness_required: true,
      liveness_threshold: t.liveness,
      branding: { display_name: 'NinjaBet', primary_color: '#10b981' },
      redirect_url: REDIRECT_URL,
      webhook_url: 'https://webhook.site/6282e26f-3dca-4d4c-af23-c3603963c1ef',
    }

    const flowResponsePayload = {
      id: flowId,
      name: flowName,
      status: 'active',
      sandbox: true,
      rules: flowPayload.rules,
      created_at: new Date().toISOString(),
    }

    const flowCurl = `curl -X POST https://api.ninja.ng/api/flows \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(flowPayload, null, 2)}'`

    const flowTs = `const flow = await ninja.flows.create(${JSON.stringify(flowPayload, null, 2)})
console.log('Flow created:', flow.id)`

    const flowPython = `response = requests.post(
    "https://api.ninja.ng/api/flows",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(flowPayload, null, 4)}
)`

    const flowGo = `flow, err := ninjaClient.CreateFlow(ctx, ninja.CreateFlowRequest{
    Name: "${flowName}",
    IDTypes: []string{"nin"},
    Rules: ninja.FlowRules{
        AllowTransposedNames: true,
    },
    SelfieRequired:    true,
    SelfieThreshold:   ${t.face},
    LivenessRequired:  true,
    LivenessThreshold: ${t.liveness},
})`

    const flowRust = `let res = client
    .post("https://api.ninja.ng/api/flows")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(flowPayload, null, 4)}))
    .send()
    .await?;`

    // Case 1 Link Payload
    const payload = {
      customer_name: playerName,
      customer_ref: `${playerId}:${withdrawalRef}`,
      values: {
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dateOfBirth,
      },
    }

    const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`

    const ts = `// Case 1: Pre-filled Verification Link (Seamless UX)
// Ninja pre-fills name and DOB. Customer skips typing and jumps directly into face verification.
const link = await ninja.flows.createLink('${flowId}', {
  customerName: '${playerName}',
  customerRef: '${playerId}:${withdrawalRef}',
  values: {
    first_name: '${firstName}',
    last_name: '${lastName}',
    date_of_birth: '${dateOfBirth}',
  },
})
console.log('Hosted verification link:', link.url)`

    const python = `# Case 1: Pre-filled verification flow link
response = requests.post(
    "https://api.ninja.ng/api/flows/${flowId}/links",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "customer_name": "${playerName}",
        "customer_ref": "${playerId}:${withdrawalRef}",
        "values": {
            "first_name": "${firstName}",
            "last_name": "${lastName}",
            "date_of_birth": "${dateOfBirth}"
        }
    }
)
link = response.json()
print("Hosted verification link:", link["url"])`

    const go = `// Case 1: Pre-filled hosted verification link
link, err := ninjaClient.CreateFlowLink(context.Background(), "${flowId}", ninja.CreateFlowLinkRequest{
    CustomerName: "${playerName}",
    CustomerRef:  "${playerId}:${withdrawalRef}",
    Values: map[string]any{
        "first_name":    "${firstName}",
        "last_name":     "${lastName}",
        "date_of_birth": "${dateOfBirth}",
    },
})`

    const rust = `// Case 1: Pre-filled hosted verification link
let res = client
    .post("https://api.ninja.ng/api/flows/${flowId}/links")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`

    return {
      id: 'prefilled',
      name: 'Pre-filled Session (Recommended)',
      badge: 'Best UX & High Conversion',
      description:
        'Ninja pre-fills the first name, surname, and date of birth from your database (source: "business"). The customer skips manual typing and jumps straight into live biometric verification.',
      flowId,
      flowName,
      flowRequestPayload: flowPayload,
      flowResponsePayload,
      flowCurl,
      flowTs,
      flowPython,
      flowGo,
      flowRust,
      requestPayload: payload,
      curl,
      ts,
      python,
      go,
      rust,
    }
  }

  if (scenario === 'unfilled') {
    const flowId = createdFlowId || FLOW_ID_PLACEHOLDER
    const flowName = 'Sportsbook Payout Face Verification (Blank Form)'
    const flowPayload = {
      name: flowName,
      id_types: ['nin'],
      rules: {
        allow_transposed_names: true,
        accept_score: 0.90,
        review_score: 0.60,
        min_age: 18,
        fields: [
          { field: 'first_name', match: 'name', required: true, source: 'customer' },
          { field: 'last_name', match: 'name', required: true, source: 'customer' },
          { field: 'date_of_birth', match: 'date', required: true, source: 'customer' },
        ],
      },
      selfie_required: true,
      selfie_threshold: t.face,
      liveness_required: true,
      liveness_threshold: t.liveness,
      branding: { display_name: 'NinjaBet', primary_color: '#10b981' },
      redirect_url: REDIRECT_URL,
      webhook_url: 'https://webhook.site/4006b092-0050-4a89-aa8a-93368ac8d44c',
    }

    const flowResponsePayload = {
      id: flowId,
      name: flowName,
      status: 'active',
      sandbox: true,
      rules: flowPayload.rules,
      created_at: new Date().toISOString(),
    }

    const flowCurl = `curl -X POST https://api.ninja.ng/api/flows \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(flowPayload, null, 2)}'`

    const flowTs = `const flow = await ninja.flows.create(${JSON.stringify(flowPayload, null, 2)})
console.log('Flow created:', flow.id)`

    const flowPython = `response = requests.post(
    "https://api.ninja.ng/api/flows",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(flowPayload, null, 4)}
)`

    const flowGo = `flow, err := ninjaClient.CreateFlow(ctx, ninja.CreateFlowRequest{
    Name: "${flowName}",
    IDTypes: []string{"nin"},
    Rules: ninja.FlowRules{
        AllowTransposedNames: true,
    },
    SelfieRequired:    true,
    SelfieThreshold:   ${t.face},
    LivenessRequired:  true,
    LivenessThreshold: ${t.liveness},
})`

    const flowRust = `let res = client
    .post("https://api.ninja.ng/api/flows")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(flowPayload, null, 4)}))
    .send()
    .await?;`

    // Case 2 Link Payload: NO values supplied! Customer fills form on Ninja's portal
    const payload = {
      customer_name: playerName,
      customer_ref: `${playerId}:${withdrawalRef}`,
    }

    const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`

    const ts = `// Case 2: Blank Form (Customer Types Details On-Screen)
// Generates an unfilled link where the customer enters their details on Ninja's portal.
const link = await ninja.flows.createLink('${flowId}', {
  customerName: '${playerName}',
  customerRef: '${playerId}:${withdrawalRef}',
})
console.log('Blank form verification link:', link.url)`

    const python = `# Case 2: Blank Form verification flow link
response = requests.post(
    "https://api.ninja.ng/api/flows/${flowId}/links",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "customer_name": "${playerName}",
        "customer_ref": "${playerId}:${withdrawalRef}"
    }
)
print("Blank form verification link:", response.json()["url"])`

    const go = `// Case 2: Blank Form verification flow link
link, err := ninjaClient.CreateFlowLink(ctx, "${flowId}", ninja.CreateFlowLinkRequest{
    CustomerName: "${playerName}",
    CustomerRef:  "${playerId}:${withdrawalRef}",
})`

    const rust = `// Case 2: Blank Form verification link
let res = client
    .post("https://api.ninja.ng/api/flows/${flowId}/links")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`

    return {
      id: 'unfilled',
      name: 'Blank Form (Cold KYC)',
      badge: 'Cold User Onboarding',
      description:
        'Flow defines source: "customer". Ninja provides an empty form where the user types their personal details directly on Ninja’s portal before facial verification.',
      flowId,
      flowName,
      flowRequestPayload: flowPayload,
      flowResponsePayload,
      flowCurl,
      flowTs,
      flowPython,
      flowGo,
      flowRust,
      requestPayload: payload,
      curl,
      ts,
      python,
      go,
      rust,
    }
  }

  // scenario === 'custom'
  const flowId = createdFlowId || FLOW_ID_PLACEHOLDER
  const flowName = 'Sportsbook Payout Face Verification (Audited)'
  const flowPayload = {
    name: flowName,
    id_types: ['nin'],
    rules: {
      allow_transposed_names: true,
      accept_score: 0.90,
      review_score: 0.60,
      min_age: 18,
      fields: [
        { field: 'first_name', match: 'name', required: true, source: 'business' },
        { field: 'last_name', match: 'name', required: true, source: 'business' },
        { field: 'date_of_birth', match: 'date', required: true, source: 'business' },
      ],
    },
    selfie_required: true,
    selfie_threshold: t.face,
    liveness_required: true,
    liveness_threshold: t.liveness,
    branding: { display_name: 'NinjaBet', primary_color: '#10b981' },
    redirect_url: REDIRECT_URL,
    webhook_url: 'https://webhook.site/4006b092-0050-4a89-aa8a-93368ac8d44c',
  }

  const flowResponsePayload = {
    id: flowId,
    name: flowName,
    status: 'active',
    sandbox: true,
    rules: flowPayload.rules,
    created_at: new Date().toISOString(),
  }

  const flowCurl = `curl -X POST https://api.ninja.ng/api/flows \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(flowPayload, null, 2)}'`

  const flowTs = `const flow = await ninja.flows.create(${JSON.stringify(flowPayload, null, 2)})
console.log('Flow created:', flow.id)`

  const flowPython = `response = requests.post(
    "https://api.ninja.ng/api/flows",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(flowPayload, null, 4)}
)`

  const flowGo = `flow, err := ninjaClient.CreateFlow(ctx, ninja.CreateFlowRequest{
    Name: "${flowName}",
    IDTypes: []string{"nin"},
    Rules: ninja.FlowRules{
        AllowTransposedNames: true,
    },
    SelfieRequired:    true,
    SelfieThreshold:   ${t.face},
    LivenessRequired:  true,
    LivenessThreshold: ${t.liveness},
})`

  const flowRust = `let res = client
    .post("https://api.ninja.ng/api/flows")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(flowPayload, null, 4)}))
    .send()
    .await?;`

  // Case 3 Link Payload: Custom reference & audit tag attached
  const payload = {
    customer_name: playerName,
    customer_ref: `wtd_sec_${withdrawalRef}:tier_strict`,
    values: {
      first_name: firstName,
      last_name: lastName,
      date_of_birth: dateOfBirth,
    },
  }

  const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`

  const ts = `// Case 3: Custom Reference Tracking & Payout Ledger Audit
// Bind your internal transaction reference directly to the session.
// Webhook events carry this exact customer_ref for automated ledger reconciliation.
const link = await ninja.flows.createLink('${flowId}', {
  customerName: '${playerName}',
  customerRef: 'wtd_sec_${withdrawalRef}:tier_strict',
  values: {
    first_name: '${firstName}',
    last_name: '${lastName}',
    date_of_birth: '${dateOfBirth}',
  },
})
console.log('Audited verification link:', link.url)`

  const python = `# Case 3: Custom reference & ledger audit tracking
response = requests.post(
    "https://api.ninja.ng/api/flows/${flowId}/links",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "customer_name": "${playerName}",
        "customer_ref": "wtd_sec_${withdrawalRef}:tier_strict",
        "values": {
            "first_name": "${firstName}",
            "last_name": "${lastName}",
            "date_of_birth": "${dateOfBirth}"
        }
    }
)`

  const go = `// Case 3: Custom reference tracking
link, err := ninjaClient.CreateFlowLink(ctx, "${flowId}", ninja.CreateFlowLinkRequest{
    CustomerName: "${playerName}",
    CustomerRef:  "wtd_sec_${withdrawalRef}:tier_strict",
    Values: map[string]any{
        "first_name":    "${firstName}",
        "last_name":     "${lastName}",
        "date_of_birth": "${dateOfBirth}",
    },
})`

  const rust = `// Case 3: Custom reference tracking
let res = client
    .post("https://api.ninja.ng/api/flows/${flowId}/links")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`

  return {
    id: 'custom',
    name: 'Custom Ref & Tracking',
    badge: 'Ledger Audit Reconciled',
    description:
      'Prefills identity and attaches your internal transaction reference (customer_ref). Webhooks correlate directly with your payout queue.',
    flowId,
    flowName,
    flowRequestPayload: flowPayload,
    flowResponsePayload,
    flowCurl,
    flowTs,
    flowPython,
    flowGo,
    flowRust,
    requestPayload: payload,
    curl,
    ts,
    python,
    go,
    rust,
  }
}

export interface FlowCreationConfig {
  flowId: string
  requestPayload: Record<string, any>
  responsePayload: Record<string, any>
  curl: string
  ts: string
  python: string
  go: string
  rust: string
}

export function getFlowCreationConfig(
  scenario: 'prefilled' | 'unfilled' | 'custom' = 'prefilled',
  customThresholds?: Thresholds
): FlowCreationConfig {
  const cfg = getLinkScenarioConfig(scenario, 'James Bond', 'player_007', 'wtd_01', 'James', 'Bond', '1975-01-01', undefined, customThresholds)
  return {
    flowId: cfg.flowId,
    requestPayload: cfg.flowRequestPayload,
    responsePayload: cfg.flowResponsePayload,
    curl: cfg.flowCurl,
    ts: cfg.flowTs,
    python: cfg.flowPython,
    go: cfg.flowGo,
    rust: cfg.flowRust,
  }
}
