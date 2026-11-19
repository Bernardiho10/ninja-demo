import { loadKybState, isKybStep1Complete, canAccessKybStep, isKybStep2Complete, resetKybDemoState } from './lib/kybState.js';
import { initFloatingWhatsapp } from './lib/floatingWhatsapp.js';

function updateKybNavFromState(state) {
    const current = state || loadKybState();
    const nameEl = document.getElementById('nav-company-name');
    const statusEl = document.getElementById('nav-company-status');
    const rcEl = document.getElementById('nav-company-rc');
    const isVerified = isKybStep1Complete(current);
    if (nameEl) {
        nameEl.textContent = isVerified && current.company.details
            ? current.company.details.company_name
            : 'Guest Company';
    }
    if (rcEl) {
        rcEl.textContent = isVerified && current.company.details
            ? current.company.details.rc_number
            : '—';
    }
    if (statusEl) {
        if (!isVerified) {
            statusEl.textContent = 'Unverified';
            statusEl.className = 'player-status-badge';
        }
        else if (current.company.status === 'ACTIVE') {
            statusEl.textContent = 'Active (CAC)';
            statusEl.className = 'player-status-badge badge-verified';
        }
        else if (current.company.status === 'INACTIVE') {
            statusEl.textContent = 'Inactive (CAC)';
            statusEl.className = 'player-status-badge';
            statusEl.style.background = 'rgba(239, 68, 68, 0.2)';
            statusEl.style.color = '#f87171';
        }
        else {
            statusEl.textContent = 'Verified (Step 1)';
            statusEl.className = 'player-status-badge badge-verified';
        }
    }
    [1, 2, 3].forEach((step) => {
        const btn = document.getElementById(`step-nav-${step}`);
        if (btn) {
            const access = canAccessKybStep(step, current);
            if (step === current.currentStep) {
                btn.className = 'checkpoint-step active';
                btn.removeAttribute('title');
            }
            else if (!access.allowed) {
                btn.className = 'checkpoint-step locked';
                btn.title = access.reason || 'Complete previous steps first';
            }
            else if ((step === 1 && isKybStep1Complete(current)) ||
                (step === 2 && isKybStep2Complete(current))) {
                btn.className = 'checkpoint-step completed';
                btn.removeAttribute('title');
            }
            else {
                btn.className = 'checkpoint-step';
                btn.removeAttribute('title');
            }
        }
    });
}
function initKybNav() {
    updateKybNavFromState();
    initFloatingWhatsapp();
    [1, 2, 3].forEach((step) => {
        const btn = document.getElementById(`step-nav-${step}`);
        btn?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('ninjakyb:navigate-step', { detail: { step } }));
        });
    });
    // Global Reset button
    const resetBtn = document.getElementById('global-reset-btn');
    resetBtn?.addEventListener('click', async () => {
        if (confirm('Start the business KYB demo afresh? This clears company records, directors, and the API log.')) {
            resetBtn.disabled = true;
            resetBtn.textContent = 'Resetting...';
            resetKybDemoState();
            try {
                sessionStorage.clear();
            }
            catch { }
            window.location.replace(window.location.pathname);
        }
    });
    // Listen to state changes
    window.addEventListener('ninjakyb:state-updated', ((e) => {
        updateKybNavFromState(e.detail.state);
    }));
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKybNav);
}
else {
    initKybNav();
}

export { updateKybNavFromState };
