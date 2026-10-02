# Ninja Demo

An interactive demo of [Ninja](https://ninja.ng/)'s identity APIs, built around a fictional betting app called **ninja-bet**.

You walk through what a real player does: sign up, add a bank account, withdraw winnings. At each step you see the exact Ninja API call behind it, in cURL, JavaScript, Python, Go and Rust. The point is simple: show a developer how Ninja fits into their product, using real requests and real responses.

---

## What it does

| Step | Player action | Ninja feature | Real or simulated |
|---|---|---|---|
| 1 · Sign up | Enters name, NIN, date of birth | NIN lookup + legal-age check | Simulated in the browser |
| 2 · Bank account | Adds a bank account + BVN | BVN ownership match | Simulated in the browser |
| 3 · Withdraw | Must pass a face check before payout | **Flows**: create a flow, mint a hosted verification link, get the result | **Real**, against the Ninja sandbox |

In Step 3 you get a real link you can open on your phone. Do the face check, and the page shows:

- **Passed** or **Failed**, with match, face and liveness scores and a per-field match table
- **Why it failed**, in plain language, when it fails
- **The webhook Ninja sent** (`verification.completed`): delivery ID, signature, and the full JSON payload

Payout only unlocks on a pass.

Every call is recorded in the API log on the right, with request, response, status and timing.

---

## Built with HAM

The frontend is built with **[HAM (HTML As Modules)](https://github.com/bougroup/ham)**, our small HTML compiler and dev proxy. Check it out there.

HAM does two jobs here:

- **`ham build`** compiles `src/*.html` with its layout (`.lhtml`) and partials (`.phtml`) into plain HTML in `public/`.
- **`ham proxy`** serves `public/` on `:8082` and forwards every `/api/*` request to a backend, stripping the `/api/` prefix on the way.

You need `ham` on your `PATH` to build or run the project.

---

## Quick start

```bash
npm install
cp .env.example .env     # add your Ninja sandbox key + a webhook.site URL
npm run dev              # build + backend + ham proxy
```

Open **http://localhost:8082**. Ctrl+C stops everything.

| Command | What it does |
|---|---|
| `npm run dev` | Builds, starts the Node backend on `:8080` and `ham proxy` on `:8082` |
| `npm run dev -- python` | Same, with another backend: `python`, `go`, `rust` or `php` |
| `npm run build` | `ham build && rollup -c`, outputs the site to `public/` |
| `npm run serve` | Static preview on `:5671`. No backend, so Step 3 won't work |

Port 8080 taken by something else? Use another one:

```bash
API_PORT=8090 npm run dev            # macOS / Linux / Git Bash
$env:API_PORT=8090; npm run dev      # PowerShell
```

### Environment (`.env`)

| Variable | What it's for |
|---|---|
| `NINJA_API_BASE` | Ninja API base URL (defaults to the sandbox) |
| `NINJA_SANDBOX_SECRET_KEY` | Your `sk_sandbox_…` key. Server-side only, never sent to the browser |
| `NINJA_WEBHOOK_URL` | Your [webhook.site](https://webhook.site) inbox URL. Set on every flow the backend creates |

`.env` is git-ignored. Never commit it.

---

## How it works

Steps 1–2 are static, but Step 3 needs a server, for two reasons:

1. **The secret key.** Creating a flow needs `NINJA_SANDBOX_SECRET_KEY`. Anything shipped to a browser is public, so the key has to live on a server.
2. **The webhook.** When a verification finishes, Ninja POSTs `verification.completed` to a public URL. A browser can't receive that, and neither can a backend on `localhost`.

```
Browser ──/api/*──▶ ham proxy :8082 ──▶ backend :8080 ──(Bearer sk_…)──▶ Ninja sandbox
                         │                    │                              │
                         └─ serves public/    │                              │ verification.completed
                                              │                              ▼
                                              └──── reads it back ────── webhook.site inbox
```

The page polls two routes every few seconds. Whichever answers first decides pass or fail:

- `GET /api/verifications/:id` gets the session status from Ninja
- `GET /api/webhook-events?verification_id=…` gets the webhook delivery, read back from webhook.site

In production you'd point `NINJA_WEBHOOK_URL` at your own public server, verify the `X-Ninja-Signature` HMAC, and store the event. webhook.site stands in for that so the demo runs on a laptop.

---

## Backends

Every backend implements the same 4 routes, reads the same `.env`, and needs no framework. Pick the one that matches your stack, or read them side by side.

| Route | What it does |
|---|---|
| `POST /flows` | Creates a flow. Sets `webhook_url` from `NINJA_WEBHOOK_URL` |
| `POST /flows/:flowId/links` | Mints a single-use hosted verification link |
| `GET /verifications/:id` | Returns the session status and outcome |
| `GET /webhook-events?verification_id=…` | Returns the webhook deliveries for that verification |

| Language | File | Dependencies |
|---|---|---|
| Node.js | `backends/node/server.mjs` | none |
| Python | `backends/python/server.py` | none |
| Go | `backends/go/main.go` | none |
| Rust | `backends/rust/src/main.rs` | `tiny_http`, `ureq`, `serde_json` |
| PHP | `backends/php/server.php` | `curl` + `openssl` extensions |

**PHP on Windows:** a fresh install has these extensions turned off. `npm run dev -- php` turns them on for you. To run it by hand:

```bash
php -d extension_dir=ext -d extension=curl -d extension=openssl -S 0.0.0.0:8080 backends/php/server.php
```

---

## Deploying

The site deploys to Vercel (`vercel.json`). `public/` is served as static files, and the same 4 routes run as Vercel functions from `api/`. Set the three `.env` variables in the Vercel project settings.

---

## Project structure

```text
ninja-demo/
├── src/                        # Frontend source (compiled by HAM + Rollup)
│   ├── index.html              # The 3-step walkthrough page
│   ├── index.ts                # Step logic, live API calls, verification result, API log
│   ├── index.css               # Page styles
│   ├── shared.css              # Design system: colours, components, dark theme
│   ├── default.lhtml           # HAM layout: page shell, fonts, shared partials
│   ├── nav.phtml               # HAM partial: top bar with progress stepper
│   ├── nav.ts                  # Keeps the nav in sync with the current step
│   ├── logo.phtml              # HAM partial: brand logo
│   ├── assets/images/          # Logos
│   └── lib/
│       ├── api.ts              # Steps 1–2 client, with in-browser simulation fallback
│       ├── linkScenarios.ts    # Step 3 flow + link payloads and code snippets
│       ├── codeModal.ts        # "See the request first" drawer (cURL/JS/Python/Go/Rust)
│       └── state.ts            # Demo state, saved in sessionStorage
│
├── backends/                   # Local API servers, same 4 routes, pick one
│   ├── node/server.mjs
│   ├── python/server.py
│   ├── go/main.go
│   ├── rust/src/main.rs
│   └── php/server.php
│
├── api/                        # The same routes as Vercel functions (production)
│   ├── flows.ts
│   ├── flows/[flowId]/links.ts
│   ├── verifications/[id].ts
│   └── webhook-events.ts
│
├── scripts/dev.mjs             # `npm run dev`: starts one backend + ham proxy
├── public/                     # Build output (git-ignored)
├── ham.json                    # HAM config
├── rollup.config.js            # Bundles src/*.ts into public/assets/js/
├── tsconfig.json
├── vercel.json                 # Vercel build + output settings
├── .env.example                # Copy to .env
└── CNAME                       # Custom domain (demo.ninja.ng)
```

---

## Notes

- **Steps 1–2 are simulated.** `src/lib/api.ts` tries an old local API and, when it isn't there, generates realistic responses in the browser. They don't call Ninja yet.
- **Webhook not showing up?** Check that `NINJA_WEBHOOK_URL` in `.env` is the inbox you're watching. Flows created before the backend set `webhook_url` still deliver to their old URL, so hit **Reset** to create a fresh one.
- **`npx run dev` doesn't work.** It's `npm run dev`.
