import { api, formatNaira, STATUS_LABEL } from './lib/api.js';
import { loadState, resetDemoState } from './lib/state.js';

function updateNavFromState(state) {
    const current = state || loadState();
    const nameEl = document.getElementById('nav-player-name');
    const statusEl = document.getElementById('nav-player-status');
    const balanceEl = document.getElementById('nav-player-balance');
    if (nameEl) {
        nameEl.textContent = `${current.player.firstName} ${current.player.lastName}`;
    }
    if (statusEl) {
        if (current.currentStep === 1) {
            statusEl.textContent = 'Step 1';
            statusEl.className = 'player-status-badge';
        }
        else if (current.currentStep === 2) {
            statusEl.textContent = 'Step 2';
            statusEl.className = 'player-status-badge badge-verified';
        }
        else {
            statusEl.textContent = 'Step 3';
            statusEl.className = 'player-status-badge badge-verified';
        }
    }
    if (balanceEl) {
        balanceEl.textContent = new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            maximumFractionDigits: 0,
        }).format(current.player.walletBalanceNaira);
    }
    // Update Stepper buttons
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
async function refreshNavPlayer() {
    updateNavFromState();
    try {
        const player = await api.me();
        const nameEl = document.getElementById('nav-player-name');
        const balanceEl = document.getElementById('nav-player-balance');
        const statusEl = document.getElementById('nav-player-status');
        if (nameEl && player.first_name) {
            nameEl.textContent = `${player.first_name} ${player.last_name}`;
        }
        if (balanceEl && typeof player.balance_kobo === 'number') {
            balanceEl.textContent = formatNaira(player.balance_kobo);
        }
        if (statusEl && player.kyc_status) {
            statusEl.textContent = STATUS_LABEL[player.kyc_status] ?? player.kyc_status;
            statusEl.className = `player-status-badge badge-${player.kyc_status}`;
        }
        return player;
    }
    catch {
        return null;
    }
}
function initNav() {
    updateNavFromState();
    refreshNavPlayer();
    [1, 2, 3].forEach((step) => {
        const btn = document.getElementById(`step-nav-${step}`);
        btn?.addEventListener('click', () => {
            // Ensure we are in sportsbook mode when clicking stepper
            window.dispatchEvent(new CustomEvent('ninjabet:navigate-mode', { detail: { mode: 'sportsbook' } }));
            window.dispatchEvent(new CustomEvent('ninjabet:navigate-step', { detail: { step } }));
        });
    });
    // Mode Switcher (Sportsbook vs Fintech)
    const sbBtn = document.getElementById('mode-btn-sportsbook');
    const ftBtn = document.getElementById('mode-btn-fintech');
    const stepper = document.getElementById('checkpoint-stepper');
    sbBtn?.addEventListener('click', () => {
        sbBtn.classList.add('active');
        ftBtn?.classList.remove('active');
        if (stepper)
            stepper.style.display = 'flex';
        window.dispatchEvent(new CustomEvent('ninjabet:navigate-mode', { detail: { mode: 'sportsbook' } }));
    });
    ftBtn?.addEventListener('click', () => {
        ftBtn.classList.add('active');
        sbBtn?.classList.remove('active');
        if (stepper)
            stepper.style.display = 'none';
        window.dispatchEvent(new CustomEvent('ninjabet:navigate-mode', { detail: { mode: 'fintech' } }));
    });
    // Global Reset button
    const resetBtn = document.getElementById('global-reset-btn');
    resetBtn?.addEventListener('click', async () => {
        if (confirm('Reset demo state back to clean initial state (clears checkpoints, reset wallet balances, fresh James Bond fixtures)?')) {
            resetBtn.disabled = true;
            resetBtn.textContent = 'Resetting...';
            try {
                try {
                    await api.resetDemo();
                }
                catch { }
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

export { refreshNavPlayer, updateNavFromState };
