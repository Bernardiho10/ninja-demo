# Ninja Identity API &mdash; Interactive Integration Guide

Interactive, client-side developer demonstration and integration guide for [Ninja](https://ninja.ng/)'s identity verification, BVN account matching, and biometric payout authorization APIs.

Built with [HAM](https://github.com/bougroup/ham). Steps 1–2 run statically in the browser. Step 3 (real Ninja Flows: create flow, mint link, poll status) needs a small backend from [`backends/`](backends/) that keeps your sandbox secret key off the browser. `ham proxy` serves the frontend and forwards `/api/*` to that backend.

---

## 🗺️ Codebase Map & Directory Structure

All source code resides strictly inside [`src/`](src) with zero scattered root folders. The build pipeline bundles source files into the standalone [`public/`](public) deployment directory.

```text
ninja-demo/
├── src/                                  # All source application files
│   ├── assets/images/                   # Brand logos and demo visual assets
│   ├── lib/                             # Core shared logic
│   │   ├── api.ts                       # Typed client for Steps 1–2 with in-browser simulation fallback
│   │   ├── codeModal.ts                 # Code-first slide-out (cURL, JS, Python, Go, Rust) before each live call
│   │   ├── linkScenarios.ts             # Flow + link payloads/snippets for the 3 scenarios (Pre-filled, Blank, Custom)
│   │   └── state.ts                     # Browser state machine & localStorage persistence
│   ├── default.lhtml                    # HTML layout shell with Google Fonts & global partials
│   ├── index.css                        # Page-level styling
│   ├── index.html                       # Main interactive 3-step developer workbench
│   ├── index.ts                         # Workbench event bindings, telemetry, and verification flow
│   ├── logo.phtml                       # Brand logo partial
│   ├── nav.phtml                        # Top navigation bar with live progress stepper
│   ├── nav.ts                           # Dynamic state-synchronized navbar controller
│   └── shared.css                       # Comprehensive design system, dark theme, and telemetry styles
├── backends/                            # Same 3 /api routes in Node, Python, Go, Rust, PHP
├── public/                              # Git-ignored production build output (Vercel target)
├── .gitignore                           # Excludes node_modules, public/, and temporary files
├── ham.json                             # HAM project config
├── CNAME                                # Custom domain configuration
├── package.json                         # Project metadata, dependencies, and NPM scripts
├── rollup.config.js                     # Rollup configuration for TypeScript & CSS bundling
├── tsconfig.json                        # TypeScript compiler options
└── vercel.json                          # Zero-config static deployment settings for Vercel
```

---

## ⚙️ Configuration Files Map

| File | Purpose | Key Settings |
| :--- | :--- | :--- |
| [`ham.json`](ham.json) | [HAM](https://github.com/bougroup/ham) project config | Compiles `src/*.html` + `.lhtml` layouts + `.phtml` partials into `public/`; `ham proxy` serves `public/` and forwards `/api/*` to a backend |
| [`package.json`](package.json) | Package manifest & scripts | `"build": "ham build && rollup -c"`, `"dev": "npx serve public -l 5671"` (static only) |
| [`rollup.config.js`](rollup.config.js) | Asset bundler config | Compiles `src/*.ts` to ESM modules in `public/assets/js/`, copies CSS & images |
| [`tsconfig.json`](tsconfig.json) | TypeScript compiler config | Strict type-checking, ES2022 target, NodeNext module resolution |
| [`vercel.json`](vercel.json) | Vercel platform config | `buildCommand: "npm run build"`, `outputDirectory: "public"`, `cleanUrls: true` |
| [`.env.example`](.env.example) | Backend config template | `NINJA_API_BASE`, `NINJA_SANDBOX_SECRET_KEY`, `NINJA_WEBHOOK_URL` — copy to `.env` (git-ignored) |

---

## 🎮 The Main Betting App Identity Journey

The application teaches developers and gaming operators how Ninja solves the three most critical identity challenges in sports betting and iGaming:

### 1. Registration: Fast Onboarding & 18+ NIN Verification
* **Endpoint**: `POST /api/identity/identify`
* **Why it matters**: Over 40% of prospective players drop off during slow, manual KYC. Ninja verifies government National Identity (NIN), legal age (18+), and exact name matching in under 1 second.
* **1-Click Test Scenarios**:
  * `✓ Valid Adult (James Bond · 49 yrs)` &mdash; 100% verification match and immediate approval.
  * `✗ Wrong Name (Chinedu Okafor)` &mdash; Identifies mismatched identity claims.
  * `✗ Under 18 (Tobi · 16 yrs)` &mdash; Blocks underage users to satisfy regulatory compliance (NLRC).

### 2. Bank Verification: Payout Route Protection (BVN Match)
* **Endpoint**: `POST /api/identity/identify`
* **Why it matters**: Fraudsters frequently win bets and attempt to cash out into a mule bank account. Ninja cross-checks the Bank Verification Number (BVN) directly with NIBSS to ensure the bank account belongs to the registered player.
* **1-Click Test Scenarios**:
  * `✓ Owner's Account (James Bond)` &mdash; Matching BVN, account safely bound to player.
  * `✗ Mule Account (Emeka Ugo)` &mdash; Third-party account rejected immediately, stopping payout redirection.

### 3. Payout Authorization: Biometric Verification Link
* **Endpoint**: `POST /api/flows/{flowId}/links`
* **Why it matters**: Passwords and SMS OTPs can be intercepted. Before releasing significant winnings, Ninja creates a single-use hosted verification link. The player completes a rapid live face check on any smartphone (no app installation needed), matched against their authoritative government photo.
* **3 Integration Cases Tested**:
  1. **Case 1: Pre-filled (Recommended for Best UX)** &mdash; First Name, Surname, and DOB are pre-populated. The customer skips manual typing and jumps straight to facial verification.
  2. **Case 2: Blank Form (Cold KYC)** &mdash; Unfilled link session where the user manually types their details on Ninja's portal before facial check.
  3. **Case 3: Custom Reference Tracking** &mdash; Binds internal ledger transaction IDs (`wtd_sec_wtd_01:tier_strict`) into `customer_ref` for instant webhook reconciliation.

---

## 📡 Live Telemetry & API Call Log

The right sidebar features an interactive Developer Telemetry Center:
* **Multi-Language Code Inspector**: Live code snippets generated in **cURL**, **JavaScript**, **Python**, **Go**, and **Rust**.
* **Collapsible API Call & Response Log**:
  * Every API call is tied to its originating step (`[Step 1 · Signup]`, `[Step 2 · Bank Match]`, `[Step 3 · Verification Link]`, `[Webhook · Face Verified]`, `[Payout · Disburse]`).
  * **Click to drop down**: Click any log entry to expand and inspect both the full **Request Payload** and the full **Response Body** with duration and status code.

---

## 🚀 Quickstart & Development

### Prerequisites
* [HAM](https://github.com/bougroup/ham) on your `PATH` (`ham build`, `ham proxy`)
* Node.js v18 or higher
* npm v9 or higher

### Install Dependencies
```bash
npm install
```

### Start Local Development Server
```bash
npm run dev
```
Open [http://localhost:5671](http://localhost:5671) in your browser. The server serves the compiled application with clean URLs and instant response.

**Note:** this serves static files only — there is no `/api/*` here, so anything that calls the real Ninja Flows API (Step 3: Create Flow / Generate Link) will 404. Use it for pure frontend/markup work.

### Start Local Development Server With the Real API
Step 3 (Create Flow / Generate Link / check verification status) calls a backend that holds `NINJA_SANDBOX_SECRET_KEY` server-side and talks to the real Ninja sandbox — a secret key can never go in the browser bundle. The frontend is backend-agnostic: it just calls `/api/flows`, `/api/flows/:id/links`, and `/api/verifications/:id` on its own origin and doesn't care what's answering.

Two pieces, two terminals, using [`ham`](https://github.com/bougroup/ham) (package.json / ham.json are not involved):

```bash
npm run build
node backends/node/server.mjs   # terminal 1 — any ONE backend from backends/, listens on :8080
ham proxy                       # terminal 2 — serves public/, proxies /api/ → :8080, on :8082
```
Open [http://localhost:8082](http://localhost:8082). Requires repo-root `.env` with `NINJA_API_BASE`, `NINJA_SANDBOX_SECRET_KEY`, and `NINJA_WEBHOOK_URL` set (not committed — copy `.env.example`).

`ham proxy` strips its `API_PROXY_PREFIX` (`/api/`) before forwarding, so every backend's routes are `/flows`, `/flows/:flowId/links`, `/verifications/:id` — not `/api/...`.

### Backend Reference Implementations (Same API, Every Language)
The frontend never changes — only which process you run on `:8080` changes. Each one in [`backends/`](backends) implements the exact same 3 routes, reads the same `.env`, and does the same thing: attach `Authorization: Bearer $NINJA_SANDBOX_SECRET_KEY` and relay the real Ninja sandbox's response byte-for-byte. Pick whichever matches the stack you're integrating into, or compare them side by side.

| Language | Path | Run | Dependencies | Verified against the real sandbox |
|---|---|---|---|---|
| Node.js | `backends/node/server.mjs` | `node backends/node/server.mjs` | none (stdlib `http`/`fetch`) | ✅ yes |
| Python | `backends/python/server.py` | `python backends/python/server.py` (or `py ...` on Windows) | none (stdlib `http.server`/`urllib`) | ✅ yes |
| Go | `backends/go/main.go` | `go run backends/go/main.go` | none (stdlib `net/http`) | ✅ yes |
| Rust | `backends/rust/src/main.rs` | `cargo run --manifest-path backends/rust/Cargo.toml` | `tiny_http`, `ureq` (both sync, no async runtime) | ✅ yes |
| PHP | `backends/php/server.php` | `php -S 0.0.0.0:8080 backends/php/server.php` | `curl` extension (standard, usually built in) | ⚠️ **not yet verified** — not run end-to-end against the sandbox yet. Test it before relying on it. |
| curl | shown in the in-app code inspector | — | — | not a backend — curl has no server mode, so it's illustrative snippets only (already in the UI's "cURL" tab), not a `backends/` folder |

All five share one contract, so switching languages is only ever step 1 of the two-terminal workflow above — `ham proxy` and the frontend don't change.

### Build for Production
```bash
npm run build
```
Compiles HTML templates, bundles TypeScript, copies CSS/images, and outputs the deployable bundle into [`public/`](public).
