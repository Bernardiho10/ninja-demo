import { loadCreditState, isStep1Complete, canAccessCreditStep, isStep2Complete, resetCreditDemoState } from './lib/creditState.js';
import { initFloatingWhatsapp } from './lib/floatingWhatsapp.js';

function updateCreditNavFromState(state) {
    const current = state || loadCreditState();
    const nameEl = document.getElementById('nav-borrower-name');
    const statusEl = document.getElementById('nav-borrower-status');
    const askEl = document.getElementById('nav-loan-ask');
    const isVerified = isStep1Complete(current);
    if (nameEl) {
        nameEl.textContent = isVerified ? `${current.borrower.firstName} ${current.borrower.lastName}` : 'Guest';
    }
    if (statusEl) {
        if (!isVerified) {
            statusEl.textContent = 'Unverified';
            statusEl.className = 'player-status-badge';
        }
        else if (current.disbursement?.status === 'disbursed') {
            statusEl.textContent = 'Disbursed';
            statusEl.className = 'player-status-badge badge-verified';
        }
        else if (current.currentStep === 1) {
            statusEl.textContent = 'KYC Verified (Step 1)';
            statusEl.className = 'player-status-badge badge-verified';
        }
        else if (current.currentStep === 2) {
            const rec = current.creditCheck?.recommendation;
            if (rec === 'approve') {
                statusEl.textContent = 'Pre-Approved (Step 2)';
            }
            else if (rec === 'review') {
                statusEl.textContent = 'Under Review (Step 2)';
            }
            else if (rec === 'deny') {
                statusEl.textContent = 'Denied (Step 2)';
            }
            else {
                statusEl.textContent = 'Scored (Step 2)';
            }
            statusEl.className = 'player-status-badge badge-verified';
        }
        else {
            statusEl.textContent = 'Underwriting (Step 3)';
            statusEl.className = 'player-status-badge badge-verified';
        }
    }
    if (askEl) {
        askEl.textContent = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            maximumFractionDigits: 0,
        }).format(current.loanRequest.amountNaira);
    }
    [1, 2, 3].forEach((step) => {
        const btn = document.getElementById(`step-nav-${step}`);
        if (btn) {
            const access = canAccessCreditStep(step, current);
            if (step === current.currentStep) {
                btn.className = 'checkpoint-step active';
                btn.removeAttribute('title');
            }
            else if (!access.allowed) {
                btn.className = 'checkpoint-step locked';
                btn.title = access.reason || 'Complete previous steps first';
            }
            else if ((step === 1 && isStep1Complete(current)) ||
                (step === 2 && isStep2Complete(current))) {
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
function initCreditNav() {
    updateCreditNavFromState();
    initFloatingWhatsapp();
    [1, 2, 3].forEach((step) => {
        const btn = document.getElementById(`step-nav-${step}`);
        btn?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('ninjacredit:navigate-step', { detail: { step } }));
        });
    });
    // Global Reset button
    const resetBtn = document.getElementById('global-reset-btn');
    resetBtn?.addEventListener('click', async () => {
        if (confirm('Start the credit demo afresh? This clears the borrower, credit scores, history and the API log.')) {
            resetBtn.disabled = true;
            resetBtn.textContent = 'Resetting...';
            resetCreditDemoState();
            try {
                sessionStorage.clear();
            }
            catch { }
            window.location.replace(window.location.pathname);
        }
    });
    // Listen to state changes
    window.addEventListener('ninjacredit:state-updated', ((e) => {
        updateCreditNavFromState(e.detail.state);
    }));
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCreditNav);
}
else {
    initCreditNav();
}

export { updateCreditNavFromState };
