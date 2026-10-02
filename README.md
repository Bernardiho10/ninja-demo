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
├── scripts/dev.mjs                      # Starts one backend + ham proxy together (npm run dev)
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
| [`package.json`](package.json) | Package manifest & scripts | `"dev"`: build + backend + `ham proxy` (via `scripts/dev.mjs`), `"serve"`: static preview on :5671, `"build"`: `ham build && rollup -c` |
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

### Run It Locally (frontend + real API)
Copy `.env.example` to `.env` and fill in `NINJA_SANDBOX_SECRET_KEY` and `NINJA_WEBHOOK_URL`, then:

```bash
npm run dev            # builds, starts the Node backend on :8080 and `ham proxy` on :8082
npm run dev -- php     # same, but with another backend: python | go | rust | php
```
Open [http://localhost:8082](http://localhost:8082). Ctrl+C stops everything.

If port 8080 is already taken by something else, choose another backend port:
```bash
API_PORT=8090 npm run dev           # bash / macOS / Linux
$env:API_PORT=8090; npm run dev     # PowerShell
```

How it fits together: [`scripts/dev.mjs`](scripts/dev.mjs) starts one backend from `backends/` and [`ham proxy`](https://github.com/bougroup/ham). HAM serves the built site from `public/` and forwards every `/api/*` request to the backend, removing the `/api/` prefix on the way. That's why each backend's routes are `/flows`, `/flows/:flowId/links` and `/verifications/:id`. The backend adds `Authorization: Bearer $NINJA_SANDBOX_SECRET_KEY` and calls the Ninja sandbox. The secret key never reaches the browser.

To run the two pieces by hand instead, use two terminals: `node backends/node/server.mjs`, then `ham proxy`.

### Static Preview Only (no API)
```bash
npm run serve          # http://localhost:5671
```
This only serves files. Steps 1–2 still work because they run in simulation mode, but Step 3 (Create Flow / Generate Link) will fail with a 404 because nothing answers `/api/*`.

### Backend Reference Implementations (Same API, Every Language)
The frontend never changes — only which process you run on `:8080` changes. Each one in [`backends/`](backends) implements the exact same 3 routes, reads the same `.env`, and does the same thing: attach `Authorization: Bearer $NINJA_SANDBOX_SECRET_KEY` and relay the real Ninja sandbox's response byte-for-byte. Pick whichever matches the stack you're integrating into, or compare them side by side.

| Language | Path | Run | Dependencies | Verified against the real sandbox |
|---|---|---|---|---|
| Node.js | `backends/node/server.mjs` | `node backends/node/server.mjs` | none (stdlib `http`/`fetch`) | ✅ yes |
| Python | `backends/python/server.py` | `python backends/python/server.py` (or `py ...` on Windows) | none (stdlib `http.server`/`urllib`) | ✅ yes |
| Go | `backends/go/main.go` | `go run backends/go/main.go` | none (stdlib `net/http`) | ✅ yes |
| Rust | `backends/rust/src/main.rs` | `cargo run --manifest-path backends/rust/Cargo.toml` | `tiny_http`, `ureq` (both sync, no async runtime) | ✅ yes |
| PHP | `backends/php/server.php` | `npm run dev -- php`, or `php -S 0.0.0.0:8080 backends/php/server.php` | `curl` + `openssl` extensions. A fresh Windows PHP has these switched off, so add `-d extension_dir=ext -d extension=curl -d extension=openssl` (`npm run dev -- php` does this for you) | ✅ yes (PHP 8.5) |
| curl | shown in the in-app code inspector | — | — | not a backend — curl has no server mode, so it's illustrative snippets only (already in the UI's "cURL" tab), not a `backends/` folder |

All five share one contract, so switching languages only changes the word after `npm run dev --`. `ham proxy` and the frontend stay the same.

### Build for Production
```bash
npm run build
```
Compiles HTML templates, bundles TypeScript, copies CSS/images, and outputs the deployable bundle into [`public/`](public).
