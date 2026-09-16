-- ninja-bank: KYB (know-your-business) demo — a bank onboarding a
-- business doesn't just check one person, it needs every director behind
-- that business to resolve to a real registered identity, and it needs
-- to catch one stolen identity being reused across many agent-network
-- terminals under its name. Two different Ninja calls power those two
-- stories: bulk-identify (up to 25 IDs in one call) for directors, and
-- identify(mode=verify) + a local dedup check for agents.

CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    rc_number TEXT NOT NULL, -- CAC registration number — locally stored,
                              -- not verified against Ninja: no company-
                              -- registry idType is exposed by the sandbox,
                              -- only individual nin/bvn/ndl. The directors
                              -- behind the business are what Ninja actually
                              -- verifies (see business_directors).

    -- status is derived from director results, recomputed after every
    -- bulk-verify call, never set directly by the operator:
    -- pending (no directors checked yet) | verified (every director
    -- resolved to a real identity) | flagged_review (at least one
    -- director not found or name-mismatched)
    status TEXT NOT NULL DEFAULT 'pending',

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS business_directors (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    full_name TEXT NOT NULL, -- as submitted by the business
    id_type TEXT NOT NULL, -- nin | bvn
    id_number TEXT NOT NULL,

    -- What bulk-identify actually returned for this id_number — a
    -- registry lookup, not a verify-mode score (BulkIdentify has no
    -- per-entry name to check against, unlike identify(mode=verify)).
    found INTEGER NOT NULL DEFAULT 0,
    registry_first_name TEXT,
    registry_last_name TEXT,
    registry_date_of_birth TEXT,

    -- name_match is LOCAL business logic layered on top of the lookup —
    -- comparing the submitted full_name against the registry's name,
    -- since Ninja's bulk endpoint doesn't do that comparison itself:
    -- verified (found, name matches) | name_mismatch (found, name
    -- doesn't match) | not_found (no registry record for this id_number)
    status TEXT NOT NULL DEFAULT 'not_found',

    checked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL REFERENCES businesses(id),
    agent_code TEXT NOT NULL, -- the terminal/agent-code the business assigned
    full_name TEXT NOT NULL,
    id_type TEXT NOT NULL, -- nin | bvn
    id_number TEXT NOT NULL,

    -- identify(mode=verify) result for this specific agent registration.
    score REAL NOT NULL,
    recommendation TEXT NOT NULL,

    -- status: active (verified, and this id_number isn't already an
    -- agent anywhere else) | flagged_duplicate_identity (this exact
    -- id_number is already registered as a DIFFERENT agent_code — one
    -- identity behind two+ terminals, a real agent-banking fraud
    -- pattern) | blocked_mismatch (identify(mode=verify) itself failed)
    status TEXT NOT NULL,
    duplicate_of_agent_id TEXT, -- set only when status = flagged_duplicate_identity

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Same transparency pattern as ninja-bet/ninja-fintech's Inspector page —
-- every real call to Ninja logged here, nothing hidden.
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
