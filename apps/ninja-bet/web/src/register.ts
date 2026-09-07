import { api, APIError, type RegisterResponse } from './lib/api'
import { renderLanguageTabs } from './lib/codeSnippet'
import { buildLanguageSnippets, LOOKUP_CALL, VERIFY_REGISTRATION_CALL } from './lib/apiExamples'
import { showErrorModal } from './lib/modal'

// Only calls to Ninja itself — no internal app-handler source. This is
// integration reference for whoever's building against Ninja, not a tour
// of this demo's own code.
function callTabs(call: typeof LOOKUP_CALL, mode: 'lookup' | 'verify') {
  const s = buildLanguageSnippets(call, mode)
  return [
    { id: 'curl', label: 'cURL', lang: 'bash', code: s.curl },
    { id: 'js', label: 'JavaScript', lang: 'javascript', code: s.javascript },
    { id: 'node', label: 'Node.js', lang: 'javascript', code: s.node },
    { id: 'python', label: 'Python', lang: 'python', code: s.python },
    { id: 'go', label: 'Go', lang: 'go', code: s.go },
  ]
}

const form = document.getElementById('register-form') as HTMLFormElement
const errorEl = document.getElementById('form-error') as HTMLElement
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement
const resultEl = document.getElementById('result') as HTMLElement
const underageBtn = document.getElementById('simulate-underage-btn') as HTMLButtonElement

const field = (id: string) => document.getElementById(id) as HTMLInputElement

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function showError(message: string) {
  errorEl.textContent = message
  errorEl.hidden = false
  showErrorModal(message, 'Registration failed')
}

function clearError() {
  errorEl.hidden = true
  errorEl.textContent = ''
}

function renderResult(res: RegisterResponse) {
  const statusClass = res.player.kyc_status === 'verified' ? 'success' : 'error'
  let html = `<p class="${statusClass}">${escapeHtml(res.message)}</p>`

  if (res.lookup_result?.data) {
    const d = res.lookup_result.data
    const address = [d.address_line, d.address_town, d.address_state].filter(Boolean).join(', ')
    html += `
      <div class="lookup-summary">
        ${d.image ? `<img class="lookup-photo" src="${d.image}" alt="Registry photo" />` : ''}
        <div>
          <p class="hint">Fetched from Ninja via NIN lookup — nothing you typed:</p>
          <table class="fields"><tbody>
            <tr><td>Registry name</td><td>${escapeHtml(d.first_name)} ${escapeHtml(d.last_name)}</td></tr>
            <tr><td>Date of birth</td><td>${escapeHtml(d.date_of_birth)}</td></tr>
            <tr><td>Gender</td><td>${escapeHtml(d.gender)}</td></tr>
            <tr><td>Address</td><td>${escapeHtml(address)}</td></tr>
          </tbody></table>
        </div>
      </div>
    `
  }

  if (res.verify_result?.fields) {
    html += `
      <table class="fields" style="margin-top: 10px">
        <thead><tr><th>Field</th><th>Provided</th><th>Match</th></tr></thead>
        <tbody>
          ${res.verify_result.fields
            .map((f) => `<tr><td>${escapeHtml(f.field)}</td><td>${escapeHtml(f.provided)}</td><td>${escapeHtml(f.match)}</td></tr>`)
            .join('')}
        </tbody>
      </table>
    `
  }

  resultEl.innerHTML = html
  resultEl.hidden = false
}

const LOGGED_IN_STATUSES = new Set(['verified', 'flagged_duplicate_identity'])

function onSuccess(res: RegisterResponse) {
  renderResult(res)
  // A blocked registration (underage, name/NIN mismatch) never gets a
  // session — the backend won't have set one either — so there's nowhere
  // to redirect to. Stay put and let the rejection message speak for
  // itself instead of bouncing toward a page that will just 401.
  if (LOGGED_IN_STATUSES.has(res.player.kyc_status)) {
    setTimeout(() => {
      window.location.href = '/play.html'
    }, 1600)
  } else {
    showErrorModal(res.message, 'Registration blocked')
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  clearError()
  resultEl.hidden = true
  submitBtn.disabled = true
  submitBtn.textContent = 'Verifying with Ninja…'
  try {
    const res = await api.register({
      first_name: field('first_name').value,
      last_name: field('last_name').value,
      phone_number: field('phone_number').value,
      nin: field('nin').value,
      password: field('password').value,
    })
    onSuccess(res)
  } catch (err) {
    showError(err instanceof APIError ? err.message : 'Something went wrong')
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Create account — get ₦100,000 welcome credit'
  }
})

underageBtn.addEventListener('click', async () => {
  clearError()
  resultEl.hidden = true
  underageBtn.disabled = true
  try {
    // A fresh phone number each click — this demo scenario has its own
    // fixed identity (Tobi Minor, age 16), so it shouldn't collide with
    // whatever's typed in the form above.
    const demoPhone = '080' + Math.floor(10000000 + Math.random() * 89999999).toString()
    const res = await api.simulateUnderage({ phone_number: demoPhone, password: field('password').value || 'password123' })
    onSuccess(res)
  } catch (err) {
    showError(err instanceof APIError ? err.message : 'Something went wrong')
  } finally {
    underageBtn.disabled = false
  }
})

renderLanguageTabs(document.getElementById('lookup-tabs')!, {
  title: '1. POST /api/identity/identify (mode: lookup)',
  tabs: callTabs(LOOKUP_CALL, 'lookup'),
})
renderLanguageTabs(document.getElementById('verify-tabs')!, {
  title: '2. POST /api/identity/identify (mode: verify)',
  tabs: callTabs(VERIFY_REGISTRATION_CALL, 'verify'),
})
