const STORAGE_KEY = 'ninjakyb:demo-state';
const INITIAL_KYB_STATE = {
    currentStep: 1,
    company: {
        rcNumber: '',
        companyName: '',
        companyType: 'PRIVATE_COMPANY_LIMITED_BY_SHARES',
        status: 'UNVERIFIED',
        verified: false,
    },
    directors: {
        audited: false,
        list: [],
    },
    hostedFlow: {
        status: 'idle',
    },
    logs: [],
};
function loadKybState() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw)
            return { ...INITIAL_KYB_STATE };
        return JSON.parse(raw);
    }
    catch {
        return { ...INITIAL_KYB_STATE };
    }
}
function saveKybState(state) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch { }
}
function resetKybDemoState() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    }
    catch { }
}
function isKybStep1Complete(state) {
    if (!state.company.verified || state.company.status === 'UNVERIFIED' || state.company.status === 'NOT_FOUND') {
        return false;
    }
    if (state.company.status === 'INACTIVE') {
        return state.company.opsDecision === 'CONDITIONAL_APPROVED';
    }
    return true;
}
function isKybStep2Complete(state) {
    return isKybStep1Complete(state) && state.directors.audited === true;
}
function canAccessKybStep(step, state) {
    if (step === 1)
        return { allowed: true };
    if (step === 2) {
        if (!isKybStep1Complete(state)) {
            return { allowed: false, reason: 'Step 1 (Company Check) required' };
        }
        return { allowed: true };
    }
    if (step === 3) {
        if (!isKybStep1Complete(state)) {
            return { allowed: false, reason: 'Step 1 (Company Check) required' };
        }
        if (!isKybStep2Complete(state)) {
            return { allowed: false, reason: 'Step 2 (Directors Check) required' };
        }
        return { allowed: true };
    }
    return { allowed: false };
}

export { INITIAL_KYB_STATE, canAccessKybStep, isKybStep1Complete, isKybStep2Complete, loadKybState, resetKybDemoState, saveKybState };
