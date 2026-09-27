import { api, formatNaira, STATUS_LABEL, type Player } from './lib/api'
import { loadState, resetDemoState, type V2State } from './lib/state'

export function updateNavFromState(state?: V2State) {
  const current = state || loadState()
  const nameEl = document.getElementById('nav-player-name')
  const statusEl = document.getElementById('nav-player-status')
  const balanceEl = document.getElementById('nav-player-balance')

  const isVerified = current.player && current.player.kycStatus === 'verified' && Boolean(current.player.firstName)

  if (nameEl) {
    nameEl.textContent = isVerified ? `${current.player.firstName} ${current.player.lastName}` : 'Guest'
  }

  if (statusEl) {
    if (!isVerified) {
      statusEl.textContent = 'Unregistered'
      statusEl.className = 'player-status-badge'
    } else if (current.currentStep === 1) {
      statusEl.textContent = 'Verified (Step 1)'
      statusEl.className = 'player-status-badge badge-verified'
    } else if (current.currentStep === 2) {
      statusEl.textContent = 'Bank Linked (Step 2)'
      statusEl.className = 'player-status-badge badge-verified'
    } else {
      statusEl.textContent = 'Payout Ready (Step 3)'
      statusEl.className = 'player-status-badge badge-verified'
    }
  }

  if (balanceEl) {
    const bal = isVerified ? current.player.walletBalanceNaira : 0
    balanceEl.textContent = new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      maximumFractionDigits: 0,
    }).format(bal)
  }

  // Update Stepper buttons
  ;[1, 2, 3].forEach((step) => {
    const btn = document.getElementById(`step-nav-${step}`)
    if (btn) {
      if (step === current.currentStep) {
        btn.className = 'checkpoint-step active'
      } else if (step < current.currentStep) {
        btn.className = 'checkpoint-step completed'
      } else {
        btn.className = 'checkpoint-step'
      }
    }
  })
}

export async function refreshNavPlayer(): Promise<Player | null> {
  const current = loadState()
  updateNavFromState(current)

  try {
    const player = await api.me()
    const nameEl = document.getElementById('nav-player-name')
    const balanceEl = document.getElementById('nav-player-balance')
    const statusEl = document.getElementById('nav-player-status')

    if (current.player && current.player.kycStatus === 'verified' && player && player.kyc_status === 'verified') {
      if (nameEl && player.first_name) {
        nameEl.textContent = `${player.first_name} ${player.last_name}`
      }
      if (balanceEl && typeof player.balance_kobo === 'number') {
        balanceEl.textContent = formatNaira(player.balance_kobo)
      }
      if (statusEl && player.kyc_status) {
        statusEl.textContent = STATUS_LABEL[player.kyc_status] ?? player.kyc_status
        statusEl.className = `player-status-badge badge-${player.kyc_status}`
      }
    }
    return player
  } catch {
    return null
  }
}

function initNav() {
  updateNavFromState()
  refreshNavPlayer()

  // Stepper clicks
  ;[1, 2, 3].forEach((step) => {
    const btn = document.getElementById(`step-nav-${step}`)
    btn?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('ninjabet:navigate-step', { detail: { step } }))
    })
  })

  // Global Reset button
  const resetBtn = document.getElementById('global-reset-btn') as HTMLButtonElement | null
  resetBtn?.addEventListener('click', async () => {
    if (confirm('Reset demo state back to clean initial state (clears checkpoints, reset wallet balances, fresh James Bond fixtures)?')) {
      resetBtn.disabled = true
      resetBtn.textContent = 'Resetting...'
      try {
        try {
          await api.resetDemo()
        } catch {}
        resetDemoState()
        updateNavFromState()
        window.dispatchEvent(new CustomEvent('ninjabet:navigate-mode', { detail: { mode: 'sportsbook' } }))
        window.dispatchEvent(new CustomEvent('ninjabet:navigate-step', { detail: { step: 1 } }))
      } catch (err) {
        alert('Failed to reset demo: ' + (err as Error).message)
      } finally {
        resetBtn.disabled = false
        resetBtn.textContent = 'Reset'
      }
    }
  })

  // Listen to state changes
  window.addEventListener('ninjabet:statechange', () => {
    updateNavFromState()
  })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNav)
} else {
  initNav()
}
