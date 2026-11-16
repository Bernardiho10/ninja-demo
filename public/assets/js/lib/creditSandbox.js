// Official Ninja Sandbox fixtures matching backend/service/credit/credit_sandbox.go
// and http://ninja.ng/docs/#api-credit
const SANDBOX_CREDIT_BVNS = {
    CLEAN: '77777777777', // 3 loans, performing, 2 repaid, Score 690, approve, eligible ₦1.8m
    DEFAULTED: '33333333333', // lost open loan, 3 missed repayments, deny
    NO_HISTORY: '44444444444', // profile with no loan accounts, review, no_credit_history
    NOT_FOUND: '55555555555', // no bureau record
    ERROR: '00000000000', // simulated 503 upstream error
};
function getSandboxCreditCheck(bvn, loanAmountKobo = 50000000) {
    if (bvn === SANDBOX_CREDIT_BVNS.ERROR) {
        return {
            status: 503,
            body: {
                type: 'api_error',
                code: '503',
                message: 'simulated upstream bureau failure',
            },
        };
    }
    if (bvn === SANDBOX_CREDIT_BVNS.NOT_FOUND || (bvn !== SANDBOX_CREDIT_BVNS.CLEAN && bvn !== SANDBOX_CREDIT_BVNS.DEFAULTED && bvn !== SANDBOX_CREDIT_BVNS.NO_HISTORY)) {
        return {
            status: 200,
            body: {
                status: 'not_found',
                data: null,
            },
        };
    }
    if (bvn === SANDBOX_CREDIT_BVNS.NO_HISTORY) {
        return {
            status: 200,
            body: {
                status: 'no_history',
                data: {
                    full_name: 'NINJA DEMO NEWCOMER',
                    score: null,
                    band: null,
                    recommendation: 'review',
                    reasons: ['no_credit_history'],
                    loan_amount: loanAmountKobo,
                    eligible_amount: 0,
                    summary: {
                        institutions: 0,
                        total_loans: 0,
                        open_loans: 0,
                        closed_loans: 0,
                        performing_loans: 0,
                        non_performing_loans: 0,
                        open_non_performing_loans: 0,
                        missed_repayments: 0,
                        total_credit_value: 0,
                        highest_credit: 0,
                        open_credit_value: 0,
                    },
                },
            },
        };
    }
    if (bvn === SANDBOX_CREDIT_BVNS.DEFAULTED) {
        return {
            status: 200,
            body: {
                status: 'found',
                data: {
                    full_name: 'NINJA DEMO DEFAULTER',
                    score: 415,
                    band: 'poor',
                    recommendation: 'deny',
                    reasons: ['open_non_performing_loan', 'missed_repayments'],
                    loan_amount: loanAmountKobo,
                    eligible_amount: 0,
                    summary: {
                        institutions: 1,
                        total_loans: 2,
                        open_loans: 1,
                        closed_loans: 1,
                        performing_loans: 1,
                        non_performing_loans: 1,
                        open_non_performing_loans: 1,
                        missed_repayments: 3,
                        total_credit_value: 95000000,
                        highest_credit: 80000000,
                        open_credit_value: 80000000,
                    },
                },
            },
        };
    }
    // CLEAN: 77777777777
    const eligibleKobo = 180000000; // ₦1,800,000 (1.5x highest credit ₦1,200,000)
    const isOverAmount = loanAmountKobo > eligibleKobo;
    const recommendation = isOverAmount ? 'review' : 'approve';
    const reasons = isOverAmount ? ['clean_record', 'amount_above_eligible'] : ['clean_record'];
    return {
        status: 200,
        body: {
            status: 'found',
            data: {
                full_name: 'JAMES BOND',
                score: 690,
                band: 'good',
                recommendation,
                reasons,
                loan_amount: loanAmountKobo,
                eligible_amount: eligibleKobo,
                summary: {
                    institutions: 2,
                    total_loans: 3,
                    open_loans: 1,
                    closed_loans: 2,
                    performing_loans: 3,
                    non_performing_loans: 0,
                    open_non_performing_loans: 0,
                    missed_repayments: 0,
                    total_credit_value: 190000000,
                    highest_credit: 120000000,
                    open_credit_value: 120000000,
                },
            },
        },
    };
}
function getSandboxCreditHistory(bvn, loanAmountKobo = 50000000) {
    const check = getSandboxCreditCheck(bvn, loanAmountKobo);
    if (check.status !== 200 || !check.body.data) {
        return check;
    }
    if (bvn === SANDBOX_CREDIT_BVNS.NO_HISTORY) {
        return {
            status: 200,
            body: {
                status: 'no_history',
                data: {
                    ...check.body.data,
                    profile: {
                        full_name: 'NINJA DEMO NEWCOMER',
                        gender: 'male',
                        address_history: [
                            { address: '14 Independence Way, Victoria Island, Lagos', type: 'Residential', date_reported: '2025-01-10' },
                        ],
                        identifications: [
                            { type: 'BVN', number: SANDBOX_CREDIT_BVNS.NO_HISTORY },
                        ],
                    },
                    accounts: [],
                },
            },
        };
    }
    if (bvn === SANDBOX_CREDIT_BVNS.DEFAULTED) {
        return {
            status: 200,
            body: {
                status: 'found',
                data: {
                    ...check.body.data,
                    profile: {
                        full_name: 'NINJA DEMO DEFAULTER',
                        gender: 'male',
                        address_history: [
                            { address: '88 Allen Avenue, Ikeja, Lagos State', type: 'Residential', date_reported: '2024-08-20' },
                        ],
                        identifications: [
                            { type: 'BVN', number: SANDBOX_CREDIT_BVNS.DEFAULTED },
                        ],
                    },
                    accounts: [
                        {
                            institution: 'NINJA DEMO BANK PLC',
                            loans: [
                                {
                                    status: 'open',
                                    performance: 'lost',
                                    currency: 'NGN',
                                    opening_balance: 80000000,
                                    repayment_amount: 7000000,
                                    repayment_frequency: 'monthly',
                                    tenor: 12,
                                    date_opened: '2025-02-01',
                                    repayment_schedule: [
                                        { period: '2026-08', status: 'missed' },
                                        { period: '2026-09', status: 'missed' },
                                        { period: '2026-10', status: 'missed' },
                                    ],
                                },
                                {
                                    status: 'closed',
                                    performance: 'performing',
                                    currency: 'NGN',
                                    opening_balance: 15000000,
                                    repayment_amount: 2600000,
                                    repayment_frequency: 'monthly',
                                    tenor: 6,
                                    date_opened: '2023-03-01',
                                    date_closed: '2023-09-01',
                                    repayment_schedule: [
                                        { period: '2023-08', status: 'paid' },
                                        { period: '2023-09', status: 'paid' },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            },
        };
    }
    // CLEAN: 77777777777
    return {
        status: 200,
        body: {
            status: 'found',
            data: {
                ...check.body.data,
                profile: {
                    full_name: 'JAMES BOND',
                    gender: 'male',
                    address_history: [
                        { address: '1 Demo Close, Wuse II, Abuja, FCT', type: 'Residential', date_reported: '2024-03-18' },
                    ],
                    identifications: [
                        { type: 'BVN', number: SANDBOX_CREDIT_BVNS.CLEAN },
                    ],
                },
                accounts: [
                    {
                        institution: 'NINJA DEMO BANK PLC',
                        loans: [
                            {
                                status: 'closed',
                                performance: 'performing',
                                currency: 'NGN',
                                opening_balance: 50000000,
                                repayment_amount: 4500000,
                                repayment_frequency: 'monthly',
                                tenor: 12,
                                date_opened: '2023-01-15',
                                date_closed: '2024-01-15',
                                repayment_schedule: [
                                    { period: '2023-11', status: 'paid' },
                                    { period: '2023-12', status: 'paid' },
                                    { period: '2024-01', status: 'paid' },
                                ],
                            },
                            {
                                status: 'open',
                                performance: 'performing',
                                currency: 'NGN',
                                opening_balance: 120000000,
                                repayment_amount: 5500000,
                                repayment_frequency: 'monthly',
                                tenor: 24,
                                date_opened: '2025-06-01',
                                repayment_schedule: [
                                    { period: '2026-09', status: 'paid' },
                                    { period: '2026-10', status: 'paid' },
                                    { period: '2026-11', status: 'pending' },
                                ],
                            },
                        ],
                    },
                    {
                        institution: 'NINJA DEMO MICROFINANCE BANK',
                        loans: [
                            {
                                status: 'closed',
                                performance: 'performing',
                                currency: 'NGN',
                                opening_balance: 20000000,
                                repayment_amount: 3500000,
                                repayment_frequency: 'monthly',
                                tenor: 6,
                                date_opened: '2024-05-10',
                                date_closed: '2024-11-10',
                                repayment_schedule: [
                                    { period: '2024-10', status: 'paid' },
                                    { period: '2024-11', status: 'paid' },
                                ],
                            },
                        ],
                    },
                ],
            },
        },
    };
}

export { SANDBOX_CREDIT_BVNS, getSandboxCreditCheck, getSandboxCreditHistory };
