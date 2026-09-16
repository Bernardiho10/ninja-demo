# apps/

Each subfolder here is a standalone demo app showing Ninja's identity API
solving one real fraud problem in one Nigerian vertical. They share nothing
at runtime — each has its own database, its own frontend, its own port —
but they all import the same root-level `internal/ninja` client, so there's
one proven, tested integration with the Ninja sandbox underneath every app.

| App | Vertical | Status |
|---|---|---|
| [`ninja-bet`](./ninja-bet) | Sports betting — KYC-first signup, bonus-farming defense, payout re-verification, facial verification | Built |
| [`ninja-fintech`](./ninja-fintech) | Scored onboarding (per-field match, not pass/fail), tiered transfer limits, re-KYC lifecycle | Built |
| `ninja-bank` | KYB, bulk-identify for directors, agent networks | Not started |

## Conventions every app here follows

- **Layout**: `cmd/server/main.go` (entrypoint) + `internal/api` (HTTP
  handlers) + `internal/db` (SQLite schema and queries) + `web/` (frontend)
  + `tutor.md` (a running log of real, verified API behavior — not a spec
  written in advance; see any app's `tutor.md` for the pattern).
- **Frontend**: [HAM](https://github.com/bougroup/ham) — BOU Group's own
  hypermedia framework — not React or any other client-side framework.
  Static `.html` pages against a shared `.lhtml` layout, `.phtml` partials
  for shared chrome (nav, footer), plain TypeScript per page bundled with
  Rollup. See `ninja-bet/web/README.md` for the concrete setup, including
  two real dependency gotchas in HAM's own project scaffold worth knowing
  before starting a new app.
- **Backend and frontend are separate origins in dev** (Go API on one
  port, HAM's dev server on another), connected via CORS + cookies — not
  a reverse proxy. Each app's frontend `api.ts`-equivalent should say so
  explicitly in a comment, since it's not obvious from the code alone.
- **Every claim in a `tutor.md` must trace to a real request/response**
  captured from the sandbox or the app's own `api_logs` table — this is a
  hard rule carried over from `ninja-bet`, not a suggestion.
