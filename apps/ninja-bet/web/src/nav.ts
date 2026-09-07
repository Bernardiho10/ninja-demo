// Populates the shared nav partial (src/nav.phtml) on every page — HAM's
// layout is static HTML at build time, so login state, balance, and the
// KYC badge are filled in client-side after fetching /api/players/me. Also
// wires the logout button. Linked directly from default.lhtml (not one of
// each page's own bundles) so it runs identically everywhere.
import { api, formatNaira, STATUS_LABEL } from './lib/api'

async function initNav() {
  const guestEls = document.querySelectorAll<HTMLElement>('[data-visibility="guest"]')
  const playerEls = document.querySelectorAll<HTMLElement>('[data-visibility="player"]')
  const nameEl = document.querySelector<HTMLElement>('[data-role="account-name"]')
  const balanceEl = document.querySelector<HTMLElement>('[data-role="balance"]')
  const badgeEl = document.querySelector<HTMLElement>('[data-role="status-badge"]')
  const logoutBtn = document.querySelector<HTMLButtonElement>('[data-role="logout"]')

  let player
  try {
    player = await api.me()
  } catch {
    player = null
  }

  guestEls.forEach((el) => (el.hidden = !!player))
  playerEls.forEach((el) => (el.hidden = !player))

  if (player) {
    if (nameEl) nameEl.textContent = `${player.first_name} ${player.last_name}`
    if (balanceEl) balanceEl.textContent = formatNaira(player.balance_kobo)
    if (badgeEl) {
      badgeEl.textContent = STATUS_LABEL[player.kyc_status] ?? player.kyc_status
      badgeEl.className = `nav-status-badge badge-${player.kyc_status}`
    }
  }

  logoutBtn?.addEventListener('click', async () => {
    await api.logout()
    window.location.href = '/register.html'
  })

  const path = window.location.pathname
  document.querySelectorAll<HTMLAnchorElement>('.nav a[href]').forEach((a) => {
    if (a.getAttribute('href') === path) a.classList.add('nav-active')
  })
}

initNav()
