# ninja-bet/web

[HAM](https://github.com/bougroup/ham) frontend — static hypermedia pages,
no client-side framework. See `apps/ninja-bet/tutor.md` Chapter 8 for the
full story of why and how this replaced an earlier React version.

## Structure

```
src/
  default.lhtml        shared layout — nav partial, shared.css, nav.js
  nav.phtml            shared nav bar (partial, embedded into the layout)
  nav.ts                populates the nav from GET /api/players/me
  shared.css            all styling — one file, no per-page overrides needed
  <page>.html            one static page per route (register, login, play,
  <page>.ts               profile, fraud-signals, inspector, index)
  <page>.css
  lib/
    api.ts              fetch wrapper — one function per Go handler
    apiExamples.ts       multi-language reference snippets (curl/JS/Python/Go) —
                          calls TO NINJA ONLY; no internal app-handler source is
                          ever shown, on purpose (see tutor.md Chapter 9)
    codeSnippet.ts       vanilla port of the old LanguageTabs component
    tour.ts              vanilla port of the guided-tour spotlight component
```

## Running it

```
npm install
npm run dev      # ham serve -p 5671
npm run build    # `ham build` + `rollup -c` → public/
```

The Go API (`apps/ninja-bet`, `go run ./cmd/server`) must be running on
`:4100` separately — this frontend calls it directly cross-origin via
`lib/api.ts`'s `API_BASE` constant, relying on the Go server's CORS
middleware, not a same-origin proxy. `API_BASE` is hardcoded for dev; a
production deploy that serves this frontend from the same Go process
would set it to `''`.

## Two real gotchas in HAM's own project scaffold

Hit both setting this up — worth knowing before starting another HAM
project from `ham init`:

1. `@rollup/plugin-typescript` pulls in **TypeScript 7** (a pre-release,
   API-incompatible major version) as an unpinned transitive dependency,
   and breaks on `Cannot read properties of undefined (reading
   'ES2015')`. Fix: pin `"typescript": "^5.6.0"` explicitly in
   `devDependencies`.
2. The same plugin needs `tslib` as a peer dependency the scaffold
   doesn't declare, failing with `Could not find module 'tslib'`. Fix:
   add it to `devDependencies` too.

Both are already fixed in this project's `package.json` — only relevant
if you're bootstrapping a fresh HAM app elsewhere.

## One more thing worth knowing

`ham serve` doesn't proxy API calls to a backend — that's a *separate*
command, `ham proxy` (env-var configured: `API_ENDPOINT`, `WEB_ROOT`,
`PROXY_PORT`, `API_PROXY_PREFIX`). It exists and works, but it strips the
matched prefix before forwarding (`/api/players/me` → backend sees
`/players/me`), which doesn't fit this app's routes (registered as
`/api/players/me` throughout). Rather than rename every backend route,
this app uses `ham serve` (no proxying) + an absolute `API_BASE` URL +
CORS instead. If you're starting a new HAM app and want `ham proxy` to
just work, register your backend's routes **without** the `/api` prefix
from the start.
