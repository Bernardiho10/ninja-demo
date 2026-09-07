import confetti from 'canvas-confetti'
import { api, APIError, formatNaira, type Player } from './lib/api'
import { renderLanguageTabs } from './lib/codeSnippet'
import { buildLanguageSnippets, VERIFY_PAYOUT_CALL, VERIFY_PAYOUT_BVN_CALL } from './lib/apiExamples'
import { startGuidedTour, autoStartTourIfFirstTime } from './lib/tour'
import { showErrorModal } from './lib/modal'

const statusLabel: Record<string, string> = {
  verified: 'Verified ✓',
  flagged_duplicate_identity: 'Duplicate identity — no bonus',
  blocked_underage: 'Blocked — underage',
  blocked_mismatch: 'Blocked — identity mismatch',
  blocked_lookup_failed: 'Blocked — NIN not found',
}

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

let player: Player | null = null
let selection: { fixture: Fixture; pick: Pick } | null = null
let stake = 5000
let busy = false

const betslipBody = document.getElementById('betslip-body') as HTMLElement
const pageError = document.getElementById('page-error') as HTMLElement
const pageNote = document.getElementById('page-note') as HTMLElement

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function canTransact(p: Player): boolean {
  return p.kyc_status === 'verified' || p.kyc_status === 'flagged_duplicate_identity'
}

function renderBetslip() {
  if (!player) return
  if (!canTransact(player)) {
    betslipBody.innerHTML = `<p class="hint">Identity verification did not clear at registration — betting isn't available on this account.</p>`
    return
  }
  if (!selection) {
    betslipBody.innerHTML = `<p class="hint">Click any odds to add a selection.</p>`
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
    <label>Stake (₦)<input id="stake-input" type="number" min="100" step="100" value="${stake}" /></label>
    <p class="hint">Potential win: <strong>${formatNaira(potentialWin * 100)}</strong></p>
    <button type="button" id="place-bet-btn" ${busy ? 'disabled' : ''}>Place ₦${stake.toLocaleString()} stake</button>
  `
  document.getElementById('stake-input')?.addEventListener('input', (e) => {
    stake = Number((e.target as HTMLInputElement).value)
    renderBetslip()
  })
  document.getElementById('place-bet-btn')?.addEventListener('click', onPlaceBet)
}

function renderWallet() {
  if (!player) return
  ;(document.querySelector('[data-role="balance"]') as HTMLElement).textContent = formatNaira(player.balance_kobo)
  ;(document.querySelector('[data-role="winnings"]') as HTMLElement).textContent = formatNaira(player.winnings_kobo)
  const excludedNote = document.getElementById('self-excluded-note') as HTMLElement
  excludedNote.hidden = !player.self_excluded
}

function renderIdentity() {
  if (!player) return
  const body = document.getElementById('identity-body') as HTMLElement
  body.innerHTML = `
    ${player.photo_data_uri ? `<img class="lookup-photo" src="${player.photo_data_uri}" alt="Registry photo" />` : ''}
    <div>
      <p><span class="badge badge-${player.kyc_status}">${escapeHtml(statusLabel[player.kyc_status] ?? player.kyc_status)}</span></p>
      <p class="hint">Age ${player.age ?? '—'} &middot; score ${player.match_score ?? '—'}</p>
    </div>
  `
}

function oddClass(fixtureId: string, pick: Pick): string {
  const isSelected = selection?.fixture.id === fixtureId && selection.pick === pick
  return `sb-odd${isSelected ? ' sb-odd-selected' : ''}`
}

function renderOddsSelection() {
  document.querySelectorAll<HTMLButtonElement>('.sb-odd').forEach((btn) => {
    const fixtureId = btn.dataset.fixture!
    const pick = btn.dataset.pick as Pick
    btn.className = oddClass(fixtureId, pick)
  })
}

function showError(message: string) {
  pageError.textContent = message
  pageError.hidden = false
  pageNote.hidden = true
  showErrorModal(message)
}
function showNote(message: string) {
  pageNote.textContent = message
  pageNote.hidden = false
  pageError.hidden = true
}

async function refreshPlayer() {
  player = await api.me()
  ;(document.querySelector('[data-role="player-name"]') as HTMLElement).textContent = `${player.first_name} ${player.last_name}`
  renderWallet()
  renderIdentity()
  renderBetslip()
  return player
}

async function loadHistory() {
  // Go's encoding/json marshals a nil slice as `null`, not `[]` — the
  // backend returns null when a player has no bets/payouts yet.
  const [bets, payouts] = await Promise.all([api.listBets(), api.listPayouts()])
  const betsList = bets ?? []
  const payoutsList = payouts ?? []
  const betHistory = document.getElementById('bet-history') as HTMLElement
  betHistory.innerHTML =
    betsList.length === 0
      ? '<p class="hint">No bets yet.</p>'
      : `<table class="fields"><thead><tr><th>Event</th><th>Selection</th><th>Stake</th><th>Status</th></tr></thead><tbody>
          ${betsList.map((b) => `<tr><td>${escapeHtml(b.MatchEvent)}</td><td>${escapeHtml(b.Selection)}</td><td>${formatNaira(b.StakeKobo)}</td><td>${escapeHtml(b.Status)}</td></tr>`).join('')}
        </tbody></table>`

  const payoutHistory = document.getElementById('payout-history') as HTMLElement
  payoutHistory.innerHTML =
    payoutsList.length === 0
      ? '<p class="hint">No payout attempts yet.</p>'
      : `<table class="fields"><thead><tr><th>Amount</th><th>To</th><th>Status</th></tr></thead><tbody>
          ${payoutsList.map((p) => `<tr><td>${formatNaira(p.AmountKobo)}</td><td>${p.BeneficiaryName?.Valid ? escapeHtml(p.BeneficiaryName.String) : ''}</td><td>${escapeHtml(p.Status)}</td></tr>`).join('')}
        </tbody></table>`
}

async function run(fn: () => Promise<void>) {
  busy = true
  renderBetslip()
  try {
    await fn()
    await loadHistory()
  } catch (err) {
    showError(err instanceof APIError ? err.message : 'Something went wrong')
  } finally {
    busy = false
    renderBetslip()
  }
}

async function onPlaceBet() {
  if (!selection) return
  await run(async () => {
    const res = await api.placeBet({
      match_event: `${selection!.fixture.home} vs ${selection!.fixture.away} (${selection!.fixture.league})`,
      selection: pickLabel(selection!.fixture, selection!.pick),
      odds: pickOdds(selection!.fixture, selection!.pick),
      stake_naira: stake,
    })
    showNote(`Bet placed. Potential win: ${formatNaira(res.potential_win_kobo)}`)
    selection = null
    await refreshPlayer()
  })
}

function fireWinConfetti() {
  const colors = ['#17b84b', '#e4002b', '#ffd76b', '#ffffff']
  confetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.3, y: 0.6 }, colors })
  confetti({ particleCount: 90, spread: 70, startVelocity: 45, origin: { x: 0.7, y: 0.6 }, colors })
}

document.getElementById('simulate-win-btn')?.addEventListener('click', () =>
  run(async () => {
    await api.simulateWin()
    showNote('Match simulated as won — winnings credited. Ready to withdraw? Scroll down.')
    await refreshPlayer()
    fireWinConfetti()
  }),
)

document.getElementById('reset-demo-btn')?.addEventListener('click', () =>
  run(async () => {
    await api.resetDemo()
    showNote('Demo balances reset. Identity stays as resolved at registration.')
    await refreshPlayer()
  }),
)

document.getElementById('self-exclude-btn')?.addEventListener('click', () =>
  run(async () => {
    const res = await api.selfExclude()
    showNote(res.message)
    await refreshPlayer()
  }),
)

document.querySelectorAll<HTMLButtonElement>('.sb-odd').forEach((btn) => {
  btn.addEventListener('click', () => {
    const fixture = FIXTURES.find((f) => f.id === btn.dataset.fixture)
    if (!fixture) return
    selection = { fixture, pick: btn.dataset.pick as Pick }
    renderOddsSelection()
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

const payoutForm = document.getElementById('payout-form') as HTMLFormElement
payoutForm.addEventListener('submit', (e) => {
  e.preventDefault()
  const payoutSubmitBtn = document.getElementById('payout-submit-btn') as HTMLButtonElement
  run(async () => {
    payoutSubmitBtn.disabled = true
    payoutSubmitBtn.textContent = 'Re-verifying with sandbox…'
    try {
      const res = await api.requestPayout({
        amount_naira: Number((document.getElementById('payout_amount') as HTMLInputElement).value),
        beneficiary_name: (document.getElementById('beneficiary_name') as HTMLInputElement).value,
        bank_name: (document.getElementById('bank_name') as HTMLInputElement).value,
        account_number: (document.getElementById('account_number') as HTMLInputElement).value,
        bvn: (document.getElementById('bvn') as HTMLInputElement).value,
      })
      showNote(res.message)
      if (res.status.startsWith('blocked_')) showErrorModal(res.message, 'Withdrawal blocked')
      await refreshPlayer()
    } finally {
      payoutSubmitBtn.disabled = false
      payoutSubmitBtn.textContent = 'Withdraw'
    }
  })
})

document.getElementById('tour-restart-btn')?.addEventListener('click', () => startGuidedTour())

async function init() {
  try {
    await refreshPlayer()
  } catch {
    window.location.href = '/register.html'
    return
  }
  ;(document.getElementById('beneficiary_name') as HTMLInputElement).value = `${player!.first_name} ${player!.last_name}`
  await loadHistory()

  const payoutSnippets = buildLanguageSnippets(VERIFY_PAYOUT_CALL, 'verify')
  renderLanguageTabs(document.getElementById('payout-tabs')!, {
    title: 'POST /api/identity/identify (mode: verify) — at payout',
    tabs: [
      { id: 'curl', label: 'cURL', lang: 'bash', code: payoutSnippets.curl },
      { id: 'js', label: 'JavaScript', lang: 'javascript', code: payoutSnippets.javascript },
      { id: 'node', label: 'Node.js', lang: 'javascript', code: payoutSnippets.node },
      { id: 'python', label: 'Python', lang: 'python', code: payoutSnippets.python },
      { id: 'go', label: 'Go', lang: 'go', code: payoutSnippets.go },
    ],
  })

  const payoutBvnSnippets = buildLanguageSnippets(VERIFY_PAYOUT_BVN_CALL, 'verify')
  renderLanguageTabs(document.getElementById('payout-bvn-tabs')!, {
    title: 'POST /api/identity/identify (mode: verify) — BVN check at payout',
    tabs: [
      { id: 'curl', label: 'cURL', lang: 'bash', code: payoutBvnSnippets.curl },
      { id: 'js', label: 'JavaScript', lang: 'javascript', code: payoutBvnSnippets.javascript },
      { id: 'node', label: 'Node.js', lang: 'javascript', code: payoutBvnSnippets.node },
      { id: 'python', label: 'Python', lang: 'python', code: payoutBvnSnippets.python },
      { id: 'go', label: 'Go', lang: 'go', code: payoutBvnSnippets.go },
    ],
  })

  autoStartTourIfFirstTime()

  if (new URLSearchParams(window.location.search).get('face') === 'complete') {
    showNote("Facial verification submitted — waiting for Ninja's confirmation. This updates on its own; no need to refresh.")
  }
  if (player!.face_verification_status === 'pending') pollForVerificationOutcome()
}

// The real hosted flow finishes on Ninja's own timeline, in a tab this
// page doesn't control — Ninja calls our webhook, not this page. Poll
// briefly rather than leaving a stale "pending" badge on screen.
let pollHandle: ReturnType<typeof setInterval> | null = null
function pollForVerificationOutcome() {
  if (pollHandle) return
  let attempts = 0
  pollHandle = setInterval(async () => {
    attempts++
    const before = player!.face_verification_status
    await refreshPlayer()
    if (player!.face_verification_status !== before && player!.face_verification_status !== 'pending') {
      showNote(
        player!.face_verification_status === 'passed'
          ? 'Facial verification passed — withdrawals that require it are now unblocked.'
          : "Facial verification failed — it didn't match the registry photo closely enough. You can try again from Account.",
      )
    }
    if (player!.face_verification_status !== 'pending' || attempts >= 24) {
      if (pollHandle) clearInterval(pollHandle)
      pollHandle = null
    }
  }, 5000)
}

init()
