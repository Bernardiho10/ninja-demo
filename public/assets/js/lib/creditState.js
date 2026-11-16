// State management for ninja-credit demo
const STORAGE_KEY = 'ninja_credit_state_v1';
const DEFAULT_CREDIT_STATE = {
    currentStep: 1,
    borrower: {
        firstName: '',
        lastName: '',
        phone: '',
        bvn: '',
        dob: '',
        kycStatus: 'unverified',
    },
    loanRequest: {
        amountNaira: 500000,
        amountKobo: 50000000,
        purpose: 'Business Working Capital',
        tenorMonths: 6,
        reference: 'loan-app-1042',
        consent: true,
    },
    creditCheck: null,
    creditHistory: null,
    disbursement: null,
    logs: [],
};
function loadCreditState() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return {
                ...DEFAULT_CREDIT_STATE,
                ...parsed,
                borrower: { ...DEFAULT_CREDIT_STATE.borrower, ...(parsed.borrower || {}) },
                loanRequest: { ...DEFAULT_CREDIT_STATE.loanRequest, ...(parsed.loanRequest || {}) },
            };
        }
    }
    catch { }
    return JSON.parse(JSON.stringify(DEFAULT_CREDIT_STATE));
}
function saveCreditState(state) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch { }
}
function resetCreditDemoState() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    }
    catch { }
}
function isStep1Complete(state) {
    return state.borrower.kycStatus === 'verified' && Boolean(state.borrower.bvn);
}
function isStep2Complete(state) {
    return isStep1Complete(state) && state.creditCheck !== null;
}
function canAccessCreditStep(targetStep, state) {
    if (targetStep === 1)
        return { allowed: true };
    if (targetStep === 2) {
        if (!isStep1Complete(state)) {
            return { allowed: false, reason: 'Complete Step 1 (Borrower KYC) first' };
        }
        return { allowed: true };
    }
    if (targetStep === 3) {
        if (!isStep1Complete(state)) {
            return { allowed: false, reason: 'Complete Step 1 (Borrower KYC) first' };
        }
        if (!isStep2Complete(state)) {
            return { allowed: false, reason: 'Run Step 2 (Bureau Credit Check) first' };
        }
        return { allowed: true };
    }
    return { allowed: false, reason: 'Invalid step' };
}

export { DEFAULT_CREDIT_STATE, canAccessCreditStep, isStep1Complete, isStep2Complete, loadCreditState, resetCreditDemoState, saveCreditState };
