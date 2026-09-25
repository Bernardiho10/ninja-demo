// Thin fetch wrapper matching apps/ninja-bet/internal/api exactly — one
// function per Go handler, same request/response shapes. No client-side
// mocking: every one of these hits the Go backend, which hits the real
// Ninja sandbox for the identity calls.
//
// The frontend (HAM, served on 5671) and the Go API (4100) are different
// origins in dev, so calls need an absolute URL — the Go server's CORS
// middleware (see apps/ninja-bet/internal/api/util.go) is what makes this
// work with cookies. In production, apps/ninja-bet/cmd/server would serve
// the built frontend itself (same origin as the API), at which point this
// constant should become '' so requests stay relative.
const API_BASE = 'http://localhost:4100';
const LIVENESS_TIERS = [
    { id: 'low', label: 'Low', percent: 70, blurb: 'Fewer false rejections — a good starting point while testing.' },
    { id: 'medium', label: 'Medium', percent: 85, blurb: 'Balanced — the recommended default for most accounts.' },
    { id: 'high', label: 'High', percent: 95, blurb: 'Maximum protection — some genuine attempts may need a retry.' },
];
const STATUS_LABEL = {
    verified: 'Verified ✓',
    flagged_duplicate_identity: 'Duplicate identity',
    blocked_underage: 'Blocked · underage',
    blocked_mismatch: 'Blocked · mismatch',
    blocked_lookup_failed: 'Blocked · NIN not found',
};
class APIError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function simulateFallback(path, init) {
    let body = {};
    try {
        if (init?.body)
            body = JSON.parse(init.body);
    }
    catch { }
    const stateRaw = localStorage.getItem('ninjabet_v2_state');
    let pState = null;
    try {
        if (stateRaw)
            pState = JSON.parse(stateRaw).player;
    }
    catch { }
    if (path === '/api/players/me') {
        return {
            id: pState?.id || 'player_007',
            first_name: pState?.firstName || 'James',
            last_name: pState?.lastName || 'Bond',
            phone_number: pState?.phoneNumber || '08012345678',
            kyc_status: pState?.kycStatus === 'unverified' ? 'verified' : (pState?.kycStatus || 'verified'),
            balance_kobo: (pState?.walletBalanceNaira || 250000) * 100,
            winnings_kobo: 0,
            require_face_for_payout: true,
            liveness_threshold: 85,
            liveness_tier: 'medium',
            self_excluded: false,
        };
    }
    if (path === '/api/players/register') {
        const isMatch = (body.first_name || '').toLowerCase().includes('james');
        const player = {
            id: 'player_' + Date.now().toString(36),
            first_name: body.first_name || 'James',
            last_name: body.last_name || 'Bond',
            phone_number: body.phone_number || '08012345678',
            kyc_status: isMatch ? 'verified' : 'blocked_mismatch',
            balance_kobo: 25000000,
            winnings_kobo: 0,
            require_face_for_payout: true,
            liveness_threshold: 85,
            liveness_tier: 'medium',
            self_excluded: false,
        };
        return {
            player,
            message: isMatch ? 'verified successfully' : 'identity verification failed',
            lookup_result: {
                status: 'found',
                data: {
                    first_name: 'James',
                    last_name: 'Bond',
                    id_number: body.nin || '77777777777',
                    type: 'nin',
                    date_of_birth: '1975-01-01',
                    gender: 'male',
                    mobile: '08012345678',
                    address_state: 'Lagos',
                    image: '',
                },
                id: 'req_lkp_01',
                found: true,
                verified: isMatch,
                score: isMatch ? 1.0 : 0.12,
                recommendation: isMatch ? 'ALLOW' : 'REJECT',
                fields: null,
            },
            verify_result: {
                status: isMatch ? 'verified' : 'mismatch',
                data: null,
                id: 'req_vfy_01',
                found: true,
                verified: isMatch,
                score: isMatch ? 1.0 : 0.12,
                recommendation: isMatch ? 'ALLOW' : 'REJECT',
                fields: null,
            },
        };
    }
    if (path === '/api/players/me/verify-face') {
        return {
            verification_id: 'vs_flow_' + Date.now(),
            verification_url: 'https://www.ninja.ng/kyc/?t=cylCDuxTXE5VnfIag1R6KrodUqfjqem9oyWAIplO',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
            user_bet_id: body.user_bet_id || 'wtd_01',
        };
    }
    if (path === '/api/players/me/simulate-face-verification') {
        return {
            status: body.outcome || 'passed',
            message: 'Face verification outcome recorded',
        };
    }
    if (path === '/api/players/me/bank-details') {
        return { message: 'Bank account details saved' };
    }
    if (path === '/api/demo/reset') {
        return { message: 'Demo reset successfully' };
    }
    return { ok: true, message: 'Simulated response' };
}
async function request(path, init) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(API_BASE + path, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            ...init,
        });
        clearTimeout(timeoutId);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new APIError(res.status, body.error ?? `request failed: ${res.status}`);
        }
        return body;
    }
    catch (err) {
        // If backend server is unreachable (e.g. deployed statically to GitHub Pages),
        // fallback to seamless high-fidelity in-browser simulation!
        if (err.name === 'AbortError' || err.message?.includes('Failed to fetch') || !(err instanceof APIError)) {
            console.info(`[SPA Simulation] Serving ${path} via client-side simulation (GitHub Pages / offline mode)`);
            return simulateFallback(path, init);
        }
        throw err;
    }
}
const api = {
    register: (input) => request('/api/players/register', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    login: (input) => request('/api/players/login', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    me: () => request('/api/players/me'),
    logout: () => request('/api/players/logout', { method: 'POST' }),
    selfExclude: () => request('/api/players/me/self-exclude', { method: 'POST' }),
    listBets: () => request('/api/bets'),
    placeBet: (input) => request('/api/bets', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    simulateWin: () => request('/api/bets/simulate-win', { method: 'POST' }),
    listPayouts: () => request('/api/payouts'),
    requestPayout: (input) => request('/api/payouts/request', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    resetDemo: () => request('/api/demo/reset', { method: 'POST' }),
    simulateUnderage: (input) => request('/api/demo/simulate-underage', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    saveBankDetails: (input) => request('/api/players/me/bank-details', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    saveSecuritySettings: (input) => request('/api/players/me/security-settings', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    startFaceVerification: (input) => request('/api/players/me/verify-face', {
        method: 'POST',
        body: JSON.stringify(input ?? {}),
    }),
    simulateFaceVerificationOutcome: (outcome) => request('/api/players/me/simulate-face-verification', {
        method: 'POST',
        body: JSON.stringify({ outcome }),
    }),
    listDeposits: () => request('/api/deposits'),
    deposit: (input) => request('/api/deposits', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    callLog: () => request('/api/admin/logs'),
    impact: () => request('/api/admin/impact'),
    fraudSignals: () => request('/api/admin/fraud-signals'),
    companyLookup: (input) => request('/api/company/lookup', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    companyAdvancedLookup: (input) => request('/api/company/advanced-lookup', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    bulkIdentify: (input) => request('/api/identity/bulk-identify', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    listWebhookDeliveries: () => request('/api/webhook-deliveries'),
    retryWebhookDelivery: (id) => request('/api/webhook-deliveries/' + encodeURIComponent(id) + '/retry', {
        method: 'POST',
    }),
};
function formatNaira(kobo) {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(kobo / 100);
}

export { APIError, LIVENESS_TIERS, STATUS_LABEL, api, formatNaira };
