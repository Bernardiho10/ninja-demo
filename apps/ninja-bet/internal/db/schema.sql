-- ninja-bet: consumer sportsbook compliance demo.
-- Registration collects first_name, last_name, phone_number, and a NIN —
-- never a typed date of birth. POST /api/identity/identify is called TWICE
-- at signup (mode=lookup to fetch the registry's name/DOB/photo from the
-- NIN alone, then mode=verify to confirm the submitted name matches that
-- registry record) and once more at payout (mode=verify, re-checked live).

CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone_number TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,

    -- KYC state, resolved at registration via identity/identify
    -- (lookup then verify) and re-checked at payout (verify only).
    -- verified | flagged_duplicate_identity | blocked_underage | blocked_mismatch
    -- flagged_duplicate_identity = same NIN already tied to another account:
    -- identity is genuine, but no second welcome bonus (bonus-farming defense).
    kyc_status TEXT NOT NULL DEFAULT 'unverified',
    id_type TEXT NOT NULL DEFAULT 'nin',
    id_number TEXT NOT NULL,
    date_of_birth TEXT, -- from Ninja's lookup response, never user-typed
    age INTEGER,
    match_score REAL,
    lookup_raw TEXT, -- raw JSON of the identify(lookup) response
    verify_raw TEXT, -- raw JSON of the identify(verify) response
    photo_data_uri TEXT, -- the registry photo Ninja's lookup returned, if any

    self_excluded INTEGER NOT NULL DEFAULT 0,

    balance_kobo INTEGER NOT NULL DEFAULT 10000000,   -- welcome credit, kobo (₦100,000)
    winnings_kobo INTEGER NOT NULL DEFAULT 0,

    -- Saved payout destination — pre-fills the withdrawal form; still
    -- editable per-request (the beneficiary-mismatch defense has to stay
    -- reachable by typing a different name here).
    saved_bank_name TEXT,
    saved_account_number TEXT,

    -- Hosted KYC (selfie + liveness) — a second, independent identity
    -- signal beyond identify()'s name-matching: even someone who knows the
    -- correct name and NIN for a stolen identity still has to physically
    -- look like the registry photo and pass a liveness check. Unlike
    -- identify(), this can't be driven by a fixed sandbox fixture — a real
    -- human has to complete Ninja's hosted flow.
    face_verification_id TEXT,
    face_verification_url TEXT,
    face_verification_status TEXT, -- pending | passed | failed (null = never started)
    face_score REAL,
    face_verify_raw TEXT,

    -- Layer-2 payout security: if a session or saved bank detail is ever
    -- stolen, this is the backstop — every withdrawal re-checks the most
    -- recent liveness score against a player-chosen threshold, regardless
    -- of how the payout beneficiary-name check above resolves. On by
    -- default at the "Medium" tier (85%); the player can raise, lower, or
    -- disable it in Account settings, trading strictness for friction.
    require_face_for_payout INTEGER NOT NULL DEFAULT 1,
    liveness_threshold REAL NOT NULL DEFAULT 0.85,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Key-value store for idempotent hosted-flow IDs, same pattern as the
-- parent repo's internal/db.Config — created once, cached, reused.
CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bets (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    match_event TEXT NOT NULL,
    selection TEXT NOT NULL,
    odds REAL NOT NULL,
    stake_kobo INTEGER NOT NULL,
    status TEXT NOT NULL, -- placed | won | lost
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deposits (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    amount_kobo INTEGER NOT NULL,
    method TEXT NOT NULL, -- card | bank_transfer | ussd — no real money moves, this models the UX only
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES players(id),
    amount_kobo INTEGER NOT NULL,
    -- who the player claims to be withdrawing to — checked against the NIN
    -- identity via identify(mode=verify), same as the "does the beneficiary
    -- account holder match the verified NIN" pattern real payout rails use.
    beneficiary_name TEXT,
    bank_name TEXT,
    account_number TEXT,
    status TEXT NOT NULL, -- approved | blocked_beneficiary_mismatch | blocked_self_excluded | blocked_unverified
    reason TEXT,
    verify_raw TEXT, -- raw JSON of the re-verification IdentifyResponse
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every inbound webhook delivery from Ninja, verbatim, regardless of
-- outcome — same pattern as the parent repo's internal/db.WebhookEvent.
CREATE TABLE IF NOT EXISTS webhook_events (
    id TEXT PRIMARY KEY,
    event TEXT NOT NULL,
    delivery_id TEXT,
    payload_raw TEXT NOT NULL,
    signature_ok INTEGER NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Every call made to the Ninja sandbox, verbatim request/response, so the
-- frontend "Ninja Call Inspector" panel can show real traffic, not a mockup.
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
