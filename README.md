# Ninja Demo Suite

This repo is a set of small, real, working demo apps that each show
[Ninja](https://ninja.ng/)'s identity-verification API solving one
specific fraud or compliance problem — not slideware, actual working
software you can click through and break.

Every app calls Ninja's real sandbox API. Nothing about "identity
verified" or "payout blocked" in these demos is faked — it's the real
sandbox saying yes or no, live, every time.

## What is Ninja?

Ninja is an identity-verification API for Nigeria (and beyond). Given a
person's **NIN** (National Identity Number) or **BVN** (Bank Verification
Number — the number tied to a Nigerian bank account), it can:
- **look up** who that number belongs to (name, date of birth, photo),
- **verify** whether a name you were given actually matches that number,
- run a **hosted selfie + liveness check** — proving a real, live person
  is the one completing the check, not a photo or a stolen ID.

Every app in this repo is a demonstration of one industry using those
three capabilities to solve a real problem.

## Technology

- **Backend**: Go (`net/http`, SQLite) — one small service per app.
- **Frontend**: [HAM](https://github.com/bougroup/ham) — a lightweight
  hypermedia framework (plain HTML pages + partials + TypeScript, no
  React or any client-side framework). Chosen deliberately over a
  JS-framework frontend; see each app's own docs for why.
- **Identity provider**: [Ninja](https://ninja.ng/) sandbox API.

## The apps

### `apps/ninja-bet` — sports betting

**The problem**: Nigerian sports-betting platforms are a magnet for four
specific kinds of fraud — minors signing up, one person farming welcome
bonuses across many fake accounts, withdrawals sent to someone else's
bank account, and a stolen password being enough to drain a winning
balance.

**How Ninja solves it**: registration itself checks the player's real
age and identity against the NIN before an account is even usable — no
separate "verify later" step. Every withdrawal independently re-checks
the beneficiary name against the NIN *and* the destination bank
account's BVN, so a name typed correctly can't disguise money going to
someone else's account. A player can also turn on a facial-verification
requirement for withdrawals, with a strictness level they choose
themselves, so even a fully compromised password can't move real money
out without a live face matching the registry photo.

### `apps/ninja-fintech` — *planned*

**The problem**: fintechs onboarding customers need more than a yes/no
identity check — they need to know *how confident* a name match is (a
typo isn't the same risk as a completely different person), and they
need a way to re-verify an account later if it gets flagged.

**How Ninja solves it**: per-field match scoring instead of a blunt
pass/fail, and a re-KYC workflow for accounts that need a second look
after the fact.

### `apps/ninja-bank` — *planned*

**The problem**: banks and similar institutions need to verify not just
individual customers but entire businesses — the company itself, every
director behind it, and (for agent-banking networks) every agent
operating under the bank's name.

**How Ninja solves it**: hosted business verification (KYB), bulk
identity checks across every director in one call, and agent-network
verification that catches one stolen identity being reused behind many
terminals.

## Getting started

Each app is self-contained — its own Go server, its own frontend, its
own database. Start with whichever one exists already:

```
cd apps/ninja-bet
cat README.md
```

That walks through running the backend and frontend locally. See
[`apps/README.md`](apps/README.md) for the shared conventions every app
in this repo follows (folder layout, how the frontend and backend talk
to each other, what to copy when starting the next app).

## Repo layout

```
apps/
  README.md          the pattern every app follows
  ninja-bet/          sports betting — built
  ninja-fintech/       (planned)
  ninja-bank/          (planned)
internal/
  ninja/              the shared Go client every app imports — one proven
                       integration with Ninja's sandbox, used by all of them
```
