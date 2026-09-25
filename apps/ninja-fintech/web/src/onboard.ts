import { api, APIError, STATUS_LABEL, type Customer } from './lib/api'
import { renderLanguageTabs } from './lib/codeSnippet'
import { showErrorModal } from './lib/modal'
import { buildLanguageSnippets, ONBOARD_CALL } from './lib/apiExamples'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const form = document.getElementById('onboard-form') as HTMLFormElement
const errorEl = document.getElementById('form-error') as HTMLElement
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement
const resultEl = document.getElementById('result') as HTMLElement
const field = (id: string) => document.getElementById(id) as HTMLInputElement

function renderResult(customer: Customer, message: string) {
  let html = `
    <p class="${customer.status === 'onboarded' ? 'success' : 'error'}">${escapeHtml(message)}</p>
    <p><span class="badge badge-${customer.status}">${escapeHtml(STATUS_LABEL[customer.status] ?? customer.status)}</span></p>
    ${
      (customer.fields ?? []).length === 0
        ? '<p class="hint">Ninja returned no per-field breakdown for this result.</p>'
        : `<table class="fields">
      <thead><tr><th>Field</th><th>Provided</th><th>Match</th><th>Score</th></tr></thead>
      <tbody>
        ${(customer.fields ?? [])
          .map(
            (f) => `<tr><td>${escapeHtml(f.field)}</td><td>${escapeHtml(f.provided)}</td><td>${escapeHtml(f.match)}</td><td>${Math.round(f.score * 100)}%</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>`
    }
    <p class="hint" style="margin-top: 10px"><a href="./dashboard.html">View on the dashboard →</a></p>
  `
  resultEl.innerHTML = html
  resultEl.hidden = false
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  errorEl.hidden = true
  resultEl.hidden = true
  submitBtn.disabled = true
  submitBtn.textContent = 'Verifying with Ninja…'
  try {
    const res = await api.onboardCustomer({
      full_name: field('full_name').value,
      date_of_birth: field('date_of_birth').value,
      id_type: field('id_type').value as 'nin' | 'bvn',
      id_number: field('id_number').value,
    })
    renderResult(res.customer, res.message)
  } catch (err) {
    const message = err instanceof APIError ? err.message : 'Something went wrong'
    errorEl.textContent = message
    errorEl.hidden = false
    showErrorModal(message, 'Onboarding failed')
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Verify & onboard'
  }
})

// 1-Click test presets
document.getElementById('preset-exact')?.addEventListener('click', () => {
  field('full_name').value = 'James Bond'
  field('date_of_birth').value = '1975-01-01'
  field('id_type').value = 'nin'
  field('id_number').value = '77777777777'
  errorEl.hidden = true
  resultEl.hidden = true
})

document.getElementById('preset-fuzzy')?.addEventListener('click', () => {
  field('full_name').value = 'Jams Bond'
  field('date_of_birth').value = '1975-01-01'
  field('id_type').value = 'nin'
  field('id_number').value = '77777777777'
  errorEl.hidden = true
  resultEl.hidden = true
})

document.getElementById('preset-mismatch')?.addEventListener('click', () => {
  field('full_name').value = 'Tony Stark'
  field('date_of_birth').value = '1980-05-29'
  field('id_type').value = 'bvn'
  field('id_number').value = '22222222222'
  errorEl.hidden = true
  resultEl.hidden = true
})

const onboardSnippets = buildLanguageSnippets(ONBOARD_CALL)
renderLanguageTabs(document.getElementById('onboard-tabs')!, {
  title: 'POST /api/identity/identify (mode: verify) — at onboarding',
  tabs: [
    { id: 'curl', label: 'cURL', lang: 'bash', code: onboardSnippets.curl },
    { id: 'js', label: 'JavaScript', lang: 'javascript', code: onboardSnippets.javascript },
    { id: 'node', label: 'Node.js', lang: 'javascript', code: onboardSnippets.node },
    { id: 'python', label: 'Python', lang: 'python', code: onboardSnippets.python },
    { id: 'go', label: 'Go', lang: 'go', code: onboardSnippets.go },
  ],
})
