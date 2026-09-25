# Ninja Identity API &mdash; Interactive Integration Guide

Interactive, client-side developer demonstration and integration guide for [Ninja](https://ninja.ng/)'s identity verification, BVN account matching, and biometric payout authorization APIs.

Runs 100% statically in the browser or deploys instantly to any static hosting provider (Vercel, GitHub Pages, Cloudflare Pages, Netlify). No backend servers, external databases, or API keys required.

---

## 🗺️ Codebase Map & Directory Structure

All source code resides strictly inside [`src/`](file:///C:/Users/Bernardiho/Desktop/projects/bougroup/ninja-demo/src) with zero scattered root folders. The build pipeline bundles source files into the standalone [`public/`](file:///C:/Users/Bernardiho/Desktop/projects/bougroup/ninja-demo/public) deployment directory.

```text
ninja-demo/
├── src/                                  # All source application files
│   ├── assets/images/                   # Brand logos and demo visual assets
│   ├── lib/                             # Core shared logic & simulation engines
│   │   ├── api.ts                       # Typed client SDK & offline simulation fallback
│   │   ├── apiExamples.ts               # Multi-language code generators (cURL, JS, Python, Go)
│   │   ├── codeModal.ts                 # Code-first slide-out drawer before API execution
│   │   ├── codeSnippet.ts               # Prism highlighting and snippet formatters
│   │   ├── linkScenarios.ts             # 3 verification link scenarios (Pre-filled, Blank, Custom)
│   │   ├── modal.ts                     # Accessible alert & feedback modals
│   │   ├── state.ts                     # Reactive browser state machine & localStorage persistence
│   │   └── tour.ts                      # Guided onboarding tour helpers
│   ├── default.lhtml                    # HTML layout shell with Google Fonts & global partials
│   ├── index.css                        # Page-level styling
│   ├── index.html                       # Main interactive 3-step developer workbench
│   ├── index.ts                         # Workbench event bindings, telemetry, and verification flow
│   ├── logo.phtml                       # Brand logo partial
│   ├── nav.phtml                        # Top navigation bar with live progress stepper
│   ├── nav.ts                           # Dynamic state-synchronized navbar controller
│   └── shared.css                       # Comprehensive design system, dark theme, and telemetry styles
├── scripts/
│   ├── build.js                         # Pure Node.js in-process HAM compiler & Rollup bundler
│   └── serve.js                         # Lightweight standalone HTTP server for local testing
├── public/                              # Git-ignored production build output (Vercel target)
├── .gitignore                           # Excludes node_modules, public/, and temporary files
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
| [`package.json`](file:///C:/Users/Bernardiho/Desktop/projects/bougroup/ninja-demo/package.json) | Package manifest & scripts | `"dev": "node scripts/serve.js"`, `"build": "node scripts/build.js"` |
| [`rollup.config.js`](file:///C:/Users/Bernardiho/Desktop/projects/bougroup/ninja-demo/rollup.config.js) | Asset bundler config | Compiles `src/*.ts` to ESM modules in `public/assets/js/`, copies CSS & images |
| [`tsconfig.json`](file:///C:/Users/Bernardiho/Desktop/projects/bougroup/ninja-demo/tsconfig.json) | TypeScript compiler config | Strict type-checking, ES2022 target, NodeNext module resolution |
| [`vercel.json`](file:///C:/Users/Bernardiho/Desktop/projects/bougroup/ninja-demo/vercel.json) | Vercel platform config | `buildCommand: "npm run build"`, `outputDirectory: "public"`, `cleanUrls: true` |

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
* **Multi-Language Code Inspector**: Live code snippets generated in **cURL**, **JavaScript**, **Python**, and **Go**.
* **Collapsible API Call & Response Log**:
  * Every API call is tied to its originating step (`[Step 1 · Signup]`, `[Step 2 · Bank Match]`, `[Step 3 · Verification Link]`, `[Webhook · Face Verified]`, `[Payout · Disburse]`).
  * **Click to drop down**: Click any log entry to expand and inspect both the full **Request Payload** and the full **Response Body** with duration and status code.

---

## 🚀 Quickstart & Development

### Prerequisites
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

### Build for Production
```bash
npm run build
```
Compiles HTML templates, bundles TypeScript, copies CSS/images, and outputs the deployable bundle into [`public/`](file:///C:/Users/Bernardiho/Desktop/projects/bougroup/ninja-demo/public).
