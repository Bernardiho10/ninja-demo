# Technical Discrepancies, Ambiguities & Issues in Ninja API Documentation
> **Target Documentation**: [https://www.ninja.ng/docs/](https://www.ninja.ng/docs/)  
> **API Sandbox Base**: `https://api.sandbox.ninja.boucloud.io`  
> **Date of Audit**: September 2026  
> **Status**: Verified via live sandbox testing and code analysis  

---

## 1. Naming Convention Inconsistency (camelCase vs snake_case)

### The Issue
Different endpoint families across the Ninja API inconsistently mix `camelCase` and `snake_case` in request payloads and webhook events without a documented schema convention.

- **Identity Endpoints (`/api/identity/*`)**:
  - Request body uses strict `camelCase`:
    ```json
    {
      "idType": "nin",
      "idNumber": "12345678901",
      "mode": "verify",
      "dateOfBirth": "1994-08-12",
      "firstName": "Chinedu",
      "lastName": "Okonkwo"
    }
    ```
- **Hosted KYC Flows (`/api/flows`)**:
  - Request body uses `snake_case`:
    ```json
    {
      "customer_ref": "cust_123",
      "id_types": ["nin", "bvn"],
      "require_face": true
    }
    ```
- **Webhook Payloads**:
  - Event payloads deliver all fields in `snake_case` (`first_name`, `date_of_birth`, `match_status`, `face_match_confidence`).
- **Response Fields**:
  - `POST /api/identity/identify` response returns a mix: top-level status is `status`, but identity details can contain `date_of_birth` while request was `dateOfBirth`.

### Recommended Documentation Fix
Standardize documentation to explicitly note case requirements per endpoint, or update API serialization to accept both `snake_case` and `camelCase` aliases.

---

## 2. Supported ID Types Discrepancy

### The Issue
- In the primary table of `/api/identity/identify`, the documented allowed values for `idType` are:
  - `nin` (National Identity Number - 11 digits)
  - `bvn` (Bank Verification Number - 11 digits)
  - `ndl` (Nigerian Driver's License)
- However, throughout search indexing, onboarding guides, and hosted KYC flow documentation, `voters_card` (INEC Voter's Card / VIN) and `passport` (Nigerian International Passport) are referenced as supported options.
- In sandbox testing, calling `POST /api/identity/identify` with `"idType": "voters_card"` or `"idType": "passport"` returns `400 Bad Request: unsupported id_type`.

### Recommended Documentation Fix
Clearly separate tier-1 ID types supported by direct synchronous lookup (`nin`, `bvn`, `ndl`) from those requiring manual document upload or hosted KYC flows, and specify the exact string enum required for each endpoint.

---

## 3. Direct Bearer Key vs Session Token Authentication

### The Issue
- The documentation states:
  > *"You can authenticate by passing your API Secret Key directly as a Bearer token in the `Authorization: Bearer <secret_key>` header, OR by generating a temporary 5-minute session token via `POST /auth/session`."*
- In sandbox environments, passing `Authorization: Bearer <secret_key>` directly often returns `401 Unauthorized` on fresh API keys until an initial session token is obtained via `POST /auth/session` with `{"client_key": "...", "client_secret": "..."}`.
- Furthermore, the token expiry in `POST /auth/session` is returned as RFC3339 string (`expiry`), but documentation does not specify the exact TTL (it is 300 seconds / 5 minutes).

### Recommended Documentation Fix
Clarify that client applications must always implement session exchange or token caching with automatic refresh, rather than hardcoding static secret keys into authorization headers.

---

## 4. Sandbox Scope Limitations (Undocumented 403 Forbidden Errors)

### The Issue
Several endpoints presented in the API reference return `403 Forbidden (sandbox_scope)` or `404 Not Found` when tested against `https://api.sandbox.ninja.boucloud.io`:
- `GET /api/request/stats`
- `GET /api/request/trend`
- Production billing / wallet top-up endpoints

### Recommended Documentation Fix
Add an explicit "Sandbox Availability" badge to every endpoint in the reference docs, noting which telemetry, billing, and balance endpoints require production scope.

---

## 5. Hosted Flow Redirect URL Security Ambiguity

### The Issue
- When creating a hosted verification session via `POST /api/flows/:id/links`, developers provide a `redirect_url`.
- Upon user completion on Ninja's hosted portal, the browser is redirected to:
  `{redirect_url}?vs_id={id}&status=completed`
- The documentation does not warn developers that:
  1. This query parameter is purely client-side and can be forged by malicious users.
  2. The redirect query parameters do **not** contain verified user data (name, DOB, match score).
  3. Applications **must never** grant access or trust status based solely on the redirect parameters; they must either wait for the `verification.completed` webhook or query `GET /api/verifications/:id` server-to-server.

### Recommended Documentation Fix
Add a prominent `[!CAUTION]` or security best-practice callout on the Hosted Flow page advising developers to verify the verification session server-side before updating database state.

---

## 6. Face Match Confidence Score Range (Float vs Integer)

### The Issue
- In narrative descriptions, facial liveness and biometric match confidence are referred to as percentage values (e.g. `95% match`).
- In sample JSON responses, confidence is sometimes depicted as a floating-point number between `0.0` and `1.0` (e.g., `"confidence": 0.96`), while in live sandbox payload samples it is returned as an integer `0-100` (`"confidence": 96`).
- This causes deserialization bugs in statically-typed languages (like Go, Rust, or Java) if a struct field is typed as `float64` and receives an integer, or vice versa, or if comparison logic checks `confidence > 0.8` when the value returned is `80`.

### Recommended Documentation Fix
Explicitly state the data type and range: `confidence: integer (0 - 100)` or `confidence: float (0.0 - 1.0)`.

---

## 7. Webhook Signature Verification (`X-Ninja-Signature`)

### The Issue
- The documentation specifies:
  > *"Validate webhooks using HMAC-SHA256 signature in the `X-Ninja-Signature` header."*
- It does not specify:
  1. Whether the HMAC is computed over the raw incoming request bytes or a parsed/re-serialized string.
  2. Whether the secret key used for signing is the `NINJA_CLIENT_SECRET` or a separate webhook signing secret configured in the dashboard.
  3. How clock drift or timestamp replay attacks should be mitigated (no `X-Ninja-Timestamp` header is documented).

### Recommended Documentation Fix
Provide copy-pasteable verification snippets for Node.js, Python, Go, and PHP showing raw body extraction (`req.body` as Buffer / `io.ReadAll(r.Body)`) and constant-time string comparison (`crypto/subtle.ConstantTimeCompare`).

---

## 8. Bulk Identify Failure Atomicity

### The Issue
- `POST /api/identity/bulk-identify` accepts up to 25 identities.
- The documentation does not specify error behavior:
  - If 1 out of 25 NINs is invalid or formatted incorrectly, does the entire call fail with `400`?
  - Or does it return `207 Multi-Status` / `200 OK` with individual item errors in an array?

### Recommended Documentation Fix
Document the exact batch response contract with an example containing both successful lookups and failed items in the same batch.

---

## 9. Company / CAC Lookup Data Model Variances

### The Issue
- For `POST /api/company/lookup` (₦550) and `POST /api/company/advanced-lookup` (₦1,200):
  - The documentation presents a schema with `directors: []Director`.
  - For Nigerian Business Names (registered under Part B of CAMA with prefix `BN`), companies do not have "directors"; they have "proprietors" / "partners".
  - When looking up a Business Name, the `directors` key is either empty or omitted, which can surprise developers expecting director details.

### Recommended Documentation Fix
Document the distinction between Limited Liability Companies (`RC`), Business Names (`BN`), and Incorporated Trustees (`IT`), and show sample response shapes for each.

---

## 10. Bulk Identify Response Unwrapped Array Schema
> **Discovered & Verified**: September 2026 live sandbox audit

### The Issue
- The documentation implies `POST /api/identity/bulk-identify` returns an object envelope:
  ```json
  {
    "status": "success",
    "data": [
      { "id_number": "77777777777", ... }
    ]
  }
  ```
- In sandbox execution, `POST /api/identity/bulk-identify` returns an **unwrapped raw JSON array**:
  ```json
  [
    {
      "id_number": "77777777777",
      "type": "nin",
      "first_name": "James",
      "last_name": "Bond",
      "date_of_birth": "1975-01-01",
      ...
    },
    {
      "id_number": "66666666666",
      "type": "nin",
      "first_name": "Alex",
      "last_name": "Watchlist",
      "date_of_birth": "1975-01-01",
      ...
    }
  ]
  ```
- Strongly-typed SDKs and API clients (e.g. Go, Java, C#, Rust) that deserialize into `struct { Status string, Data []T }` immediately fail with `cannot unmarshal array into Go value of type ...`.

### Recommended Documentation Fix
Update the API response schema definition to reflect the actual JSON array response `IdentifyData[]`, or wrap the sandbox response inside `{"status": "success", "data": [...]}` for consistency with the rest of the endpoints.

---

## 11. CAC Corporate Lookup Sandbox Test Fixtures Undocumented
> **Discovered & Verified**: September 2026 live sandbox audit

### The Issue
- `POST /api/company/lookup` and `POST /api/company/advanced-lookup` fail with `{"status": "not_found"}` when arbitrary or common test RC numbers are provided (such as `1234567` or `RC1234567`).
- The documentation does not list any valid sandbox test RC numbers for developers testing corporate onboarding or KYB flows.
- Through sandbox inspection, the authoritative working test fixture is:
  - **RC Number**: `0000000`
  - **Company Name**: `NINJA DEMO COMPANY LIMITED`
  - **Company Type**: `PRIVATE_COMPANY_LIMITED_BY_SHARES`
  - **Status**: `ACTIVE`
  - **Secretary**: `Ninja Demo Registrars Limited`
  - **Shareholders**: `Ninja Demo Shareholder`

### Recommended Documentation Fix
Explicitly list `0000000` in the "Test Data & Sandbox Simulation" section of the documentation as the designated fixture for testing Basic and Advanced CAC Lookups.

---

## 12. Hosted Flow Link `values` Pre-fill Rejection for Undeclared Rule Fields
> **Discovered & Verified**: September 2026 live sandbox audit  
> **Error Caught**: `{"type":"validation_error","code":"400","message":"Validation error: unknown value field: user_bet_id"}`

### The Issue
- In the documentation for `POST /api/flows/:id/links`, the request body includes a `values: object` field without a detailed explanation of its validation rules.
- Developers often assume `values` can carry arbitrary custom metadata, transaction tracking keys, or application state (such as `user_bet_id`, `cart_id`, `invoice_no`).
- In reality, the Ninja API strictly validates every property in `values` against the flow's declared `rules.fields` (e.g. `first_name`, `last_name`, `date_of_birth`). If any undeclared key is passed in `values`, the Ninja API immediately rejects the request with HTTP `400 Bad Request: unknown value field: <key>`.
- Similarly, attempting to define custom non-standard fields on a Flow's `rules.fields` during `POST /api/flows` is rejected with `Validation error: unknown rule field: <key>`.

### Recommended Documentation Fix
1. Explicitly clarify in the `POST /api/flows/:id/links` documentation that `values` is strictly a **pre-fill identity dictionary** for fields evaluated by the flow's rules (`first_name`, `last_name`, `date_of_birth`).
2. Advise developers to attach application-level custom references (such as `user_bet_id`, order numbers, or player account IDs) via the `customer_ref` field (e.g. `customer_ref: "player_123:BET-9824108"`), which is preserved on the verification session and delivered in all resulting webhook events.


