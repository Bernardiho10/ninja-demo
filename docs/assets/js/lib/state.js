// =============================================================================
// ninja-bet V2: Reactive State Machine (Browser Storage / GitHub Pages Ready)
// =============================================================================
const STORAGE_KEY = 'ninjabet_v2_state';
const DEFAULT_STATE = {
    currentStep: 1,
    player: {
        id: 'player_007',
        firstName: 'James',
        lastName: 'Bond',
        phoneNumber: '08012345678',
        nin: '77777777777',
        dateOfBirth: '1975-01-01',
        age: 49,
        walletBalanceNaira: 250000,
        withdrawableBalanceNaira: 250000,
        kycStatus: 'unverified',
        matchScore: 1.0,
    },
    bankAccount: null,
    withdrawal: {
        amountNaira: 250000,
        scenario: 'prefilled',
        faceStatus: 'unverified',
        isDisbursed: false,
    },
    logs: [],
};
function loadState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_STATE, ...parsed };
        }
    }
    catch (e) {
        console.warn('Failed to load state from localStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch (e) {
        console.warn('Failed to save state to localStorage:', e);
    }
}
function resetDemoState() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('ninjabet_tour_done');
    }
    catch { }
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    saveState(fresh);
    return fresh;
}

export { loadState, resetDemoState, saveState };
