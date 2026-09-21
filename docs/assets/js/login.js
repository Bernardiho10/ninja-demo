import { api, APIError } from './lib/api.js';
import { showErrorModal } from './lib/modal.js';
import { renderCodeDrawer } from './lib/codeSnippet.js';

const form = document.getElementById('login-form');
const errorEl = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');
const quickLoginBtn = document.getElementById('quick-login-btn');
const phoneInput = document.getElementById('phone_number');
const passwordInput = document.getElementById('password');
function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    showErrorModal(message, 'Login failed');
}
async function doLogin(phone, pass) {
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';
    if (quickLoginBtn)
        quickLoginBtn.disabled = true;
    try {
        await api.login({ phone_number: phone, password: pass });
        window.location.href = '/play.html';
    }
    catch (err) {
        const message = err instanceof APIError ? err.message : 'Something went wrong';
        showError(message);
    }
    finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log in to Sportsbook';
        if (quickLoginBtn)
            quickLoginBtn.disabled = false;
    }
}
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await doLogin(phoneInput.value, passwordInput.value);
});
quickLoginBtn?.addEventListener('click', async () => {
    phoneInput.value = '08012345678';
    passwordInput.value = 'password123';
    await doLogin('08012345678', 'password123');
});
// Collapsible reference drawer
const drawerEl = document.getElementById('login-code-drawer');
if (drawerEl) {
    renderCodeDrawer(drawerEl, {
        title: 'POST /api/players/login',
        buttonLabel: 'View Authentication API Reference',
        subtitle: 'Authenticates player session and sets secure HTTP-only session cookie',
        tabs: [
            {
                id: 'curl',
                label: 'cURL',
                lang: 'bash',
                code: `curl -X POST "http://localhost:4100/api/players/login" \\
  -H "Content-Type: application/json" \\
  -d '{"phone_number": "08012345678", "password": "password123"}'`,
            },
            {
                id: 'js',
                label: 'JavaScript',
                lang: 'javascript',
                code: `const res = await fetch('/api/players/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ phone_number: '08012345678', password: 'password123' }),
});
const data = await res.json();`,
            },
        ],
        defaultOpen: false,
    });
}
