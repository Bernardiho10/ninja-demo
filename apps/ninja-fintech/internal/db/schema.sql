-- ninja-fintech: customer onboarding + re-KYC compliance demo.
-- Unlike ninja-bet (a consumer-facing app with its own player logins),
-- this is an operations console — the shape "Fintechs" actually use
-- Ninja in: an ops/compliance team onboarding customers and monitoring
-- them, not each customer self-registering. identify(mode=verify) is
-- called at onboarding AND again, on demand, as re-KYC for a flagged
-- account — same endpoint, two different moments, same as ninja-bet's
-- register-then-payout pattern but here both moments are ops-initiated.

CREATE TABLE IF NOT EXISTS fintech_customers (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    id_type TEXT NOT NULL, -- nin | bvn
    id_number TEXT NOT NULL,

    -- Ninja's identify(mode=verify) result — a SCORE and RECOMMENDATION,
    -- not a blunt pass/fail. score is 0..1 (or 0..100 depending on sandbox
    -- response shape — normalized to 0..1 before storage, see api.go).
    -- recommendation: accept | review | reject (Ninja's own bucket if
    -- present; bucketed locally at 85%/60% if the sandbox omits it).
    score REAL NOT NULL,
    recommendation TEXT NOT NULL,
    mismatches_raw TEXT, -- JSON array of fields that didn't match, if any
    fields_raw TEXT NOT NULL, -- JSON array of every field Ninja scored — the actual "per-field" detail this app exists to show, not just the top-line score

    -- status is business logic layered on top of Ninja's recommendation,
    -- not something Ninja returns itself:
    -- onboarded | flagged_review | re_kyc_cleared | re_kyc_failed
    status TEXT NOT NULL,

    -- Account tier gates the daily transfer limit — a real fintech
    -- consequence of the verification outcome, not just a badge.
    tier INTEGER NOT NULL DEFAULT 1,
    daily_limit_kobo INTEGER NOT NULL DEFAULT 5000000, -- ₦50,000, Tier 1
    balance_kobo INTEGER NOT NULL DEFAULT 125000000, -- ₦1,250,000 starting demo balance

    last_checked_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS fintech_transfers (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES fintech_customers(id),
    recipient_name TEXT NOT NULL,
    recipient_bank TEXT NOT NULL,
    recipient_account TEXT NOT NULL,
    amount_kobo INTEGER NOT NULL,
    status TEXT NOT NULL, -- completed | blocked_tier_limit | held_re_kyc
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Same transparency pattern as ninja-bet's Inspector page — every real
-- call to Ninja logged here, nothing hidden.
CREATE TABLE IF NOT EXISTS api_logs (
    id TEXT PRIMARY KEY,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    request_payload TEXT,
    response_payload TEXT,
    is_mock INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
