# Ninja Identity API &mdash; Interactive Demo Suite

Interactive, client-side developer demonstrations of [Ninja](https://ninja.ng/)'s identity-verification, name-matching, and KYC APIs.

No external databases, servers, or credentials required — runs 100% statically in the browser using `localStorage` for state and Ninja's sandbox API.

## Demos

### 1. Sportsbook KYC & Payout Protection (Root `/`)
Demonstrates how sports betting and iGaming platforms protect against fraud and underage gambling:
- **Step 1: Sign Up** &mdash; Real-time NIN/BVN identity resolution and age verification.
- **Step 2: Add Bank** &mdash; Automated beneficiary account validation.
- **Step 3: Withdraw** &mdash; Account name matching against destination account BVN to stop payout theft.

### 2. Digital Banking KYC & Tiered Limits (`/fintech/`)
Demonstrates digital bank customer onboarding, scored name matching, and account tier limits:
- **1-Click Test Scenarios**: Exact Match, Minor Typo, and Fraud Mismatch.
- **Customer Directory & Tier Limits**: Tier 1 (₦50K), Tier 2 (₦500K), Tier 3 (₦5M).
- **Flagging & Re-KYC**: Real-time account hold upon name discrepancies with self-service resolution.
- **API Call Inspector**: Real-time request/response viewer with cURL, TypeScript, and Go code snippets.
