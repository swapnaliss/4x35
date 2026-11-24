# 4x35

**SWIFT's MT messages died. Their addresses didn't.**

4x35 turns the four 35-character free-text address lines in your supplier and employee records into
bank-valid ISO 20022 structured addresses. Every field comes with its reason, nothing is invented,
you approve every change, and your payment file is checked against your bank's published rules
before the bank can reject it.

> Built for Kiroween 2026 (category: Resurrection).

## Problem
_Placeholder, filled by M4-01: the bank notice, who suffers, evidence with sources._

## Solution
_Placeholder, filled by M4-01: upload → health report → review queue → link → pre-flight → export._

## Why now
_Placeholder, filled by M4-01: the cutover date being re-set, bank-level enforcement (sources)._

## Architecture
See [docs/architecture.md](docs/architecture.md) and the [ADRs](docs/adr/).
_Diagram placeholder, filled by M4-01._

## Accuracy
_Placeholder, filled by M3-07: per-field and per-country results with sample sizes._

## Demo
- App: _placeholder (M1-07)_. Judge credentials: in the Devpost submission (M3-09).
- Video: _placeholder (M4-03)_.

## How Kiro built it
_Placeholder, filled by M4-02: specs, steering, hooks, custom agent, MCP, property tests, power, Crew app._

## Future vision
_Placeholder, filled by M4-01._

## How to run

**Prerequisites:** Node.js 24 with npm 11 or later, Docker 29 or later with Compose v2, GNU make and git.

```bash
git clone https://github.com/swapnaliss/4x35.git && cd 4x35
npm ci
cp .env.example .env     # the owner fills it; the local stack below needs none of it
make up                  # Postgres 17 healthy, then migrations, then the seed
npm test                 # unit tests in every workspace
```

| Command | What it does |
|---|---|
| `make up` | Starts Postgres 17 (`127.0.0.1:5432`), waits until it is healthy, applies migrations, runs the seed |
| `make down` | Stops the stack and keeps the data |
| `make reset` | Deletes the stack and its volume, then `make up`: the clean state every gate starts from |
| `make migrate` / `make seed` | Applies pending migrations (a no-op when none are pending) / runs the idempotent seed |
| `make psql` / `make logs` | psql inside the container / the last Postgres log lines |

Integration tests run against the local stack. The Makefile uses a local-only connection string
when `DATABASE_URL` is unset (and refuses a non-local one unless `ALLOW_REMOTE_DATABASE=1`);
export the same one for the tests:

```bash
export DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
npm run test:integration
```

Several checkouts (git worktrees) can run at once: each directory gets its own containers and
volume, and `PORT_OFFSET=10 make up` moves Postgres to port 5442.

## Licence
Apache-2.0. Third-party data attribution: [NOTICE](NOTICE).
