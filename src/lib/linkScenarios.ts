// =============================================================================
// ninja-bet: Hosted Verification Link Scenarios
// =============================================================================

export interface LinkScenarioConfig {
  id: 'prefilled' | 'unfilled' | 'custom'
  name: string
  badge: string
  description: string
  flowId: string
  requestPayload: Record<string, any>
  curl: string
  ts: string
  python: string
  go: string
}

export function getLinkScenarioConfig(
  scenario: 'prefilled' | 'unfilled' | 'custom',
  playerName: string,
  playerId: string,
  withdrawalRef: string,
  firstName: string,
  lastName: string,
  dateOfBirth: string = '1975-01-01'
): LinkScenarioConfig {
  const flowId = 'vf_QAIWePPP4cLtGCaIkDeJillxxwYiV'

  if (scenario === 'prefilled') {
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

    const ts = `import { NinjaClient } from '@bougroup/ninja-node'

const ninja = new NinjaClient({
  clientKey: process.env.NINJA_CLIENT_KEY!,
  clientSecret: process.env.NINJA_CLIENT_SECRET!,
})

// Case 1: Pre-filled Verification Link (Recommended for Seamless UX)
// Ninja pre-fills First Name, Last Name, and Date of Birth from your database.
// The customer skips typing and proceeds straight into live facial verification.
// Prevents player drop-off, eliminates keyboard typos, and stops fraud.
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

    const python = `import os
import requests

# Case 1: Pre-filled verification flow link
# Pre-populating avoids user friction and accelerates checkout approval.
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

    const go = `package main

import (
	"context"
	"fmt"
	"github.com/bougroup/ninja-go"
)

func main() {
	// Case 1: Pre-filled hosted verification link
	// Passing verified name + DOB eliminates drop-off and secures payout.
	link, err := ninjaClient.CreateFlowLink(context.Background(), "${flowId}", ninja.CreateFlowLinkRequest{
		CustomerName: "${playerName}",
		CustomerRef:  "${playerId}:${withdrawalRef}",
		Values: map[string]any{
			"first_name":    "${firstName}",
			"last_name":     "${lastName}",
			"date_of_birth": "${dateOfBirth}",
		},
	})
	if err != nil {
		panic(err)
	}
	fmt.Println("Hosted verification link:", link.URL)
}`

    return {
      id: 'prefilled',
      name: 'Pre-filled Session (Recommended)',
      badge: 'Best UX & High Conversion',
      description:
        'Ninja pre-fills the first name, surname, and date of birth from your registration records. The customer skips manual typing and jumps straight into live biometric verification — eliminating drop-off and preventing spelling mistakes.',
      flowId,
      requestPayload: payload,
      curl,
      ts,
      python,
      go,
    }
  }

  if (scenario === 'unfilled') {
    const payload = {
      customer_name: playerName,
      customer_ref: `${playerId}:${withdrawalRef}`,
    }

    const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`

    const ts = `// Case 2: Blank Form (Cold KYC Verification Link)
// Generates an unfilled link where the customer enters their own identity details
// directly on Ninja's secure portal before the live face check is conducted.
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

    return {
      id: 'unfilled',
      name: 'Blank Form (Cold KYC)',
      badge: 'Cold User Onboarding',
      description:
        'Generates an unfilled verification link where the user manually types their details from scratch on Ninja’s hosted portal before live facial verification. Useful for re-verifying flagged accounts or cold onboarding.',
      flowId,
      requestPayload: payload,
      curl,
      ts,
      python,
      go,
    }
  }

  // scenario === 'custom'
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
// Bind your internal payout transaction ID and risk tier directly to the session.
// Webhook events carry this exact customer_ref back for automated ledger reconciliation.
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

  return {
    id: 'custom',
    name: 'Custom Ref & Tracking',
    badge: 'Ledger Audit Reconciled',
    description:
      'Prefills the verified identity and passes internal transaction references through customer_ref. Webhooks automatically correlate with your payout queue without extra database lookups.',
    flowId,
    requestPayload: payload,
    curl,
    ts,
    python,
    go,
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
}

export function getFlowCreationConfig(): FlowCreationConfig {
  const flowId = 'vf_QAIWePPP4cLtGCaIkDeJillxxwYiV'
  const payload = {
    name: 'Sportsbook Payout Face Verification',
    id_types: ['nin'],
    rules: {
      allow_transposed_names: true,
      require_liveness: true,
      liveness_threshold: 85,
    },
  }

  const curl = `curl -X POST https://api.ninja.ng/api/flows \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`

  const ts = `import { NinjaClient } from '@bougroup/ninja-node'

const ninja = new NinjaClient({
  clientKey: process.env.NINJA_CLIENT_KEY!,
  clientSecret: process.env.NINJA_CLIENT_SECRET!,
})

// Initial Setup: Create the Payout Verification Flow in Ninja Sandbox
const flow = await ninja.flows.create({
  name: 'Sportsbook Payout Face Verification',
  idTypes: ['nin'],
  rules: {
    allowTransposedNames: true,
    requireLiveness: true,
    livenessThreshold: 85,
  },
})

console.log('Flow ID created:', flow.id) // ${flowId}`

  const python = `import os
import requests

# Initial Setup: Create Sandbox Verification Flow
response = requests.post(
    "https://api.ninja.ng/api/flows",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(payload, null, 4)}
)
flow = response.json()
print("Flow ID:", flow["id"])`

  const go = `package main

import (
	"context"
	"fmt"
	"github.com/bougroup/ninja-go"
)

func main() {
	// Initial Setup: Create Sandbox Verification Flow
	flow, err := ninjaClient.CreateFlow(context.Background(), ninja.CreateFlowRequest{
		Name:    "Sportsbook Payout Face Verification",
		IDTypes: []string{"nin"},
		Rules: ninja.FlowRules{
			AllowTransposedNames: true,
			RequireLiveness:      true,
			LivenessThreshold:    85,
		},
	})
	if err != nil {
		panic(err)
	}
	fmt.Println("Flow ID:", flow.ID)
}`

  return {
    flowId,
    requestPayload: payload,
    responsePayload: {
      id: flowId,
      name: 'Sportsbook Payout Face Verification',
      id_types: ['nin'],
      rules: {
        allow_transposed_names: true,
        require_liveness: true,
        liveness_threshold: 85,
      },
      status: 'active',
      sandbox: true,
      created_at: '2026-09-25T10:00:00Z',
    },
    curl,
    ts,
    python,
    go,
  }
}

