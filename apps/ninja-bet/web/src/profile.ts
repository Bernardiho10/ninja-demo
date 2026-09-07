import { api, APIError, formatNaira, STATUS_LABEL, LIVENESS_TIERS, type Player } from './lib/api'
import { showErrorModal } from './lib/modal'

const faceStatusLabel: Record<string, string> = {
  pending: 'Pending — link sent, not completed yet',
  passed: 'Passed ✓',
  failed: 'Failed — did not match the registry photo',
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

let player: Player
let selectedTier: 'low' | 'medium' | 'high' = 'medium'

// The real hosted flow opens in a new tab and finishes on Ninja's own
// timeline — Ninja calls our webhook, not this tab, so this page has no
// way to know it's done except asking. Polls briefly after a link is
// created; stops as soon as the status leaves "pending" or after 2
// minutes (the player closed the tab, gave up, or is still mid-flow).
let pollHandle: ReturnType<typeof setInterval> | null = null

function pollForVerificationOutcome() {
  if (pollHandle) return
  let attempts = 0
  pollHandle = setInterval(async () => {
    attempts++
    await refresh()
    if (player.face_verification_status !== 'pending' || attempts >= 24) {
      if (pollHandle) clearInterval(pollHandle)
      pollHandle = null
    }
  }, 5000)
}

function renderSummary() {
  ;(document.getElementById('account-summary') as HTMLElement).innerHTML =
    `${escapeHtml(player.first_name)} ${escapeHtml(player.last_name)} &middot; ${escapeHtml(player.phone_number)} &middot; ` +
    `<span class="badge badge-${player.kyc_status}">${escapeHtml(STATUS_LABEL[player.kyc_status] ?? player.kyc_status)}</span>`
}

function renderFaceStatus() {
  const el = document.getElementById('face-status') as HTMLElement
  if (!player.face_verification_status) {
    el.hidden = true
    return
  }
  el.hidden = false
  const badgeClass =
    player.face_verification_status === 'passed'
      ? 'verified'
      : player.face_verification_status === 'failed'
        ? 'blocked_mismatch'
        : 'flagged_duplicate_identity'
  el.innerHTML =
    `<span class="badge badge-${badgeClass}">${escapeHtml(faceStatusLabel[player.face_verification_status] ?? player.face_verification_status)}</span>` +
    (typeof player.face_score === 'number' ? `<span class="hint">&nbsp;score ${Math.round(player.face_score * 100)}%</span>` : '')
}

const requireFaceToggle = document.getElementById('require-face-toggle') as HTMLInputElement
const tierButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tier-option'))
const securityStatus = document.getElementById('security-status') as HTMLElement

function renderTierSelection() {
  tierButtons.forEach((btn) => btn.classList.toggle('tier-option-selected', btn.dataset.tier === selectedTier))
}

function renderSecuritySection() {
  requireFaceToggle.checked = player.require_face_for_payout
  selectedTier = player.liveness_tier === 'custom' ? 'medium' : player.liveness_tier
  renderTierSelection()

  if (!player.require_face_for_payout) {
    securityStatus.textContent = 'Withdrawals currently skip the liveness check — only the beneficiary-name check runs at payout.'
  } else {
    const tier = LIVENESS_TIERS.find((t) => t.id === player.liveness_tier)
    const meets = player.face_verification_status === 'passed' && typeof player.face_score === 'number' && player.face_score >= player.liveness_threshold
    securityStatus.textContent = meets
      ? `Active at ${tier ? tier.percent : Math.round(player.liveness_threshold * 100)}% — your last liveness check clears the bar. Withdrawals are unblocked.`
      : `Active at ${tier ? tier.percent : Math.round(player.liveness_threshold * 100)}% — you don't have a qualifying liveness check on file yet. The next withdrawal will be blocked until you complete one below.`
  }
}

async function refresh() {
  player = await api.me()
  renderSummary()
  renderFaceStatus()
  renderSecuritySection()
  ;(document.getElementById('bank_name') as HTMLInputElement).value = player.saved_bank_name ?? 'GTBank'
  ;(document.getElementById('account_number') as HTMLInputElement).value = player.saved_account_number ?? ''
}

const depositForm = document.getElementById('deposit-form') as HTMLFormElement
const depositAmountInput = document.getElementById('deposit_amount') as HTMLInputElement
const depositSubmitBtn = document.getElementById('deposit-submit-btn') as HTMLButtonElement
const depositNote = document.getElementById('deposit-note') as HTMLElement

function updateDepositButtonLabel() {
  depositSubmitBtn.textContent = `Deposit ${formatNaira(Number(depositAmountInput.value) * 100)}`
}
depositAmountInput.addEventListener('input', updateDepositButtonLabel)

depositForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  depositSubmitBtn.disabled = true
  depositNote.hidden = true
  try {
    const amount = Number(depositAmountInput.value)
    await api.deposit({ amount_naira: amount, method: (document.getElementById('deposit_method') as HTMLSelectElement).value })
    depositNote.textContent = `Deposited ${formatNaira(amount * 100)}.`
    depositNote.hidden = false
    await refresh()
  } catch (err) {
    const msg = err instanceof APIError ? err.message : 'Something went wrong'
    depositNote.textContent = msg
    depositNote.hidden = false
    showErrorModal(msg, 'Deposit failed')
  } finally {
    depositSubmitBtn.disabled = false
    updateDepositButtonLabel()
  }
})

const bankForm = document.getElementById('bank-form') as HTMLFormElement
const bankNote = document.getElementById('bank-note') as HTMLElement
bankForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const submitBtn = bankForm.querySelector('button[type="submit"]') as HTMLButtonElement
  submitBtn.disabled = true
  bankNote.hidden = true
  try {
    const res = await api.saveBankDetails({
      bank_name: (document.getElementById('bank_name') as HTMLInputElement).value,
      account_number: (document.getElementById('account_number') as HTMLInputElement).value,
    })
    bankNote.textContent = res.message
    bankNote.hidden = false
    await refresh()
  } catch (err) {
    const msg = err instanceof APIError ? err.message : 'Something went wrong'
    bankNote.textContent = msg
    bankNote.hidden = false
    showErrorModal(msg, 'Could not save bank details')
  } finally {
    submitBtn.disabled = false
  }
})

tierButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    selectedTier = btn.dataset.tier as 'low' | 'medium' | 'high'
    renderTierSelection()
  })
})

const saveSecurityBtn = document.getElementById('save-security-btn') as HTMLButtonElement
const securityNote = document.getElementById('security-note') as HTMLElement
saveSecurityBtn.addEventListener('click', async () => {
  saveSecurityBtn.disabled = true
  securityNote.hidden = true
  try {
    const res = await api.saveSecuritySettings({ require_face_for_payout: requireFaceToggle.checked, tier: selectedTier })
    securityNote.textContent = res.message
    securityNote.hidden = false
    await refresh()
  } catch (err) {
    const msg = err instanceof APIError ? err.message : 'Something went wrong'
    securityNote.textContent = msg
    securityNote.hidden = false
    showErrorModal(msg, 'Could not save security settings')
  } finally {
    saveSecurityBtn.disabled = false
  }
})

const startFaceBtn = document.getElementById('start-face-btn') as HTMLButtonElement
const faceErrorEl = document.getElementById('face-error') as HTMLElement
const faceLinkEl = document.getElementById('face-link') as HTMLElement

startFaceBtn.addEventListener('click', async () => {
  startFaceBtn.disabled = true
  startFaceBtn.textContent = 'Creating link…'
  faceErrorEl.hidden = true
  try {
    const res = await api.startFaceVerification()
    faceLinkEl.innerHTML =
      `Real Ninja-hosted link (expires ${new Date(res.expires_at).toLocaleString()}): ` +
      `<a href="${res.verification_url}" target="_blank" rel="noreferrer">${res.verification_url}</a>. ` +
      `Open it on a phone to complete the real selfie/liveness check — Ninja will call our webhook when you're done.`
    faceLinkEl.hidden = false
    await refresh()
    pollForVerificationOutcome()
  } catch (err) {
    const msg = err instanceof APIError ? err.message : 'Something went wrong'
    faceErrorEl.textContent = msg
    faceErrorEl.hidden = false
    showErrorModal(msg, 'Could not start facial verification')
  } finally {
    startFaceBtn.disabled = false
    startFaceBtn.textContent = 'Start facial verification'
  }
})

async function init() {
  try {
    await refresh()
  } catch {
    window.location.href = '/register.html'
    return
  }
  if (player.face_verification_status === 'pending') pollForVerificationOutcome()
  updateDepositButtonLabel()
}

init()
