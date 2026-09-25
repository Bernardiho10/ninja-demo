import confetti from 'canvas-confetti'
import {
  api,
  APIError,
  formatNaira,
  STATUS_LABEL,
  LIVENESS_TIERS,
  type Player,
} from './lib/api'
import { renderCodeDrawer } from './lib/codeSnippet'
import {
  buildLanguageSnippets,
  LOOKUP_CALL,
  VERIFY_PAYOUT_CALL,
  VERIFY_PAYOUT_BVN_CALL,
  companyLookupCurlExample,
  companyLookupTsExample,
  companyLookupPythonExample,
  companyLookupGoExample,
  bulkIdentifyCurlExample,
  bulkIdentifyTsExample,
} from './lib/apiExamples'
import { autoStartTourIfFirstTime } from './lib/tour'
import { showErrorModal } from './lib/modal'

// =============================================================================
// TYPES & CONSTANTS
// =============================================================================
type Pick = 'home' | 'draw' | 'away'
interface Fixture {
  id: string
  league: string
  home: string
  away: string
  oddsHome: number
  oddsDraw: number
  oddsAway: number
}

const FIXTURES: Fixture[] = [
  { id: 'f1', league: 'Premier League', home: 'Arsenal', away: 'Chelsea', oddsHome: 2.1, oddsDraw: 3.3, oddsAway: 3.4 },
  { id: 'f2', league: 'Premier League', home: 'Man City', away: 'Liverpool', oddsHome: 2.35, oddsDraw: 3.4, oddsAway: 2.9 },
  { id: 'f3', league: 'La Liga', home: 'Real Madrid', away: 'Barcelona', oddsHome: 1.85, oddsDraw: 3.6, oddsAway: 4.2 },
  { id: 'f4', league: 'La Liga', home: 'Atletico Madrid', away: 'Sevilla', oddsHome: 1.72, oddsDraw: 3.5, oddsAway: 4.6 },
  { id: 'f5', league: 'Bundesliga', home: 'Bayern Munich', away: 'Dortmund', oddsHome: 1.55, oddsDraw: 4.2, oddsAway: 5.4 },
  { id: 'f6', league: 'Ligue 1', home: 'PSG', away: 'Marseille', oddsHome: 1.45, oddsDraw: 4.6, oddsAway: 6.2 },
  { id: 'f7', league: 'Serie A', home: 'Napoli', away: 'Inter Milan', oddsHome: 2.65, oddsDraw: 3.2, oddsAway: 2.55 },
]

function pickOdds(f: Fixture, pick: Pick): number {
  return pick === 'home' ? f.oddsHome : pick === 'draw' ? f.oddsDraw : f.oddsAway
}

function pickLabel(f: Fixture, pick: Pick): string {
  if (pick === 'draw') return 'Draw'
  return pick === 'home' ? `${f.home} to Win` : `${f.away} to Win`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// =============================================================================
// STATE
// =============================================================================
let player: Player | null = null
let selection: { fixture: Fixture; pick: Pick } | null = null
let stake = 5000
let busy = false
let selectedTier: 'low' | 'medium' | 'high' = 'medium'
let pollHandle: ReturnType<typeof setInterval> | null = null

// DOM Elements
const betslipBody = document.getElementById('betslip-body') as HTMLElement
const pageError = document.getElementById('page-error') as HTMLElement
const pageNote = document.getElementById('page-note') as HTMLElement

function showError(message: string) {
  pageError.textContent = message
  pageError.hidden = false
  pageNote.hidden = true
  showErrorModal(message, 'Sportsbook Notification')
}

function showNote(message: string) {
  pageNote.textContent = message
  pageNote.hidden = false
  pageError.hidden = true
}

function fireWinConfetti() {
  const colors = ['#10b981', '#059669', '#34d399', '#ffd76b', '#ffffff']
  confetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.3, y: 0.6 }, colors })
  confetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.7, y: 0.6 }, colors })
}

// =============================================================================
// HERO & WALLET RENDERING
// =============================================================================
function renderHero() {
  if (!player) return
  const fullName = `${player.first_name} ${player.last_name}`
  const nameEls = Array.from(document.querySelectorAll<HTMLElement>('[data-role="player-name"]'))
  nameEls.forEach((el) => (el.textContent = fullName))

  const balanceEls = Array.from(document.querySelectorAll<HTMLElement>('[data-role="balance"]'))
  balanceEls.forEach((el) => (el.textContent = formatNaira(player!.balance_kobo)))

  const winningsEls = Array.from(document.querySelectorAll<HTMLElement>('[data-role="winnings"]'))
  winningsEls.forEach((el) => (el.textContent = formatNaira(player!.winnings_kobo)))

  const kycBadge = document.getElementById('hero-kyc-badge')
  if (kycBadge) {
    kycBadge.textContent = STATUS_LABEL[player.kyc_status] ?? player.kyc_status
    kycBadge.className = `badge badge-${player.kyc_status}`
  }

  const ageEl = document.getElementById('hero-player-age')
  if (ageEl) ageEl.textContent = player.age ? String(player.age) : '49'

  // Photos
  if (player.photo_data_uri) {
    const photoWrap = document.getElementById('hero-photo-wrap')
    if (photoWrap) {
      photoWrap.innerHTML = `<img src="${player.photo_data_uri}" alt="Registry photo" />`
    }
    const facePhotoPreview = document.getElementById('face-photo-preview')
    if (facePhotoPreview) {
      facePhotoPreview.innerHTML = `<img src="${player.photo_data_uri}" alt="Registry photo" />`
    }
  }
}

// =============================================================================
// BETSLIP RENDERING
// =============================================================================
function renderBetslip() {
  if (!player) return
  if (!selection) {
    betslipBody.innerHTML = `<p class="hint">Click any match odds to place a bet.</p>`
    return
  }
  const odds = pickOdds(selection.fixture, selection.pick)
  const potentialWin = Math.round(stake * odds)
  betslipBody.innerHTML = `
    <div class="fixture">
      <div>
        <div class="fixture-teams">${escapeHtml(selection.fixture.home)} <span class="fixture-vs">vs</span> ${escapeHtml(selection.fixture.away)}</div>
        <div class="fixture-league">${escapeHtml(selection.fixture.league)} &middot; ${escapeHtml(pickLabel(selection.fixture, selection.pick))}</div>
      </div>
      <div class="odds-pill">${odds.toFixed(2)}</div>
    </div>
    <div class="field-group">
      <label for="stake-input" style="font-size: 11px;">Stake Amount (₦)</label>
      <input id="stake-input" type="number" min="100" step="100" value="${stake}" style="margin-top: 4px;" />
    </div>
    <p class="hint" style="margin: 8px 0;">Potential Payout: <strong style="color: #34d399;">${formatNaira(potentialWin * 100)}</strong></p>
    <button type="button" id="place-bet-btn" ${busy ? 'disabled' : ''} class="btn-primary" style="margin-top: 6px;">
      Place ₦${stake.toLocaleString()} Bet
    </button>
  `
  document.getElementById('stake-input')?.addEventListener('input', (e) => {
    stake = Number((e.target as HTMLInputElement).value)
    renderBetslip()
  })
  document.getElementById('place-bet-btn')?.addEventListener('click', onPlaceBet)
}

function renderOddsButtons() {
  document.querySelectorAll<HTMLButtonElement>('.sb-odd').forEach((btn) => {
    const fixtureId = btn.dataset.fixture!
    const pick = btn.dataset.pick as Pick
    const isSelected = selection?.fixture.id === fixtureId && selection.pick === pick
    btn.className = `sb-odd${isSelected ? ' sb-odd-selected' : ''}`
  })
}

async function onPlaceBet() {
  if (!selection || !player) return
  busy = true
  renderBetslip()
  try {
    const res = await api.placeBet({
      match_event: `${selection.fixture.home} vs ${selection.fixture.away} (${selection.fixture.league})`,
      selection: pickLabel(selection.fixture, selection.pick),
      odds: pickOdds(selection.fixture, selection.pick),
      stake_naira: stake,
    })
    showNote(`Bet placed successfully! Potential win: ${formatNaira(res.potential_win_kobo)}`)
    selection = null
    renderOddsButtons()
    await refreshPlayer()
    await loadHistory()
  } catch (err) {
    showError(err instanceof APIError ? err.message : 'Could not place bet')
  } finally {
    busy = false
    renderBetslip()
  }
}

async function onSimulateWin() {
  try {
    const res = await api.simulateWin()
    showNote(`Match simulated as WON! Winnings credited: +₦250,000. Total winnings: ${formatNaira(res.winnings_kobo)}. Proceed to Payout Rail below.`)
    await refreshPlayer()
    await loadHistory()
    fireWinConfetti()
  } catch (err) {
    showError(err instanceof APIError ? err.message : 'Could not simulate win')
  }
}

// =============================================================================
// BIOMETRIC FACE VERIFICATION & SECURITY POLICY
// =============================================================================
function renderBiometricStatus() {
  if (!player) return
  const pill = document.getElementById('face-status-pill') as HTMLElement
  const scoreVal = document.getElementById('face-score-val') as HTMLElement
  const timestampEl = document.getElementById('face-timestamp') as HTMLElement

  if (!player.face_verification_status) {
    pill.textContent = 'Not Verified Yet'
    pill.className = 'badge badge-flagged_duplicate_identity'
    scoreVal.textContent = '—'
    timestampEl.textContent = 'No biometric verification session on file'
  } else if (player.face_verification_status === 'passed') {
    pill.textContent = 'Passed ✓'
    pill.className = 'badge badge-verified'
    const score = typeof player.face_score === 'number' ? Math.round(player.face_score * 100) : 97
    scoreVal.textContent = `${score}% Match Confidence`
    timestampEl.textContent = 'Authoritative government face match verified'
  } else if (player.face_verification_status === 'failed') {
    pill.textContent = 'Failed ✕'
    pill.className = 'badge badge-blocked_mismatch'
    const score = typeof player.face_score === 'number' ? Math.round(player.face_score * 100) : 2
    scoreVal.textContent = `${score}% (Below Threshold)`
    timestampEl.textContent = 'Face does not match registry photo'
  } else {
    pill.textContent = 'Pending Verification…'
    pill.className = 'badge badge-flagged_duplicate_identity'
    scoreVal.textContent = 'Awaiting User Selfie'
    timestampEl.textContent = 'Camera flow initiated via Ninja hosted link'
  }

  // Security policy
  const toggle = document.getElementById('require-face-toggle') as HTMLInputElement
  if (toggle) toggle.checked = player.require_face_for_payout

  selectedTier = player.liveness_tier === 'custom' ? 'medium' : player.liveness_tier
  document.querySelectorAll<HTMLButtonElement>('.tier-option').forEach((btn) => {
    btn.classList.toggle('tier-option-selected', btn.dataset.tier === selectedTier)
  })

  const securityStatus = document.getElementById('security-status') as HTMLElement
  if (securityStatus) {
    if (!player.require_face_for_payout) {
      securityStatus.textContent = 'Policy: Biometric liveness check is optional for standard withdrawals.'
    } else {
      const tierObj = LIVENESS_TIERS.find((t) => t.id === selectedTier)
      const pct = tierObj ? tierObj.percent : Math.round(player.liveness_threshold * 100)
      const meets =
        player.face_verification_status === 'passed' &&
        typeof player.face_score === 'number' &&
        player.face_score >= player.liveness_threshold
      securityStatus.textContent = meets
        ? `Policy active at ${pct}% strictness. Current face check clears the bar (payouts unblocked).`
        : `Policy active at ${pct}% strictness. No qualifying face check on file (payouts blocked until passed).`
    }
  }
}

function pollForVerificationOutcome() {
  if (pollHandle) return
  let attempts = 0
  pollHandle = setInterval(async () => {
    attempts++
    const before = player?.face_verification_status
    await refreshPlayer()
    if (player && player.face_verification_status !== before && player.face_verification_status !== 'pending') {
      showNote(
        player.face_verification_status === 'passed'
          ? 'Facial verification PASSED with high confidence. High-stakes withdrawals are now unblocked.'
          : 'Facial verification FAILED — face did not match registry photo closely enough.',
      )
    }
    if (!player || player.face_verification_status !== 'pending' || attempts >= 24) {
      if (pollHandle) clearInterval(pollHandle)
      pollHandle = null
    }
  }, 5000)
}

// =============================================================================
// CAC DUE DILIGENCE
// =============================================================================
async function doCACLookup(advanced: boolean) {
  const rcInput = document.getElementById('cac_rc_number') as HTMLInputElement
  const rc = rcInput.value.trim() || '0000000'
  const btn = document.getElementById(advanced ? 'btn-cac-advanced' : 'btn-cac-basic') as HTMLButtonElement
  const resultBox = document.getElementById('cac-result-box') as HTMLElement

  btn.disabled = true
  btn.textContent = 'Verifying with CAC…'
  resultBox.hidden = true

  try {
    const res = advanced ? await api.companyAdvancedLookup({ rc_number: rc }) : await api.companyLookup({ rc_number: rc })
    const d = res.data || {}
    let html = `
      <div class="cac-details-box">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
          <div>
            <h4 style="font-size: 16px; font-weight: 900; color: #fff; margin: 0;">${escapeHtml(d.name || d.company_name || 'Premier Betting Syndicate Ltd')}</h4>
            <span style="font-size: 12px; color: var(--muted);">RC Number: <strong>${escapeHtml(d.rc_number || rc)}</strong></span>
          </div>
          <span class="badge badge-verified">${escapeHtml(d.status || 'ACTIVE')}</span>
        </div>
        <div class="cac-field-grid">
          <div class="cac-field-item">
            <span class="cac-field-label">Registration Date</span>
            <span class="cac-field-value">${escapeHtml(d.registration_date || '2019-04-12')}</span>
          </div>
          <div class="cac-field-item">
            <span class="cac-field-label">Company Type</span>
            <span class="cac-field-value">${escapeHtml(d.type || 'Private Company Limited by Shares')}</span>
          </div>
          <div class="cac-field-item" style="grid-column: 1 / -1;">
            <span class="cac-field-label">Head Office Address</span>
            <span class="cac-field-value">${escapeHtml(d.address || 'Plot 14, Commercial Avenue, Victoria Island, Lagos')}</span>
          </div>
        </div>
    `

    if (advanced && d.directors) {
      const directors = Array.isArray(d.directors) ? d.directors : []
      html += `
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
          <h5 style="font-size: 12px; text-transform: uppercase; color: #34d399; margin: 0 0 8px;">Registered Directors &amp; Beneficial Owners:</h5>
          <table class="fields">
            <thead><tr><th>Name</th><th>Designation</th><th>Nationality</th></tr></thead>
            <tbody>
              ${directors.map((dir: any) => `
                <tr>
                  <td><strong>${escapeHtml(dir.name || dir.full_name)}</strong></td>
                  <td>${escapeHtml(dir.designation || 'Director')}</td>
                  <td>${escapeHtml(dir.nationality || 'Nigerian')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
    }

    if (advanced && d.shareholders) {
      const shareholders = Array.isArray(d.shareholders) ? d.shareholders : []
      html += `
        <div style="margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.08);">
          <h5 style="font-size: 12px; text-transform: uppercase; color: #34d399; margin: 0 0 8px;">Shareholding Distribution:</h5>
          <table class="fields">
            <thead><tr><th>Shareholder</th><th>Shares</th><th>Stake</th></tr></thead>
            <tbody>
              ${shareholders.map((sh: any) => `
                <tr>
                  <td>${escapeHtml(sh.name)}</td>
                  <td>${escapeHtml(sh.shares ? String(sh.shares) : '500,000')}</td>
                  <td><strong style="color: #34d399;">${escapeHtml(sh.percentage || '50%')}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `
    }

    html += `</div>`
    resultBox.innerHTML = html
    resultBox.hidden = false
  } catch (err) {
    showError(err instanceof APIError ? err.message : 'Corporate CAC lookup failed')
  } finally {
    btn.disabled = false
    btn.textContent = advanced ? 'Advanced Lookup (₦1,200)' : 'Basic Lookup (₦550)'
  }
}

// =============================================================================
// WEBHOOK DELIVERIES AUDIT LEDGER
// =============================================================================
async function loadWebhookDeliveries() {
  const container = document.getElementById('webhooks-ledger-container')
  if (!container) return
  try {
    const deliveries = await api.listWebhookDeliveries()
    const list = Array.isArray(deliveries) ? deliveries : []
    if (list.length === 0) {
      container.innerHTML = `<p class="hint">No webhook deliveries recorded yet in this session.</p>`
      return
    }
    container.innerHTML = `
      <table class="deliveries-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Delivery ID</th>
            <th>HTTP Status</th>
            <th>HMAC Signature</th>
            <th>Timestamp</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${list.map((d: any) => `
            <tr>
              <td><strong style="color: #fff;">${escapeHtml(d.event_type || d.event || 'verification.completed')}</strong></td>
              <td><code>${escapeHtml((d.id || d.delivery_id || 'del_test').substring(0, 14))}…</code></td>
              <td><span class="badge ${d.status_code === 200 || d.status === 'delivered' ? 'badge-verified' : 'badge-blocked_mismatch'}">${d.status_code || 200} OK</span></td>
              <td><span style="color: #34d399; font-family: var(--font-mono); font-size: 11px;">Verified ✓ sha256</span></td>
              <td>${new Date(d.created_at || Date.now()).toLocaleTimeString()}</td>
              <td>
                <button type="button" class="btn-retry-delivery link-button" data-id="${escapeHtml(d.id || 'del_test')}">
                  Retry
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `

    container.querySelectorAll('.btn-retry-delivery').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!
        try {
          await api.retryWebhookDelivery(id)
          showNote(`Webhook delivery ${id} re-dispatched.`)
          await loadWebhookDeliveries()
        } catch (err) {
          showError('Retry failed: ' + (err as Error).message)
        }
      })
    })
  } catch {
    container.innerHTML = `<p class="hint">Could not load webhook delivery log.</p>`
  }
}

// =============================================================================
// HISTORY (BETS & PAYOUTS)
// =============================================================================
async function loadHistory() {
  const [bets, payouts] = await Promise.all([api.listBets(), api.listPayouts()])
  const betsList = bets ?? []
  const payoutsList = payouts ?? []

  const betHistory = document.getElementById('bet-history')
  if (betHistory) {
    betHistory.innerHTML =
      betsList.length === 0
        ? '<p class="hint">No bets placed yet.</p>'
        : `<table class="fields"><thead><tr><th>Match</th><th>Pick</th><th>Stake</th><th>Status</th></tr></thead><tbody>
            ${betsList.slice(0, 5).map((b) => `<tr><td>${escapeHtml(b.MatchEvent)}</td><td>${escapeHtml(b.Selection)}</td><td>${formatNaira(b.StakeKobo)}</td><td><span class="badge badge-verified">${escapeHtml(b.Status)}</span></td></tr>`).join('')}
          </tbody></table>`
  }

  const payoutHistory = document.getElementById('payout-history')
  if (payoutHistory) {
    payoutHistory.innerHTML =
      payoutsList.length === 0
        ? '<p class="hint">No payout attempts yet.</p>'
        : `<table class="fields"><thead><tr><th>Amount</th><th>Beneficiary</th><th>Status</th></tr></thead><tbody>
            ${payoutsList.slice(0, 6).map((p) => {
              const statusClass = p.Status === 'completed' ? 'badge-verified' : 'badge-blocked_mismatch'
              const name = p.BeneficiaryName?.Valid ? p.BeneficiaryName.String : 'James Bond'
              return `<tr>
                <td><strong>${formatNaira(p.AmountKobo)}</strong></td>
                <td>${escapeHtml(name)}</td>
                <td><span class="badge ${statusClass}">${escapeHtml(p.Status)}</span></td>
              </tr>`
            }).join('')}
          </tbody></table>`
  }
}

// =============================================================================
// REFRESH PLAYER
// =============================================================================
async function refreshPlayer() {
  player = await api.me()
  renderHero()
  renderBiometricStatus()
  renderBetslip()
  return player
}

// =============================================================================
// CODE DRAWERS INITIALIZATION
// =============================================================================
function initCodeDrawers() {
  // 1. NIN Lookup
  const ninLookupTabs = buildLanguageSnippets(LOOKUP_CALL, 'lookup')
  renderCodeDrawer(document.getElementById('drawer-nin-lookup')!, {
    title: '1. POST /api/identity/identify (mode: lookup)',
    buttonLabel: 'NIN Registry Lookup & Authoritative Photo',
    subtitle: 'Synchronously retrieves authoritative date of birth, portrait image, and residential details from government database',
    tabs: [
      { id: 'curl', label: 'cURL', lang: 'bash', code: ninLookupTabs.curl },
      { id: 'js', label: 'JavaScript', lang: 'javascript', code: ninLookupTabs.javascript },
      { id: 'node', label: 'Node.js', lang: 'javascript', code: ninLookupTabs.node },
      { id: 'python', label: 'Python', lang: 'python', code: ninLookupTabs.python },
      { id: 'go', label: 'Go', lang: 'go', code: ninLookupTabs.go },
    ],
    defaultOpen: false,
  })

  // 2. Payout Name Verify
  const payoutNameTabs = buildLanguageSnippets(VERIFY_PAYOUT_CALL, 'verify')
  renderCodeDrawer(document.getElementById('drawer-payout-verify')!, {
    title: '2. POST /api/identity/identify (mode: verify) — Beneficiary Match',
    buttonLabel: 'Payout Beneficiary Name Verification',
    subtitle: 'Fuzzy-matches recipient account name against registry record before funds move',
    tabs: [
      { id: 'curl', label: 'cURL', lang: 'bash', code: payoutNameTabs.curl },
      { id: 'js', label: 'JavaScript', lang: 'javascript', code: payoutNameTabs.javascript },
      { id: 'node', label: 'Node.js', lang: 'javascript', code: payoutNameTabs.node },
      { id: 'python', label: 'Python', lang: 'python', code: payoutNameTabs.python },
      { id: 'go', label: 'Go', lang: 'go', code: payoutNameTabs.go },
    ],
    defaultOpen: false,
  })

  // 3. Payout BVN Verify
  const payoutBvnTabs = buildLanguageSnippets(VERIFY_PAYOUT_BVN_CALL, 'verify')
  renderCodeDrawer(document.getElementById('drawer-payout-bvn')!, {
    title: '3. POST /api/identity/identify (mode: verify with BVN)',
    buttonLabel: 'Bank Account BVN Ownership Check',
    subtitle: 'Defeats mule account attacks by proving destination bank account belongs to registered player',
    tabs: [
      { id: 'curl', label: 'cURL', lang: 'bash', code: payoutBvnTabs.curl },
      { id: 'js', label: 'JavaScript', lang: 'javascript', code: payoutBvnTabs.javascript },
      { id: 'node', label: 'Node.js', lang: 'javascript', code: payoutBvnTabs.node },
      { id: 'python', label: 'Python', lang: 'python', code: payoutBvnTabs.python },
      { id: 'go', label: 'Go', lang: 'go', code: payoutBvnTabs.go },
    ],
    defaultOpen: false,
  })

  // 4. Biometrics
  renderCodeDrawer(document.getElementById('drawer-biometrics')!, {
    title: '4. POST /api/flows/:id/links — Biometric Facial Verification Session',
    buttonLabel: 'Hosted Biometric Camera Link Flow',
    subtitle: 'Generates secure, single-use mobile webcam link with active liveness challenge',
    tabs: [
      {
        id: 'curl',
        label: 'cURL',
        lang: 'bash',
        code: `# 1. Create KYC Flow requiring facial liveness
curl -s -X POST https://api.ninja.ng/api/flows \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Sportsbook Liveness", "id_types": ["nin"], "require_face": true}'

# 2. Generate Single-Use Hosted Camera Link
curl -s -X POST https://api.ninja.ng/api/flows/$FLOW_ID/links \\
  -H "Authorization: Bearer $NINJA_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"customer_name": "James Bond", "customer_ref": "player_123"}'`,
      },
      {
        id: 'js',
        label: 'JavaScript',
        lang: 'javascript',
        code: `const link = await fetch(\`https://api.ninja.ng/api/flows/\${flowId}/links\`, {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${token}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ customer_name: 'James Bond', customer_ref: 'player_123' }),
}).then(r => r.json());
console.log('Hosted selfie URL:', link.url);`,
      },
      {
        id: 'python',
        label: 'Python',
        lang: 'python',
        code: `link = requests.post(
    f"https://api.ninja.ng/api/flows/{flow_id}/links",
    headers={"Authorization": f"Bearer {token}"},
    json={"customer_name": "James Bond", "customer_ref": "player_123"},
).json()
print("Hosted camera link:", link["url"])`,
      },
      {
        id: 'go',
        label: 'Go',
        lang: 'go',
        code: `link, err := ninjaClient.CreateFlowLink(ctx, flowID, ninja.CreateFlowLinkRequest{
	CustomerName: "James Bond",
	CustomerRef:  "player_123",
})
if err != nil {
	return err
}
fmt.Println("Hosted selfie URL:", link.URL)`,
      },
    ],
    defaultOpen: false,
  })

  // 5. CAC Corporate
  renderCodeDrawer(document.getElementById('drawer-cac-lookup')!, {
    title: '5. POST /api/company/lookup & /api/company/advanced-lookup',
    buttonLabel: 'CAC Corporate Affairs Commission KYB',
    subtitle: 'Validates corporate syndicate legal standing, directors, and beneficial shareholders',
    tabs: [
      { id: 'curl', label: 'cURL', lang: 'bash', code: companyLookupCurlExample('1234567', true) },
      { id: 'js', label: 'JavaScript', lang: 'javascript', code: companyLookupTsExample('1234567', true) },
      { id: 'python', label: 'Python', lang: 'python', code: companyLookupPythonExample('1234567', true) },
      { id: 'go', label: 'Go', lang: 'go', code: companyLookupGoExample('1234567', true) },
    ],
    defaultOpen: false,
  })

  // 6. Bulk Identify
  renderCodeDrawer(document.getElementById('drawer-bulk-identify')!, {
    title: '6. POST /api/identity/bulk-identify',
    buttonLabel: 'Bulk Identity Verification (Up to 25 IDs)',
    subtitle: 'Synchronous batch verification for player databases and roster lists',
    tabs: [
      { id: 'curl', label: 'cURL', lang: 'bash', code: bulkIdentifyCurlExample() },
      { id: 'js', label: 'JavaScript', lang: 'javascript', code: bulkIdentifyTsExample() },
    ],
    defaultOpen: false,
  })
}

// =============================================================================
// MAIN INITIALIZATION & EVENT WIRING
// =============================================================================
async function init() {
  try {
    await refreshPlayer()
  } catch {
    window.location.href = '/register.html'
    return
  }

  // Pre-fill forms
  const beneficiaryInput = document.getElementById('beneficiary_name') as HTMLInputElement
  if (beneficiaryInput && player) beneficiaryInput.value = `${player.first_name} ${player.last_name}`

  const bankNameInput = document.getElementById('bank_name') as HTMLInputElement
  const payoutBankInput = document.getElementById('payout_bank_name') as HTMLInputElement
  if (player?.saved_bank_name) {
    if (bankNameInput) bankNameInput.value = player.saved_bank_name
    if (payoutBankInput) payoutBankInput.value = player.saved_bank_name
  }

  const accountNumInput = document.getElementById('account_number') as HTMLInputElement
  const payoutAccountInput = document.getElementById('payout_account_number') as HTMLInputElement
  if (player?.saved_account_number) {
    if (accountNumInput) accountNumInput.value = player.saved_account_number
    if (payoutAccountInput) payoutAccountInput.value = player.saved_account_number
  }

  await loadHistory()
  await loadWebhookDeliveries()
  initCodeDrawers()

  // Handle callback query parameters from Ninja hosted selfie verification or redirects
  const rawSearch = window.location.search
  const cleanSearch = rawSearch.startsWith('?') ? '?' + rawSearch.substring(1).split('?').join('&') : rawSearch
  const urlParams = new URLSearchParams(cleanSearch)
  const faceStatus = urlParams.get('status')
  const vsId = urlParams.get('vs_id') || urlParams.get('verification_id')
  const isFaceCallback = !!(faceStatus || vsId || urlParams.get('face'))

  if (faceStatus === 'failed' || faceStatus === 'declined' || faceStatus === 'abandoned') {
    try {
      await api.simulateFaceVerificationOutcome('failed')
    } catch {}
    await refreshPlayer()
    showErrorModal(
      'Biometric Facial Verification Failed: The live selfie did not match your authoritative NIN registry portrait or failed liveness detection. Payouts remain locked under Anti-ATO defense policy.',
      'Biometric Facial Verification Failed'
    )
    document.getElementById('face-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } else if (faceStatus === 'completed' || faceStatus === 'passed' || faceStatus === 'success' || faceStatus === 'approved') {
    try {
      await api.simulateFaceVerificationOutcome('passed')
    } catch {}
    await refreshPlayer()
    fireWinConfetti()
    showNote('✓ Biometric Facial Verification Passed: Live selfie verified against government NIN registry portrait (97% confidence match). Layer-2 2FA cleared for instant payout.')
    document.getElementById('face-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (isFaceCallback) {
    // Strip face params from address bar, preserving tour param if present
    const tourParam = urlParams.get('tour')
    const newSearch = tourParam ? `?tour=${tourParam}` : ''
    window.history.replaceState({}, document.title, window.location.pathname + newSearch)
  } else {
    autoStartTourIfFirstTime()
  }

  // ---------------------------------------------------------------------------
  // Sportsbook Fixture & Odds Listeners
  // ---------------------------------------------------------------------------
  document.querySelectorAll<HTMLButtonElement>('.sb-odd').forEach((btn) => {
    btn.addEventListener('click', () => {
      const fixture = FIXTURES.find((f) => f.id === btn.dataset.fixture)
      if (!fixture) return
      selection = { fixture, pick: btn.dataset.pick as Pick }
      renderOddsButtons()
      renderBetslip()
    })
  })

  document.querySelectorAll<HTMLButtonElement>('#league-list button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const league = btn.dataset.league!
      document.querySelectorAll('#league-list button').forEach((b) => b.classList.toggle('sb-league-active', b === btn))
      document.querySelectorAll<HTMLElement>('.sb-league-group').forEach((section) => {
        section.hidden = league !== 'all' && section.dataset.league !== league
      })
    })
  })

  // Win Simulators
  document.getElementById('simulate-win-btn')?.addEventListener('click', onSimulateWin)
  document.getElementById('hero-simulate-win-btn')?.addEventListener('click', onSimulateWin)

  // ---------------------------------------------------------------------------
  // Bank Account & Deposit Listeners
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Bank Account & Deposit Listeners
  // ---------------------------------------------------------------------------
  const bankForm = document.getElementById('bank-form') as HTMLFormElement
  const bankNote = document.getElementById('bank-note') as HTMLElement
  const bankError = document.getElementById('bank-error') as HTMLElement
  const bankBvnInput = document.getElementById('bank_bvn') as HTMLInputElement

  document.getElementById('btn-bank-bvn-match')?.addEventListener('click', () => {
    if (bankBvnInput) bankBvnInput.value = '77777777777'
    if (bankError) bankError.hidden = true
  })

  document.getElementById('btn-bank-bvn-mismatch')?.addEventListener('click', () => {
    if (bankBvnInput) bankBvnInput.value = '22222222222'
    if (bankNote) bankNote.hidden = true
  })

  bankForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('save-bank-btn') as HTMLButtonElement
    btn.disabled = true
    if (bankNote) bankNote.hidden = true
    if (bankError) bankError.hidden = true

    const bankName = (document.getElementById('bank_name') as HTMLInputElement).value.trim()
    const accountNum = (document.getElementById('account_number') as HTMLInputElement).value.trim()
    const bvn = bankBvnInput?.value.trim() || '77777777777'

    try {
      // Real-time BVN ownership verification simulation against registered NIN
      if (bvn === '22222222222') {
        const errMsg = 'BVN Lookup Mismatch: Account BVN 22222222222 does not match registered NIN identity (James Bond). Bank account ownership rejected under CBN AML/KYC guidelines.'
        if (bankError) {
          bankError.textContent = errMsg
          bankError.hidden = false
        }
        showErrorModal(errMsg, 'Bank Account BVN Mismatch')
        return
      }

      const res = await api.saveBankDetails({ bank_name: bankName, account_number: accountNum })
      if (bankNote) {
        bankNote.textContent = `✓ BVN ${bvn} verified with CBN/NIBSS (100% Match). ${res.message}`
        bankNote.hidden = false
      }
      if (payoutBankInput) payoutBankInput.value = bankName
      if (payoutAccountInput) payoutAccountInput.value = accountNum
      if (bvnInput) bvnInput.value = bvn
      await refreshPlayer()
      showNote(`Bank details verified and saved: ${bankName} (${accountNum}) with BVN ${bvn}.`)
    } catch (err) {
      const errMsg = err instanceof APIError ? err.message : 'Could not save bank details'
      if (bankError) {
        bankError.textContent = errMsg
        bankError.hidden = false
      }
      showError(errMsg)
    } finally {
      btn.disabled = false
    }
  })

  const depositForm = document.getElementById('deposit-form') as HTMLFormElement
  const depositNote = document.getElementById('deposit-note') as HTMLElement
  depositForm?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const btn = document.getElementById('deposit-submit-btn') as HTMLButtonElement
    btn.disabled = true
    depositNote.hidden = true
    try {
      const amount = Number((document.getElementById('deposit_amount') as HTMLInputElement).value)
      const method = (document.getElementById('deposit_method') as HTMLSelectElement).value
      await api.deposit({ amount_naira: amount, method })
      depositNote.textContent = `Deposited ${formatNaira(amount * 100)} via ${method}. Balance updated.`
      depositNote.hidden = false
      await refreshPlayer()
    } catch (err) {
      showError(err instanceof APIError ? err.message : 'Deposit failed')
    } finally {
      btn.disabled = false
    }
  })

  // ---------------------------------------------------------------------------
  // Biometrics Action Listeners
  // ---------------------------------------------------------------------------
  const startFaceBtn = document.getElementById('start-face-btn') as HTMLButtonElement
  const faceLinkEl = document.getElementById('face-link') as HTMLElement
  const faceErrorEl = document.getElementById('face-error') as HTMLElement

  startFaceBtn?.addEventListener('click', async () => {
    startFaceBtn.disabled = true
    startFaceBtn.textContent = 'Generating Secure Session with user betID…'
    faceErrorEl.hidden = true
    try {
      const betIdInput = document.getElementById('user_bet_id_input') as HTMLInputElement
      const userBetId = betIdInput?.value.trim() || 'BET-9824108'
      const res = await api.startFaceVerification({ user_bet_id: userBetId })
      faceLinkEl.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 12px; margin-top: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; color: #34d399; font-weight: 800; margin-bottom: 4px;">
            Single-Use Biometric Flow Link Generated
          </div>
          <div style="font-size: 12px; margin-bottom: 6px;">
            Attached Custom Field: <code style="color: #34d399; font-weight: bold;">user betID: ${escapeHtml(userBetId)}</code>
          </div>
          <a href="${res.verification_url}" target="_blank" rel="noreferrer" style="display: inline-block; background: #10b981; color: #000; font-weight: 700; padding: 8px 14px; border-radius: 6px; text-decoration: none; font-size: 12px; margin-top: 4px;">
            Open Ninja Hosted Camera Flow →
          </a>
          <span style="font-size: 11px; color: var(--muted); margin-left: 10px;">(Expires ${new Date(res.expires_at).toLocaleTimeString()})</span>
          <p style="font-size: 11px; color: var(--muted); margin: 8px 0 0;">
            Complete selfie on webcam/mobile, or click <strong>⚡ Simulate Pass (97%)</strong> below to clear instantly.
          </p>
        </div>
      `
      faceLinkEl.hidden = false
      window.open(res.verification_url, '_blank')
      await refreshPlayer()
      pollForVerificationOutcome()
    } catch (err) {
      faceErrorEl.textContent = err instanceof APIError ? err.message : 'Could not generate verification link'
      faceErrorEl.hidden = false
    } finally {
      startFaceBtn.disabled = false
      startFaceBtn.textContent = '📸 Generate Verification Link with user betID (Hosted Webcam Flow)'
    }
  })

  document.getElementById('sim-face-pass-btn')?.addEventListener('click', async () => {
    try {
      await api.simulateFaceVerificationOutcome('passed')
      showNote('Simulated Biometric Check: PASSED with 97% confidence match against government registry photo.')
      await refreshPlayer()
    } catch (err) {
      showError('Simulation error: ' + (err as Error).message)
    }
  })

  document.getElementById('sim-face-fail-btn')?.addEventListener('click', async () => {
    try {
      await api.simulateFaceVerificationOutcome('failed')
      showNote('Simulated Biometric Check: FAILED with 2% confidence score (does not match registry photo).')
      await refreshPlayer()
    } catch (err) {
      showError('Simulation error: ' + (err as Error).message)
    }
  })

  // Tier Selector
  document.querySelectorAll<HTMLButtonElement>('.tier-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedTier = btn.dataset.tier as 'low' | 'medium' | 'high'
      document.querySelectorAll('.tier-option').forEach((b) => b.classList.toggle('tier-option-selected', b === btn))
      renderBiometricStatus()
    })
  })

  const saveSecurityBtn = document.getElementById('save-security-btn') as HTMLButtonElement
  const securityNote = document.getElementById('security-note') as HTMLElement
  saveSecurityBtn?.addEventListener('click', async () => {
    saveSecurityBtn.disabled = true
    securityNote.hidden = true
    try {
      const requireFace = (document.getElementById('require-face-toggle') as HTMLInputElement).checked
      const res = await api.saveSecuritySettings({ require_face_for_payout: requireFace, tier: selectedTier })
      securityNote.textContent = res.message
      securityNote.hidden = false
      await refreshPlayer()
    } catch (err) {
      showError(err instanceof APIError ? err.message : 'Could not save security settings')
    } finally {
      saveSecurityBtn.disabled = false
    }
  })

  // ---------------------------------------------------------------------------
  // Payout Form & Scenario Presets
  // ---------------------------------------------------------------------------
  const payoutForm = document.getElementById('payout-form') as HTMLFormElement
  const payoutSubmitBtn = document.getElementById('payout-submit-btn') as HTMLButtonElement
  const payoutAmountInput = document.getElementById('payout_amount') as HTMLInputElement
  const bvnInput = document.getElementById('bvn') as HTMLInputElement

  async function executeWithdrawal() {
    if (!player) return
    const amount = Number(payoutAmountInput.value)

    // 1. Bonus restriction check: ₦100,000 welcome bonus is not directly withdrawable
    if (player.winnings_kobo <= 0) {
      showErrorModal(
        'Non-Withdrawable Welcome Bonus: The ₦100,000 welcome credit is a wagering bonus and cannot be withdrawn directly. Under NLRC regulations and anti-bonus-farming controls, you must wager on a match and generate winnings first. Click "⚡ Simulate Match Win (+₦250,000)" to win a ticket and unlock withdrawable cash winnings!',
        'Winnings Balance Required'
      )
      return
    }

    // 2. Layer-2 Biometric 2-Step Auth Gate
    if (player.require_face_for_payout || player.face_verification_status !== 'passed') {
      if (player.face_verification_status === 'failed') {
        showErrorModal(
          'Biometric 2-Step Auth Failed: The last facial verification attempt scored 2% (below threshold) and did not match the authoritative NIN registry portrait. Payout blocked under Anti-ATO defense policy.',
          'Biometric Verification Failed'
        )
        return
      }

      if (player.face_verification_status !== 'passed') {
        showErrorModal(
          'Layer-2 2-Step Auth Required: High-stakes withdrawals require biometric facial verification to ensure the player initiating the payout is the verified NIN owner. Generating your single-use webcam link carrying your user betID now...',
          'Biometric 2FA Verification Required'
        )
        const faceCard = document.getElementById('face-card')
        faceCard?.scrollIntoView({ behavior: 'smooth' })
        faceCard?.classList.add('pulse-focus')
        setTimeout(() => faceCard?.classList.remove('pulse-focus'), 3000)
        startFaceBtn.click()
        return
      }
    }

    payoutSubmitBtn.disabled = true
    payoutSubmitBtn.textContent = 'Verifying Triple ATO Defense with Ninja…'
    try {
      const res = await api.requestPayout({
        amount_naira: amount,
        beneficiary_name: beneficiaryInput.value,
        bank_name: payoutBankInput.value,
        account_number: payoutAccountInput.value,
        bvn: bvnInput.value,
      })
      showNote(res.message)
      if (res.status.startsWith('blocked_')) {
        showErrorModal(res.message, 'Withdrawal Blocked by ATO Defense')
      } else {
        fireWinConfetti()
        showNote(`✓ Instant Payout Approved: ₦${amount.toLocaleString()} successfully disbursed to ${beneficiaryInput.value} (${payoutBankInput.value} · ${payoutAccountInput.value}).`)
      }
      await refreshPlayer()
      await loadHistory()
      await loadWebhookDeliveries()
    } catch (err) {
      showError(err instanceof APIError ? err.message : 'Withdrawal failed')
    } finally {
      payoutSubmitBtn.disabled = false
      payoutSubmitBtn.textContent = `Execute Instant Withdrawal (₦${Number(payoutAmountInput.value).toLocaleString()})`
    }
  }

  payoutForm?.addEventListener('submit', (e) => {
    e.preventDefault()
    executeWithdrawal()
  })

  // 1-Click Payout Scenario Buttons
  document.getElementById('btn-payout-legit')?.addEventListener('click', () => {
    if (player) beneficiaryInput.value = `${player.first_name} ${player.last_name}`
    bvnInput.value = '77777777777'
    payoutAmountInput.value = player && player.winnings_kobo > 0 ? String(player.winnings_kobo / 100) : '250000'
    executeWithdrawal()
  })

  document.getElementById('btn-payout-mule')?.addEventListener('click', () => {
    beneficiaryInput.value = 'Emeka Obi'
    bvnInput.value = '77777777777'
    executeWithdrawal()
  })

  document.getElementById('btn-payout-bvn')?.addEventListener('click', () => {
    if (player) beneficiaryInput.value = `${player.first_name} ${player.last_name}`
    bvnInput.value = '22222222222'
    executeWithdrawal()
  })

  document.getElementById('btn-payout-liveness')?.addEventListener('click', async () => {
    // Enable require face, simulate fail, and attempt withdrawal
    await api.saveSecuritySettings({ require_face_for_payout: true, tier: 'high' })
    await api.simulateFaceVerificationOutcome('failed')
    await refreshPlayer()
    executeWithdrawal()
  })

  document.getElementById('self-exclude-btn')?.addEventListener('click', async () => {
    if (confirm('Self-exclude this account? Betting and withdrawals will be frozen under NLRC responsible gaming rules.')) {
      try {
        const res = await api.selfExclude()
        showNote(res.message)
        await refreshPlayer()
      } catch (err) {
        showError((err as Error).message)
      }
    }
  })

  // ---------------------------------------------------------------------------
  // Corporate CAC Listeners
  // ---------------------------------------------------------------------------
  document.getElementById('btn-cac-preset')?.addEventListener('click', () => {
    const rcInput = document.getElementById('cac_rc_number') as HTMLInputElement
    if (rcInput) rcInput.value = '0000000'
    doCACLookup(true)
  })

  document.getElementById('btn-cac-basic')?.addEventListener('click', () => doCACLookup(false))
  document.getElementById('btn-cac-advanced')?.addEventListener('click', () => doCACLookup(true))

  // ---------------------------------------------------------------------------
  // Webhooks Refresh
  // ---------------------------------------------------------------------------
  document.getElementById('refresh-webhooks-btn')?.addEventListener('click', () => {
    loadWebhookDeliveries()
  })

  if (player?.face_verification_status === 'pending') pollForVerificationOutcome()
}

init()
