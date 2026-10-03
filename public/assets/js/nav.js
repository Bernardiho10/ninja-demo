import { loadState, resetDemoState } from './lib/state.js';

function updateNavFromState(state) {
    const current = state || loadState();
    const nameEl = document.getElementById('nav-player-name');
    const statusEl = document.getElementById('nav-player-status');
    const balanceEl = document.getElementById('nav-player-balance');
    const isVerified = current.player && current.player.kycStatus === 'verified' && Boolean(current.player.firstName);
    if (nameEl) {
        nameEl.textContent = isVerified ? `${current.player.firstName} ${current.player.lastName}` : 'Guest';
    }
    if (statusEl) {
        if (!isVerified) {
            statusEl.textContent = 'Unregistered';
            statusEl.className = 'player-status-badge';
        }
        else if (current.currentStep === 1) {
            statusEl.textContent = 'Verified (Step 1)';
            statusEl.className = 'player-status-badge badge-verified';
        }
        else if (current.currentStep === 2) {
            statusEl.textContent = 'Bank Linked (Step 2)';
            statusEl.className = 'player-status-badge badge-verified';
        }
        else {
            statusEl.textContent = 'Payout Ready (Step 3)';
            statusEl.className = 'player-status-badge badge-verified';
        }
    }
    if (balanceEl) {
        const bal = isVerified ? current.player.walletBalanceNaira : 0;
        balanceEl.textContent = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            maximumFractionDigits: 0,
        }).format(bal);
    }
    [1, 2, 3].forEach((step) => {
        const btn = document.getElementById(`step-nav-${step}`);
        if (btn) {
            if (step === current.currentStep) {
                btn.className = 'checkpoint-step active';
            }
            else if (step < current.currentStep) {
                btn.className = 'checkpoint-step completed';
            }
            else {
                btn.className = 'checkpoint-step';
            }
        }
    });
}
function initNav() {
    updateNavFromState();
    [1, 2, 3].forEach((step) => {
        const btn = document.getElementById(`step-nav-${step}`);
        btn?.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('ninjabet:navigate-step', { detail: { step } }));
        });
    });
    // Global Reset button
    const resetBtn = document.getElementById('global-reset-btn');
    resetBtn?.addEventListener('click', async () => {
        if (confirm('Reset demo state back to clean initial state (clears checkpoints, reset wallet balances, fresh James Bond fixtures)?')) {
            resetBtn.disabled = true;
            resetBtn.textContent = 'Resetting...';
            try {
                resetDemoState();
                updateNavFromState();
                window.dispatchEvent(new CustomEvent('ninjabet:navigate-mode', { detail: { mode: 'sportsbook' } }));
                window.dispatchEvent(new CustomEvent('ninjabet:navigate-step', { detail: { step: 1 } }));
            }
            catch (err) {
                alert('Failed to reset demo: ' + err.message);
            }
            finally {
                resetBtn.disabled = false;
                resetBtn.textContent = 'Reset';
            }
        }
    });
    // Listen to state changes
    window.addEventListener('ninjabet:statechange', () => {
        updateNavFromState();
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
}
else {
    initNav();
}

export { updateNavFromState };
