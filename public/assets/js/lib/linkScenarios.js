// =============================================================================
// ninja-bet: Hosted Verification Link Scenarios (KYC Flows & Link Generation)
// =============================================================================
// Where Ninja sends the player after the hosted check, e.g.
// https://ninja-demo-pink.vercel.app/?vs_id=vs_...&status=failed
// It's this page's own address, so it's right on Vercel and on localhost.
// index.ts reads vs_id on load and shows that verification's result.
const REDIRECT_URL = typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://ninja-demo-pink.vercel.app/';
function getLinkScenarioConfig(scenario, playerName, playerId, withdrawalRef, firstName, lastName, dateOfBirth = '1975-01-01') {
    if (scenario === 'prefilled') {
        const flowId = 'vf_sportsbook_prefilled';
        const flowName = 'Sportsbook Payout Face Verification (Pre-filled)';
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
            selfie_threshold: 85,
            liveness_required: true,
            liveness_threshold: 85,
            branding: { display_name: 'NinjaBet', primary_color: '#10b981' },
            redirect_url: REDIRECT_URL,
            webhook_url: 'https://webhook.site/6282e26f-3dca-4d4c-af23-c3603963c1ef',
        };
        const flowResponsePayload = {
            id: flowId,
            name: flowName,
            status: 'active',
            sandbox: true,
            rules: flowPayload.rules,
            created_at: new Date().toISOString(),
        };
        const flowCurl = `curl -X POST https://api.ninja.ng/api/flows \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(flowPayload, null, 2)}'`;
        const flowTs = `const flow = await ninja.flows.create(${JSON.stringify(flowPayload, null, 2)})
console.log('Flow created:', flow.id)`;
        const flowPython = `response = requests.post(
    "https://api.ninja.ng/api/flows",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(flowPayload, null, 4)}
)`;
        const flowGo = `flow, err := ninjaClient.CreateFlow(ctx, ninja.CreateFlowRequest{
    Name: "${flowName}",
    IDTypes: []string{"nin"},
    Rules: ninja.FlowRules{
        AllowTransposedNames: true,
    },
    SelfieRequired:    true,
    SelfieThreshold:   85,
    LivenessRequired:  true,
    LivenessThreshold: 85,
})`;
        const flowRust = `let res = client
    .post("https://api.ninja.ng/api/flows")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(flowPayload, null, 4)}))
    .send()
    .await?;`;
        // Case 1 Link Payload
        const payload = {
            customer_name: playerName,
            customer_ref: `${playerId}:${withdrawalRef}`,
            values: {
                first_name: firstName,
                last_name: lastName,
                date_of_birth: dateOfBirth,
            },
        };
        const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
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
console.log('Hosted verification link:', link.url)`;
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
print("Hosted verification link:", link["url"])`;
        const go = `// Case 1: Pre-filled hosted verification link
link, err := ninjaClient.CreateFlowLink(context.Background(), "${flowId}", ninja.CreateFlowLinkRequest{
    CustomerName: "${playerName}",
    CustomerRef:  "${playerId}:${withdrawalRef}",
    Values: map[string]any{
        "first_name":    "${firstName}",
        "last_name":     "${lastName}",
        "date_of_birth": "${dateOfBirth}",
    },
})`;
        const rust = `// Case 1: Pre-filled hosted verification link
let res = client
    .post("https://api.ninja.ng/api/flows/${flowId}/links")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`;
        return {
            id: 'prefilled',
            name: 'Pre-filled Session (Recommended)',
            badge: 'Best UX & High Conversion',
            description: 'Ninja pre-fills the first name, surname, and date of birth from your database (source: "business"). The customer skips manual typing and jumps straight into live biometric verification.',
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
        };
    }
    if (scenario === 'unfilled') {
        const flowId = 'vf_sportsbook_blank_form';
        const flowName = 'Sportsbook Payout Face Verification (Blank Form)';
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
            selfie_threshold: 85,
            liveness_required: true,
            liveness_threshold: 85,
            branding: { display_name: 'NinjaBet', primary_color: '#10b981' },
            redirect_url: REDIRECT_URL,
            webhook_url: 'https://webhook.site/4006b092-0050-4a89-aa8a-93368ac8d44c',
        };
        const flowResponsePayload = {
            id: flowId,
            name: flowName,
            status: 'active',
            sandbox: true,
            rules: flowPayload.rules,
            created_at: new Date().toISOString(),
        };
        const flowCurl = `curl -X POST https://api.ninja.ng/api/flows \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(flowPayload, null, 2)}'`;
        const flowTs = `const flow = await ninja.flows.create(${JSON.stringify(flowPayload, null, 2)})
console.log('Flow created:', flow.id)`;
        const flowPython = `response = requests.post(
    "https://api.ninja.ng/api/flows",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(flowPayload, null, 4)}
)`;
        const flowGo = `flow, err := ninjaClient.CreateFlow(ctx, ninja.CreateFlowRequest{
    Name: "${flowName}",
    IDTypes: []string{"nin"},
    Rules: ninja.FlowRules{
        AllowTransposedNames: true,
    },
    SelfieRequired:    true,
    SelfieThreshold:   85,
    LivenessRequired:  true,
    LivenessThreshold: 85,
})`;
        const flowRust = `let res = client
    .post("https://api.ninja.ng/api/flows")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(flowPayload, null, 4)}))
    .send()
    .await?;`;
        // Case 2 Link Payload: NO values supplied! Customer fills form on Ninja's portal
        const payload = {
            customer_name: playerName,
            customer_ref: `${playerId}:${withdrawalRef}`,
        };
        const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
        const ts = `// Case 2: Blank Form (Customer Types Details On-Screen)
// Generates an unfilled link where the customer enters their details on Ninja's portal.
const link = await ninja.flows.createLink('${flowId}', {
  customerName: '${playerName}',
  customerRef: '${playerId}:${withdrawalRef}',
})
console.log('Blank form verification link:', link.url)`;
        const python = `# Case 2: Blank Form verification flow link
response = requests.post(
    "https://api.ninja.ng/api/flows/${flowId}/links",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "customer_name": "${playerName}",
        "customer_ref": "${playerId}:${withdrawalRef}"
    }
)
print("Blank form verification link:", response.json()["url"])`;
        const go = `// Case 2: Blank Form verification flow link
link, err := ninjaClient.CreateFlowLink(ctx, "${flowId}", ninja.CreateFlowLinkRequest{
    CustomerName: "${playerName}",
    CustomerRef:  "${playerId}:${withdrawalRef}",
})`;
        const rust = `// Case 2: Blank Form verification link
let res = client
    .post("https://api.ninja.ng/api/flows/${flowId}/links")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`;
        return {
            id: 'unfilled',
            name: 'Blank Form (Cold KYC)',
            badge: 'Cold User Onboarding',
            description: 'Flow defines source: "customer". Ninja provides an empty form where the user types their personal details directly on Ninja’s portal before facial verification.',
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
        };
    }
    // scenario === 'custom'
    const flowId = 'vf_sportsbook_custom_ref';
    const flowName = 'Sportsbook Payout Face Verification (Audited)';
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
        selfie_threshold: 90,
        liveness_required: true,
        liveness_threshold: 90,
        branding: { display_name: 'NinjaBet', primary_color: '#10b981' },
        redirect_url: REDIRECT_URL,
        webhook_url: 'https://webhook.site/4006b092-0050-4a89-aa8a-93368ac8d44c',
    };
    const flowResponsePayload = {
        id: flowId,
        name: flowName,
        status: 'active',
        sandbox: true,
        rules: flowPayload.rules,
        created_at: new Date().toISOString(),
    };
    const flowCurl = `curl -X POST https://api.ninja.ng/api/flows \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(flowPayload, null, 2)}'`;
    const flowTs = `const flow = await ninja.flows.create(${JSON.stringify(flowPayload, null, 2)})
console.log('Flow created:', flow.id)`;
    const flowPython = `response = requests.post(
    "https://api.ninja.ng/api/flows",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(flowPayload, null, 4)}
)`;
    const flowGo = `flow, err := ninjaClient.CreateFlow(ctx, ninja.CreateFlowRequest{
    Name: "${flowName}",
    IDTypes: []string{"nin"},
    Rules: ninja.FlowRules{
        AllowTransposedNames: true,
    },
    SelfieRequired:    true,
    SelfieThreshold:   90,
    LivenessRequired:  true,
    LivenessThreshold: 90,
})`;
    const flowRust = `let res = client
    .post("https://api.ninja.ng/api/flows")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(flowPayload, null, 4)}))
    .send()
    .await?;`;
    // Case 3 Link Payload: Custom reference & audit tag attached
    const payload = {
        customer_name: playerName,
        customer_ref: `wtd_sec_${withdrawalRef}:tier_strict`,
        values: {
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dateOfBirth,
        },
    };
    const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
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
console.log('Audited verification link:', link.url)`;
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
)`;
    const go = `// Case 3: Custom reference tracking
link, err := ninjaClient.CreateFlowLink(ctx, "${flowId}", ninja.CreateFlowLinkRequest{
    CustomerName: "${playerName}",
    CustomerRef:  "wtd_sec_${withdrawalRef}:tier_strict",
    Values: map[string]any{
        "first_name":    "${firstName}",
        "last_name":     "${lastName}",
        "date_of_birth": "${dateOfBirth}",
    },
})`;
    const rust = `// Case 3: Custom reference tracking
let res = client
    .post("https://api.ninja.ng/api/flows/${flowId}/links")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`;
    return {
        id: 'custom',
        name: 'Custom Ref & Tracking',
        badge: 'Ledger Audit Reconciled',
        description: 'Prefills identity and attaches your internal transaction reference (customer_ref). Webhooks correlate directly with your payout queue.',
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
    };
}
function getFlowCreationConfig(scenario = 'prefilled') {
    const cfg = getLinkScenarioConfig(scenario, 'James Bond', 'player_007', 'wtd_01', 'James', 'Bond', '1975-01-01');
    return {
        flowId: cfg.flowId,
        requestPayload: cfg.flowRequestPayload,
        responsePayload: cfg.flowResponsePayload,
        curl: cfg.flowCurl,
        ts: cfg.flowTs,
        python: cfg.flowPython,
        go: cfg.flowGo,
        rust: cfg.flowRust,
    };
}

export { getFlowCreationConfig, getLinkScenarioConfig };
