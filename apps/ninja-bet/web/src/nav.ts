import { api, formatNaira, STATUS_LABEL, type Player } from './lib/api'

export async function refreshNavPlayer(): Promise<Player | null> {
  const nameEl = document.querySelector<HTMLElement>('[data-role="account-name"]')
  const balanceEl = document.querySelector<HTMLElement>('[data-role="balance"]')
  const badgeEl = document.querySelector<HTMLElement>('[data-role="status-badge"]')
  const pillEl = document.querySelector<HTMLElement>('[data-role="player-pill"]')

  try {
    const player = await api.me()
    if (nameEl) nameEl.textContent = `${player.first_name} ${player.last_name}`
    if (balanceEl) balanceEl.textContent = formatNaira(player.balance_kobo)
    if (badgeEl) {
      badgeEl.textContent = STATUS_LABEL[player.kyc_status] ?? player.kyc_status
      badgeEl.className = `nav-status-badge badge-${player.kyc_status}`
    }
    if (pillEl) pillEl.style.opacity = '1'
    return player
  } catch {
    if (nameEl) nameEl.textContent = 'Guest / Unregistered'
    if (balanceEl) balanceEl.textContent = '₦0'
    if (badgeEl) {
      badgeEl.textContent = 'Not Registered'
      badgeEl.className = 'nav-status-badge badge-pending'
    }
    return null
  }
}

function initNav() {
  refreshNavPlayer()

  // Smooth anchor scrolling
  document.querySelectorAll<HTMLAnchorElement>('.nav-anchor, .nav-stage-pill').forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href')
      if (href?.startsWith('#')) {
        e.preventDefault()
        const target = document.querySelector(href)
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
          window.history.pushState(null, '', href)
        }
      }
    })
  })

  // Global reset demo button
  const resetBtn = document.getElementById('global-reset-btn') as HTMLButtonElement
  resetBtn?.addEventListener('click', async () => {
    if (confirm('Reset all demo players, balances, bets, and payouts back to clean initial state?')) {
      resetBtn.disabled = true
      resetBtn.textContent = 'Resetting...'
      try {
        await api.resetDemo()
        await refreshNavPlayer()
        window.dispatchEvent(new CustomEvent('ninja-demo-reset'))
        window.location.reload()
      } catch (err) {
        alert('Failed to reset demo: ' + (err as Error).message)
      } finally {
        resetBtn.disabled = false
        resetBtn.textContent = 'Reset Demo'
      }
    }
  })
}

initNav()
