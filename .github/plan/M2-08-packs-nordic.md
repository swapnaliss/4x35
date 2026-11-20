---
title: "M2-08 · Bank packs: Nordea, Danske Bank, Handelsbanken, SEB"
milestone: "M2 · Core Loop"
labels: ["backend"]
blocked_by: ["M2-07"]
estimate: "5h"
resources: []
needs: []
---

## Context
ADR 0009 launch packs include Nordea, Danske, Handelsbanken and SEB. Their public guides
(`docs/research/notes/kickoff-domain.md` §5, evidence captured by M0-04 in `docs/evidence/`) differ
from the CBPR+ generic pack in ways a payer needs to see before the bank does: Nordea forbids
unstructured addresses for ultimate parties cross-border; Danske needs at least one `AdrLine` in
hybrid and, for SEPA, removes a non-compliant address (a `strip`, not a `reject`) and lists per-market
RTGS dates; Handelsbanken makes the address mandatory per payment type; SEB accepts all three formats
until a new market date and requires structured town and country for every party. Rubric: Potential
Impact ("per-bank packs with sources"). Guide text is never copied.

## Scope
1. Write the Kiro spec first: `.kiro/specs/packs-nordic/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro (one EARS requirement per bank rule, citing its source section), and log it in
   `docs/kiro-usage.md`. `design.md` names **P-PACK-1** and **P-PACK-2** (exact inheritance), both
   from M2-07's spec, for each pack.
2. Packs, each `extends: "cbpr-plus-generic@1.0.0"` and containing only the differences:
   - `packages/rulepacks/packs/nordea/1.0.0.json`: MIG pain.001.001.09 v1.4 (2026-09-16) and its
     version description; .09 only; ultimate debtor/creditor unstructured not allowed cross-border;
     creditor `TwnNm` conditional as the MIG states.
   - `packages/rulepacks/packs/danske/1.0.0.json`: hybrid needs 1–2 `AdrLine`; SEPA non-compliant
     address → `strip`; countries where a beneficiary address is mandatory; per-market dates (Taiwan,
     Korea, Philippines, Malaysia) as `stated_dates` with scope and `status: confirmed`, page updated
     9 Oct 2026.
   - `packages/rulepacks/packs/handelsbanken/1.0.0.json`: address mandatory or optional per payment
     type (cross-border, SCT, ACH US, Fedwire US, SE/NO local, BACS, CHAPS, SDD) via
     `address-required-when`; if present, `TwnNm` + `Ctry`; end dates "to be decided" → `not_set`.
   - `packages/rulepacks/packs/seb/1.0.0.json`: structured `TwnNm` + `Ctry` for every party; the
     unstructured form still allowed (`warn`) until a revised market date.
   - Every pack: `effective_from: "not_set"` unless the bank's own current page confirms a date; a
     date in a guide that predates Swift's 27 Aug 2026 deferral is recorded with
     `status: predates_deferral`, never as `effective_from`.
3. Fixtures per pack in `packages/rulepacks/packs/<id>/fixtures/*.json` (synthetic, fictional
   parties): a passing and a failing case for every rule the pack adds or overrides.
4. Tests `packages/rulepacks/test/{nordea,danske,handelsbanken,seb}.test.ts` reusing M2-07's
   `test/helpers/pack-fixtures.ts`, `test/helpers/inheritance.ts` and the copied-text test.

## Out of scope
- Bank of Ireland, Standard Chartered, BNY and Wells Fargo (not launch packs per ADR 0009; log to
  `/backlog` if wanted). Continental banks (M2-09).
- Any claim that a file will be accepted; results are "checked against `<pack>@<version>`".

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/packs-nordic/` with P-PACK-1 and P-PACK-2 named, and
   `docs/kiro-usage.md` has an entry.
2. `npm run packs:check -w packages/rulepacks` passes; every `sourceRef` resolves to a source with
   URL, document version, retrieval date and an existing `docs/evidence/` file.
3. P-PACK-1 passes for all four packs; P-PACK-2 passes as a fast-check property test (at least 300
   runs per pack) over generated addresses and payment contexts.
4. A Danske SEPA fixture with a non-compliant creditor address yields a `strip` finding, not
   `reject`; a Danske hybrid fixture with no `AdrLine` yields `min-adrline`.
5. A Nordea cross-border fixture with an unstructured ultimate creditor yields `reject`; the same
   party on a domestic payment does not.
6. No pack has an `effective_from` date that came from a pre-deferral guide (test checks every
   `stated_dates` entry before 2026-08-27 has `status: predates_deferral`).
7. The wording guard and the copied-text test pass for all four packs.

## Deliverables
- `.kiro/specs/packs-nordic/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `packages/rulepacks/packs/{nordea,danske,handelsbanken,seb}/1.0.0.json` and their `fixtures/`
- `packages/rulepacks/test/{nordea,danske,handelsbanken,seb}.test.ts`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npm run packs:check -w packages/rulepacks
npx vitest run packages/rulepacks
npx tsc -b
npx biome check packages/rulepacks
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-21** pre-flights against these packs; it needs the payment context fields used in `when`
  conditions (service level, cross-border, party role, payment type), listed in `design.md`.
- **M2-05** shows the packs in its picker automatically.
- **M3-05** (`rulepack-author` agent) uses these packs as worked examples.
