// Thin fetch wrapper matching apps/ninja-fintech/internal/api exactly.
// Supports both live Go API backend AND standalone static execution via localStorage
// for seamless GitHub Pages deployment without needing a database or Go server.
const API_BASE = 'http://localhost:4200';
const STATUS_LABEL = {
    onboarded: 'Onboarded ✓',
    flagged_review: 'Flagged for review',
    re_kyc_cleared: 'Re-KYC cleared ✓',
    re_kyc_failed: 'Re-KYC failed',
};
class APIError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
// -----------------------------------------------------------------------------
// LocalStorage Persistence Layer for GitHub Pages (No Database Required)
// -----------------------------------------------------------------------------
const STORAGE_KEY_CUSTOMERS = 'ninjafintech_customers_v1';
const STORAGE_KEY_TRANSFERS = 'ninjafintech_transfers_v1';
const STORAGE_KEY_LOGS = 'ninjafintech_logs_v1';
function getSeedCustomers() {
    return [
        {
            id: 'cust_001_james',
            full_name: 'James Bond',
            date_of_birth: '1975-01-01',
            id_type: 'nin',
            id_number: '77777777777',
            score: 0.98,
            recommendation: 'ALLOW',
            fields: [
                { field: 'first_name', score: 1.0, match: 'exact', provided: 'James' },
                { field: 'last_name', score: 1.0, match: 'exact', provided: 'Bond' },
                { field: 'date_of_birth', score: 1.0, match: 'exact', provided: '1975-01-01' },
            ],
            status: 'onboarded',
            tier: 2,
            daily_limit_kobo: 50000000, // ₦500,000
            balance_kobo: 250000000, // ₦2,500,000
            last_checked_at: new Date(Date.now() - 3600000).toISOString(),
            created_at: new Date(Date.now() - 86400000).toISOString(),
        },
        {
            id: 'cust_002_chinedu',
            full_name: 'Chinedu Okafor',
            date_of_birth: '1988-06-15',
            id_type: 'bvn',
            id_number: '22222222222',
            score: 0.74,
            recommendation: 'MANUAL_REVIEW',
            fields: [
                { field: 'first_name', score: 0.72, match: 'fuzzy', provided: 'Chinedu', detail: 'Registry has Chinedu Emeka' },
                { field: 'last_name', score: 1.0, match: 'exact', provided: 'Okafor' },
                { field: 'date_of_birth', score: 1.0, match: 'exact', provided: '1988-06-15' },
            ],
            status: 'flagged_review',
            tier: 1,
            daily_limit_kobo: 5000000, // ₦50,000
            balance_kobo: 75000000, // ₦750,000
            last_checked_at: new Date(Date.now() - 7200000).toISOString(),
            created_at: new Date(Date.now() - 172800000).toISOString(),
        },
    ];
}
function loadLocalCustomers() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_CUSTOMERS);
        if (raw)
            return JSON.parse(raw);
    }
    catch { }
    const seeds = getSeedCustomers();
    saveLocalCustomers(seeds);
    return seeds;
}
function saveLocalCustomers(list) {
    try {
        localStorage.setItem(STORAGE_KEY_CUSTOMERS, JSON.stringify(list));
    }
    catch { }
}
function loadLocalTransfers() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_TRANSFERS);
        if (raw)
            return JSON.parse(raw);
    }
    catch { }
    return {
        cust_001_james: [
            {
                ID: 'tx_001',
                CustomerID: 'cust_001_james',
                RecipientName: 'Adeola Adeleke',
                RecipientBank: 'Access Bank',
                RecipientAccount: '0123456789',
                AmountKobo: 25000000,
                Status: 'completed',
                Reason: 'Cleared Tier 2 Transfer',
                CreatedAt: new Date(Date.now() - 1800000).toISOString(),
            },
        ],
    };
}
function saveLocalTransfers(data) {
    try {
        localStorage.setItem(STORAGE_KEY_TRANSFERS, JSON.stringify(data));
    }
    catch { }
}
function addLocalLog(method, endpoint, status, req, resp) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_LOGS);
        const logs = raw ? JSON.parse(raw) : [];
        logs.unshift({
            ID: 'log_' + Date.now().toString(36),
            Endpoint: endpoint,
            Method: method,
            StatusCode: status,
            DurationMs: Math.floor(Math.random() * 80) + 40,
            RequestPayload: { String: JSON.stringify(req, null, 2), Valid: true },
            ResponsePayload: { String: JSON.stringify(resp, null, 2), Valid: true },
            IsMock: true,
            CreatedAt: new Date().toISOString(),
        });
        localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs.slice(0, 50)));
    }
    catch { }
}
function simulateFallback(path, init) {
    let body = {};
    try {
        if (init?.body)
            body = JSON.parse(init.body);
    }
    catch { }
    const customers = loadLocalCustomers();
    // 1. POST /api/customers (Onboard Customer)
    if (path === '/api/customers' && init?.method === 'POST') {
        const fullName = body.full_name || 'James Bond';
        const dob = body.date_of_birth || '1975-01-01';
        const idType = body.id_type || 'nin';
        const idNumber = body.id_number || '77777777777';
        const isJames = fullName.toLowerCase().includes('james');
        const isTypo = fullName.toLowerCase().includes('jam') && !isJames;
        let score = 0.15;
        let rec = 'REJECT';
        let status = 'flagged_review';
        if (isJames) {
            score = 0.98;
            rec = 'ALLOW';
            status = 'onboarded';
        }
        else if (isTypo) {
            score = 0.78;
            rec = 'MANUAL_REVIEW';
            status = 'flagged_review';
        }
        const newCustomer = {
            id: 'cust_' + Date.now().toString(36),
            full_name: fullName,
            date_of_birth: dob,
            id_type: idType,
            id_number: idNumber,
            score,
            recommendation: rec,
            fields: [
                { field: 'full_name', score, match: score >= 0.85 ? 'exact' : score >= 0.7 ? 'fuzzy' : 'mismatch', provided: fullName },
                { field: 'date_of_birth', score: 1.0, match: 'exact', provided: dob },
                { field: 'id_number', score: 1.0, match: 'exact', provided: idNumber },
            ],
            status,
            tier: 1,
            daily_limit_kobo: 5000000, // ₦50,000 for tier 1
            balance_kobo: 100000000, // ₦1,000,000 initial sandbox wallet
            last_checked_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
        };
        customers.unshift(newCustomer);
        saveLocalCustomers(customers);
        const resp = { customer: newCustomer, message: `Customer verified via Ninja API (score: ${Math.round(score * 100)}%)` };
        addLocalLog('POST', 'https://api.ninja.ng/api/identity/identify', score >= 0.7 ? 200 : 400, body, resp);
        return resp;
    }
    // 2. GET /api/customers
    if (path === '/api/customers' && (!init?.method || init.method === 'GET')) {
        return customers;
    }
    // 3. POST /api/customers/:id/re-kyc
    const rekycMatch = path.match(/^\/api\/customers\/([^/]+)\/re-kyc$/);
    if (rekycMatch && init?.method === 'POST') {
        const cid = rekycMatch[1];
        const customer = customers.find((c) => c.id === cid);
        if (!customer)
            throw new APIError(404, 'Customer not found');
        customer.status = 're_kyc_cleared';
        customer.score = 0.96;
        customer.recommendation = 'ALLOW';
        customer.last_checked_at = new Date().toISOString();
        saveLocalCustomers(customers);
        const resp = { customer, message: 'Re-KYC completed successfully via Ninja lookup.' };
        addLocalLog('POST', `https://api.ninja.ng/api/identity/identify (re-kyc)`, 200, { customerId: cid }, resp);
        return resp;
    }
    // 4. POST /api/customers/:id/upgrade-tier
    const upgradeMatch = path.match(/^\/api\/customers\/([^/]+)\/upgrade-tier$/);
    if (upgradeMatch && init?.method === 'POST') {
        const cid = upgradeMatch[1];
        const customer = customers.find((c) => c.id === cid);
        if (!customer)
            throw new APIError(404, 'Customer not found');
        if (customer.tier === 1) {
            customer.tier = 2;
            customer.daily_limit_kobo = 50000000; // ₦500,000
        }
        else if (customer.tier === 2) {
            customer.tier = 3;
            customer.daily_limit_kobo = 500000000; // ₦5,000,000
        }
        saveLocalCustomers(customers);
        const resp = { customer };
        addLocalLog('POST', `/api/customers/${cid}/upgrade-tier`, 200, { tier: customer.tier }, resp);
        return resp;
    }
    // 5. POST /api/customers/:id/transfer
    const transferMatch = path.match(/^\/api\/customers\/([^/]+)\/transfer$/);
    if (transferMatch && init?.method === 'POST') {
        const cid = transferMatch[1];
        const customer = customers.find((c) => c.id === cid);
        if (!customer)
            throw new APIError(404, 'Customer not found');
        const amountNaira = Number(body.amount_naira || 0);
        const amountKobo = amountNaira * 100;
        const recipientName = body.recipient_name || 'Recipient';
        const recipientBank = body.recipient_bank || 'Access Bank';
        const recipientAccount = body.recipient_account || '0123456789';
        const allTransfers = loadLocalTransfers();
        if (!allTransfers[cid])
            allTransfers[cid] = [];
        // Rule: flagged accounts require re-KYC before transfers
        if (customer.status === 'flagged_review' || customer.status === 're_kyc_failed') {
            const heldTx = {
                ID: 'tx_' + Date.now().toString(36),
                CustomerID: cid,
                RecipientName: recipientName,
                RecipientBank: recipientBank,
                RecipientAccount: recipientAccount,
                AmountKobo: amountKobo,
                Status: 'held_re_kyc',
                Reason: 'Held: customer is flagged for identity re-KYC verification.',
                CreatedAt: new Date().toISOString(),
            };
            allTransfers[cid].unshift(heldTx);
            saveLocalTransfers(allTransfers);
            return { status: 'held_re_kyc', message: heldTx.Reason };
        }
        // Rule: daily tier limit
        if (amountKobo > customer.daily_limit_kobo) {
            const blockedTx = {
                ID: 'tx_' + Date.now().toString(36),
                CustomerID: cid,
                RecipientName: recipientName,
                RecipientBank: recipientBank,
                RecipientAccount: recipientAccount,
                AmountKobo: amountKobo,
                Status: 'blocked_tier_limit',
                Reason: `Blocked: ₦${amountNaira.toLocaleString()} exceeds Tier ${customer.tier} daily limit of ${formatNaira(customer.daily_limit_kobo)}.`,
                CreatedAt: new Date().toISOString(),
            };
            allTransfers[cid].unshift(blockedTx);
            saveLocalTransfers(allTransfers);
            return { status: 'blocked_tier_limit', message: blockedTx.Reason };
        }
        // Success: transfer completed
        customer.balance_kobo = Math.max(0, customer.balance_kobo - amountKobo);
        saveLocalCustomers(customers);
        const completedTx = {
            ID: 'tx_' + Date.now().toString(36),
            CustomerID: cid,
            RecipientName: recipientName,
            RecipientBank: recipientBank,
            RecipientAccount: recipientAccount,
            AmountKobo: amountKobo,
            Status: 'completed',
            Reason: `Disbursed to ${recipientName} (${recipientBank} · ${recipientAccount})`,
            CreatedAt: new Date().toISOString(),
        };
        allTransfers[cid].unshift(completedTx);
        saveLocalTransfers(allTransfers);
        return { status: 'completed', message: `₦${amountNaira.toLocaleString()} sent successfully to ${recipientName}!` };
    }
    // 6. GET /api/customers/:id/transfers
    const listTxMatch = path.match(/^\/api\/customers\/([^/]+)\/transfers$/);
    if (listTxMatch) {
        const cid = listTxMatch[1];
        const allTransfers = loadLocalTransfers();
        return (allTransfers[cid] || []);
    }
    // 7. GET /api/admin/logs
    if (path === '/api/admin/logs') {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_LOGS);
            if (raw)
                return JSON.parse(raw);
        }
        catch { }
        return [
            {
                ID: 'log_seed_1',
                Endpoint: 'POST https://api.ninja.ng/api/identity/identify',
                Method: 'POST',
                StatusCode: 200,
                DurationMs: 64,
                RequestPayload: { String: JSON.stringify({ idType: 'nin', mode: 'verify', idNumber: '77777777777' }, null, 2), Valid: true },
                ResponsePayload: { String: JSON.stringify({ status: 'found', verified: true, score: 0.98, recommendation: 'ALLOW' }, null, 2), Valid: true },
                IsMock: false,
                CreatedAt: new Date().toISOString(),
            },
        ];
    }
    return {};
}
async function request(path, init) {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(API_BASE + path, {
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            ...init,
        });
        clearTimeout(timer);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new APIError(res.status, body.error ?? `request failed: ${res.status}`);
        }
        return body;
    }
    catch (err) {
        if (err instanceof APIError) {
            throw err;
        }
        // Fallback directly to localStorage simulation for GitHub Pages!
        return simulateFallback(path, init);
    }
}
const api = {
    onboardCustomer: (input) => request('/api/customers', {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    listCustomers: () => request('/api/customers'),
    reKYC: (customerId) => request(`/api/customers/${customerId}/re-kyc`, { method: 'POST' }),
    upgradeTier: (customerId) => request(`/api/customers/${customerId}/upgrade-tier`, { method: 'POST' }),
    requestTransfer: (customerId, input) => request(`/api/customers/${customerId}/transfer`, {
        method: 'POST',
        body: JSON.stringify(input),
    }),
    listTransfers: (customerId) => request(`/api/customers/${customerId}/transfers`),
    callLog: () => request('/api/admin/logs'),
};
function formatNaira(kobo) {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(kobo / 100);
}

export { APIError, STATUS_LABEL, api, formatNaira };
