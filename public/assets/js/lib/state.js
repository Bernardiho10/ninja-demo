// =============================================================================
// ninja-bet V2: Reactive State Machine (Browser Storage / GitHub Pages Ready)
// =============================================================================
const STORAGE_KEY = 'ninjabet_v2_state';
const DEFAULT_STATE = {
    currentStep: 1,
    player: {
        id: '',
        firstName: '',
        lastName: '',
        phoneNumber: '',
        nin: '',
        dateOfBirth: '',
        age: 0,
        walletBalanceNaira: 0,
        withdrawableBalanceNaira: 0,
        kycStatus: 'unverified',
        matchScore: 0,
    },
    bankAccount: null,
    withdrawal: {
        amountNaira: 250000,
        scenario: 'prefilled',
        faceStatus: 'unverified',
        isDisbursed: false,
    },
    logs: [],
    createdFlows: {},
    customThresholds: { face: 90, liveness: 90 },
};
function loadState() {
    try {
        // Purge any legacy localStorage state to avoid old session contamination
        try {
            localStorage.removeItem(STORAGE_KEY);
        }
        catch { }
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const merged = { ...DEFAULT_STATE, ...parsed };
            merged.logs = Array.isArray(parsed.logs) ? parsed.logs : [];
            // The player name should not be set until registration is finished
            if (merged.player && merged.player.kycStatus !== 'verified') {
                merged.player.firstName = '';
                merged.player.lastName = '';
                merged.player.phoneNumber = '';
                merged.player.nin = '';
                merged.player.dateOfBirth = '';
                merged.player.walletBalanceNaira = 0;
                merged.player.withdrawableBalanceNaira = 0;
            }
            return merged;
        }
    }
    catch (e) {
        console.warn('Failed to load state from sessionStorage:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
}
function saveState(state) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch (e) {
        console.warn('Failed to save state to sessionStorage:', e);
    }
}
function resetDemoState() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY);
    }
    catch { }
    const fresh = JSON.parse(JSON.stringify(DEFAULT_STATE));
    saveState(fresh);
    return fresh;
}

export { loadState, resetDemoState, saveState };
