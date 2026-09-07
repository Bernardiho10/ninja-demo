import { api, APIError } from './lib/api'
import { showErrorModal } from './lib/modal'

const form = document.getElementById('login-form') as HTMLFormElement
const errorEl = document.getElementById('form-error') as HTMLElement
const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement
const field = (id: string) => document.getElementById(id) as HTMLInputElement

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  errorEl.hidden = true
  submitBtn.disabled = true
  submitBtn.textContent = 'Logging in…'
  try {
    await api.login({ phone_number: field('phone_number').value, password: field('password').value })
    window.location.href = '/play.html'
  } catch (err) {
    const message = err instanceof APIError ? err.message : 'Something went wrong'
    errorEl.textContent = message
    errorEl.hidden = false
    showErrorModal(message, 'Login failed')
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Log in'
  }
})
