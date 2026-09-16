# ninja-fintech/web

[HAM](https://github.com/bougroup/ham) frontend — static hypermedia
pages, no client-side framework. Same toolchain and conventions as
`apps/ninja-bet/web` (see that app's `README.md` for the two real HAM
scaffold gotchas — `typescript` pinning, `tslib` — already applied here
too).

## Structure

```
src/
  default.lhtml        shared layout — nav partial, shared.css, nav.js
  nav.phtml            shared nav bar (partial, embedded into the layout)
  nav.ts                highlights the active link — no session to fetch,
                        this is an ops console, not a per-user app
  shared.css            all styling — same variable names as ninja-bet's
                         (--red, --green, ...) with a blue palette, so
                         every component rule carries over unchanged
  <page>.html            one static page per route (onboard, dashboard,
  <page>.ts               inspector, index)
  <page>.css
  lib/
    api.ts              fetch wrapper — one function per Go handler;
                        Customer.fields is typed MatchField[] | null —
                        Ninja's real sandbox returns no per-field array
                        at all on a full mismatch, see tutor.md Ch.2
    apiExamples.ts       multi-language reference snippets — goExample()
                        here is NOT a copy of ninja-bet's: this app has
                        no lookup step, onboarding is verify-mode from
                        the first call
    codeSnippet.ts       vanilla port of the LanguageTabs component (copied
                        from ninja-bet, fully generic)
    modal.ts             error-modal component (copied from ninja-bet,
                        fully generic)
```

## Running it

```
npm install
npm run dev      # ham serve -p 5672
npm run build    # `ham build` + `rollup -c` → public/
```

The Go API (`apps/ninja-fintech`, `go run ./cmd/server`) must be running
on `:4200` separately — this frontend calls it directly cross-origin via
`lib/api.ts`'s `API_BASE` constant, relying on the Go server's CORS
middleware, not a same-origin proxy. `API_BASE` is hardcoded for dev; a
production deploy that serves this frontend from the same Go process
would set it to `''`.
