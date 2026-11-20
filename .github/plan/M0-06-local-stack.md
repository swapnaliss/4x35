---
title: "M0-06 · Local stack: make up/down/reset with Postgres 17, and the migrations runner"
milestone: "M0 · Recon & Bootstrap"
labels: ["infra"]
blocked_by: ["M0-05"]
estimate: "3h"
resources: ["LOCK", "SCHEMA"]
needs: ["P-02", "P-03"]
---

## Context

ADR 0016 and `docs/engineering-standards.md` §3.12 require a local stack that mirrors production
with one command (`make up` / `make down`), and R10 sets environment reset ≤ 2 min. ADR 0003 fixes
Postgres 17 with drizzle-kit migrations run on deploy; M0-07 calls the same runner before each
Render deploy, and every gate starts from "fresh `make up`, migrations, seed". Parallel workers from
`/start-milestone` each get a `PORT_OFFSET` from `scripts/waves.py`, so local stacks must not
collide.

## Scope

Claims **LOCK** (adds `drizzle-orm`, `drizzle-kit` and `pg` to `packages/db`) and **SCHEMA** (adds
the first migration and fixes the migration sequence).

1. `docker-compose.yml`: one service `postgres` (`postgres:17-alpine`), named volume, healthcheck
   (`pg_isready`), host port `5432 + ${PORT_OFFSET:-0}`, compose project name derived from the
   worktree directory so parallel worktrees get separate containers and volumes. The stack works
   without a `.env`: it uses local-only defaults (bound to `127.0.0.1`), and the Makefile derives a
   local `DATABASE_URL` only when the variable is unset. No real credential appears in any file.
2. `Makefile` targets: `up` (compose up `--wait`, then `migrate`, then `seed`), `down` (stop, keep
   data), `reset` (down with volumes, then `up`), `migrate`, `seed`, `psql` (opens psql in the
   container), `logs`. No target prints an environment value.
3. `packages/db`: `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `pg` 8.23.1 at exact versions;
   `drizzle.config.ts` (schema path `packages/db/src/schema/`, migrations in `drizzle/`);
   `src/client.ts` (pool from `DATABASE_URL`, statement timeout, pool size from env default);
   `src/migrate.ts` (drizzle migrator for node-postgres, exits non-zero on failure, logs migration
   names only); root scripts `db:migrate`, `db:generate`, `db:seed`.
4. First migration `drizzle/0000_baseline.sql`: `CREATE EXTENSION IF NOT EXISTS citext` and
   `pgcrypto` only (tables come in M1-02). `src/seed.ts` is an idempotent seed entry point that
   later tickets extend (M0-08 datasets, M2-24 demo set); in this ticket it connects, logs
   `seed: nothing to load`, and exits 0.
5. Integration test project in `vitest.workspace.ts` (`*.int.test.ts`): migrations applied twice
   leave the same `drizzle.__drizzle_migrations` count; extensions present. Uses `DATABASE_URL`
   from the environment and skips with a clear message when it is unset (never in CI).
6. CI: a job in `.github/workflows/ci.yml` with a `postgres:17` service container that runs
   `npm run db:migrate` and the integration tests.
7. `README.md` "How to run": prerequisites, `cp .env.example .env` (owner fills it), `make up`,
   `make reset`, `npm test`.

## Out of scope

- Any table (M1-02), dataset loading (M0-08, M2-11), demo data (M2-24)
- Deploying or running migrations on Render (M0-07 wires the same runner)

## Acceptance Criteria

1. `make reset` from nothing brings Postgres 17 up healthy, applies the baseline migration and runs
   the seed, in ≤ 2 min (timed, R10).
2. Running `make migrate` a second time applies nothing and exits 0.
3. `SELECT version()` reports PostgreSQL 17; `citext` and `pgcrypto` are installed.
4. Two stacks with `PORT_OFFSET=0` and `PORT_OFFSET=10` from two worktree directories run at the
   same time on different ports and volumes.
5. The integration tests pass locally and in the CI Postgres job.
6. No Make target or script prints an environment value (`make -n up` and the logs contain no
   `DATABASE_URL` value; `check-no-secrets.sh` passes).
7. `README.md` "How to run" works when followed verbatim on a clean clone.

## Deliverables

- `docker-compose.yml`, `Makefile`
- `packages/db/drizzle.config.ts`, `packages/db/src/{client,migrate,seed}.ts`,
  `packages/db/test/migrate.int.test.ts`
- `drizzle/0000_baseline.sql` (and drizzle-kit's `meta/` journal)
- `vitest.workspace.ts`, `.github/workflows/ci.yml`, `package.json` scripts, `README.md`

## Validation Gate

```bash
time make reset                                                         # <= 2 min
make migrate; echo "second migrate exit $?"
docker compose exec -T postgres psql -U postgres -tAc "select version()" | grep -q 'PostgreSQL 17' && echo pg17
docker compose exec -T postgres psql -U postgres -tAc "select extname from pg_extension order by 1"
npm run test -- --project integration
mkdir -p "$TMPDIR/wt2" && git worktree add "$TMPDIR/wt2/4x35-b" HEAD && (cd "$TMPDIR/wt2/4x35-b" && npm ci --silent && PORT_OFFSET=10 make up) && docker compose ls
(cd "$TMPDIR/wt2/4x35-b" && make down) && git worktree remove --force "$TMPDIR/wt2/4x35-b"
./scripts/landing-checks.sh
```

## Handoff

- **M1-02** (schema): drizzle config paths, the `drizzle/` sequence starting after `0000_baseline`,
  `client.ts` pool API; claim SCHEMA for every new migration.
- **M0-07** (deploy): `npm run db:migrate` is the pre-deploy command.
- **M0-08, M2-11, M2-24**: extend `packages/db/src/seed.ts`; keep it idempotent.
- **Every gate**: the clean-state recipe is `make reset`.
