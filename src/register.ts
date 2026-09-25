import { api, APIError, type RegisterResponse } from './lib/api'
import { renderCodeDrawer } from './lib/codeSnippet'
import { buildLanguageSnippets, LOOKUP_CALL, VERIFY_REGISTRATION_CALL } from './lib/apiExamples'
import { showErrorModal } from './lib/modal'

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
const presetAdultBtn = document.getElementById('btn-preset-adult') as HTMLButtonElement
const openBulkBtn = document.getElementById('btn-open-bulk-modal') as HTMLButtonElement
const closeBulkBtn = document.getElementById('close-bulk-modal-btn') as HTMLButtonElement
const bulkModalBackdrop = document.getElementById('bulk-modal-backdrop') as HTMLElement
const bulkSubmitBtn = document.getElementById('bulk-submit-btn') as HTMLButtonElement
const bulkNinsInput = document.getElementById('bulk-nins-input') as HTMLTextAreaElement
const bulkResultContainer = document.getElementById('bulk-result-container') as HTMLElement

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
      <div class="lookup-summary" style="margin-top: 14px; background: rgba(255, 255, 255, 0.03); padding: 14px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.08);">
        ${d.image ? `<img class="lookup-photo" src="${d.image}" alt="Registry photo" style="width: 72px; height: 72px; border-radius: 8px; object-fit: cover; border: 2px solid #34d399;" />` : ''}
        <div>
          <p class="hint" style="margin-bottom: 8px; color: #34d399; font-weight: 700;">Authoritative NIN Registry Record (Government Database):</p>
          <table class="fields"><tbody>
            <tr><td>Registry name</td><td><strong>${escapeHtml(d.first_name)} ${escapeHtml(d.last_name)}</strong></td></tr>
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
      <table class="fields" style="margin-top: 14px">
        <thead><tr><th>Field</th><th>Provided</th><th>Match Score</th></tr></thead>
        <tbody>
          ${res.verify_result.fields
            .map((f) => `<tr><td>${escapeHtml(f.field)}</td><td>${escapeHtml(f.provided)}</td><td><span class="badge badge-verified">${escapeHtml(f.match)}</span></td></tr>`)
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
  if (LOGGED_IN_STATUSES.has(res.player.kyc_status)) {
    try {
      localStorage.removeItem('ninjabet_tour_done')
    } catch {}
    setTimeout(() => {
      window.location.href = '/play.html?tour=1'
    }, 1200)
  } else {
    showErrorModal(res.message, 'Registration blocked: Identity Mismatch')
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  clearError()
  resultEl.hidden = true
  submitBtn.disabled = true
  submitBtn.textContent = 'Verifying NIN with Government Registry…'
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
    submitBtn.textContent = 'Verify NIN & Create Account (+₦100,000 Welcome Credit)'
  }
})

presetAdultBtn?.addEventListener('click', () => {
  field('first_name').value = 'James'
  field('last_name').value = 'Bond'
  field('phone_number').value = '08012345678'
  field('nin').value = '77777777777'
  field('password').value = 'password123'
  submitBtn.click()
})

const mismatchBtn = document.getElementById('btn-preset-mismatch') as HTMLButtonElement | null
mismatchBtn?.addEventListener('click', () => {
  field('first_name').value = 'Chinedu'
  field('last_name').value = 'Okafor'
  field('phone_number').value = '080' + Math.floor(10000000 + Math.random() * 89999999).toString()
  field('nin').value = '77777777777' // Borrowed James Bond's NIN
  field('password').value = 'password123'
  submitBtn.click()
})

underageBtn?.addEventListener('click', async () => {
  clearError()
  resultEl.hidden = true
  underageBtn.disabled = true
  try {
    const demoPhone = '080' + Math.floor(10000000 + Math.random() * 89999999).toString()
    const res = await api.simulateUnderage({ phone_number: demoPhone, password: field('password').value || 'password123' })
    onSuccess(res)
  } catch (err) {
    showError(err instanceof APIError ? err.message : 'Something went wrong')
  } finally {
    underageBtn.disabled = false
  }
})

// Bulk Identify Modal
openBulkBtn?.addEventListener('click', () => {
  bulkModalBackdrop.hidden = false
})

closeBulkBtn?.addEventListener('click', () => {
  bulkModalBackdrop.hidden = true
})

bulkModalBackdrop?.addEventListener('click', (e) => {
  if (e.target === bulkModalBackdrop) bulkModalBackdrop.hidden = true
})

bulkSubmitBtn?.addEventListener('click', async () => {
  bulkSubmitBtn.disabled = true
  bulkSubmitBtn.textContent = 'Verifying in Batch…'
  bulkResultContainer.hidden = true
  try {
    const raw = bulkNinsInput.value
    const nins = raw.split(',').map((s) => s.trim()).filter(Boolean).join(',')
    const res = await api.bulkIdentify({
      idType: 'nin',
      idNumbers: nins,
      reference: 'bulk_reg_' + Date.now(),
    })
    const list = Array.isArray(res.data) ? res.data : []
    bulkResultContainer.innerHTML = `
      <div style="background: rgba(255, 255, 255, 0.04); padding: 12px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1);">
        <h4 style="margin: 0 0 8px; font-size: 13px; color: #34d399;">Batch Identified: ${list.length} Identities</h4>
        <table class="fields">
          <thead><tr><th>ID Number</th><th>Name</th><th>DOB</th><th>Status</th></tr></thead>
          <tbody>
            ${list.map((item: any) => `
              <tr>
                <td><code>${escapeHtml(item.id_number || item.idNumber || '—')}</code></td>
                <td>${escapeHtml((item.first_name || '') + ' ' + (item.last_name || ''))}</td>
                <td>${escapeHtml(item.date_of_birth || item.dateOfBirth || '—')}</td>
                <td><span class="badge badge-verified">${escapeHtml(item.status || 'verified')}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
    bulkResultContainer.hidden = false
  } catch (err) {
    showErrorModal(err instanceof APIError ? err.message : 'Bulk verify failed', 'Batch Identify Error')
  } finally {
    bulkSubmitBtn.disabled = false
    bulkSubmitBtn.textContent = 'Execute Bulk Identify'
  }
})

renderCodeDrawer(document.getElementById('lookup-tabs')!, {
  title: '1. POST /api/identity/identify (mode: lookup)',
  buttonLabel: 'View NIN Registry Lookup API Call',
  subtitle: 'Fetches authoritative date of birth and registry photo directly from government database',
  tabs: callTabs(LOOKUP_CALL, 'lookup'),
  defaultOpen: false,
})

renderCodeDrawer(document.getElementById('verify-tabs')!, {
  title: '2. POST /api/identity/identify (mode: verify)',
  buttonLabel: 'View Name Verification API Call',
  subtitle: 'Matches user-provided name against registry record with fuzzy scoring',
  tabs: callTabs(VERIFY_REGISTRATION_CALL, 'verify'),
  defaultOpen: false,
})
