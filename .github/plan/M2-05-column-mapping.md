---
title: "M2-05 · Column mapping API and UI"
milestone: "M2 · Core Loop"
labels: ["backend", "frontend"]
blocked_by: ["M2-01", "M2-02"]
estimate: "5h"
resources: []
needs: []
---

## Context
Core journey step 3: "Map columns (auto-detected), pick a bank pack and the target form (structured
or hybrid)". Without it a real ERP export with its own headers cannot be structured (Potential
Impact), and the screen is part of the storyboard scene 0:35–0:55 (Design). The batch's unique key
`(workspace, sha256, pack_id, pack_version, form)` makes a repeated upload idempotent (architecture
§2). API rules: ADR 0005 (zod-openapi, Idempotency-Key, problem+json); UI rules: ADR 0012 and
`docs/design/` from M1-06.

## Scope
1. Write the Kiro spec first: `.kiro/specs/column-mapping/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro, and log it in `docs/kiro-usage.md`. `design.md` names the properties: **P-MAP-1**
   detection is deterministic for the same headers and sample rows; **P-MAP-2** a confirmed map never
   assigns one source column to two target roles, except address-line roles that are ordered.
2. Detection in `apps/server/src/modules/ingest/mapping/detect.ts` (pure): target roles `name`,
   `addressLine1..4`, `street`, `buildingNumber`, `postcode`, `town`, `region`, `country`, `iban`,
   `account`, `ignore`. Signals: header names in English, German, French, Spanish, Dutch, Italian
   and Japanese (a closed alias table), value shapes from the first 50 rows (IBAN checksum, ISO
   country codes). Each suggestion carries a reason key for the UI.
3. API (zod-openapi, session + CSRF, workspace-scoped repositories, added to the authZ matrix test):
   - `GET /api/batches/{id}/mapping` → headers, sheet list (XLSX), 5 sample rows, suggestions with
     reasons, available packs from `packages/rulepacks` (id, version, allowed forms per message version).
   - `PUT /api/batches/{id}/mapping` with `Idempotency-Key`: column map, sheet, pack id + version,
     form. Validates P-MAP-2 and that the form is allowed by the pack. If another batch in the
     workspace already has the same `(sha256, pack, version, form)`, returns 409 problem+json with
     that batch's id. On success, in one transaction: stores the map, moves the batch to `parsing`,
     writes the event and enqueues the parse job (ADR 0006).
   - Only owners and reviewers of the workspace may call these; a batch in any state after
     `parsing` returns 409.
4. UI route `apps/web/src/routes/batches/$batchId/mapping.tsx` built to the M1-06 design spec: a
   table of source columns with sample values and a role select per column, suggestion reasons shown,
   pack and form pickers, a sheet picker for XLSX, a Confirm action. Empty, loading and error states;
   full keyboard use; all text via i18next keys in `apps/web/src/i18n/en/mapping.json`.
5. Pack picker text uses "checked against `<pack>@<version>`" wording and never says a bank will
   accept a file.

## Out of scope
- Saved mapping templates per workspace (log to `/backlog` if wanted).
- The health report screen (M2-16).

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/column-mapping/` with P-MAP-1..2 named, and
   `docs/kiro-usage.md` has an entry.
2. Detection returns the expected roles for every CSV and XLSX fixture from M2-01 and M2-02, including
   a German-header file and a file whose address is in four unnamed columns; P-MAP-1 and P-MAP-2 pass
   as fast-check property tests (at least 300 runs).
3. Integration tests on the local Postgres: a valid PUT moves the batch to `parsing` and enqueues
   exactly one job in the same transaction; replaying the same `Idempotency-Key` returns the same
   response without a second job; a duplicate `(sha256, pack, version, form)` returns 409 with the
   existing batch id; an invalid form for the pack returns 422 problem+json.
4. The authZ matrix test covers both endpoints: a user from another workspace gets 404, an
   unauthenticated call 401, a missing CSRF token 403.
5. Playwright e2e on the local stack: upload a CSV, accept the suggestions, pick a pack and form,
   confirm, and reach the batch status page using only the keyboard.
6. The screen shows designed empty (no columns), loading and error (API failure) states, verified in
   the Playwright run with screenshots in `.review/`.
7. An axe scan of the screen in the Playwright run reports no WCAG 2.2 AA violations (using
   `@axe-core/playwright`; if M1-06/M1-07 did not add it, its version is verified on the npm registry
   in this ticket).
8. No user-visible string is hard-coded: a test fails on literal JSX text in the route's files, and
   every key used exists in `mapping.json`.
9. `ui-reviewer` passes the screen against `docs/design/` (Phase 6b of `/start`).

## Deliverables
- `.kiro/specs/column-mapping/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `apps/server/src/modules/ingest/mapping/{detect,aliases,routes,index}.ts` and tests
- `apps/server/test/integration/mapping.test.ts`; authZ matrix entries
- `apps/web/src/routes/batches/$batchId/mapping.tsx` and components under `apps/web/src/features/mapping/`
- `apps/web/src/i18n/en/mapping.json`
- `e2e/column-mapping.spec.ts`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
make up && make migrate
npx vitest run apps/server/src/modules/ingest/mapping
npx vitest run apps/server/test/integration/mapping.test.ts
npx vitest run apps/server/test/integration/authz-matrix.test.ts
npx playwright test e2e/column-mapping.spec.ts
npx tsc -b
npx biome check apps/server/src/modules/ingest/mapping apps/web/src/features/mapping
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-16** (health report) is the screen the Confirm action leads to once structuring completes;
  it reads the pack id, version and form stored here.
- **M2-24** and **M2-26** drive this screen in the storyboard e2e; the stable `data-testid`s are
  `mapping-role-<column>`, `mapping-pack`, `mapping-form`, `mapping-confirm`.
- Packs added by M2-07..09 appear in the picker without UI changes.
