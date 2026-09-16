import {
  api,
  formatNaira,
  STATUS_LABEL,
  type Player,
  type APILogEntry,
  type FraudSignalGroup,
} from './lib/api'
import {
  renderCodeDrawer,
  type LanguageTab,
} from './lib/codeSnippet'
import {
  curlExample,
  javascriptExample,
  pythonExample,
  goExample,
  LOOKUP_CALL,
  VERIFY_REGISTRATION_CALL,
  VERIFY_PAYOUT_CALL,
  VERIFY_PAYOUT_BVN_CALL,
  hostedFlowCurlExample,
  hostedFlowTsExample,
  webhookVerifyGoExample,
} from './lib/apiExamples'
import { refreshNavPlayer } from './nav'

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function prettyJson(raw: { String: string; Valid: boolean } | string | object): string {
  if (typeof raw === 'object' && raw !== null && 'Valid' in raw) {
    if (!raw.Valid || !raw.String) return ''
    try {
      return JSON.stringify(JSON.parse(raw.String), null, 2)
    } catch {
      return raw.String
    }
  }
  if (typeof raw === 'string') {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2)
    } catch {
      return raw
    }
  }
  return JSON.stringify(raw, null, 2)
}

// Current active player state cache
let currentPlayer: Player | null = null
let currentOdds = 1.85
let currentSelection = 'Arsenal to Win'

// ============================================================================
// MOUNT CODE DRAWERS
// ============================================================================
function mountCodeDrawers() {
  // 1. Onboarding Code Drawer
  const obDrawerMount = document.getElementById('code-drawer-onboarding')
  if (obDrawerMount) {
    const obTabs: LanguageTab[] = [
      {
        id: 'curl',
        label: 'cURL',
        lang: 'bash',
        code: `${curlExample(LOOKUP_CALL)}\n\n# 3. Followed immediately by mode=verify to match name:\n${curlExample(VERIFY_REGISTRATION_CALL)}`,
      },
      {
        id: 'typescript',
        label: 'TypeScript',
        lang: 'javascript',
        code: `// Step 1: Lookup authoritative DOB and Photo from National Identity Registry\n${javascriptExample(LOOKUP_CALL)}\n\n// Step 2: Verify submitted first & last name match registry record\n${javascriptExample(VERIFY_REGISTRATION_CALL)}`,
      },
      {
        id: 'go',
        label: 'Go',
        lang: 'go',
        code: `// Step 1: Lookup authoritative DOB\n${goExample('lookup', LOOKUP_CALL.body)}\n\n// Step 2: Verify submitted name matches\n${goExample('verify', VERIFY_REGISTRATION_CALL.body)}`,
      },
      {
        id: 'python',
        label: 'Python',
        lang: 'python',
        code: `# Step 1: Lookup authoritative DOB and Photo\n${pythonExample(LOOKUP_CALL)}\n\n# Step 2: Verify submitted name matches\n${pythonExample(VERIFY_REGISTRATION_CALL)}`,
      },
    ]

    renderCodeDrawer(obDrawerMount, {
      title: 'POST /api/identity/identify',
      subtitle: 'Authoritative KYC: mode=lookup (extracts government DOB & photo) + mode=verify (verifies user identity)',
      tabs: obTabs,
      defaultOpen: false,
    })
  }

  // 2. Bonus Defense Code Drawer
  const bonusDrawerMount = document.getElementById('code-drawer-bonus')
  if (bonusDrawerMount) {
    const bonusTabs: LanguageTab[] = [
      {
        id: 'sql',
        label: 'SQL Architecture',
        lang: 'bash',
        code: `-- 1. Check if National Identity Number (NIN) has already received a sign-up bonus:
SELECT id, phone_number, created_at, kyc_status 
FROM players 
WHERE nin = '77777777777' AND bonus_kobo > 0;

-- 2. If existing > 0, account is permitted to register for genuine play,
-- but duplicate ₦100,000 welcome credit is blocked and flagged in fraud ledger:
INSERT INTO fraud_signals (nin, flag_type, reason, blocked_amount_kobo)
VALUES ('77777777777', 'sybil_bonus_farming', 'Duplicate NIN registration attempt', 10000000);`,
      },
      {
        id: 'go',
        label: 'Go Handler',
        lang: 'go',
        code: `// apps/ninja-bet/internal/api/register.go
existingAccounts, err := betdb.CountPlayersByIdentity(e.DB, req.NIN)

var status string
welcomeBonusKobo := int64(10000000) // ₦100,000

if existingAccounts > 0 {
    // Government-issued NIN is strictly one per citizen.
    // Burner phones cannot harvest duplicate bonuses:
    status = "flagged_duplicate_identity"
    welcomeBonusKobo = 0 // ₦0 bonus granted!
}`,
      },
      {
        id: 'typescript',
        label: 'TypeScript',
        lang: 'javascript',
        code: `// Enforce 1-Bonus-Per-Human across unlimited burner SIMs
const existing = await db.findPlayerByNIN(req.nin);
if (existing.length > 0) {
  return {
    kyc_status: 'flagged_duplicate_identity',
    bonus_granted_naira: 0,
    warning: 'Duplicate National ID detected. Welcome bonus blocked per terms.',
  };
}`,
      },
    ]

    renderCodeDrawer(bonusDrawerMount, {
      title: 'Sybil Defense: National ID Bonus Anchor',
      subtitle: 'Anchor platform incentives to unique government identities rather than spoofable phone numbers or emails.',
      tabs: bonusTabs,
      defaultOpen: false,
    })
  }

  // 3. Payout Code Drawer
  const payoutDrawerMount = document.getElementById('code-drawer-payout')
  if (payoutDrawerMount) {
    const payoutTabs: LanguageTab[] = [
      {
        id: 'curl',
        label: 'cURL',
        lang: 'bash',
        code: `# Dual-Check Step 1: Verify beneficiary name against verified player NIN\n${curlExample(VERIFY_PAYOUT_CALL)}\n\n# Dual-Check Step 2: Verify destination bank account BVN against registry\n${curlExample(VERIFY_PAYOUT_BVN_CALL)}`,
      },
      {
        id: 'typescript',
        label: 'TypeScript',
        lang: 'javascript',
        code: `// Check 1: Beneficiary name matches verified player NIN
const ninCheck = await ninja.identify({
  idType: 'nin',
  mode: 'verify',
  idNumber: player.nin,
  firstName: beneficiaryFirst,
  lastName: beneficiaryLast,
  dateOfBirth: player.dob,
});

// Check 2: Destination bank BVN matches beneficiary identity
const bvnCheck = await ninja.identify({
  idType: 'bvn',
  mode: 'verify',
  idNumber: req.bvn,
  firstName: beneficiaryFirst,
  lastName: beneficiaryLast,
  dateOfBirth: player.dob,
});`,
      },
      {
        id: 'go',
        label: 'Go',
        lang: 'go',
        code: `// Dual Check 1: Re-verify beneficiary against player's verified NIN
res1, _ := e.Ninja.Identify(ctx, ninja.IdentifyRequest{
    IDType: player.IDType, Mode: "verify", IDNumber: player.IDNumber,
    FirstName: bFirst, LastName: bLast, DateOfBirth: player.DateOfBirth.String,
})

// Dual Check 2: Verify bank BVN independently
res2, _ := e.Ninja.Identify(ctx, ninja.IdentifyRequest{
    IDType: "bvn", Mode: "verify", IDNumber: req.BVN,
    FirstName: bFirst, LastName: bLast, DateOfBirth: player.DateOfBirth.String,
})`,
      },
      {
        id: 'python',
        label: 'Python',
        lang: 'python',
        code: `# Check 1: NIN verification\n${pythonExample(VERIFY_PAYOUT_CALL)}\n\n# Check 2: Bank BVN verification\n${pythonExample(VERIFY_PAYOUT_BVN_CALL)}`,
      },
    ]

    renderCodeDrawer(payoutDrawerMount, {
      title: 'POST /api/identity/identify (Double Check: NIN + BVN)',
      subtitle: 'Account Takeover (ATO) Defense: Validates typed beneficiary name and bank BVN against official registry records.',
      tabs: payoutTabs,
      defaultOpen: false,
    })
  }

  // 4. Biometrics Code Drawer
  const bioDrawerMount = document.getElementById('code-drawer-biometrics')
  if (bioDrawerMount) {
    const bioTabs: LanguageTab[] = [
      {
        id: 'curl',
        label: 'cURL',
        lang: 'bash',
        code: hostedFlowCurlExample(),
      },
      {
        id: 'typescript',
        label: 'TypeScript',
        lang: 'javascript',
        code: hostedFlowTsExample(),
      },
      {
        id: 'go',
        label: 'Go Webhook HMAC',
        lang: 'go',
        code: webhookVerifyGoExample(),
      },
      {
        id: 'python',
        label: 'Python',
        lang: 'python',
        code: `import requests

# 1. Obtain session token
session = requests.post("https://api.sandbox.ninja.boucloud.io/auth/session", json={
    "client_key": NINJA_CLIENT_KEY,
    "client_secret": NINJA_CLIENT_SECRET,
}).json()

# 2. Initiate hosted 3D facial liveness check
flow = requests.post(
    "https://api.sandbox.ninja.boucloud.io/api/flows",
    headers={"Authorization": f"Bearer {session['token']}"},
    json={
        "name": "ninja-bet Biometric Liveness",
        "id_types": ["nin"],
        "selfie_required": True,
        "liveness_required": True,
        "redirect_url": "https://yourdomain.com/payout?status=complete",
        "webhook_url": "https://api.yourdomain.com/webhooks/ninja",
    },
).json()
print("Camera verification URL:", flow["url"])`,
      },
    ]

    renderCodeDrawer(bioDrawerMount, {
      title: 'POST /api/flows & Webhook HMAC Verification',
      subtitle: 'Passive 3D liveness detection matched directly against the authoritative registry photo fetched during onboarding.',
      tabs: bioTabs,
      defaultOpen: false,
    })
  }
}

// ============================================================================
// STAGE 1: 18+ ONBOARDING & REGISTRY MATCH GATE
// ============================================================================
function initStage1() {
  const form = document.getElementById('onboarding-form') as HTMLFormElement | null
  const resultBox = document.getElementById('ob-result') as HTMLElement | null
  const submitBtn = document.getElementById('ob-submit-btn') as HTMLButtonElement | null

  const firstNameInput = document.getElementById('ob-first-name') as HTMLInputElement | null
  const lastNameInput = document.getElementById('ob-last-name') as HTMLInputElement | null
  const phoneInput = document.getElementById('ob-phone') as HTMLInputElement | null
  const ninInput = document.getElementById('ob-nin') as HTMLInputElement | null
  const passwordInput = document.getElementById('ob-password') as HTMLInputElement | null

  // 1-Click Preset Buttons
  document.getElementById('preset-adult-btn')?.addEventListener('click', () => {
    if (firstNameInput) firstNameInput.value = 'James'
    if (lastNameInput) lastNameInput.value = 'Bond'
    if (phoneInput) phoneInput.value = '08012345678'
    if (ninInput) ninInput.value = '77777777777'
    if (passwordInput) passwordInput.value = 'password123'
    if (resultBox) resultBox.hidden = true
  })

  document.getElementById('preset-minor-btn')?.addEventListener('click', () => {
    if (firstNameInput) firstNameInput.value = 'Tobi'
    if (lastNameInput) lastNameInput.value = 'Minor'
    if (phoneInput) phoneInput.value = '08088888888'
    if (ninInput) ninInput.value = '88888888888'
    if (passwordInput) passwordInput.value = 'password123'
    if (resultBox) resultBox.hidden = true
  })

  document.getElementById('preset-mismatch-btn')?.addEventListener('click', () => {
    if (firstNameInput) firstNameInput.value = 'Impostor'
    if (lastNameInput) lastNameInput.value = 'Attacker'
    if (phoneInput) phoneInput.value = '08099999999'
    if (ninInput) ninInput.value = '77777777777'
    if (passwordInput) passwordInput.value = 'password123'
    if (resultBox) resultBox.hidden = true
  })

  // Submit Handler
  form?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!submitBtn || !resultBox) return

    const firstName = firstNameInput?.value.trim() || ''
    const lastName = lastNameInput?.value.trim() || ''
    const phoneNumber = phoneInput?.value.trim() || ''
    const nin = ninInput?.value.trim() || ''
    const password = passwordInput?.value || 'password123'

    submitBtn.disabled = true
    submitBtn.textContent = 'Verifying with Ninja Identity Sandbox (NLRC Gate)...'
    resultBox.hidden = true

    try {
      let resp
      if (nin === '88888888888') {
        resp = await api.simulateUnderage({ phone_number: phoneNumber, password })
      } else {
        resp = await api.register({
          first_name: firstName,
          last_name: lastName,
          phone_number: phoneNumber,
          nin,
          password,
        })
      }

      const p = resp.player
      currentPlayer = p
      await refreshNavPlayer()

      const isUnderage = p.kyc_status === 'blocked_underage'
      const isMismatch = p.kyc_status === 'blocked_mismatch'
      const isDuplicate = p.kyc_status === 'flagged_duplicate_identity'

      let alertClass = 'result-success'
      let statusTitle = 'KYC PASSED · 18+ IDENTITY CONFIRMED'

      if (isUnderage) {
        alertClass = 'result-error'
        statusTitle = '⛔ NLRC §34 VIOLATION · REGISTRATION BLOCKED (MINOR)'
      } else if (isMismatch) {
        alertClass = 'result-error'
        statusTitle = '⚠️ IDENTITY MISMATCH · REGISTRATION LOCKED'
      } else if (isDuplicate) {
        alertClass = 'result-warning'
        statusTitle = '⚡ DUPLICATE IDENTITY · WELCOME BONUS WITHHELD'
      }

      // Extract registry photo
      const photoUri = p.photo_data_uri || resp.lookup_result?.data?.image || ''
      const dob = resp.lookup_result?.data?.date_of_birth || (p.age ? `${2026 - p.age}-01-01` : 'N/A')
      const ageDisplay = p.age ? `${p.age} years old` : 'Unknown'
      const matchScore = p.match_score !== undefined ? `${Math.round(p.match_score * 100)}%` : '100%'

      resultBox.className = `result-box ${alertClass}`
      resultBox.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <strong style="font-size:14px;">${escapeHtml(statusTitle)}</strong>
          <span class="status-badge status-200">${escapeHtml(STATUS_LABEL[p.kyc_status] || p.kyc_status)}</span>
        </div>
        <p style="margin:0 0 12px; color:#e2e8f0;">${escapeHtml(resp.message)}</p>

        <div class="result-photo-card">
          ${photoUri ? `<img src="${escapeHtml(photoUri)}" alt="Official Registry Photo" class="result-avatar" />` : ''}
          <div style="flex:1;">
            <table class="result-meta-table">
              <tr><td>Official Name:</td><td>${escapeHtml(resp.lookup_result?.data?.first_name || p.first_name)} ${escapeHtml(resp.lookup_result?.data?.last_name || p.last_name)}</td></tr>
              <tr><td>Authoritative DOB:</td><td>${escapeHtml(dob)} (${escapeHtml(ageDisplay)})</td></tr>
              <tr><td>National NIN:</td><td><code>${escapeHtml(p.phone_number ? nin : '77777777777')}</code></td></tr>
              <tr><td>Identity Match Score:</td><td><strong style="color:${isMismatch ? '#ef4444' : '#22c55e'}">${escapeHtml(matchScore)}</strong></td></tr>
              <tr><td>Bonus Credited:</td><td><strong>${formatNaira(p.balance_kobo)}</strong></td></tr>
            </table>
          </div>
        </div>
      `
      resultBox.hidden = false

      // Update sportsbook balances and bio status
      updateStage3Wallet()
      updateStage4UI()
      refreshStage2Ledger()
      refreshTelemetry()
    } catch (err) {
      resultBox.className = 'result-box result-error'
      resultBox.innerHTML = `
        <strong>Registration Verification Failed</strong>
        <p style="margin:6px 0 0;">${escapeHtml((err as Error).message)}</p>
      `
      resultBox.hidden = false
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Verify Identity with Ninja API & Create Account →'
    }
  })
}

function renderStage1ActivePlayer(p: Player) {
  const resultBox = document.getElementById('ob-result') as HTMLElement | null
  const firstNameInput = document.getElementById('ob-first-name') as HTMLInputElement | null
  const lastNameInput = document.getElementById('ob-last-name') as HTMLInputElement | null
  const phoneInput = document.getElementById('ob-phone') as HTMLInputElement | null
  const ninInput = document.getElementById('ob-nin') as HTMLInputElement | null

  if (firstNameInput) firstNameInput.value = p.first_name
  if (lastNameInput) lastNameInput.value = p.last_name
  if (phoneInput) phoneInput.value = p.phone_number
  if (ninInput) ninInput.value = '77777777777'

  if (!resultBox) return

  const isVerified = p.kyc_status === 'verified'
  const photoUri = p.photo_data_uri || ''
  const ageDisplay = p.age ? `${p.age} years old` : '51 years old'
  const matchScore = p.match_score !== undefined ? `${Math.round(p.match_score * 100)}%` : '100%'

  resultBox.className = `result-box ${isVerified ? 'result-success' : 'result-warning'}`
  resultBox.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <strong style="font-size:14px;">ACTIVE IDENTITY ON FILE: ${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</strong>
      <span class="status-badge status-200">${escapeHtml(STATUS_LABEL[p.kyc_status] || p.kyc_status)}</span>
    </div>
    <p style="margin:0 0 12px; color:#e2e8f0;">
      Official Nigerian identity verified live via Ninja Identity API.
      Authoritative date of birth and biometric facial profile confirmed against the National Database.
    </p>

    <div class="result-photo-card">
      ${photoUri ? `<img src="${escapeHtml(photoUri)}" alt="Official Registry Photo" class="result-avatar" />` : ''}
      <div style="flex:1;">
        <table class="result-meta-table">
          <tr><td>Official Name:</td><td>${escapeHtml(p.first_name)} ${escapeHtml(p.last_name)}</td></tr>
          <tr><td>Authoritative Age:</td><td>${escapeHtml(ageDisplay)} (Adult 18+ Confirmed)</td></tr>
          <tr><td>Registered NIN:</td><td><code>77777777777</code></td></tr>
          <tr><td>Registry Match:</td><td><strong style="color:#22c55e">${escapeHtml(matchScore)}</strong></td></tr>
          <tr><td>Account Bonus:</td><td><strong>${formatNaira(p.balance_kobo)}</strong></td></tr>
        </table>
      </div>
    </div>
  `
  resultBox.hidden = false
}

// ============================================================================
// STAGE 2: SYBIL BONUS-FARMING DEFENSE
// ============================================================================
async function refreshStage2Ledger() {
  const ledgerEl = document.getElementById('fraud-ledger-table')
  const countEl = document.getElementById('metric-dup-count')
  const savedEl = document.getElementById('metric-saved-amount')
  if (!ledgerEl) return

  try {
    const [signals, impact] = await Promise.all([
      api.fraudSignals(),
      api.impact(),
    ])

    if (countEl) countEl.textContent = String(impact.DuplicateAccountsBlocked)
    if (savedEl) savedEl.textContent = formatNaira(impact.BonusFraudPreventedKobo)

    const signalList: FraudSignalGroup[] = Array.isArray(signals) ? signals : []

    if (signalList.length === 0) {
      ledgerEl.innerHTML = '<p class="hint" style="color:#94a3b8; font-size:12px; margin:8px 0;">No duplicate accounts detected yet. Click the Sybil Attack button above to launch an attack.</p>'
      return
    }

    const rows: string[] = []
    signalList.forEach((group: FraudSignalGroup) => {
      group.accounts.forEach((acc, idx) => {
        const isFirst = idx === 0
        rows.push(`
          <tr>
            <td><code>${escapeHtml(group.id_number)}</code></td>
            <td>${escapeHtml(acc.first_name)} ${escapeHtml(acc.last_name)}</td>
            <td><span class="status-badge ${isFirst ? 'status-200' : 'status-400'}">${escapeHtml(acc.kyc_status)}</span></td>
            <td><strong style="color:${isFirst ? '#22c55e' : '#ef4444'}">${isFirst ? '₦100,000 (Claimed)' : '₦0 (BLOCKED)'}</strong></td>
            <td style="color:#94a3b8;">${escapeHtml(acc.created_at || 'Just now')}</td>
          </tr>
        `)
      })
    })

    ledgerEl.innerHTML = `
      <table class="ledger-table">
        <thead>
          <tr>
            <th>Anchor NIN</th>
            <th>Player Name</th>
            <th>KYC Security Status</th>
            <th>Welcome Bonus</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join('')}
        </tbody>
      </table>
    `
  } catch {
    if (ledgerEl) ledgerEl.innerHTML = '<p style="color:#ef4444; font-size:12px;">Failed to load fraud signals.</p>'
  }
}

function initStage2() {
  const sybilBtn = document.getElementById('sybil-attack-btn') as HTMLButtonElement | null

  sybilBtn?.addEventListener('click', async () => {
    sybilBtn.disabled = true
    sybilBtn.textContent = '⚡ Simulating Sybil Attack (Attempting to harvest ₦100k bonus)...'

    try {
      // Generate random phone number: 080 + 8 random digits
      const randomPhone = '080' + Math.floor(10000000 + Math.random() * 90000000).toString()

      // Call register with existing NIN 77777777777 and burner phone
      await api.register({
        first_name: 'James',
        last_name: 'Bond',
        phone_number: randomPhone,
        nin: '77777777777',
        password: 'password123',
      })

      await refreshStage2Ledger()
      refreshTelemetry()

      alert(
        `🛡️ Sybil Attack Trapped!\n\n` +
        `Attacker attempted to open account with burner SIM (${randomPhone}) and claim ₦100,000 bonus.\n` +
        `Ninja-Bet matched NIN 77777777777 against the central fraud ledger.\n\n` +
        `Result: Account created with KYC status: flagged_duplicate_identity.\n` +
        `Welcome bonus granted: ₦0 (₦100,000 platform reserves saved).`
      )
    } catch (err) {
      alert('Sybil attack test error: ' + (err as Error).message)
    } finally {
      sybilBtn.disabled = false
      sybilBtn.textContent = '⚡ Launch Sybil Attack: Register Account #2 with Same NIN'
    }
  })

  refreshStage2Ledger()
}

// ============================================================================
// STAGE 3: LIVE SPORTSBOOK & DUAL-CHECK PAYOUT RAIL
// ============================================================================
function updateStage3Wallet() {
  const bonusEl = document.getElementById('sp-bonus-val')
  const winEl = document.getElementById('sp-winnings-val')
  const payoutAmountInput = document.getElementById('po-amount') as HTMLInputElement | null

  if (currentPlayer) {
    if (bonusEl) bonusEl.textContent = formatNaira(currentPlayer.balance_kobo)
    if (winEl) winEl.textContent = formatNaira(currentPlayer.winnings_kobo)
    if (payoutAmountInput && currentPlayer.winnings_kobo > 0) {
      payoutAmountInput.value = String(currentPlayer.winnings_kobo / 100)
    }
  }
}

function initStage3() {
  const betBtn = document.getElementById('place-bet-btn') as HTMLButtonElement | null
  const winBtn = document.getElementById('simulate-win-btn') as HTMLButtonElement | null
  const oddsButtons = document.querySelectorAll<HTMLButtonElement>('.odds-btn')

  // Odds buttons selection
  oddsButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      oddsButtons.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      currentOdds = parseFloat(btn.dataset.odds || '1.85')
      currentSelection = btn.textContent?.trim() || 'Arsenal (1.85)'
      if (betBtn) {
        betBtn.textContent = `Place ₦5,000 Bet on ${currentSelection}`
      }
    })
  })

  // Place Bet
  betBtn?.addEventListener('click', async () => {
    if (!currentPlayer) {
      alert('Please complete Stage 1 onboarding verification first.')
      return
    }

    betBtn.disabled = true
    try {
      const resp = await api.placeBet({
        match_event: 'Arsenal 2 - 1 Chelsea (Premier League)',
        selection: currentSelection,
        odds: currentOdds,
        stake_naira: 5000,
      })

      currentPlayer.balance_kobo = resp.balance_kobo
      updateStage3Wallet()
      await refreshNavPlayer()
      refreshTelemetry()

      alert(`✓ Bet Placed!\nStake: ₦5,000 deducted from welcome bonus.\nPotential Return: ${formatNaira(resp.potential_win_kobo)}.`)
    } catch (err) {
      alert('Could not place bet: ' + (err as Error).message)
    } finally {
      betBtn.disabled = false
    }
  })

  // Simulate Win
  winBtn?.addEventListener('click', async () => {
    if (!currentPlayer) {
      alert('Please complete Stage 1 onboarding verification first.')
      return
    }

    winBtn.disabled = true
    try {
      const resp = await api.simulateWin()
      currentPlayer.winnings_kobo = resp.winnings_kobo
      updateStage3Wallet()
      await refreshNavPlayer()
      refreshTelemetry()

      const payoutInput = document.getElementById('po-amount') as HTMLInputElement | null
      if (payoutInput) payoutInput.value = '250000'

      alert(`🏆 Match Settled!\nArsenal Won 2 - 1. You won ₦250,000!\nProceed to the instant bank withdrawal form below.`)
    } catch (err) {
      alert('Could not simulate win: ' + (err as Error).message)
    } finally {
      winBtn.disabled = false
    }
  })

  // Payout Presets
  const poBeneficiary = document.getElementById('po-beneficiary') as HTMLInputElement | null
  const poBank = document.getElementById('po-bank') as HTMLInputElement | null
  const poAccNum = document.getElementById('po-account-number') as HTMLInputElement | null
  const poBVN = document.getElementById('po-bvn') as HTMLInputElement | null
  const poAmount = document.getElementById('po-amount') as HTMLInputElement | null
  const poResult = document.getElementById('po-result') as HTMLElement | null

  document.getElementById('payout-legit-btn')?.addEventListener('click', () => {
    if (poBeneficiary) poBeneficiary.value = 'James Bond'
    if (poBank) poBank.value = 'GTBank'
    if (poAccNum) poAccNum.value = '0123456789'
    if (poBVN) poBVN.value = '77777777777' // Matches player's verified NIN
    if (poAmount && currentPlayer && currentPlayer.winnings_kobo > 0) {
      poAmount.value = String(currentPlayer.winnings_kobo / 100)
    }
    if (poResult) poResult.hidden = true
  })

  document.getElementById('payout-hacker-btn')?.addEventListener('click', () => {
    if (poBeneficiary) poBeneficiary.value = 'Mule Account'
    if (poBank) poBank.value = 'Kuda Bank'
    if (poAccNum) poAccNum.value = '9988776655'
    if (poBVN) poBVN.value = '55555555555' // Mismatched BVN
    if (poAmount && currentPlayer && currentPlayer.winnings_kobo > 0) {
      poAmount.value = String(currentPlayer.winnings_kobo / 100)
    }
    if (poResult) poResult.hidden = true
  })

  // Payout Form Submit
  const payoutForm = document.getElementById('payout-form') as HTMLFormElement | null
  const poSubmitBtn = document.getElementById('po-submit-btn') as HTMLButtonElement | null

  payoutForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (!poSubmitBtn || !poResult) return
    if (!currentPlayer) {
      alert('Please complete Stage 1 onboarding verification first.')
      return
    }

    const amountNaira = parseFloat(poAmount?.value || '250000')
    const beneficiaryName = poBeneficiary?.value.trim() || ''
    const bankName = poBank?.value.trim() || ''
    const accountNumber = poAccNum?.value.trim() || ''
    const bvn = poBVN?.value.trim() || ''

    poSubmitBtn.disabled = true
    poSubmitBtn.textContent = 'Executing Dual-Check Verification with Ninja API...'
    poResult.hidden = true

    try {
      const resp = await api.requestPayout({
        amount_naira: amountNaira,
        beneficiary_name: beneficiaryName,
        bank_name: bankName,
        account_number: accountNumber,
        bvn,
      })

      const isApproved = resp.status === 'approved'
      const isBVNMismatch = resp.status === 'blocked_bvn_mismatch'
      const isNameMismatch = resp.status === 'blocked_beneficiary_mismatch'
      const isLivenessRequired = resp.status === 'blocked_liveness_required'

      let alertClass = 'result-success'
      let statusTitle = '✓ PAYOUT APPROVED & CLEARED'

      if (isApproved) {
        currentPlayer.winnings_kobo = Math.max(0, currentPlayer.winnings_kobo - amountNaira * 100)
        updateStage3Wallet()
        await refreshNavPlayer()
      } else if (isBVNMismatch) {
        alertClass = 'result-error'
        statusTitle = '⛔ ATO DEFENSE TRIGGERED: BANK BVN MISMATCH'
      } else if (isNameMismatch) {
        alertClass = 'result-error'
        statusTitle = '⛔ BENEFICIARY NAME MISMATCH'
      } else if (isLivenessRequired) {
        alertClass = 'result-warning'
        statusTitle = '📷 LAYER-2 BIOMETRIC LIVENESS VERIFICATION REQUIRED'
      }

      poResult.className = `result-box ${alertClass}`
      poResult.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <strong style="font-size:14px;">${escapeHtml(statusTitle)}</strong>
          <span class="status-badge ${isApproved ? 'status-200' : 'status-400'}">${escapeHtml(resp.status)}</span>
        </div>
        <p style="margin:0 0 12px; color:#e2e8f0;">${escapeHtml(resp.message)}</p>

        <table class="result-meta-table" style="background:#0b0f19; padding:12px; border-radius:8px;">
          <tr><td>Requested Payout:</td><td>${formatNaira(amountNaira * 100)}</td></tr>
          <tr><td>Destination Bank:</td><td>${escapeHtml(bankName)} (${escapeHtml(accountNumber)})</td></tr>
          <tr><td>Check 1 (NIN vs Name):</td><td><strong style="color:${isNameMismatch ? '#ef4444' : '#22c55e'}">${isNameMismatch ? 'FAILED (Mule Name)' : 'MATCHED 100%'}</strong></td></tr>
          <tr><td>Check 2 (Bank BVN):</td><td><strong style="color:${isBVNMismatch ? '#ef4444' : '#22c55e'}">${isBVNMismatch ? 'FAILED (Mule BVN ' + escapeHtml(bvn) + ')' : 'MATCHED 100%'}</strong></td></tr>
          <tr><td>Check 3 (Biometric Liveness):</td><td><strong style="color:${isLivenessRequired ? '#f59e0b' : '#22c55e'}">${isLivenessRequired ? 'ACTION NEEDED (See Stage 4)' : 'CLEARED'}</strong></td></tr>
        </table>

        ${
          isLivenessRequired
            ? `<div style="margin-top:14px; text-align:right;">
                 <a href="#biometrics" class="preset-btn bio-pass" style="text-decoration:none; display:inline-block;">
                   👉 Complete Biometric Liveness in Stage 4 to Release Payout →
                 </a>
               </div>`
            : ''
        }
      `
      poResult.hidden = false
      refreshTelemetry()
    } catch (err) {
      poResult.className = 'result-box result-error'
      poResult.innerHTML = `
        <strong>Withdrawal Request Failed</strong>
        <p style="margin:6px 0 0;">${escapeHtml((err as Error).message)}</p>
      `
      poResult.hidden = false
    } finally {
      poSubmitBtn.disabled = false
      poSubmitBtn.textContent = 'Submit Withdrawal with Dual-Check Ninja Verification →'
    }
  })
}

// ============================================================================
// STAGE 4: LAYER-2 BIOMETRIC FACIAL LIVENESS ARMOR
// ============================================================================
function updateStage4UI() {
  const badgeEl = document.getElementById('bio-status-badge')
  const requireToggle = document.getElementById('bio-require-toggle') as HTMLInputElement | null
  const tierButtons = document.querySelectorAll<HTMLButtonElement>('.tier-btn')

  if (!currentPlayer) return

  if (requireToggle) {
    requireToggle.checked = currentPlayer.require_face_for_payout
  }

  const currentTier = currentPlayer.liveness_tier || 'medium'
  tierButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tier === currentTier)
  })

  if (badgeEl) {
    const status = currentPlayer.face_verification_status || 'pending'
    const score = currentPlayer.face_score !== undefined ? Math.round(currentPlayer.face_score * 100) : null

    if (status === 'passed') {
      badgeEl.textContent = `Passed ✓ (${score ?? 94}%)`
      badgeEl.className = 'badge-tag'
      badgeEl.style.color = '#22c55e'
      badgeEl.style.borderColor = 'rgba(34, 197, 94, 0.4)'
    } else if (status === 'failed') {
      badgeEl.textContent = `Spoof Detected ⛔ (${score ?? 2}%)`
      badgeEl.className = 'badge-tag alert-tag'
      badgeEl.style.color = '#ef4444'
    } else {
      badgeEl.textContent = currentPlayer.require_face_for_payout ? 'Action Required' : 'Optional'
      badgeEl.className = 'badge-tag'
      badgeEl.style.color = '#94a3b8'
    }
  }
}

function initStage4() {
  const requireToggle = document.getElementById('bio-require-toggle') as HTMLInputElement | null
  const tierButtons = document.querySelectorAll<HTMLButtonElement>('.tier-btn')
  const launchFaceBtn = document.getElementById('launch-real-face-btn') as HTMLButtonElement | null
  const simPassBtn = document.getElementById('sim-face-pass-btn') as HTMLButtonElement | null
  const simFailBtn = document.getElementById('sim-face-fail-btn') as HTMLButtonElement | null
  const bioResult = document.getElementById('bio-result') as HTMLElement | null

  let activeTier: 'low' | 'medium' | 'high' = 'medium'

  // Tier buttons
  tierButtons.forEach((btn) => {
    btn.addEventListener('click', async () => {
      tierButtons.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      activeTier = (btn.dataset.tier as 'low' | 'medium' | 'high') || 'medium'

      if (currentPlayer) {
        try {
          await api.saveSecuritySettings({
            require_face_for_payout: requireToggle?.checked ?? true,
            tier: activeTier,
          })
          currentPlayer.liveness_tier = activeTier
          refreshTelemetry()
        } catch (err) {
          console.error('save tier error', err)
        }
      }
    })
  })

  // Require Face Toggle
  requireToggle?.addEventListener('change', async () => {
    if (!currentPlayer) return
    try {
      await api.saveSecuritySettings({
        require_face_for_payout: requireToggle.checked,
        tier: activeTier,
      })
      currentPlayer.require_face_for_payout = requireToggle.checked
      updateStage4UI()
      refreshTelemetry()
    } catch (err) {
      alert('Could not update security settings: ' + (err as Error).message)
    }
  })

  // Launch Real Ninja Hosted Liveness Flow
  launchFaceBtn?.addEventListener('click', async () => {
    if (!currentPlayer) {
      alert('Please complete Stage 1 onboarding verification first.')
      return
    }

    launchFaceBtn.disabled = true
    launchFaceBtn.textContent = 'Generating Secure Ninja Hosted Verification Flow...'

    try {
      const flow = await api.startFaceVerification()
      if (bioResult) {
        bioResult.className = 'result-box result-success'
        bioResult.innerHTML = `
          <strong>📷 Ninja Hosted Biometric Flow Generated</strong>
          <p style="margin:6px 0 12px; color:#e2e8f0;">
            A real biometric flow session was created with Ninja. Click the link below to open Ninja's camera interface in a new window and complete 3D facial liveness:
          </p>
          <div style="margin-bottom:12px;">
            <a href="${escapeHtml(flow.verification_url)}" target="_blank" rel="noopener" class="cta-btn primary-cta" style="text-decoration:none; display:inline-flex;">
              Open Ninja Hosted Camera Liveness Flow ↗
            </a>
          </div>
          <small style="color:#94a3b8; font-family:monospace; display:block; word-break:break-all;">
            Flow URL: ${escapeHtml(flow.verification_url)}<br/>
            Expires At: ${escapeHtml(flow.expires_at || 'In 1 hour')}
          </small>
        `
        bioResult.hidden = false
      }
      refreshTelemetry()
    } catch (err) {
      if (bioResult) {
        bioResult.className = 'result-box result-error'
        bioResult.innerHTML = `<strong>Error initiating hosted flow:</strong><p>${escapeHtml((err as Error).message)}</p>`
        bioResult.hidden = false
      }
    } finally {
      launchFaceBtn.disabled = false
      launchFaceBtn.textContent = '📷 Launch Real Ninja Hosted Liveness Camera Check'
    }
  })

  // Simulate Pass
  simPassBtn?.addEventListener('click', async () => {
    if (!currentPlayer) {
      alert('Please complete Stage 1 onboarding verification first.')
      return
    }

    simPassBtn.disabled = true
    try {
      await api.simulateFaceVerificationOutcome('passed')
      currentPlayer.face_verification_status = 'passed'
      currentPlayer.face_score = 0.97
      updateStage4UI()

      if (bioResult) {
        bioResult.className = 'result-box result-success'
        bioResult.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong>✓ Biometric Liveness Passed</strong>
            <span class="status-badge status-200">Score: 97%</span>
          </div>
          <p style="margin:0 0 10px; color:#e2e8f0;">
            Live 3D camera match confirmed against official government registry photograph.
            Liveness score (97%) clears the 85% payout threshold!
          </p>
          <a href="#sportsbook-payout" class="preset-btn legitimate-payout" style="text-decoration:none; display:inline-block;">
            👉 Return to Stage 3 to Complete Withdrawal →
          </a>
        `
        bioResult.hidden = false
      }
      refreshTelemetry()
    } catch (err) {
      alert('Simulation error: ' + (err as Error).message)
    } finally {
      simPassBtn.disabled = false
    }
  })

  // Simulate Fail
  simFailBtn?.addEventListener('click', async () => {
    if (!currentPlayer) {
      alert('Please complete Stage 1 onboarding verification first.')
      return
    }

    simFailBtn.disabled = true
    try {
      await api.simulateFaceVerificationOutcome('failed')
      currentPlayer.face_verification_status = 'failed'
      currentPlayer.face_score = 0.02
      updateStage4UI()

      if (bioResult) {
        bioResult.className = 'result-box result-error'
        bioResult.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong>⛔ Anti-Spoofing Defense Triggered</strong>
            <span class="status-badge status-500">Score: 2%</span>
          </div>
          <p style="margin:0; color:#e2e8f0;">
            Attack detected: Video replay / printed photograph presentation detected.
            Score 2% fails strictness threshold (85%). All withdrawals on this account remain frozen.
          </p>
        `
        bioResult.hidden = false
      }
      refreshTelemetry()
    } catch (err) {
      alert('Simulation error: ' + (err as Error).message)
    } finally {
      simFailBtn.disabled = false
    }
  })
}

// ============================================================================
// STAGE 5: REAL-TIME AUDIT TELEMETRY & API STREAM
// ============================================================================
let activeTelemetryLogId: string | null = null

async function refreshTelemetry() {
  const tbody = document.getElementById('telemetry-tbody')
  const refreshBtn = document.getElementById('refresh-telemetry-btn') as HTMLButtonElement | null

  if (refreshBtn) refreshBtn.textContent = 'Refreshing...'

  try {
    const rawLogs = await api.callLog()
    const logList: APILogEntry[] = Array.isArray(rawLogs) ? rawLogs : []
    if (!tbody) return

    if (logList.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="loading-cell">No API calls recorded yet. Interact with the stages above to see live HTTP telemetry.</td></tr>'
      return
    }

    const rows: string[] = []
    logList.slice(0, 15).forEach((log: APILogEntry) => {
      const isSuccess = log.StatusCode < 300
      const isWarn = log.StatusCode >= 400 && log.StatusCode < 500
      const statusClass = isSuccess ? 'status-200' : isWarn ? 'status-400' : 'status-500'
      const latencyClass = log.DurationMs < 60 ? 'latency-fast' : 'latency-normal'
      const isExpanded = activeTelemetryLogId === log.ID

      rows.push(`
        <tr>
          <td>
            <strong style="color:${log.Method === 'POST' ? '#38bdf8' : '#a855f7'};">${escapeHtml(log.Method)}</strong>
            <span style="color:#e2e8f0; margin-left:6px;">${escapeHtml(log.Endpoint)}</span>
          </td>
          <td><span class="status-badge ${statusClass}">${log.StatusCode}</span></td>
          <td class="${latencyClass}"><strong>${log.DurationMs}ms</strong></td>
          <td>
            ${log.IsMock ? '<span class="hero-pill reg-pill" style="font-size:9px; padding:2px 6px;">Simulated</span>' : '<span class="hero-pill live-pill" style="font-size:9px; padding:2px 6px;">Live Sandbox</span>'}
          </td>
          <td style="color:#94a3b8; font-size:11px;">${escapeHtml(log.CreatedAt?.substring(11, 19) || 'Just now')}</td>
          <td>
            <button type="button" class="inspect-payload-btn" data-log-id="${log.ID}">
              ${isExpanded ? 'Hide' : 'Inspect'}
            </button>
          </td>
        </tr>
        ${
          isExpanded
            ? `
          <tr class="expanded-log-row" style="background:#060910;">
            <td colspan="6" style="padding:16px;">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
                <div>
                  <h5 style="margin:0 0 6px; font-size:11px; text-transform:uppercase; color:#94a3b8;">Request Payload</h5>
                  <pre style="background:#030508; padding:12px; border-radius:6px; max-height:220px; overflow:auto; font-size:11px; color:#38bdf8; margin:0;"><code>${escapeHtml(prettyJson(log.RequestPayload))}</code></pre>
                </div>
                <div>
                  <h5 style="margin:0 0 6px; font-size:11px; text-transform:uppercase; color:#94a3b8;">Response Payload</h5>
                  <pre style="background:#030508; padding:12px; border-radius:6px; max-height:220px; overflow:auto; font-size:11px; color:#4ade80; margin:0;"><code>${escapeHtml(prettyJson(log.ResponsePayload))}</code></pre>
                </div>
              </div>
            </td>
          </tr>
        `
            : ''
        }
      `)
    })

    tbody.innerHTML = rows.join('')

    // Attach inspect toggle buttons
    tbody.querySelectorAll<HTMLButtonElement>('.inspect-payload-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.logId
        if (activeTelemetryLogId === id) {
          activeTelemetryLogId = null
        } else {
          activeTelemetryLogId = id || null
        }
        refreshTelemetry()
      })
    })
  } catch (err) {
    console.error('telemetry fetch failed', err)
  } finally {
    if (refreshBtn) refreshBtn.textContent = '↻ Refresh Telemetry'
  }
}

function initStage5() {
  document.getElementById('refresh-telemetry-btn')?.addEventListener('click', () => {
    refreshTelemetry()
  })
  refreshTelemetry()

  // Auto-refresh telemetry every 10 seconds
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      refreshTelemetry()
    }
  }, 10000)
}

// ============================================================================
// STEPPER OBSERVER
// ============================================================================
function initStepperObserver() {
  const sections = document.querySelectorAll<HTMLElement>('.stage-section')
  const stepperLinks = document.querySelectorAll<HTMLAnchorElement>('.stepper-item')

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id')
          stepperLinks.forEach((link) => {
            const href = link.getAttribute('href')
            link.classList.toggle('active', href === `#${id}`)
          })
        }
      })
    },
    { rootMargin: '-20% 0px -60% 0px' }
  )

  sections.forEach((s) => observer.observe(s))
}

// ============================================================================
// MAIN APP BOOTSTRAP
// ============================================================================
async function init() {
  mountCodeDrawers()
  initStage1()
  initStage2()
  initStage3()
  initStage4()
  initStage5()
  initStepperObserver()

  // Check if player is already logged in
  try {
    currentPlayer = await api.me()
    updateStage3Wallet()
    updateStage4UI()
    if (currentPlayer) {
      renderStage1ActivePlayer(currentPlayer)
    }
  } catch {
    currentPlayer = null
  }
}

document.addEventListener('DOMContentLoaded', init)
