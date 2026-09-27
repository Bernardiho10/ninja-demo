// =============================================================================
// ninja-bet: Interactive Integration Guide & Telemetry Workbench
// =============================================================================

import confetti from 'canvas-confetti'
import Prism from 'prismjs'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-rust'

import { api } from './lib/api'
import { loadState, saveState, type V2State, type TelemetryLog } from './lib/state'
import { showCodeFirstSlideOut } from './lib/codeModal'
import { getLinkScenarioConfig, getFlowCreationConfig } from './lib/linkScenarios'

let state: V2State = loadState()
let activeTab: 'curl' | 'ts' | 'python' | 'go' = 'curl'
let selectedScenario: 'prefilled' | 'unfilled' | 'custom' = 'prefilled'
let step3Subtab: 'mint' | 'flow' = 'mint'

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
  // Ensure the API Call & Response Log section is ALWAYS completely empty on landing!
  state.logs = []

  // Ensure player name is never set before registration is completed!
  if (!state.player || state.player.kycStatus !== 'verified') {
    state.player.firstName = ''
    state.player.lastName = ''
    state.player.phoneNumber = ''
    state.player.nin = ''
    state.player.dateOfBirth = ''
    state.player.kycStatus = 'unverified'
    state.player.walletBalanceNaira = 0
    state.player.withdrawableBalanceNaira = 0
  }

  bindStepper()
  bindSimulationWallet()
  bindStep1()
  bindStep2()
  bindStep3()
  bindDevTools()
  bindCopyCode()

  // Navigation listener
  window.addEventListener('ninjabet:navigate-step', (e: any) => {
    if (e.detail?.step) {
      goToStep(e.detail.step)
    }
  })

  goToStep(state.currentStep)
  syncFields()
  renderLogs()
  updateDevCode()
}

// -----------------------------------------------------------------------------
// Stepper & Step Transitions (Sportsbook KYC)
// -----------------------------------------------------------------------------
function goToStep(step: 1 | 2 | 3) {
  state.currentStep = step
  saveState(state)
  window.dispatchEvent(new CustomEvent('ninjabet:statechange'))

  const v1 = document.getElementById('view-step-1')
  const v2 = document.getElementById('view-step-2')
  const v3 = document.getElementById('view-step-3')
  const subtabs = document.getElementById('step3-code-subtabs')

  if (v1) v1.hidden = step !== 1
  if (v2) v2.hidden = step !== 2
  if (v3) v3.hidden = step !== 3
  if (subtabs) subtabs.hidden = step !== 3

  updateDevCode()
}

function bindStepper() {
  ;[1, 2, 3].forEach((s) => {
    document.getElementById(`step-nav-${s}`)?.addEventListener('click', () => {
      goToStep(s as any)
    })
  })
}

function syncFields() {
  const fn = document.getElementById('input-first-name') as HTMLInputElement | null
  const ln = document.getElementById('input-last-name') as HTMLInputElement | null
  const phone = document.getElementById('input-phone') as HTMLInputElement | null
  const nin = document.getElementById('input-nin') as HTMLInputElement | null
  const dob = document.getElementById('input-dob') as HTMLInputElement | null
  const wallet = document.getElementById('sim-wallet-input') as HTMLInputElement | null
  const holderInput = document.getElementById('input-holder-name') as HTMLInputElement | null

  if (fn) fn.value = state.player.firstName
  if (ln) ln.value = state.player.lastName
  if (phone) phone.value = state.player.phoneNumber
  if (nin) nin.value = state.player.nin
  if (dob) dob.value = state.player.dateOfBirth
  if (wallet) wallet.value = String(state.player.walletBalanceNaira)

  const isVerified = state.player && state.player.kycStatus === 'verified'
  const fullName = isVerified ? `${state.player.firstName} ${state.player.lastName}`.trim() : ''

  // Step 2 holder name
  if (holderInput && isVerified && !holderInput.value) {
    holderInput.value = fullName
  }

  // Step 2 label
  const c2Label = document.getElementById('c2-player-label')
  if (c2Label) {
    c2Label.textContent = isVerified ? fullName : '— (Pending Step 1 Registration)'
  }

  // Step 3 summary
  const c3Bank = document.getElementById('c3-bank-summary')
  const c3Amt = document.getElementById('c3-amount-summary')
  if (c3Bank) {
    if (state.bankAccount && state.bankAccount.isVerified) {
      c3Bank.textContent = `${state.bankAccount.bankName} · ${state.bankAccount.accountNumber} (${fullName})`
    } else if (isVerified) {
      c3Bank.textContent = `Access Bank · 0123456789 (${fullName})`
    } else {
      c3Bank.textContent = 'Access Bank · 0123456789 (Pending Registration)'
    }
  }
  if (c3Amt) {
    c3Amt.textContent = formatNaira(state.player.walletBalanceNaira)
  }
}

function bindSimulationWallet() {
  const walletInput = document.getElementById('sim-wallet-input') as HTMLInputElement | null
  const btn250k = document.getElementById('btn-param-250k')
  const btn50k = document.getElementById('btn-param-50k')
  const btn10k = document.getElementById('btn-param-10k')
  const presetBtns = [btn250k, btn50k, btn10k]

  function setAmount(amount: number) {
    state.player.walletBalanceNaira = amount
    state.withdrawal.amountNaira = amount
    saveState(state)
    syncFields()
    window.dispatchEvent(new CustomEvent('ninjabet:statechange'))

    presetBtns.forEach((b) => {
      if (!b) return
      const amt = Number(b.dataset.amount)
      if (amt === amount) {
        b.classList.add('active')
      } else {
        b.classList.remove('active')
      }
    })
  }

  btn250k?.addEventListener('click', () => setAmount(250000))
  btn50k?.addEventListener('click', () => setAmount(50000))
  btn10k?.addEventListener('click', () => setAmount(10000))

  walletInput?.addEventListener('input', () => {
    const val = parseInt(walletInput.value, 10) || 0
    state.player.walletBalanceNaira = val
    state.withdrawal.amountNaira = val
    saveState(state)
    window.dispatchEvent(new CustomEvent('ninjabet:statechange'))
    presetBtns.forEach((b) => b?.classList.remove('active'))
  })
}

// -----------------------------------------------------------------------------
// Step 1: Sign Up & NIN Check
// -----------------------------------------------------------------------------
function bindStep1() {
  const form = document.getElementById('form-step-1') as HTMLFormElement | null
  const fn = document.getElementById('input-first-name') as HTMLInputElement | null
  const ln = document.getElementById('input-last-name') as HTMLInputElement | null
  const phone = document.getElementById('input-phone') as HTMLInputElement | null
  const nin = document.getElementById('input-nin') as HTMLInputElement | null
  const dob = document.getElementById('input-dob') as HTMLInputElement | null
  const result = document.getElementById('step1-result')

  // Presets
  document.getElementById('btn-preset-adult')?.addEventListener('click', () => {
    if (fn) fn.value = 'James'
    if (ln) ln.value = 'Bond'
    if (phone) phone.value = '08012345678'
    if (nin) nin.value = '77777777777'
    if (dob) dob.value = '1975-01-01'
    if (result) result.hidden = true
    updateDevCode()
  })

  document.getElementById('btn-preset-mismatch')?.addEventListener('click', () => {
    if (fn) fn.value = 'Chinedu'
    if (ln) ln.value = 'Okafor'
    if (phone) phone.value = '08098765432'
    if (nin) nin.value = '77777777777'
    if (dob) dob.value = '1985-05-12'
    if (result) result.hidden = true
    updateDevCode()
  })

  document.getElementById('btn-preset-underage')?.addEventListener('click', () => {
    if (fn) fn.value = 'Tobi'
    if (ln) ln.value = 'Minor'
    if (phone) phone.value = '08011223344'
    if (nin) nin.value = '77777777777'
    if (dob) dob.value = '2010-06-15'
    if (result) result.hidden = true
    updateDevCode()
  })

  // Submit -> Code-First Slide-Out
  form?.addEventListener('submit', (e) => {
    e.preventDefault()

    const firstName = fn?.value.trim() || ''
    const lastName = ln?.value.trim() || ''
    const phoneNum = phone?.value.trim() || ''
    const ninNum = nin?.value.trim() || ''
    const dobVal = dob?.value.trim() || ''

    if (!firstName || !lastName || !ninNum || !dobVal) {
      alert('Please fill out the registration fields or click one of the 1-Click Test Scenarios above!')
      return
    }

    const payload = {
      idType: 'nin',
      mode: 'verify',
      idNumber: ninNum,
      firstName: firstName,
      lastName: lastName,
      dateOfBirth: dobVal,
    }

    const curl = `curl -X POST https://api.ninja.ng/api/identity/identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`

    const ts = `// Step 1: Verify NIN, Name, and Age in one simple API call
const result = await ninja.identity.identify({
  idType: 'nin',
  mode: 'verify',
  idNumber: '${ninNum}',
  firstName: '${firstName}',
  lastName: '${lastName}',
  dateOfBirth: '${dobVal}',
})

if (result.verified && result.data.age >= 18) {
  console.log('Player verified and compliant!')
}`

    const python = `# Step 1: Verify NIN, Name, and Age
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(payload, null, 4)}
)`

    const go = `// Step 1: Verify NIN, Name, and Age
resp, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	IDType:      "nin",
	Mode:        "verify",
	IDNumber:    "${ninNum}",
	FirstName:   "${firstName}",
	LastName:    "${lastName}",
	DateOfBirth: "${dobVal}",
})`

    const rust = `// Step 1: Verify NIN, Name, and Age
let res = client
    .post("https://api.ninja.ng/api/identity/identify")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`

    showCodeFirstSlideOut({
      title: 'POST /api/identity/identify',
      endpoint: '/api/identity/identify',
      method: 'POST',
      description: 'Ninja checks government records to verify player name, NIN authenticity, and 18+ age requirement.',
      curl,
      ts,
      python,
      go,
      rust,
      confirmLabel: 'Noted, Proceed →',
      onProceed: async () => {
        await executeStep1({ firstName, lastName, phoneNum, ninNum, dobVal, payload })
      },
    })
  })
}

async function executeStep1(p: {
  firstName: string
  lastName: string
  phoneNum: string
  ninNum: string
  dobVal: string
  payload: any
}) {
  const result = document.getElementById('step1-result')
  if (!result) return

  const age = calculateAge(p.dobVal)

  // Check age
  if (age < 18) {
    const errorResponse = {
      status: 'rejected',
      verified: false,
      score: 0.0,
      recommendation: 'REJECT',
      error: `Underage: Player is ${age} years old. Gaming regulations require players to be 18+.`,
    }
    addLog('Step 1 · Signup', 'POST', '/api/identity/identify', 400, 48, p.payload, errorResponse)
    result.hidden = false
    result.innerHTML = `
      <div class="error" style="padding: 14px; border-radius: 8px;">
        <strong>✗ Player Under 18 (Compliance Block)</strong><br/>
        Birth date indicates age <strong>${age}</strong>. Players under 18 cannot create an account per gaming regulations.
      </div>
    `
    return
  }

  // Attempt backend or simulation
  let isMatch = false
  let score = 0.15

  try {
    const res = await api.register({
      first_name: p.firstName,
      last_name: p.lastName,
      phone_number: p.phoneNum,
      nin: p.ninNum,
      password: 'password123',
    })
    isMatch = res.player.kyc_status === 'verified'
    score = res.verify_result?.score ?? (isMatch ? 1.0 : 0.2)
  } catch {
    // Sandbox fixture check
    if (p.ninNum === '77777777777' && p.firstName.toLowerCase() === 'james') {
      isMatch = true
      score = 1.0
    } else {
      isMatch = false
      score = 0.12
    }
  }

  if (isMatch) {
    const successResponse = {
      status: 'found',
      verified: true,
      score: 1.0,
      recommendation: 'ALLOW',
      data: {
        first_name: p.firstName,
        last_name: p.lastName,
        id_number: p.ninNum,
        date_of_birth: p.dobVal,
        age,
        compliance: '18+ Verified',
      },
    }
    addLog('Step 1 · Signup', 'POST', '/api/identity/identify', 200, 64, p.payload, successResponse)

    state.player.firstName = p.firstName
    state.player.lastName = p.lastName
    state.player.phoneNumber = p.phoneNum
    state.player.nin = p.ninNum
    state.player.dateOfBirth = p.dobVal
    state.player.age = age
    state.player.kycStatus = 'verified'
    state.player.matchScore = score
    state.player.walletBalanceNaira = state.player.walletBalanceNaira || 250000
    state.player.withdrawableBalanceNaira = state.player.walletBalanceNaira || 250000
    state.withdrawal.amountNaira = state.player.walletBalanceNaira || 250000
    saveState(state)
    syncFields()
    window.dispatchEvent(new CustomEvent('ninjabet:statechange'))

    result.hidden = false
    result.innerHTML = `
      <div class="success" style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 8px;">
        <div>
          <strong>✓ NIN &amp; Age Verified (100% Match)</strong><br/>
          Government identity confirmed for <strong>${p.firstName} ${p.lastName}</strong> (${age} yrs).
        </div>
        <button type="button" id="btn-next-step2" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; font-weight: 800; padding: 12px; margin-top: 4px;">
          Continue to Step 2: Add Bank Account →
        </button>
      </div>
    `

    document.getElementById('btn-next-step2')?.addEventListener('click', () => {
      goToStep(2)
      syncFields()
    })
  } else {
    const failResponse = {
      status: 'mismatch',
      verified: false,
      score,
      recommendation: 'REJECT',
      error: `Name mismatch: '${p.firstName} ${p.lastName}' does not match authoritative government record for NIN ${p.ninNum}.`,
    }
    addLog('Step 1 · Signup', 'POST', '/api/identity/identify', 400, 52, p.payload, failResponse)
    result.hidden = false
    result.innerHTML = `
      <div class="error" style="padding: 14px; border-radius: 8px;">
        <strong>✗ Identity Name Mismatch</strong><br/>
        The name "${p.firstName} ${p.lastName}" does not match the national registry record for NIN ${p.ninNum}.
      </div>
    `
  }
}

// -----------------------------------------------------------------------------
// Step 2: Add Bank Details (BVN Check)
// -----------------------------------------------------------------------------
function bindStep2() {
  const form = document.getElementById('form-step-2') as HTMLFormElement | null
  const bank = document.getElementById('input-bank-name') as HTMLSelectElement | null
  const acc = document.getElementById('input-acc-num') as HTMLInputElement | null
  const bvn = document.getElementById('input-bvn') as HTMLInputElement | null
  const holder = document.getElementById('input-holder-name') as HTMLInputElement | null
  const result = document.getElementById('step2-result')

  // Presets
  document.getElementById('btn-preset-bvn-match')?.addEventListener('click', () => {
    if (bank) bank.value = 'Access Bank'
    if (acc) acc.value = '0123456789'
    if (bvn) bvn.value = '77777777777'
    if (holder) holder.value = `${state.player.firstName} ${state.player.lastName}`
    if (result) result.hidden = true
    updateDevCode()
  })

  document.getElementById('btn-preset-bvn-mismatch')?.addEventListener('click', () => {
    if (bank) bank.value = 'GTBank'
    if (acc) acc.value = '0987654321'
    if (bvn) bvn.value = '66666666666'
    if (holder) holder.value = 'Emeka Ugo'
    if (result) result.hidden = true
    updateDevCode()
  })

  // Submit -> Code-First Slide-Out
  form?.addEventListener('submit', (e) => {
    e.preventDefault()

    const bankName = bank?.value || 'Access Bank'
    const accNum = acc?.value.trim() || '0123456789'
    const bvnNum = bvn?.value.trim() || '77777777777'
    const holderName = holder?.value.trim() || 'James Bond'

    const payload = {
      idType: 'bvn',
      mode: 'verify',
      idNumber: bvnNum,
      firstName: state.player.firstName,
      lastName: state.player.lastName,
      bank: bankName,
      accountNumber: accNum,
    }

    const curl = `curl -X POST https://api.ninja.ng/api/identity/identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(payload, null, 2)}'`

    const ts = `// Step 2: Validate BVN ownership against registered player
const check = await ninja.identity.identify({
  idType: 'bvn',
  mode: 'verify',
  idNumber: '${bvnNum}',
  firstName: '${state.player.firstName}',
  lastName: '${state.player.lastName}',
})

if (check.verified) {
  console.log('Bank account verified and safely bound to player!')
}`

    const python = `# Step 2: Verify BVN Ownership
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json=${JSON.stringify(payload, null, 4)}
)`

    const go = `// Step 2: Verify BVN Ownership
resp, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	IDType:    "bvn",
	Mode:      "verify",
	IDNumber:  "${bvnNum}",
	FirstName: "${state.player.firstName}",
	LastName:  "${state.player.lastName}",
})`

    const rust = `// Step 2: Verify BVN Ownership
let res = client
    .post("https://api.ninja.ng/api/identity/identify")
    .header(AUTHORIZATION, format!("Bearer {}", token))
    .header(CONTENT_TYPE, "application/json")
    .json(&json!(${JSON.stringify(payload, null, 4)}))
    .send()
    .await?;`

    showCodeFirstSlideOut({
      title: 'POST /api/identity/identify',
      endpoint: '/api/identity/identify',
      method: 'POST',
      description: 'Ninja cross-checks the bank BVN with NIBSS to verify account ownership belongs to the registered player.',
      curl,
      ts,
      python,
      go,
      rust,
      confirmLabel: 'Noted, Proceed →',
      onProceed: async () => {
        await executeStep2({ bankName, accNum, bvnNum, holderName, payload })
      },
    })
  })
}

async function executeStep2(p: {
  bankName: string
  accNum: string
  bvnNum: string
  holderName: string
  payload: any
}) {
  const result = document.getElementById('step2-result')
  if (!result) return

  const isMatch =
    p.holderName.toLowerCase().includes(state.player.firstName.toLowerCase()) &&
    p.bvnNum === '77777777777'

  if (isMatch) {
    const successResponse = {
      status: 'found',
      verified: true,
      score: 1.0,
      recommendation: 'ALLOW',
      match: {
        bvn: p.bvnNum,
        account_holder: p.holderName,
        registered_player: `${state.player.firstName} ${state.player.lastName}`,
        status: 'OWNER_MATCHED',
      },
    }
    addLog('Step 2 · Bank Match', 'POST', '/api/identity/identify', 200, 78, p.payload, successResponse)

    try {
      await api.saveBankDetails({ bank_name: p.bankName, account_number: p.accNum })
    } catch {}

    state.bankAccount = {
      bankName: p.bankName,
      accountNumber: p.accNum,
      bvn: p.bvnNum,
      isVerified: true,
    }
    saveState(state)

    result.hidden = false
    result.innerHTML = `
      <div class="success" style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 8px;">
        <div>
          <strong>✓ Bank Account Verified &amp; Saved!</strong><br/>
          BVN legally matches registered player <strong>${state.player.firstName} ${state.player.lastName}</strong>.
        </div>
        <button type="button" id="btn-next-step3" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; font-weight: 800; padding: 12px; margin-top: 4px;">
          Continue to Step 3: Withdraw Funds →
        </button>
      </div>
    `
    document.getElementById('btn-next-step3')?.addEventListener('click', () => {
      goToStep(3)
      syncFields()
    })
  } else {
    const failResponse = {
      status: 'mismatch',
      verified: false,
      score: 0.15,
      recommendation: 'REJECT',
      error: `Mule account blocked: Account holder '${p.holderName}' does not match registered player '${state.player.firstName} ${state.player.lastName}'.`,
    }
    addLog('Step 2 · Bank Match', 'POST', '/api/identity/identify', 400, 68, p.payload, failResponse)

    result.hidden = false
    result.innerHTML = `
      <div class="error" style="padding: 14px; border-radius: 8px;">
        <strong>✗ Payout Redirection Blocked</strong><br/>
        This bank account belongs to "<strong>${p.holderName}</strong>", not the registered player (${state.player.firstName} ${state.player.lastName}). Payouts can only be sent to the verified account owner.
      </div>
    `
  }
}

// -----------------------------------------------------------------------------
// Step 3: Withdraw Funds (Biometric Verification Link)
// -----------------------------------------------------------------------------
function bindStep3() {
  const scenCards = document.querySelectorAll<HTMLElement>('.scenario-card-btn')
  const genBtn = document.getElementById('btn-generate-flow-link')
  const linkBox = document.getElementById('step3-link-box')
  const openLink = document.getElementById('link-open-camera')
  const urlText = document.getElementById('text-flow-url')
  const simPass = document.getElementById('btn-sim-pass')
  const simFail = document.getElementById('btn-sim-fail')
  const releaseBtn = document.getElementById('btn-release-payout')
  const receipt = document.getElementById('step3-receipt')

  // Scenario toggle
  scenCards.forEach((card) => {
    card.addEventListener('click', () => {
      scenCards.forEach((c) => c.classList.remove('active'))
      card.classList.add('active')
      selectedScenario = (card.dataset.scenario as any) || 'prefilled'
      state.withdrawal.scenario = selectedScenario
      saveState(state)
      updateDevCode()
    })
  })

  // Generate Link -> Code-First Slide-Out
  genBtn?.addEventListener('click', () => {
    const config = getLinkScenarioConfig(
      selectedScenario,
      `${state.player.firstName} ${state.player.lastName}`,
      state.player.id,
      'wtd_01',
      state.player.firstName,
      state.player.lastName,
      state.player.dateOfBirth || '1975-01-01'
    )

    showCodeFirstSlideOut({
      title: `POST /api/flows/${config.flowId}/links`,
      endpoint: `/api/flows/${config.flowId}/links`,
      method: 'POST',
      description: 'Creates a single-use hosted verification link for live biometric face validation before releasing payout funds.',
      curl: config.curl,
      ts: config.ts,
      python: config.python,
      go: config.go,
      rust: config.rust,
      confirmLabel: 'Noted, Proceed →',
      onProceed: async () => {
        // Log Flow setup configured for this scenario
        addLog(
          'Step 3 · Flow Setup',
          'POST',
          '/api/flows',
          200,
          74,
          config.flowRequestPayload,
          config.flowResponsePayload
        )

        // Fixed sandbox session link per user instructions
        const url = 'https://www.ninja.ng/kyc/?t=cylCDuxTXE5VnfIag1R6KrodUqfjqem9oyWAIplO'
        const linkResponse = {
          id: 'vs_' + Math.random().toString(36).substring(2, 9),
          flow_id: config.flowId,
          url,
          expires_at: new Date(Date.now() + 3600000 * 72).toISOString(),
          status: 'pending',
          sandbox: true,
          scenario: selectedScenario,
        }

        addLog('Step 3 · Verification Link', 'POST', `/api/flows/${config.flowId}/links`, 200, 85, config.requestPayload, linkResponse)

        state.withdrawal.verificationUrl = url
        state.withdrawal.faceStatus = 'pending'
        saveState(state)

        if (linkBox) linkBox.hidden = false
        if (urlText) urlText.textContent = url

        // Wire Open Verification Link
        if (openLink) {
          openLink.onclick = (e) => {
            e.preventDefault()
            window.open(url, '_blank')
            showVerificationSimulatorModal(selectedScenario)
          }
        }
      },
    })
  })

  // Outcome Simulator: Face Matched
  simPass?.addEventListener('click', async () => {
    executeFaceOutcome('passed')
  })

  // Outcome Simulator: Face Mismatch
  simFail?.addEventListener('click', async () => {
    executeFaceOutcome('failed')
  })

  // Release Money
  releaseBtn?.addEventListener('click', () => {
    const amt = state.withdrawal.amountNaira
    state.player.walletBalanceNaira = Math.max(0, state.player.walletBalanceNaira - amt)
    saveState(state)
    window.dispatchEvent(new CustomEvent('ninjabet:statechange'))

    try {
      confetti({ particleCount: 90, spread: 60, origin: { y: 0.7 } })
    } catch {}

    const payoutRequest = {
      amount: amt,
      currency: 'NGN',
      beneficiary: `${state.player.firstName} ${state.player.lastName}`,
      bank: state.bankAccount?.bankName || 'Access Bank',
      account_number: state.bankAccount?.accountNumber || '0123456789',
      verification_flow: 'vf_QAIWePPP4cLtGCaIkDeJillxxwYiV',
      liveness_score: 0.98,
    }

    const payoutResponse = {
      status: 'SETTLED',
      transaction_reference: 'NINJA_PAY_' + Date.now(),
      amount_settled: amt,
      beneficiary: `${state.player.firstName} ${state.player.lastName}`,
      cleared_at: new Date().toISOString(),
    }

    addLog('Payout · Disburse', 'POST', '/api/payouts/send', 200, 115, payoutRequest, payoutResponse)

    if (receipt) {
      receipt.hidden = false
      receipt.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 8px; padding: 16px; margin-top: 14px;">
          <h4 style="margin: 0 0 6px; color: #34d399; font-size: 15px;">🎉 Money Disbursed Successfully!</h4>
          <p style="margin: 0 0 12px; font-size: 13px; color: #cbd5e1;">
            <strong>${formatNaira(amt)}</strong> has been securely transferred to verified account holder <strong>${state.player.firstName} ${state.player.lastName}</strong> (${state.bankAccount?.bankName || 'Access Bank'} - ${state.bankAccount?.accountNumber || '0123456789'}).
          </p>
          <button type="button" id="btn-restart-demo" class="btn-reset-ghost" style="padding: 8px 14px; font-size: 12px;">
            ↺ Reset Demo to Step 1
          </button>
        </div>
      `
      document.getElementById('btn-restart-demo')?.addEventListener('click', () => {
        goToStep(1)
        syncFields()
      })
    }
  })
}

// -----------------------------------------------------------------------------
// Interactive Verification Flow Simulator Modal (Takes User Through Each Case)
// -----------------------------------------------------------------------------
function showVerificationSimulatorModal(scenario: 'prefilled' | 'unfilled' | 'custom') {
  document.querySelector('.verification-sim-overlay')?.remove()

  const overlay = document.createElement('div')
  overlay.className = 'verification-sim-overlay'

  let scenarioBadge = 'Case 1: Pre-filled Session'
  let scenarioDesc = `Ninja has pre-populated <strong>${state.player.firstName} ${state.player.lastName}</strong> (${state.player.dateOfBirth}). The player skips all manual forms and goes straight to biometric face verification.`

  if (scenario === 'unfilled') {
    scenarioBadge = 'Case 2: Blank Form (Cold KYC)'
    scenarioDesc = `Unfilled session: The user manually types their personal details on Ninja’s hosted portal before live camera activation.`
  } else if (scenario === 'custom') {
    scenarioBadge = 'Case 3: Custom Reference Tracking'
    scenarioDesc = `Attaches payout ledger transaction <code>wtd_sec_wtd_01:tier_strict</code> for automatic webhook correlation.`
  }

  overlay.innerHTML = `
    <div class="verification-sim-modal" role="dialog" aria-modal="true">
      <div class="verification-sim-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 16px;">📱</span>
          <span style="font-weight: 800; font-size: 13px; color: #fff;">Ninja Hosted Verification Experience</span>
        </div>
        <span class="api-log-step-tag tag-step-3">${scenarioBadge}</span>
      </div>

      <div class="verification-sim-body" id="modal-sim-body">
        <div class="teaching-context-box" style="margin: 0;">
          <div class="teaching-context-title"><span>Flow Simulation</span></div>
          <p class="teaching-context-p">${scenarioDesc}</p>
        </div>

        ${
          scenario === 'unfilled'
            ? `
          <div id="sim-unfilled-form" style="display: flex; flex-direction: column; gap: 10px; background: rgba(255,255,255,0.03); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08);">
            <span style="font-size: 11px; font-weight: 800; color: #38bdf8; text-transform: uppercase;">Step 1: Enter Customer Information</span>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <div>
                <label style="font-size: 10px; color: var(--muted); display: block; margin-bottom: 2px;">First Name</label>
                <input id="sim-unfilled-fn" value="${state.player.firstName}" style="padding: 6px 8px; font-size: 12px; margin: 0;" />
              </div>
              <div>
                <label style="font-size: 10px; color: var(--muted); display: block; margin-bottom: 2px;">Surname</label>
                <input id="sim-unfilled-ln" value="${state.player.lastName}" style="padding: 6px 8px; font-size: 12px; margin: 0;" />
              </div>
            </div>
            <div>
              <label style="font-size: 10px; color: var(--muted); display: block; margin-bottom: 2px;">Date of Birth</label>
              <input id="sim-unfilled-dob" type="date" value="${state.player.dateOfBirth}" style="padding: 6px 8px; font-size: 12px; margin: 0;" />
            </div>
            <button type="button" id="btn-sim-unfilled-proceed" style="background: #10b981; color: #021a0e; font-weight: 800; padding: 10px; margin-top: 6px; font-size: 12px;">
              Save Details &amp; Open Live Camera →
            </button>
          </div>
          <div id="sim-camera-container" hidden></div>
        `
            : `
          <div id="sim-camera-container"></div>
        `
        }
      </div>

      <div class="verification-sim-footer">
        <button type="button" class="btn-reset-ghost" id="btn-close-sim-modal" style="font-size: 12px; padding: 6px 14px;">
          Close
        </button>
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  function renderCameraSection() {
    const container = overlay.querySelector('#sim-camera-container') as HTMLElement | null
    if (!container) return
    container.hidden = false
    container.innerHTML = `
      <div style="text-align: center;">
        <span style="font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.04em;">
          Live Biometric Camera Check
        </span>
        <div class="verification-camera-frame">
          <div class="verification-camera-scanline"></div>
          <span style="font-size: 42px; opacity: 0.85;">👤</span>
          <span style="font-size: 11px; color: #34d399; font-weight: 700; margin-top: 4px;">Hold Still · Scanning</span>
        </div>
        <p style="font-size: 12px; color: #94a3b8; margin: 8px 0 16px;">
          Select the biometric match outcome to simulate what happens when Ninja evaluates liveness &amp; facial match:
        </p>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button type="button" class="preset-chip preset-pass" id="btn-modal-pass" style="flex: 1; padding: 10px; font-size: 12px;">
            ✓ Real Customer (98% Pass)
          </button>
          <button type="button" class="preset-chip preset-fail" id="btn-modal-fail" style="flex: 1; padding: 10px; font-size: 12px;">
            ✗ Imposter (32% Mismatch)
          </button>
        </div>
      </div>
    `

    container.querySelector('#btn-modal-pass')?.addEventListener('click', () => {
      overlay.remove()
      executeFaceOutcome('passed')
    })

    container.querySelector('#btn-modal-fail')?.addEventListener('click', () => {
      overlay.remove()
      executeFaceOutcome('failed')
    })
  }

  if (scenario === 'unfilled') {
    overlay.querySelector('#btn-sim-unfilled-proceed')?.addEventListener('click', () => {
      const form = overlay.querySelector('#sim-unfilled-form') as HTMLElement | null
      if (form) form.hidden = true
      renderCameraSection()
    })
  } else {
    renderCameraSection()
  }

  overlay.querySelector('#btn-close-sim-modal')?.addEventListener('click', () => {
    overlay.remove()
  })
}

function executeFaceOutcome(outcome: 'passed' | 'failed') {
  const releaseBox = document.getElementById('step3-release-box')

  if (outcome === 'passed') {
    state.withdrawal.faceStatus = 'passed'
    saveState(state)

    const webhookPayload = {
      headers: {
        'content-type': 'application/json',
        'x-ninja-event': 'kyc.session.completed',
        'x-ninja-signature': 't=1727435123,v1=5d41402abc4b2a76b9719d911017c592',
      },
      event: 'kyc.session.completed',
      flow_id: 'vf_QAIWePPP4cLtGCaIkDeJillxxwYiV',
      session_id: 'vs_' + Math.random().toString(36).substring(2, 9),
      customer_ref: selectedScenario === 'custom' ? 'wtd_sec_wtd_01:tier_strict' : 'player_007:wtd_01',
      status: 'passed',
      signature_verified: true,
      biometrics: {
        liveness_score: 0.985,
        face_match_score: 0.992,
        anti_spoofing: 'PASSED',
        recommendation: 'ALLOW',
      },
    }

    const webhookAck = {
      received: true,
      signature_valid: true,
      action: 'PAYOUT_AUTHORIZED',
      ledger_status: 'QUEUED_FOR_DISBURSEMENT',
    }

    addLog('Webhook · Face Verified', 'POST', '/api/webhooks/ninja', 200, 36, webhookPayload, webhookAck)
    if (releaseBox) releaseBox.hidden = false
  } else {
    state.withdrawal.faceStatus = 'failed'
    saveState(state)

    const webhookPayload = {
      headers: {
        'content-type': 'application/json',
        'x-ninja-event': 'kyc.session.completed',
        'x-ninja-signature': 't=1727435123,v1=8e2d402abc4b2a76b9719d911017c771',
      },
      event: 'kyc.session.completed',
      flow_id: 'vf_QAIWePPP4cLtGCaIkDeJillxxwYiV',
      session_id: 'vs_' + Math.random().toString(36).substring(2, 9),
      customer_ref: selectedScenario === 'custom' ? 'wtd_sec_wtd_01:tier_strict' : 'player_007:wtd_01',
      status: 'failed',
      signature_verified: true,
      biometrics: {
        liveness_score: 0.35,
        face_match_score: 0.28,
        anti_spoofing: 'FLAGGED',
        recommendation: 'REJECT',
      },
    }

    const webhookAck = {
      received: true,
      signature_valid: true,
      action: 'PAYOUT_FROZEN_SECURITY_FLAG',
      incident_ticket: 'SEC_TAKEOVER_ALERT_4402',
    }

    addLog('Webhook · Imposter Detected', 'POST', '/api/webhooks/ninja', 400, 38, webhookPayload, webhookAck)
    if (releaseBox) releaseBox.hidden = true
    alert('Biometric Verification Failed: Live selfie does not match the registered government face record (Confidence 28%). Payout blocked!')
  }
}

// -----------------------------------------------------------------------------
// Live Code Inspector & Telemetry
// -----------------------------------------------------------------------------
function bindDevTools() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement
      if (target.id === 'subtab-mint-link' || target.id === 'subtab-create-flow') {
        return
      }
      document.querySelectorAll('.tab-btn').forEach((b) => {
        if (b.id !== 'subtab-mint-link' && b.id !== 'subtab-create-flow') {
          b.classList.remove('active')
        }
      })
      target.classList.add('active')
      activeTab = (target.dataset.tab as any) || 'curl'
      updateDevCode()
    })
  })

  // Subtabs for Step 3
  document.getElementById('subtab-mint-link')?.addEventListener('click', () => {
    step3Subtab = 'mint'
    document.getElementById('subtab-mint-link')?.classList.add('active')
    document.getElementById('subtab-create-flow')?.classList.remove('active')
    updateDevCode()
  })

  document.getElementById('subtab-create-flow')?.addEventListener('click', () => {
    step3Subtab = 'flow'
    document.getElementById('subtab-create-flow')?.classList.add('active')
    document.getElementById('subtab-mint-link')?.classList.remove('active')
    updateDevCode()
  })

  document.getElementById('btn-clear-logs')?.addEventListener('click', () => {
    state.logs = []
    saveState(state)
    renderLogs()
  })
}

function bindCopyCode() {
  const copyBtn = document.getElementById('btn-copy-code')
  const statusText = document.getElementById('copy-status-text')
  const codeBlock = document.getElementById('dev-code-block')

  copyBtn?.addEventListener('click', () => {
    if (!codeBlock) return
    const text = codeBlock.textContent || ''
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (statusText) statusText.textContent = '✓ Copied!'
        setTimeout(() => {
          if (statusText) statusText.textContent = '📋 Copy'
        }, 1800)
      })
      .catch(() => {
        if (statusText) statusText.textContent = '✓ Copied!'
      })
  })
}

function updateDevCode() {
  const endpointEl = document.getElementById('dev-endpoint-label')
  const codeEl = document.getElementById('dev-code-block')
  if (!codeEl) return

  let endpoint = 'POST /api/identity/identify'
  let snippet = ''
  let lang = 'bash'

  if (state.currentStep === 1) {
    endpoint = 'POST /api/identity/identify'
    const fn = state.player.firstName
    const ln = state.player.lastName
    const nin = state.player.nin
    const dob = state.player.dateOfBirth

    if (activeTab === 'curl') {
      lang = 'bash'
      snippet = `curl -X POST https://api.ninja.ng/api/identity/identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "idType": "nin",
    "mode": "verify",
    "idNumber": "${nin}",
    "firstName": "${fn}",
    "lastName": "${ln}",
    "dateOfBirth": "${dob}"
  }'`
    } else if (activeTab === 'ts') {
      lang = 'javascript'
      snippet = `// Step 1: NIN Verification & Legal Age Check
const result = await ninja.identity.identify({
  idType: 'nin',
  mode: 'verify',
  idNumber: '${nin}',
  firstName: '${fn}',
  lastName: '${ln}',
  dateOfBirth: '${dob}',
})`
    } else if (activeTab === 'python') {
      lang = 'python'
      snippet = `# Step 1: NIN Verification & Legal Age Check
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "idType": "nin",
        "mode": "verify",
        "idNumber": "${nin}",
        "firstName": "${fn}",
        "lastName": "${ln}",
        "dateOfBirth": "${dob}"
    }
)`
    } else {
      lang = 'go'
      snippet = `// Step 1: NIN Verification & Legal Age Check
resp, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	IDType:      "nin",
	Mode:        "verify",
	IDNumber:    "${nin}",
	FirstName:   "${fn}",
	LastName:    "${ln}",
	DateOfBirth: "${dob}",
})`
    }
  } else if (state.currentStep === 2) {
    endpoint = 'POST /api/identity/identify'
    const fn = state.player.firstName
    const ln = state.player.lastName
    const bvn = state.bankAccount?.bvn || '77777777777'

    if (activeTab === 'curl') {
      lang = 'bash'
      snippet = `curl -X POST https://api.ninja.ng/api/identity/identify \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "idType": "bvn",
    "mode": "verify",
    "idNumber": "${bvn}",
    "firstName": "${fn}",
    "lastName": "${ln}"
  }'`
    } else if (activeTab === 'ts') {
      lang = 'javascript'
      snippet = `// Step 2: Validate BVN Ownership Against Registered User
const result = await ninja.identity.identify({
  idType: 'bvn',
  mode: 'verify',
  idNumber: '${bvn}',
  firstName: '${fn}',
  lastName: '${ln}',
})`
    } else if (activeTab === 'python') {
      lang = 'python'
      snippet = `# Step 2: Validate BVN Ownership
response = requests.post(
    "https://api.ninja.ng/api/identity/identify",
    headers={"Authorization": f"Bearer {os.environ['NINJA_TOKEN']}"},
    json={
        "idType": "bvn",
        "mode": "verify",
        "idNumber": "${bvn}",
        "firstName": "${fn}",
        "lastName": "${ln}"
    }
)`
    } else {
      lang = 'go'
      snippet = `// Step 2: Validate BVN Ownership
resp, err := ninjaClient.Identify(ctx, ninja.IdentifyRequest{
	IDType:    "bvn",
	Mode:      "verify",
	IDNumber:  "${bvn}",
	FirstName: "${fn}",
	LastName:  "${ln}",
})`
    }
  } else {
    // Step 3
    if (step3Subtab === 'flow') {
      const flowCfg = getFlowCreationConfig()
      endpoint = 'POST /api/flows'
      if (activeTab === 'curl') {
        lang = 'bash'
        snippet = flowCfg.curl
      } else if (activeTab === 'ts') {
        lang = 'javascript'
        snippet = flowCfg.ts
      } else if (activeTab === 'python') {
        lang = 'python'
        snippet = flowCfg.python
      } else {
        lang = 'go'
        snippet = flowCfg.go
      }
    } else {
      const cfg = getLinkScenarioConfig(
        selectedScenario,
        `${state.player.firstName} ${state.player.lastName}`,
        state.player.id,
        'wtd_01',
        state.player.firstName,
        state.player.lastName,
        state.player.dateOfBirth || '1975-01-01'
      )
      endpoint = `POST /api/flows/${cfg.flowId}/links`

      if (activeTab === 'curl') {
        lang = 'bash'
        snippet = cfg.curl
      } else if (activeTab === 'ts') {
        lang = 'javascript'
        snippet = cfg.ts
      } else if (activeTab === 'python') {
        lang = 'python'
        snippet = cfg.python
      } else {
        lang = 'go'
        snippet = cfg.go
      }
    }
  }

  if (endpointEl) endpointEl.textContent = endpoint
  codeEl.className = `language-${lang}`
  codeEl.innerHTML = Prism.highlight(snippet, Prism.languages[lang] || Prism.languages.javascript, lang)
}

function addLog(
  step: string,
  method: 'POST' | 'GET',
  endpoint: string,
  status: number,
  durationMs: number,
  requestPayload: any,
  responsePayload: any
) {
  const log: TelemetryLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toLocaleTimeString(),
    step,
    method,
    endpoint,
    status,
    durationMs,
    requestPayload,
    responsePayload,
    summary: `${step} · ${status} · ${endpoint}`,
  }
  state.logs.unshift(log)
  if (state.logs.length > 25) state.logs.pop()
  saveState(state)
  renderLogs(log.id)
}

const logActiveLang: Record<string, string> = {}

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
async fn main() -> Result<(), Box<dyn std::error.Error>> {
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
  const list = document.getElementById('dev-call-log-list')
  if (!list) return

  if (state.logs.length === 0) {
    list.innerHTML = `
      <div style="font-size: 11.5px; color: var(--muted); text-align: center; padding: 24px;" id="empty-logs-label">
        No API calls made yet. Click any button on the left to trigger a live call.
      </div>
    `
    return
  }

  function getTagClass(step?: string): string {
    const s = String(step || '')
    if (s.includes('Step 1')) return 'tag-step-1'
    if (s.includes('Step 2')) return 'tag-step-2'
    if (s.includes('Step 3')) return 'tag-step-3'
    if (s.includes('Webhook')) return 'tag-webhook'
    if (s.includes('Payout')) return 'tag-payout'
    return 'tag-step-1'
  }

  list.innerHTML = state.logs
    .map((l, index) => {
      const isOpen = openLogId ? l.id === openLogId : index === 0
      const activeLang = logActiveLang[l.id] || 'curl'
      const snippets = generateCodeSnippets(l.method, l.endpoint, l.requestPayload)
      const currentSnippet = snippets[activeLang] || snippets.curl
      const highlightedCode = Prism.highlight(
        currentSnippet.code,
        Prism.languages[currentSnippet.lang] || Prism.languages.javascript,
        currentSnippet.lang
      )

      return `
        <div class="api-log-entry ${isOpen ? 'open' : ''}" data-log-id="${l.id}">
          <div class="api-log-header">
            <div class="api-log-header-left">
              <span class="api-log-step-tag ${getTagClass(l.step)}">${escapeHtml(l.step)}</span>
              <span class="api-log-method">${l.method}</span>
              <code class="api-log-path" title="${escapeHtml(l.endpoint)}">${escapeHtml(l.endpoint)}</code>
            </div>
            <div class="api-log-meta">
              <span class="api-log-time">${l.durationMs}ms</span>
              <span class="api-log-status api-log-status-${l.status === 200 ? '200' : '400'}">${l.status}</span>
              <span class="api-log-chevron">▼</span>
            </div>
          </div>
          <div class="api-log-details" ${isOpen ? '' : 'hidden'}>
            <!-- Multi-language code snippet box with tabs & copy button -->
            <div class="api-log-code-box">
              <div class="api-log-toolbar">
                <div class="api-log-lang-tabs" data-log-id="${l.id}">
                  <button type="button" class="api-log-lang-tab ${activeLang === 'curl' ? 'active' : ''}" data-lang="curl">cURL</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'javascript' ? 'active' : ''}" data-lang="javascript">JavaScript</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'python' ? 'active' : ''}" data-lang="python">Python</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'go' ? 'active' : ''}" data-lang="go">Go</button>
                  <button type="button" class="api-log-lang-tab ${activeLang === 'rust' ? 'active' : ''}" data-lang="rust">Rust</button>
                </div>
                <button type="button" class="btn-copy-log-snippet" data-log-id="${l.id}" title="Copy snippet">
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
                  <span class="label-method">${l.method} ${escapeHtml(l.endpoint)}</span>
                </div>
                <pre class="api-log-code"><code>${escapeHtml(JSON.stringify(l.requestPayload, null, 2))}</code></pre>
              </div>
              <div class="api-log-section">
                <div class="api-log-section-label">
                  <span>Server Response</span>
                  <span style="color: ${l.status === 200 ? '#34d399' : '#f87171'}; font-family: var(--font-mono); font-weight: 800;">${l.status} ${l.status === 200 ? 'OK' : 'REJECT'}</span>
                </div>
                <pre class="api-log-code"><code>${escapeHtml(JSON.stringify(l.responsePayload, null, 2))}</code></pre>
              </div>
            </div>
          </div>
        </div>
      `
    })
    .join('')

  // Accordion click
  list.querySelectorAll('.api-log-header').forEach((hdr) => {
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
  list.querySelectorAll('.api-log-lang-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const btn = e.currentTarget as HTMLElement
      const newLang = btn.dataset.lang || 'curl'
      const logId = btn.closest('.api-log-entry')?.getAttribute('data-log-id')
      if (logId) {
        logActiveLang[logId] = newLang
        const entry = list.querySelector(`.api-log-entry[data-log-id="${logId}"]`)
        if (entry) {
          const logItem = state.logs.find((item) => item.id === logId)
          if (logItem) {
            const snippets = generateCodeSnippets(logItem.method, logItem.endpoint, logItem.requestPayload)
            const currentSnippet = snippets[newLang] || snippets.curl
            const preEl = entry.querySelector('.api-log-snippet-pre')
            const codeEl = entry.querySelector('.api-log-snippet-code')
            if (preEl && codeEl) {
              preEl.className = `api-log-snippet-pre language-${currentSnippet.lang}`
              codeEl.className = `api-log-snippet-code language-${currentSnippet.lang}`
              codeEl.innerHTML = Prism.highlight(
                currentSnippet.code,
                Prism.languages[currentSnippet.lang] || Prism.languages.javascript,
                currentSnippet.lang
              )
            }
            entry.querySelectorAll('.api-log-lang-tab').forEach((b) => {
              if ((b as HTMLElement).dataset.lang === newLang) {
                b.classList.add('active')
              } else {
                b.classList.remove('active')
              }
            })
          }
        }
      }
    })
  })

  // Copy code snippet
  list.querySelectorAll('.btn-copy-log-snippet').forEach((copyBtn) => {
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const btn = e.currentTarget as HTMLElement
      const logId = btn.getAttribute('data-log-id')
      if (!logId) return
      const logItem = state.logs.find((item) => item.id === logId)
      if (!logItem) return
      const activeLang = logActiveLang[logId] || 'curl'
      const snippets = generateCodeSnippets(logItem.method, logItem.endpoint, logItem.requestPayload)
      const currentSnippet = snippets[activeLang] || snippets.curl
      const copyTextEl = btn.querySelector('.copy-text')

      navigator.clipboard
        .writeText(currentSnippet.code)
        .then(() => {
          btn.classList.add('copied')
          if (copyTextEl) copyTextEl.textContent = '✓ Copied!'
          setTimeout(() => {
            btn.classList.remove('copied')
            if (copyTextEl) copyTextEl.textContent = '📋 Copy Code'
          }, 1800)
        })
        .catch(() => {
          btn.classList.add('copied')
          if (copyTextEl) copyTextEl.textContent = '✓ Copied!'
          setTimeout(() => {
            btn.classList.remove('copied')
            if (copyTextEl) copyTextEl.textContent = '📋 Copy Code'
          }, 1800)
        })
    })
  })
}

function calculateAge(dobStr: string): number {
  try {
    const dob = new Date(dobStr)
    const diff = Date.now() - dob.getTime()
    return Math.abs(new Date(diff).getUTCFullYear() - 1970)
  } catch {
    return 25
  }
}

function formatNaira(val: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 0,
  }).format(val)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
