# ninja-bet

A working sportsbook demo showing Ninja's identity API stopping three real
fraud problems in Nigerian sports betting: underage signup, bonus-farming
via duplicate accounts, and payout beneficiary mismatch — plus optional
facial verification as a second identity signal. See [`tutor.md`](./tutor.md)
for the full walkthrough with real, captured sandbox responses.

## Structure

```
cmd/server/main.go     entrypoint — wires routes, env, DB, Ninja client
internal/api/          one file per feature area (register, bets, payouts,
                        face verification, profile, demo scenarios, admin)
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
`.env.example`. Listens on `:4100` by default.

**Frontend** (from `web/`):
```
npm install
npm run dev    # ham serve on :5671
```
Open `http://localhost:5671/` — it redirects to `/play.html` or
`/register.html` depending on login state (see web/README.md).

Both must be running for anything to work — the frontend calls the Go
API directly cross-origin (CORS + cookies), there's no proxy in front of
either in dev.
