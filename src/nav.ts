import {
  loadState,
  resetDemoState,
  canAccessStep,
  isStep1Complete,
  isStep2Complete,
  type V2State,
} from './lib/state'

export function updateNavFromState(state?: V2State) {
  const current = state || loadState()
  const nameEl = document.getElementById('nav-player-name')
  const statusEl = document.getElementById('nav-player-status')
  const balanceEl = document.getElementById('nav-player-balance')

  const isVerified = isStep1Complete(current)

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
      const access = canAccessStep(step, current)
      if (step === current.currentStep) {
        btn.className = 'checkpoint-step active'
        btn.removeAttribute('title')
      } else if (!access.allowed) {
        btn.className = 'checkpoint-step locked'
        btn.title = access.reason || 'Complete previous steps first'
      } else if (
        (step === 1 && isStep1Complete(current)) ||
        (step === 2 && isStep2Complete(current))
      ) {
        btn.className = 'checkpoint-step completed'
        btn.removeAttribute('title')
      } else {
        btn.className = 'checkpoint-step'
        btn.removeAttribute('title')
      }
    }
  })
}

function initNav() {
  updateNavFromState()

  // Stepper clicks with prerequisite validation
  ;[1, 2, 3].forEach((step) => {
    const btn = document.getElementById(`step-nav-${step}`)
    btn?.addEventListener('click', (e) => {
      const current = loadState()
      const access = canAccessStep(step, current)
      if (!access.allowed) {
        e.preventDefault()
        e.stopPropagation()
        window.dispatchEvent(
          new CustomEvent('ninjabet:show-toast', {
            detail: {
              message: access.reason || 'Complete previous steps first',
              type: 'warning',
            },
          })
        )
        return
      }
      window.dispatchEvent(new CustomEvent('ninjabet:navigate-step', { detail: { step } }))
    })
  })

  // Global Reset button
  const resetBtn = document.getElementById('global-reset-btn') as HTMLButtonElement | null
  resetBtn?.addEventListener('click', async () => {
    if (confirm('Start the demo afresh? This clears the player, bank account, created flows, verification and the API log.')) {
      resetBtn.disabled = true
      resetBtn.textContent = 'Resetting...'
      // Clear saved state, then reload. The page keeps state in memory too
      // (player, flows, logs, the verification being polled), and a reload is
      // the only way to be sure none of it survives and gets saved back.
      resetDemoState()
      try {
        sessionStorage.clear()
      } catch {}
      window.location.replace(window.location.pathname)
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
