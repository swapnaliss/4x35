---
title: "M0-07 · IaC and deploy: render.yaml blueprint, setup.sh, hello build live on Render Frankfurt"
milestone: "M0 · Recon & Bootstrap"
labels: ["infra", "critical", "blocker-risk"]
blocked_by: ["M0-05"]
estimate: "4h"
resources: ["DEPLOY"]
needs: []
---

## Context

The app must be testable by judges until 29 Jan 2027 (`PROJECT.md` §1, R4). ADR 0017 picks Render
Frankfurt (EU residency for personal data under GDPR, R5): one web service at 1 CPU / 2 GB ($25/mo)
plus Postgres 17 basic ($6/mo), about $32/mo, approved at Approval 2 (R9). ADR 0016 sets the
delivery shape: a `render.yaml` blueprint, migrations on deploy, one idempotent `scripts/setup.sh`,
deploy from main. The M0 gate requires "hello deployed", and M1-07 deploys the thin slice through
the same path.

## Scope

Claims **DEPLOY**: it creates the one Render service and the production Postgres.

1. `render.yaml` blueprint:
   - web service `4x35`, runtime `docker`, region `frankfurt`, the plan that gives 1 CPU / 2 GB,
     `healthCheckPath: /healthz`, auto-deploy from `main`, `preDeployCommand: npm run db:migrate
     --if-present` (the runner arrives with M0-06; both are proven together at M0-GATE), env
     `MODE=all`, `NODE_ENV=production`, `LOG_LEVEL=info`, `PORT` as Render sets it
   - database `4x35-db`: PostgreSQL 17, region `frankfurt`, basic plan; `DATABASE_URL` from the
     database's internal connection string
   - `SESSION_SECRET` and `CSRF_SECRET` with `generateValue: true`; `APP_BASE_URL`,
     `ANTHROPIC_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_DAILY_SPEND_CAP_USD`,
     `LLM_BATCH_TOKEN_CAP` and `BOOTSTRAP_ADMIN_EMAIL` declared with `sync: false` (values set by
     the owner in the Render dashboard, never in the file)
2. `scripts/setup.sh` (idempotent, safe to re-run): checks `render whoami` and `gh auth status`;
   validates the blueprint with the Render CLI (exact command verified in this ticket against the
   installed CLI version); applies or syncs the blueprint; prints service and database **IDs and the
   public URL only**, never an env value; exits non-zero with the missing owner step if the GitHub
   connection is absent. Writes IDs to `.dev-refs.md` (gitignored, IDs are not secrets).
   `scripts/setup.sh --status` changes nothing and prints one JSON object
   `{"url","region","plan","postgres_version","postgres_region","last_deploy":{"id","status","commit"}}`
   read from the Render CLI or API, so gates do not depend on the CLI's output shape.
3. First deploy of the M0-05 hello build from main; confirm region, plan and Postgres version from
   the CLI or API.
4. `docs/runbook.md`: deploy, roll back to the previous deploy (Render CLI or dashboard path),
   restore from the daily backup (RPO 24 h, RTO 4 h per R4; backup availability on the chosen plan
   verified and recorded), rotate `SESSION_SECRET`, and where the health check and logs are.
5. Record the monthly cost of the provisioned plans in `docs/budget.md` (actuals vs the approved
   $32/mo) and set a Render billing alert if the plan offers one (console path in the runbook).

## Out of scope

- Judge sandboxes and nightly reset (M3-09), the daily synthetic run (M3-09)
- Custom domain, object storage, a separate worker service (ADR 0017 triggers not met)
- Any product feature

## Acceptance Criteria

1. `render.yaml` declares exactly one web service and one Postgres database, both in `frankfurt`,
   with no secret value in the file (`check-no-secrets.sh` passes; every secret-bearing key uses
   `generateValue` or `sync: false`).
2. `scripts/setup.sh` run twice exits 0 both times and creates nothing on the second run.
3. `curl https://<service>.onrender.com/healthz` returns 200 with `status:"ok"` and the `commit` of
   main's HEAD.
4. The Render CLI or API shows the service region `frankfurt`, the 1 CPU / 2 GB plan, and Postgres
   major version 17.
5. A push to main triggers an auto-deploy that becomes live (deploy ID and status recorded).
6. A rollback to the previous deploy was performed once and the health check stayed 200 (deploy IDs
   recorded on the issue), then main's deploy restored.
7. `docs/runbook.md` covers deploy, rollback, backup restore, secret rotation, logs.
8. `docs/budget.md` shows the provisioned monthly cost and it is within the approved ceiling.

## Deliverables

- `render.yaml`, `scripts/setup.sh`
- `docs/runbook.md`, `docs/budget.md` (actuals section)
- `.dev-refs.md` updated with service and database IDs (gitignored)

## Validation Gate

```bash
./scripts/check-no-secrets.sh
grep -cE 'generateValue: true|sync: false' render.yaml
./scripts/setup.sh; echo "first exit $?"
./scripts/setup.sh; echo "second exit $? (expect 0, nothing created)"
./scripts/setup.sh --status | tee "$TMPDIR/render-status.json"
jq -e '.region=="frankfurt" and .postgres_region=="frankfurt" and (.postgres_version|tostring|startswith("17"))' "$TMPDIR/render-status.json"
APP_URL=$(jq -r .url "$TMPDIR/render-status.json")
curl -fsS "$APP_URL/healthz" | jq -e --arg c "$(git rev-parse --short origin/main)" '.status=="ok" and (.commit|startswith($c))'
test -s docs/runbook.md && grep -ciE 'rollback|restore|rotate' docs/runbook.md
```

## Handoff

- **M0-GATE**: the public URL and the `/healthz` contract; `preDeployCommand` runs
  `npm run db:migrate` once M0-06 has landed.
- **M1-07, M2-26, M3-08, M3-09**: claim DEPLOY; the deploy and rollback recipe in `docs/runbook.md`;
  service and database IDs in `.dev-refs.md`.
- **M1-05**: health check path and where Render logs are read.
- **M0-00 / owner**: env values to set in the Render dashboard (`APP_BASE_URL`,
  `BOOTSTRAP_ADMIN_EMAIL`, LLM settings) listed on the issue by key name only.
