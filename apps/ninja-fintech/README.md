# ninja-fintech

An ops console showing Ninja's identity API doing the two things a
fintech actually needs beyond a yes/no check: a **per-field match score**
at onboarding (a typo isn't the same risk as a different person), and a
**re-KYC lifecycle** where a flagged account stays frozen for transfers,
at any amount, until it clears — separate from whatever daily limit its
tier grants. See [`tutor.md`](./tutor.md) for the full walkthrough with
real, captured sandbox responses.

## Structure

```
cmd/server/main.go     entrypoint — wires routes, env, DB, Ninja client
internal/api/          customers.go (onboard/list/re-kyc/upgrade-tier),
                        transfers.go (send/list), admin.go (call log)
internal/db/           SQLite schema + queries (schema.sql, db.go)
web/                   frontend — see web/README.md
tutor.md               real, verified API behavior — read this first
```

## Running it

**Backend** (from this directory):
```
go run ./cmd/server
```
Needs `NINJA_CLIENT_KEY`/`NINJA_CLIENT_SECRET` set — see the repo root's
`.env.example`. Listens on `:4200` by default.

**Frontend** (from `web/`):
```
npm install
npm run dev    # ham serve on :5672
```
Open `http://localhost:5672/` — it redirects straight to
`/dashboard.html`; there's no login here, this is an ops console, not a
per-user app.

Both must be running for anything to work — the frontend calls the Go
API directly cross-origin (CORS, no cookies needed since there's no
session), there's no proxy in front of either in dev.
