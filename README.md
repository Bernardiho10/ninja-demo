# Ninja Demo

Interactive developer demonstrations of [Ninja](https://ninja.ng/)'s identity and credit APIs.

The repo includes two interactive industry journeys that developers can test and inspect side-by-side:

1. **ninja-bet** (`/`): Sportsbook & gaming onboarding, mule-account BVN matching, and biometric payout authorization.
2. **ninja-credit** (`/credit.html`): Digital lending & BNPL onboarding, instant credit bureau check & scoring (`/api/credit/check`), deep bureau loan history audit (`/api/credit/history`), and disbursement.

Every step executes a **real API call against the Ninja sandbox**. At each step you inspect the exact request and response payloads, plus runnable code in cURL, JavaScript, Python, Go and Rust.

---

## 1. Credit Company & Lending Demo (`ninja-credit`)

Built around a digital lending platform to show lenders how Ninja catches bad debts *before* money is disbursed.

| Step | Lender action | Ninja feature | API call |
|---|---|---|---|
| 1 · Borrower KYC | Enters name, BVN, phone, DOB, loan ask & statutory consent | BVN verify & identify against official registry | `POST /api/identity/identify` |
| 2 · Credit Check | Runs instant bureau score & risk recommendation | 300–850 bureau score, recommendation (`approve`, `review`, `deny`), reason codes, eligible credit vs requested | `POST /api/credit/check` |
| 3 · Underwrite & Disburse | Audits full loan history & executes disbursement | Full bureau profile, address history, lender-by-lender accounts, month-by-month repayment matrix, disbursement | `POST /api/credit/history` |

### What the Credit Check returns

- **A Score:** Computed on the 300 to 850 scale with color bands: Excellent (720–850), Good (650–719), Fair (580–649), Poor (300–579).
- **A Recommendation:** `approve`, `review`, or `deny`.
  - `approve`: Clean record, no open non-performing loans, requested amount is within eligible credit.
  - `deny`: Score in poor band, or an open loan classed as non-performing/lost. Always blocks disbursement.
  - `review`: Fair band, thin file / no history, or loan request exceeds eligible credit (`amount_above_eligible`).
- **Reason Codes:** `clean_record`, `open_non_performing_loan`, `past_non_performing_loan`, `missed_repayments`, `amount_above_eligible`, `no_credit_history`.
- **Loan Book in Numbers:** Reporting institutions, total loans, open vs closed, performing vs non-performing, missed repayments, total credit value, highest credit, open outstanding balance, and eligible loan capacity.

### Sandbox Test BVNs

| BVN | Result | Behavior |
|---|---|---|
| `77777777777` | `found` | Prime borrower (James Bond): 3 loans all performing, 2 repaid. Score 690 (`good`), `approve`, ₦1.8m eligible limit. If requested loan > ₦1.8m (e.g. ₦2.5m), triggers `amount_above_eligible` and becomes `review`. |
| `33333333333` | `found` | Defaulter: open loan classed as lost with 3 missed repayments beside 1 repaid loan. Score 415 (`poor`), `deny`. |
| `44444444444` | `no_history` | Thin file: known to bureaus with zero prior loan accounts. Score `null`, `review` (`no_credit_history`). |
| `55555555555` | `not_found` | No bureau record. |
| `00000000000` | Simulated failure | Simulates 503 upstream bureau outage. |

---

## 2. Sports Betting Demo (`ninja-bet`)

Built around a fictional sports betting platform to show operators how to block underage signups, prevent mule accounts, and authorize payouts with biometrics.

| Step | Player action | Ninja feature | API call |
|---|---|---|---|
| 1 · Sign up | Enters name, NIN, date of birth | NIN verify against the government record + 18+ check | `POST /api/identity/identify` |
| 2 · Bank account | Adds a bank account + BVN | BVN ownership check against the Step 1 player | `POST /api/identity/identify` |
| 3 · Withdraw | Must pass a face check before payout | **Flows**: create a flow, mint a hosted verification link, get the result | `POST /api/flows`, `POST /api/flows/:id/links`, `GET /api/verifications/:id` |

---

## Quick start

```bash
npm install
cp .env.example .env     # add your Ninja sandbox key + a webhook.site URL
npm run dev              # build + backend + ham proxy
```

Open **http://localhost:8082** (Sportsbook) or **http://localhost:8082/credit.html** (Credit & Lending).

| Command | What it does |
|---|---|
| `npm run dev` | Builds, starts the Node backend on `:8080` and `ham proxy` on `:8082` |
| `npm run dev -- python` | Same, with another backend: `python`, `go`, `rust` or `php` |
| `npm run build` | `ham build && rollup -c`, outputs the site to `public/` |
| `npm run serve` | Static preview on `:5671` |

Port 8080 taken by something else? Use another one:

```bash
API_PORT=8090 npm run dev            # macOS / Linux / Git Bash
$env:API_PORT=8090; npm run dev      # PowerShell
```

### Environment (`.env`)

| Variable | What it's for |
|---|---|
| `NINJA_API_BASE` | Ninja API base URL (defaults to `https://api.sandbox.ninja.boucloud.io`) |
| `NINJA_SANDBOX_SECRET_KEY` | Your `sk_sandbox_…` key. Server-side only, never sent to the browser |
| `NINJA_WEBHOOK_URL` | Your [webhook.site](https://webhook.site) inbox URL. Set on every flow the backend creates |

`.env` is git-ignored. Never commit it.

---

## Backends

Every backend implements the same 7 routes, reads the same `.env`, and needs no framework:

| Route | What it does |
|---|---|
| `POST /identity/identify` | Verifies a NIN or BVN against borrower/player details |
| `POST /credit/check` | Instant credit check: score (300–850), recommendation, reasons, loan summary |
| `POST /credit/history` | Deep bureau history: full profile, address history, loan accounts & schedules |
| `POST /flows` | Creates a hosted KYC flow |
| `POST /flows/:flowId/links` | Mints a single-use hosted verification link |
| `GET /verifications/:id` | Returns the session status and biometric outcome |
| `GET /webhook-events?verification_id=…` | Returns webhook deliveries for that verification from webhook.site |

| Language | File | Dependencies |
|---|---|---|
| Node.js | `backends/node/server.mjs` | none |
| Python | `backends/python/server.py` | none |
| Go | `backends/go/main.go` | none |
| Rust | `backends/rust/src/main.rs` | `tiny_http`, `ureq`, `serde_json` |
| PHP | `backends/php/server.php` | `curl` + `openssl` extensions |

---

## Deploying

The site deploys to Vercel:

1. `npm run build` locally
2. Commit `public/` together with your source changes
3. Push. Vercel serves `public/` as static files and runs the 7 routes as serverless functions from `api/`

Set `NINJA_API_BASE`, `NINJA_SANDBOX_SECRET_KEY` and `NINJA_WEBHOOK_URL` in the Vercel project settings.

---

## Project structure

```text
ninja-demo/
├── src/                        # Frontend source (compiled by HAM + Rollup)
│   ├── index.html              # Sportsbook demo page (ninja-bet)
│   ├── index.ts                # Sportsbook logic & telemetry
│   ├── index.css               # Sportsbook page styles
│   ├── credit.html             # Credit & lending demo page (ninja-credit)
│   ├── credit.ts               # Credit check, scoring & underwriting logic
│   ├── credit.css              # Credit score gauge, metrics, account timeline styles
│   ├── shared.css              # Design system: colours, navbar, dark theme, telemetry
│   ├── default.lhtml           # Sportsbook HAM layout shell
│   ├── credit.lhtml            # Credit demo HAM layout shell
│   ├── nav.phtml               # Sportsbook navigation partial with mode switcher
│   ├── credit-nav.phtml        # Credit demo navigation partial with mode switcher
│   ├── nav.ts                  # Sportsbook nav state controller
│   ├── credit-nav.ts           # Credit nav state controller
│   ├── assets/images/          # Logos & visual assets
│   └── lib/
│       ├── creditState.ts      # Credit demo state machine & sessionStorage
│       ├── creditSandbox.ts    # Official sandbox test fixtures & fallbacks
│       ├── state.ts            # Sportsbook demo state machine
│       ├── linkScenarios.ts    # Sportsbook Flow + link payloads
│       └── codeModal.ts        # Pre-flight code drawer
│
├── backends/                   # Local reference API servers (7 routes each)
│   ├── node/server.mjs
│   ├── python/server.py
│   ├── go/main.go
│   ├── rust/src/main.rs
│   └── php/server.php
│
├── api/                        # The same routes as Vercel serverless functions
│   ├── identity/identify.ts
│   ├── credit/check.ts
│   ├── credit/history.ts
│   ├── flows.ts
│   ├── flows/[flowId]/links.ts
│   ├── verifications/[id].ts
│   ├── webhook-events.ts
│   └── tsconfig.json
│
├── scripts/dev.mjs             # `npm run dev`: starts one backend + ham proxy
├── public/                     # Compiled production build output (committed for Vercel)
├── ham.json                    # HAM config
├── rollup.config.js            # TypeScript & asset bundler
└── vercel.json                 # Vercel configuration
```
