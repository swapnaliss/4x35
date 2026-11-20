---
title: "M1-07 · Thin slice: upload → parse → country-only → health report → export, deployed"
milestone: "M1 · Walking Skeleton"
labels: ["frontend", "backend", "critical", "blocker-risk"]
blocked_by: ["M1-03", "M1-04", "M1-06"]
estimate: "8h"
resources: ["DEPLOY", "LOCK"]
needs: []
---

## Context
The M1 gate is "thin slice runs on production from a clean state". This ticket proves the whole
architecture end to end on Render before M2 widens it: invite-only sign-in (ADR 0013), an upload
stored as immutable `bytea` (ADR 0003), a parse job and a structuring job through pg-boss (ADR 0006),
a Proposal built only through the provenance constructor (ADR 0008), a health report (core journey
step 4) and an export. Journey steps 1, 2, 4 and 8 in their thinnest honest form.

## Scope
1. Write the Kiro specs, thin-slice scope only, each marked "extended by M2": `.kiro/specs/ingest/`,
   `.kiro/specs/health-report/`, `.kiro/specs/export/` (`requirements.md` in EARS, `design.md`,
   `tasks.md`), with named properties `P-upload-dedup`, `P-original-bytes-unchanged`,
   `P-country-span-only`. Log them in `docs/kiro-usage.md`.
2. Upload: `POST /api/v1/workspaces/{id}/batches` (reviewer or owner; multipart; CSV in UTF-8 only
   for now, ≤ 10 MB). Stores the original bytes and sha256 in one transaction with the `BatchUploaded`
   event and the parse job (`enqueueInTx`). Same `(workspace, sha256, pack, form)` returns the
   existing batch (200), not a new one. Auto-detects the address columns by header names
   (`name`, `address1..4`, `country`); a file without them fails the batch with a reason.
3. Parse job: papaparse 5.7.1 → Records (location = row/column, original lines immutable, country
   hint from a country column if present). Batch `uploaded → parsing → parsed`, then fan-out of the
   structuring job in chunks of ≤ 200.
4. Country-only structuring in `packages/core/src/structuring/country.ts` (pure): proposes `Ctry`
   only when an input span is an ISO 3166-1 alpha-2/alpha-3 code or an English country name (from
   a list bundled in core, with source cited in a comment); `span` or `transform` (`case.upper`)
   provenance through `buildProposal`; no match → no value and the record is `needs_review`. Nothing
   else is proposed in M1.
5. Health report: `packages/core/src/rules/core-minimal.ts` with two structural checks, `ctry.missing`
   and `twnnm.missing` (hybrid form requires TwnNm and Ctry), published as `core-minimal@0.1.0`
   ("structural checks only; no bank rules"). The report shows totals, pass/fail by country and by
   check, and the header "checked against core-minimal@0.1.0". Batch moves to `ready_for_review`.
6. Status endpoint `GET /api/v1/workspaces/{id}/batches/{batchId}/status` serving `getBatchProgress`,
   polled by the UI every 2 s while active.
7. Export (`POST /api/v1/workspaces/{id}/batches/{batchId}/exports`): two artefacts stored in
   `exports` with sha256 and actor: (a) the original file unchanged, because no change has been
   approved yet (review arrives in M2); (b) a findings CSV, one row per record with location,
   findings and the proposed Ctry in a column headed "proposed (not approved)", every new cell
   escaped against formula injection by a core function `escapeCell`. Download via
   `GET .../exports/{exportId}`.
8. Web (built to `docs/design/screens/` with M1-06 components): sign-in, accept-invite, workspace
   home with upload, batch status (ProgressPanel), health report, export download. Every screen has
   empty, loading and error states, i18n keys, and keyboard paths.
9. Synthetic fixture `apps/server/test/fixtures/m1-slice-50.csv`: 50 fictional suppliers in
   12 countries, some with country codes, some with names, some with none. No real person's or
   company's data.
10. Deploy main to Render Frankfurt through the M0-07 pipeline, run migrations on deploy, and run
    `bootstrap:admin` once on production. DEPLOY: this ticket deploys and migrates production.
    LOCK: it adds papaparse and the TanStack Router/Query packages.
11. Playwright e2e `apps/web/e2e/thin-slice.spec.ts`, runnable against local and against
    `APP_BASE_URL`, signing in with `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` (a synthetic owner account
    in a dedicated workspace).

## Out of scope
- XLSX, pain.001, MT101, encodings other than UTF-8, column-mapping UI (M2-01 to M2-05).
- Rule packs and their schema (M2-06 moves `core-minimal` under the pack schema); town, street or
  postcode structuring (M2-10 onward); review and approval (M2-17/M2-18); corrected-file export (M2-22).
- Rate limits, upload hardening and audit writes (M1-08).

## Acceptance Criteria
1. Locally (`make up`, migrate, seed), the Playwright slice test passes: sign in → upload
   `m1-slice-50.csv` → status reaches `ready_for_review` → the health report shows 50 records, the
   per-country counts and "checked against core-minimal@0.1.0" → export → both artefacts download.
2. `P-original-bytes-unchanged`: the exported original artefact's sha256 equals the upload's sha256
   (asserted in the integration test and the e2e).
3. `P-upload-dedup`: uploading the same file twice returns the same batch id and creates one set of
   records (integration test).
4. `P-country-span-only` (fast-check, ≥ 1,000 runs): every proposed `Ctry` traces to a span of the
   NFC input through `span` or `case.upper`; a record with no country span has no `Ctry` proposal.
5. The findings CSV escapes any cell starting with `=`, `+`, `-`, `@`, tab or carriage return
   (property test on `escapeCell`), and contains no value in a column other than "proposed (not approved)"
   that is not from the original row.
6. Rolling back the upload transaction (forced failure after insert) leaves no batch and no job.
7. Screens show their empty state (no batches), loading state (job running) and error state (a CSV
   without address columns fails with a readable reason); all are reachable by keyboard; Playwright +
   axe at 375/768/1440 reports zero serious or critical violations; the `ui-reviewer` agent returns PASS.
8. Every new route is classified in the authZ matrix and the matrix test passes.
9. Live proof: after deploy, the same Playwright slice test passes against `APP_BASE_URL`
   (production), and `GET /readyz` there returns 200.
10. `.kiro/specs/{ingest,health-report,export}/` exist and `docs/kiro-usage.md` has an entry.

## Deliverables
- `.kiro/specs/{ingest,health-report,export}/{requirements,design,tasks}.md`; `docs/kiro-usage.md` entry
- `packages/core/src/structuring/country.ts`, `packages/core/src/rules/core-minimal.ts`,
  `packages/core/src/export/escape-cell.ts` (+ property tests)
- `apps/server/src/ingest/{routes,parse-csv.job}.ts`, `apps/server/src/structuring/country.job.ts`,
  `apps/server/src/report/{routes,build}.ts`, `apps/server/src/export/{routes,build}.ts`,
  `apps/server/src/batches/status.ts`
- `apps/web/src/routes/{sign-in,accept-invite,workspace,batch-status,health-report}.tsx`, `en.json` keys
- `apps/server/test/fixtures/m1-slice-50.csv`, `apps/server/test/slice.int.test.ts`,
  `apps/web/e2e/thin-slice.spec.ts`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm ci
make down && make up && npm run db:migrate && npm run db:seed
npm run test -w packages/core
npm run test:integration -w apps/server -- --reporter=verbose slice authz | tee "$TMPDIR/m1-07-int.log"
for p in P-upload-dedup P-original-bytes-unchanged P-country-span-only; do
  grep -q "$p" "$TMPDIR/m1-07-int.log" || grep -rq "$p" packages/core/test || { echo "missing $p"; exit 1; }
done
npx playwright test -c apps/web/playwright.config.ts thin-slice --output "$TMPDIR/m1-07-local"
./scripts/landing-checks.sh
# live proof after the deploy of main (DEPLOY held)
curl -fsS "$APP_BASE_URL/readyz"
E2E_BASE_URL="$APP_BASE_URL" npx playwright test -c apps/web/playwright.config.ts thin-slice --output "$TMPDIR/m1-07-prod"
```

## Handoff
- M1-08 hardens this upload path (limits, worker thread, sniffing), rate-limits it and adds audit
  events to upload and export.
- M1-GATE re-runs the slice from a clean state and on production.
- M2-01 replaces the UTF-8-only parse with the encoding round-trip; M2-05 replaces header
  auto-detection with mapping; M2-06 turns `core-minimal@0.1.0` into a schema-validated pack;
  M2-16 extends the health report screen; M2-22 replaces the export with corrected artefacts.
