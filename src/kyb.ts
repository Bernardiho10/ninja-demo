// =============================================================================
// ninja-kyb: Interactive Corporate Business KYB & CAC Verification Workbench
// =============================================================================

import confetti from 'canvas-confetti'
import Prism from 'prismjs'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-rust'

import {
  loadKybState,
  saveKybState,
  canAccessKybStep,
  type KybDemoState,
  type KybTelemetryLog,
} from './lib/kybState'

import {
  SANDBOX_KYB_RCS,
  getSandboxKybCheck,
  getSandboxDirectors,
  type SandboxCompany,
  type SandboxDirector,
} from './lib/kybSandbox'

import { showCodeFirstSlideOut } from './lib/codeModal'
import { updateKybNavFromState } from './kyb-nav'

// Vercel Web Analytics
import './analytics'

let state: KybDemoState = loadKybState()

let lastToastTime = 0
let lastToastMsg = ''

export function showToast(
  message: string,
  type: 'warning' | 'error' | 'success' | 'info' = 'warning'
) {
  const now = Date.now()
  if (lastToastMsg === message && now - lastToastTime < 1500) {
    return
  }
  lastToastTime = now
  lastToastMsg = message

  let container = document.getElementById('ninja-toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'ninja-toast-container'
    container.className = 'ninja-toast-container'
    document.body.appendChild(container)
  }

  container.innerHTML = ''

  const toast = document.createElement('div')
  toast.className = `ninja-toast toast-${type}`
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'

  toast.innerHTML = `
    <span class="toast-icon-badge">${icon}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
    <button type="button" class="toast-close" title="Dismiss">✕</button>
  `

  const closeBtn = toast.querySelector('.toast-close')
  let timer: any = null

  const dismiss = () => {
    if (timer) clearTimeout(timer)
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(-6px) scale(0.96)'
    setTimeout(() => {
      toast.remove()
    }, 180)
  }

  closeBtn?.addEventListener('click', dismiss)
  container.appendChild(toast)
  timer = setTimeout(dismiss, 3500)
}

function escapeHtml(str: string): string {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function init() {
  state.logs = state.logs || []

  bindStep1()
  bindStep2()
  bindStep3()
  bindLogs()

  // Navigation listener from nav stepper clicks
  window.addEventListener('ninjakyb:navigate-step', (e: any) => {
    if (e.detail?.step) {
      goToStep(e.detail.step)
    }
  })

  // Restore step view
  goToStep(state.currentStep || 1)
  renderLogs()
}

// -----------------------------------------------------------------------------
// STEP NAVIGATION
// -----------------------------------------------------------------------------
function goToStep(step: 1 | 2 | 3) {
  const access = canAccessKybStep(step, state)
  if (!access.allowed) {
    showToast(access.reason || 'Complete previous steps first', 'warning')
    return
  }

  state.currentStep = step
  saveKybState(state)
  updateKybNavFromState(state)

  const view1 = document.getElementById('view-kyb-step-1')
  const view2 = document.getElementById('view-kyb-step-2')
  const view3 = document.getElementById('view-kyb-step-3')

  if (view1) view1.hidden = step !== 1
  if (view2) view2.hidden = step !== 2
  if (view3) view3.hidden = step !== 3

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// -----------------------------------------------------------------------------
// STEP 1: COMPANY CHECK (CAC REGISTRY)
// -----------------------------------------------------------------------------
function bindStep1() {
  const form = document.getElementById('form-kyb-step-1') as HTMLFormElement
  const rcInput = document.getElementById('input-kyb-rc') as HTMLInputElement
  const nameInput = document.getElementById('input-kyb-name') as HTMLInputElement
  const typeInput = document.getElementById('input-kyb-type') as HTMLSelectElement
  const stateInput = document.getElementById('input-kyb-state') as HTMLSelectElement

  const setStep1Fields = (rc: string, name: string, type: string, st: string) => {
    if (rcInput) rcInput.value = rc
    if (nameInput) nameInput.value = name
    if (typeInput) typeInput.value = type
    if (stateInput) stateInput.value = st
  }

  // Presets
  const btnActive = document.getElementById('btn-kyb-preset-active')
  const btnInactive = document.getElementById('btn-kyb-preset-inactive')
  const btnNotFound = document.getElementById('btn-kyb-preset-notfound')

  const clearPresetActives = () => {
    btnActive?.classList.remove('active')
    btnInactive?.classList.remove('active')
    btnNotFound?.classList.remove('active')
  }

  btnActive?.addEventListener('click', () => {
    clearPresetActives()
    btnActive.classList.add('active')
    setStep1Fields(
      SANDBOX_KYB_RCS.ACTIVE,
      'NINJA TECH LOGISTICS LIMITED',
      'PRIVATE_COMPANY_LIMITED_BY_SHARES',
      'Lagos'
    )
    showToast('Loaded Active Company preset (RC 1000001 · Up to date)', 'info')
  })

  btnInactive?.addEventListener('click', () => {
    clearPresetActives()
    btnInactive.classList.add('active')
    setStep1Fields(
      SANDBOX_KYB_RCS.INACTIVE,
      'PRIME AGRO ALLIED FOODS LIMITED',
      'PRIVATE_COMPANY_LIMITED_BY_SHARES',
      'Oyo'
    )
    showToast('Loaded Inactive Company preset (RC 2000002 · Delinquent annual returns)', 'warning')
  })

  btnNotFound?.addEventListener('click', () => {
    clearPresetActives()
    btnNotFound.classList.add('active')
    setStep1Fields(
      SANDBOX_KYB_RCS.NOT_FOUND,
      'FORGED ENTERPRISES NIGERIA',
      'PRIVATE_COMPANY_LIMITED_BY_SHARES',
      'Lagos'
    )
    showToast('Loaded Not Found preset (RC 9999999 · Forged certificate test)', 'warning')
  })

  form?.addEventListener('submit', (e) => {
    e.preventDefault()

    const rc = rcInput.value.trim()
    const name = nameInput.value.trim()
    const companyType = typeInput.value
    const stateVal = stateInput.value

    const payload = {
      rc_number: rc,
      company_name: name,
      company_type: companyType,
      state: stateVal,
    }

    // Code-first drawer confirmation
    showCodeFirstSlideOut({
      title: 'Verify Company with Corporate Affairs Commission (CAC)',
      endpoint: '/api/kyb/check',
      method: 'POST',
      description: 'Calls the CAC registry to verify corporate existence, registration date, and active/inactive status.',
      curl: `curl -X POST "https://api.ninja.ng/api/kyb/check" \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`,
      ts: `const response = await fetch("https://api.ninja.ng/api/kyb/check", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.NINJA_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${JSON.stringify(payload, null, 2)}),
});
const company = await response.json();
console.log(company.data.status); // "ACTIVE" or "INACTIVE"`,
      python: `import os
import requests

response = requests.post(
    "https://api.ninja.ng/api/kyb/check",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(payload, null, 4)}
)
company = response.json()
print("Status:", company["data"]["status"])`,
      go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	payload, _ := json.Marshal(map[string]string{
		"rc_number":    "${rc}",
		"company_name": "${name}",
	})
	req, _ := http.NewRequest("POST", "https://api.ninja.ng/api/kyb/check", bytes.NewBuffer(payload))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("NINJA_TOKEN"))
	req.Header.Set("Content-Type", "application/json")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	fmt.Println("CAC Status Code:", resp.Status)
}`,
      confirmLabel: 'Inspect & Verify CAC Registry →',
      onProceed: async () => {
        await executeStep1(payload)
      },
    })
  })
}

async function executeStep1(payload: { rc_number: string; company_name: string; company_type: string; state: string }) {
  const submitBtn = document.getElementById('btn-submit-kyb-step1') as HTMLButtonElement
  const resultBox = document.getElementById('step1-kyb-result')

  if (submitBtn) {
    submitBtn.disabled = true
    submitBtn.textContent = 'Verifying with CAC Registry...'
  }

  const t0 = performance.now()
  let status = 200
  let body: any = null

  try {
    const res = await fetch('/api/kyb/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    status = res.status
    body = await res.json()
  } catch {
    const fallback = getSandboxKybCheck(payload.rc_number)
    status = fallback.status
    body = fallback.body
  }

  const duration = Math.round(performance.now() - t0)
  addLog('Step 1 · Company Check', 'POST', '/api/kyb/check', status, duration, payload, body)

  if (submitBtn) {
    submitBtn.disabled = false
    submitBtn.textContent = 'Verify Company with CAC Registry →'
  }

  if (!resultBox) return
  resultBox.hidden = false

  if (status === 200 && body?.status === 'success' && body?.data) {
    const company: SandboxCompany = body.data
    const isActive = company.status === 'ACTIVE'

    state.company = {
      rcNumber: company.rc_number,
      companyName: company.company_name,
      companyType: company.company_type,
      status: company.status,
      verified: true,
      details: company,
    }
    saveKybState(state)
    updateKybNavFromState(state)

    resultBox.innerHTML = `
      <div style="padding: 20px; border: 1px solid ${isActive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}; background: ${isActive ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)'}; border-radius: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <span class="company-status-pill ${isActive ? 'status-active' : 'status-inactive'}">
              ${isActive ? '● CAC Status: ACTIVE' : '▲ CAC Status: INACTIVE (DELINQUENT)'}
            </span>
            <h3 style="font-size: 17px; font-weight: 800; color: #fff; margin: 8px 0 2px;">
              ${escapeHtml(company.company_name)}
            </h3>
            <span style="font-family: var(--font-mono); font-size: 12px; color: #94a3b8;">
              ${escapeHtml(company.rc_number)}
            </span>
          </div>
          <span style="font-size: 12px; color: #94a3b8;">Incorporated ${escapeHtml(company.registration_date)}</span>
        </div>

        ${!isActive ? `
          <div style="background: rgba(239, 68, 68, 0.15); border-left: 3px solid #f87171; padding: 10px 14px; margin-bottom: 14px; font-size: 12px; color: #fca5a5; line-height: 1.5;">
            <strong>Warning: Delinquent CAC Status</strong><br>
            This company has failed to file annual returns with the Corporate Affairs Commission since <strong>${company.last_annual_return_year || 'unrecorded'}</strong>. Under Nigerian CAMA 2020 law, transactions with inactive entities carry heightened legal liability.
          </div>
        ` : `
          <div style="background: rgba(16, 185, 129, 0.15); border-left: 3px solid #34d399; padding: 10px 14px; margin-bottom: 14px; font-size: 12px; color: #a7f3d0; line-height: 1.5;">
            <strong>✓ Verified CAC Standing</strong><br>
            Company is active and registered. Annual returns are up to date through <strong>${company.last_annual_return_year || 2025}</strong>.
          </div>
        `}

        <div class="company-result-grid">
          <div class="company-data-item">
            <span class="company-data-label">Registered Office</span>
            <span class="company-data-value">${escapeHtml(company.registered_address)}, ${escapeHtml(company.city)}</span>
          </div>
          <div class="company-data-item">
            <span class="company-data-label">Business Nature</span>
            <span class="company-data-value">${escapeHtml(company.nature_of_business)}</span>
          </div>
        </div>

        <button type="button" id="btn-next-step2" style="margin-top: 18px; width: 100%; padding: 13px; font-size: 14px; font-weight: 800; background: #8b5cf6; color: #fff; border: none; cursor: pointer; border-radius: 4px;">
          Proceed to Step 2: Audit Registered Directors →
        </button>
      </div>
    `

    document.getElementById('btn-next-step2')?.addEventListener('click', () => {
      goToStep(2)
    })

    if (isActive) {
      showToast('CAC check passed! Company is Active.', 'success')
    } else {
      showToast('CAC check warning: Company is Inactive.', 'warning')
    }
  } else {
    state.company = {
      rcNumber: payload.rc_number,
      companyName: payload.company_name,
      companyType: payload.company_type,
      status: 'NOT_FOUND',
      verified: false,
    }
    saveKybState(state)
    updateKybNavFromState(state)

    resultBox.innerHTML = `
      <div style="padding: 18px; border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08); border-radius: 6px;">
        <span class="company-status-pill status-inactive">✕ CAC Record Not Found</span>
        <h4 style="font-size: 15px; font-weight: 800; color: #f87171; margin: 8px 0 4px;">
          Registration Number Not Found in CAC Registry
        </h4>
        <p style="font-size: 12.5px; color: #cbd5e1; margin: 0; line-height: 1.5;">
          No company registered under <strong>${escapeHtml(payload.rc_number)}</strong> exists in the official Corporate Affairs Commission database. If a certificate was provided, it is likely forged or invalid.
        </p>
      </div>
    `
    showToast('Company registration number not found in CAC registry.', 'error')
  }
}

// -----------------------------------------------------------------------------
// STEP 2: DIRECTORS & BENEFICIAL OWNERS
// -----------------------------------------------------------------------------
function bindStep2() {
  const pullBtn = document.getElementById('btn-pull-kyb-directors') as HTMLButtonElement

  pullBtn?.addEventListener('click', () => {
    const rc = state.company.rcNumber || '1000001'
    const payload = { rc_number: rc }

    showCodeFirstSlideOut({
      title: 'Pull Registered Directors from CAC',
      endpoint: '/api/kyb/directors',
      method: 'POST',
      description: 'Pulls the official shareholders, percentage ownership, and registered directors on record with the CAC.',
      curl: `curl -X POST "https://api.ninja.ng/api/kyb/directors" \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`,
      ts: `const response = await fetch("https://api.ninja.ng/api/kyb/directors", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.NINJA_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${JSON.stringify(payload, null, 2)}),
});
const result = await response.json();
console.log("Found", result.directors_count, "directors");`,
      python: `import os
import requests

response = requests.post(
    "https://api.ninja.ng/api/kyb/directors",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={"rc_number": "${rc}"}
)
print("Directors:", response.json()["data"])`,
      go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	payload, _ := json.Marshal(map[string]string{"rc_number": "${rc}"})
	req, _ := http.NewRequest("POST", "https://api.ninja.ng/api/kyb/directors", bytes.NewBuffer(payload))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("NINJA_TOKEN"))
	req.Header.Set("Content-Type", "application/json")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	fmt.Println("Directors fetched:", resp.Status)
}`,
      confirmLabel: 'Pull & Audit Directors →',
      onProceed: async () => {
        await executeStep2(payload)
      },
    })
  })
}

async function executeStep2(payload: { rc_number: string }) {
  const pullBtn = document.getElementById('btn-pull-kyb-directors') as HTMLButtonElement
  const resultBox = document.getElementById('step2-kyb-result')

  if (pullBtn) {
    pullBtn.disabled = true
    pullBtn.textContent = 'Pulling CAC Directors...'
  }

  const t0 = performance.now()
  let status = 200
  let body: any = null

  try {
    const res = await fetch('/api/kyb/directors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    status = res.status
    body = await res.json()
  } catch {
    const fallback = getSandboxDirectors(payload.rc_number)
    status = fallback.status
    body = fallback.body
  }

  const duration = Math.round(performance.now() - t0)
  addLog('Step 2 · Directors Audit', 'POST', '/api/kyb/directors', status, duration, payload, body)

  if (pullBtn) {
    pullBtn.disabled = false
    pullBtn.textContent = 'Pull Official Registered Directors (POST /api/kyb/directors) →'
  }

  if (!resultBox) return
  resultBox.hidden = false

  if (status === 200 && Array.isArray(body?.data)) {
    const directors: SandboxDirector[] = body.data
    const hasAmlHit = directors.some((d) => d.aml_flag)

    state.directors = {
      audited: true,
      list: directors,
      hasConflict: hasAmlHit,
    }
    saveKybState(state)
    updateKybNavFromState(state)

    if (!hasAmlHit) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 },
      })
    }

    resultBox.innerHTML = `
      <div style="margin-top: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h4 style="font-size: 15px; font-weight: 800; color: #fff; margin: 0;">
            ${directors.length} Registered Beneficial Owner${directors.length === 1 ? '' : 's'} on Record
          </h4>
          <span style="font-size: 11px; font-weight: 800; color: ${hasAmlHit ? '#f87171' : '#34d399'};">
            ${hasAmlHit ? '▲ AML Watchlist Flag Detected' : '● Verified Registry Standing'}
          </span>
        </div>

        <div class="directors-list-grid">
          ${directors
            .map(
              (d) => `
            <div class="director-card" style="border-left: 3px solid ${d.aml_flag ? '#f87171' : '#8b5cf6'};">
              <div class="director-header">
                <div>
                  <span class="director-name">${escapeHtml(d.name)}</span>
                  <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">
                    ${escapeHtml(d.nationality)} · ${escapeHtml(d.address)}
                  </div>
                </div>
                <span class="director-role">${escapeHtml(d.role.replace(/_/g, ' '))}</span>
              </div>

              <div class="director-meta-row" style="margin-top: 8px;">
                <div class="director-meta-item">
                  <span>Ownership Share: </span>
                  <strong>${d.share_percentage || 0}% (${(d.shares_allotted || 0).toLocaleString()} shares)</strong>
                </div>
                <div class="director-meta-item">
                  <span>ID Match: </span>
                  <strong style="color: #34d399;">✓ ${escapeHtml(d.id_type)} Verified</strong>
                </div>
                <div class="director-meta-item">
                  <span>Sanctions / PEP: </span>
                  <strong style="color: ${d.aml_flag ? '#f87171' : '#34d399'};">
                    ${d.aml_flag ? '▲ FLAG DETECTED' : '✓ Clear'}
                  </strong>
                </div>
              </div>
            </div>
          `
            )
            .join('')}
        </div>

        <button type="button" id="btn-next-step3" style="margin-top: 20px; width: 100%; padding: 13px; font-size: 14px; font-weight: 800; background: #10b981; color: #fff; border: none; cursor: pointer; border-radius: 4px;">
          Proceed to Step 3: Generate Single-Use Hosted KYB Link →
        </button>
      </div>
    `

    document.getElementById('btn-next-step3')?.addEventListener('click', () => {
      goToStep(3)
    })

    showToast(`Pulled ${directors.length} registered directors from CAC.`, 'success')
  } else {
    resultBox.innerHTML = `
      <div style="padding: 16px; border: 1px solid rgba(239, 68, 68, 0.4); background: rgba(239, 68, 68, 0.08); border-radius: 6px;">
        <span style="color: #f87171; font-weight: 800;">✕ No Director Records Found</span>
        <p style="font-size: 12px; color: #cbd5e1; margin: 4px 0 0;">
          Could not retrieve beneficial ownership data for this company.
        </p>
      </div>
    `
    showToast('Failed to pull director records.', 'error')
  }
}

// -----------------------------------------------------------------------------
// STEP 3: SINGLE-LINK HOSTED KYB ONBOARDING
// -----------------------------------------------------------------------------
function bindStep3() {
  const btnCreateFlow = document.getElementById('btn-create-kyb-flow') as HTMLButtonElement
  const btnGenLink = document.getElementById('btn-generate-kyb-link') as HTMLButtonElement
  const stage1Pill = document.getElementById('kyb-stage-1-pill')
  const stage2Card = document.getElementById('kyb-flow-stage-2-card')
  const stage2Pill = document.getElementById('kyb-stage-2-pill')
  const linkBox = document.getElementById('step3-kyb-link-box')
  const textFlowUrl = document.getElementById('text-kyb-flow-url')

  btnCreateFlow?.addEventListener('click', () => {
    const companyName = state.company.companyName || 'Corporate Partner'
    const payload = {
      name: `KYB Vendor Onboarding - ${companyName}`,
      steps: [
        { type: 'cac_lookup', required: true },
        { type: 'director_nin', required: true },
        { type: 'corporate_bank_match', required: true },
      ],
      branding: {
        company_name: 'BOU Group Enterprise',
        primary_color: '#f59e0b',
      },
    }

    showCodeFirstSlideOut({
      title: 'Programmatically Create Hosted KYB Flow',
      endpoint: '/api/flows',
      method: 'POST',
      description: 'Creates a configurable multi-step KYB onboarding template in your Ninja workspace.',
      curl: `curl -X POST "https://api.ninja.ng/api/flows" \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`,
      ts: `const response = await fetch("https://api.ninja.ng/api/flows", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.NINJA_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${JSON.stringify(payload, null, 2)}),
});
const flow = await response.json();
console.log("Created Flow ID:", flow.id);`,
      python: `import os
import requests

response = requests.post(
    "https://api.ninja.ng/api/flows",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(payload, null, 4)}
)
flow_id = response.json()["id"]
print(f"Created KYB Flow: {flow_id}")`,
      go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	payload, _ := json.Marshal(${JSON.stringify(payload)})
	req, _ := http.NewRequest("POST", "https://api.ninja.ng/api/flows", bytes.NewBuffer(payload))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("NINJA_TOKEN"))
	req.Header.Set("Content-Type", "application/json")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	fmt.Println("Flow status:", resp.Status)
}`,
      confirmLabel: 'Create KYB Flow Template →',
      onProceed: async () => {
        btnCreateFlow.disabled = true
        btnCreateFlow.textContent = 'Creating KYB Flow...'

        const t0 = performance.now()
        let flowId = 'flow_kyb_' + Math.random().toString(36).slice(2, 10)
        let status = 200
        let respPayload: any = {
          id: flowId,
          name: payload.name,
          status: 'active',
          created_at: new Date().toISOString(),
        }

        try {
          const res = await fetch('/api/flows', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (res.ok) {
            respPayload = await res.json()
            flowId = respPayload.id || flowId
          }
        } catch {}

        const duration = Math.round(performance.now() - t0)
        addLog('Step 3 · Create Flow', 'POST', '/api/flows', status, duration, payload, respPayload)

        state.hostedFlow = {
          flowId,
          flowName: payload.name,
          status: 'created',
        }
        saveKybState(state)

        if (stage1Pill) {
          stage1Pill.textContent = '✓ Flow Active'
          stage1Pill.className = 'flow-status-pill pill-completed'
        }
        btnCreateFlow.textContent = `✓ Created Flow (${flowId})`
        btnCreateFlow.disabled = true

        // Unlock stage 2
        if (stage2Card) stage2Card.classList.remove('locked')
        if (stage2Pill) {
          stage2Pill.textContent = 'Ready to Generate Link'
          stage2Pill.className = 'flow-status-pill pill-ready'
        }
        if (btnGenLink) btnGenLink.disabled = false

        showToast('Hosted KYB flow created! You can now generate a link.', 'success')
      },
    })
  })

  btnGenLink?.addEventListener('click', () => {
    const flowId = state.hostedFlow.flowId || 'flow_kyb_demo1'
    const payload = {
      reference: `vendor_kyb_${Date.now()}`,
      metadata: {
        rc_number: state.company.rcNumber || '1000001',
        company_name: state.company.companyName || 'Corporate Vendor',
      },
      expires_in_hours: 48,
    }

    showCodeFirstSlideOut({
      title: 'Generate Single-Use KYB Link',
      endpoint: `/api/flows/${flowId}/links`,
      method: 'POST',
      description: 'Generates a secure, expiring link that you send directly to your vendor over WhatsApp or email.',
      curl: `curl -X POST "https://api.ninja.ng/api/flows/${flowId}/links" \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`,
      ts: `const response = await fetch("https://api.ninja.ng/api/flows/${flowId}/links", {
  method: "POST",
  headers: {
    "Authorization": \`Bearer \${process.env.NINJA_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${JSON.stringify(payload, null, 2)}),
});
const link = await response.json();
console.log("Send this link to vendor:", link.url);`,
      python: `import os
import requests

response = requests.post(
    "https://api.ninja.ng/api/flows/${flowId}/links",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(payload, null, 4)}
)
link_url = response.json()["url"]
print(f"Vendor Onboarding URL: {link_url}")`,
      go: `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	payload, _ := json.Marshal(${JSON.stringify(payload)})
	url := fmt.Sprintf("https://api.ninja.ng/api/flows/%s/links", "${flowId}")
	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("NINJA_TOKEN"))
	req.Header.Set("Content-Type", "application/json")

	resp, _ := http.DefaultClient.Do(req)
	defer resp.Body.Close()
	fmt.Println("Link generation status:", resp.Status)
}`,
      confirmLabel: 'Mint Single-Use KYB Link →',
      onProceed: async () => {
        btnGenLink.disabled = true
        btnGenLink.textContent = 'Minting Link...'

        const t0 = performance.now()
        const token = Math.random().toString(36).slice(2, 10)
        let linkUrl = `https://verify.ninja.ng/kyb/vs_live_${token}`
        let status = 200
        let respPayload: any = {
          url: linkUrl,
          flow_id: flowId,
          reference: payload.reference,
          expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        }

        try {
          const res = await fetch(`/api/flows/${flowId}/links`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (res.ok) {
            respPayload = await res.json()
            linkUrl = respPayload.url || linkUrl
          }
        } catch {}

        const duration = Math.round(performance.now() - t0)
        addLog('Step 3 · Mint KYB Link', 'POST', `/api/flows/${flowId}/links`, status, duration, payload, respPayload)

        state.hostedFlow.linkUrl = linkUrl
        state.hostedFlow.status = 'link_generated'
        saveKybState(state)

        if (stage2Pill) {
          stage2Pill.textContent = '✓ Link Ready'
          stage2Pill.className = 'flow-status-pill pill-completed'
        }
        btnGenLink.textContent = '✓ Link Generated'

        if (linkBox && textFlowUrl) {
          linkBox.hidden = false
          textFlowUrl.textContent = linkUrl
        }

        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.5 },
        })

        showToast('Single-use vendor KYB link ready to send!', 'success')
      },
    })
  })
}

// -----------------------------------------------------------------------------
// TELEMETRY & LOG VIEWER
// -----------------------------------------------------------------------------
function bindLogs() {
  const clearBtn = document.getElementById('btn-kyb-clear-logs')
  clearBtn?.addEventListener('click', () => {
    state.logs = []
    saveKybState(state)
    renderLogs()
    showToast('API telemetry log cleared.', 'info')
  })
}

function addLog(
  step: string,
  method: 'GET' | 'POST',
  endpoint: string,
  status: number,
  durationMs: number,
  request: any,
  response: any
) {
  const log: KybTelemetryLog = {
    id: 'log_' + Math.random().toString(36).slice(2, 9),
    timestamp: new Date().toLocaleTimeString(),
    step,
    method,
    endpoint,
    status,
    durationMs,
    request,
    response,
  }

  state.logs = state.logs || []
  state.logs.unshift(log)
  if (state.logs.length > 25) state.logs.pop()
  saveKybState(state)
  renderLogs(log.id)
}

const logActiveLang: Record<string, string> = {}

function isOkStatus(status: number): boolean {
  return status >= 200 && status < 300
}

function generateCodeSnippets(
  method: string,
  endpoint: string,
  payload: any
): Record<string, { lang: string; code: string }> {
  const url = `https://api.ninja.ng${endpoint}`
  const jsonStr = JSON.stringify(payload || {}, null, 2)
  const jsonStr4 = JSON.stringify(payload || {}, null, 4)

  const curl = `curl -X ${method} "${url}" \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${jsonStr}'`

  const javascript = `const response = await fetch("${url}", {
  method: "${method}",
  headers: {
    "Authorization": \`Bearer \${process.env.NINJA_TOKEN}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${jsonStr}),
});
const data = await response.json();
console.log(data);`

  const python = `import os
import requests

response = requests.${method.toLowerCase()}(
    "${url}",
    headers={
        "Authorization": f"Bearer {os.environ.get('NINJA_TOKEN')}",
        "Content-Type": "application/json",
    },
    json=${jsonStr4}
)
data = response.json()
print(data)`

  const go = `package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
)

func main() {
	payloadBytes := []byte(\`${jsonStr}\`)
	req, _ := http.NewRequest("${method}", "${url}", bytes.NewBuffer(payloadBytes))
	req.Header.Set("Authorization", "Bearer "+os.Getenv("NINJA_TOKEN"))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		panic(err)
	}
	defer resp.Body.Close()
	fmt.Println("Response Status:", resp.Status)
}`

  const rust = `use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let client = reqwest::Client::new();
    let token = std::env::var("NINJA_TOKEN").unwrap_or_default();

    let res = client
        .${method.toLowerCase()}("${url}")
        .header(AUTHORIZATION, format!("Bearer {}", token))
        .header(CONTENT_TYPE, "application/json")
        .json(&json!(${jsonStr4}))
        .send()
        .await?;

    let body = res.text().await?;
    println!("Response: {}", body);
    Ok(())
}`

  return {
    curl: { lang: 'bash', code: curl },
    javascript: { lang: 'javascript', code: javascript },
    python: { lang: 'python', code: python },
    go: { lang: 'go', code: go },
    rust: { lang: 'rust', code: rust },
  }
}

function renderLogs(openLogId?: string) {
  const container = document.getElementById('kyb-call-log-list')
  if (!container) return

  if (!state.logs || state.logs.length === 0) {
    container.innerHTML = `
      <div style="font-size: 11.5px; color: var(--muted); text-align: center; padding: 24px;" id="kyb-empty-logs-label">
        No API calls made yet. Click any button on the left to trigger a live call.
      </div>
    `
    return
  }

  container.innerHTML = state.logs
    .map((log, index) => {
      const isOpen = openLogId ? log.id === openLogId : index === 0
      const activeLang = logActiveLang[log.id] || 'curl'
      const snippets = generateCodeSnippets(log.method, log.endpoint, log.request)
      const currentSnippet = snippets[activeLang] || snippets.curl
      const highlightedCode = Prism.highlight(
        currentSnippet.code,
        Prism.languages[currentSnippet.lang] || Prism.languages.javascript,
        currentSnippet.lang
      )

      return `
        <div class="api-log-entry ${isOpen ? 'open' : ''}" data-log-id="${log.id}">
          <div class="api-log-header">
            <div class="api-log-header-left">
              <span class="api-log-step-tag tag-step-1">${escapeHtml(log.step)}</span>
              <span class="api-log-method">${log.method}</span>
              <code class="api-log-path" title="${escapeHtml(log.endpoint)}">${escapeHtml(log.endpoint)}</code>
            </div>
            <div class="api-log-meta">
              <span class="api-log-time">${log.durationMs}ms</span>
              <span class="api-log-status ${isOkStatus(log.status) ? 'api-log-status-ok' : 'api-log-status-error'}">${log.status}</span>
              <span class="api-log-chevron">▼</span>
            </div>
          </div>
          <div class="api-log-details" ${isOpen ? '' : 'hidden'}>
            <!-- Multi-language code snippet box with tabs & copy button -->
            <div class="api-log-code-box">
              <div class="api-log-toolbar">
                <div class="api-log-lang-tabs" data-log-id="${log.id}">
                  <button type="button" class="api-log-lang-tab ${activeLang === 'curl' ? 'active' : ''}" data-lang="curl">cURL</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'javascript' ? 'active' : ''}" data-lang="javascript">JavaScript</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'python' ? 'active' : ''}" data-lang="python">Python</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'go' ? 'active' : ''}" data-lang="go">Go</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'rust' ? 'active' : ''}" data-lang="rust">Rust</button>
                </div>
                <button type="button" class="btn-copy-log-snippet" data-log-id="${log.id}" title="Copy snippet">
                  <span class="copy-text">📋 Copy Code</span>
                </button>
              </div>
              <pre class="api-log-snippet-pre language-${currentSnippet.lang}"><code class="api-log-snippet-code language-${currentSnippet.lang}">${highlightedCode}</code></pre>
            </div>

            <!-- Payloads Grid: Request and Response -->
            <div class="api-log-payloads-grid">
              <div class="api-log-section">
                <div class="api-log-section-label">
                  <span>Request Payload</span>
                  <span class="label-method">${log.method} ${escapeHtml(log.endpoint)}</span>
                </div>
                <pre class="api-log-code"><code>${escapeHtml(JSON.stringify(log.request, null, 2))}</code></pre>
              </div>
              <div class="api-log-section">
                <div class="api-log-section-label">
                  <span>Server Response</span>
                  <span style="color: ${isOkStatus(log.status) ? '#34d399' : '#f87171'}; font-family: var(--font-mono); font-weight: 800;">${log.status} ${isOkStatus(log.status) ? 'OK' : 'REJECT'}</span>
                </div>
                <pre class="api-log-code"><code>${escapeHtml(JSON.stringify(log.response, null, 2))}</code></pre>
              </div>
            </div>
          </div>
        </div>
      `
    })
    .join('')

  // Accordion click
  container.querySelectorAll('.api-log-header').forEach((hdr) => {
    hdr.addEventListener('click', () => {
      const entry = hdr.closest('.api-log-entry') as HTMLElement | null
      if (!entry) return
      const details = entry.querySelector('.api-log-details') as HTMLElement | null
      const isOpen = entry.classList.contains('open')

      if (isOpen) {
        entry.classList.remove('open')
        if (details) details.hidden = true
      } else {
        entry.classList.add('open')
        if (details) details.hidden = false
      }
    })
  })

  // Language tab switching
  container.querySelectorAll('.api-log-lang-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const btn = e.currentTarget as HTMLElement
      const newLang = btn.dataset.lang || 'curl'
      const logId = btn.closest('.api-log-entry')?.getAttribute('data-log-id')
      if (logId) {
        logActiveLang[logId] = newLang
        renderLogs(logId)
      }
    })
  })

  // Copy snippet button
  container.querySelectorAll('.btn-copy-log-snippet').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation()
      const b = e.currentTarget as HTMLButtonElement
      const logId = b.getAttribute('data-log-id')
      if (!logId) return
      const log = state.logs?.find((l) => l.id === logId)
      if (!log) return
      const lang = logActiveLang[logId] || 'curl'
      const snippets = generateCodeSnippets(log.method, log.endpoint, log.request)
      const snippet = snippets[lang] || snippets.curl
      try {
        await navigator.clipboard.writeText(snippet.code)
        const copyText = b.querySelector('.copy-text')
        if (copyText) copyText.textContent = '✓ Copied!'
        setTimeout(() => {
          if (copyText) copyText.textContent = '📋 Copy Code'
        }, 1500)
      } catch {
        showToast('Failed to copy to clipboard', 'warning')
      }
    })
  })
}

// Kick off
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
