// =============================================================================
// ninja-bet V2: Hosted Link Generation Scenarios
// =============================================================================
function getLinkScenarioConfig(scenario, playerName, playerId, withdrawalRef, firstName, lastName, dateOfBirth = '1975-01-01') {
    const flowId = 'vf_QAIWePPP4cLtGCaIkDeJillxxwYiV';
    if (scenario === 'prefilled') {
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
        const ts = `import { NinjaClient } from '@bougroup/ninja-node'

const ninja = new NinjaClient({
  clientKey: process.env.NINJA_CLIENT_KEY!,
  clientSecret: process.env.NINJA_CLIENT_SECRET!,
})

// Scenario 1: Pre-filled link — first name, surname, and DOB are pre-populated!
// Customer skips all manual data entry and jumps straight to the live camera selfie.
// Saves verification costs, eliminates drop-off, and avoids spelling typos.
const link = await ninja.flows.createLink('${flowId}', {
  customerName: '${playerName}',
  customerRef: '${playerId}:${withdrawalRef}',
  values: {
    first_name: '${firstName}',
    last_name: '${lastName}',
    date_of_birth: '${dateOfBirth}',
  },
})

console.log('Single-use hosted biometric URL:', link.url)`;
        const python = `import os
import requests

# Scenario 1: Pre-filled flow link (first name, surname, date of birth)
# Pre-populating prevents user friction and saves redundant verification calls.
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
print("Hosted camera link:", link["url"])`;
        const go = `package main

import (
	"context"
	"fmt"
	"github.com/bougroup/ninja-go"
)

func main() {
	// Scenario 1: Pre-filled hosted verification link
	// Passing registered name + DOB eliminates drop-off and saves verification resources.
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
	fmt.Println("Hosted selfie URL:", link.URL)
}`;
        return {
            id: 'prefilled',
            name: 'Pre-filled Session (Recommended)',
            badge: 'Best UX & Saves Resources',
            description: 'Ninja pre-fills the first name, surname, and date of birth from your registration records. The customer jumps straight into the live camera selfie without re-entering details — eliminating drop-off, avoiding typos, and saving valuable verification resources.',
            flowId,
            requestPayload: payload,
            curl,
            ts,
            python,
            go,
        };
    }
    if (scenario === 'unfilled') {
        const payload = {
            customer_name: playerName,
            customer_ref: `${playerId}:${withdrawalRef}`,
        };
        const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
        const ts = `// Scenario 2: Unfilled link — cold KYC where Ninja collects
// identity details directly from the user on the hosted portal.
const link = await ninja.flows.createLink('${flowId}', {
  customerName: '${playerName}',
  customerRef: '${playerId}:${withdrawalRef}',
})
console.log('Unfilled KYC URL:', link.url)`;
        const python = `# Scenario 2: Unfilled flow link
response = requests.post(
    "https://api.ninja.ng/api/flows/${flowId}/links",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "customer_name": "${playerName}",
        "customer_ref": "${playerId}:${withdrawalRef}"
    }
)
print("Unfilled URL:", response.json()["url"])`;
        const go = `// Scenario 2: Unfilled flow link
link, err := ninjaClient.CreateFlowLink(ctx, "${flowId}", ninja.CreateFlowLinkRequest{
	CustomerName: "${playerName}",
	CustomerRef:  "${playerId}:${withdrawalRef}",
})`;
        return {
            id: 'unfilled',
            name: 'Blank Form (Cold KYC)',
            badge: 'Cold Onboarding',
            description: 'Generates an unfilled single-use flow where the user manually types all their information from scratch into Ninja’s hosted portal.',
            flowId,
            requestPayload: payload,
            curl,
            ts,
            python,
            go,
        };
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
    };
    const curl = `curl -X POST https://api.ninja.ng/api/flows/${flowId}/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`;
    const ts = `// Scenario 3: Custom Reference Tracking — bind your platform's internal
// payout ledger ID and fraud tier to the single-use verification session.
const link = await ninja.flows.createLink('${flowId}', {
  customerName: '${playerName}',
  customerRef: 'wtd_sec_${withdrawalRef}:tier_strict',
  values: {
    first_name: '${firstName}',
    last_name: '${lastName}',
    date_of_birth: '${dateOfBirth}',
  },
})`;
    const python = `# Scenario 3: Custom reference & telemetry tracking
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
    const go = `// Scenario 3: Custom reference tracking
link, err := ninjaClient.CreateFlowLink(ctx, "${flowId}", ninja.CreateFlowLinkRequest{
	CustomerName: "${playerName}",
	CustomerRef:  "wtd_sec_${withdrawalRef}:tier_strict",
	Values: map[string]any{
		"first_name":    "${firstName}",
		"last_name":     "${lastName}",
		"date_of_birth": "${dateOfBirth}",
	},
})`;
    return {
        id: 'custom',
        name: 'Custom Ref & Tracking',
        badge: 'Ledger Audit',
        description: 'Prefills the verified name and DOB while passing internal transaction references through customer_ref so webhooks automatically tie back to the specific withdrawal transaction in your ledger.',
        flowId,
        requestPayload: payload,
        curl,
        ts,
        python,
        go,
    };
}

export { getLinkScenarioConfig };
