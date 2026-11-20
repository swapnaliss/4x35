---
title: "M2-09 · Bank packs: Deutsche Bank, BNP Paribas, ING, ZKB"
milestone: "M2 · Core Loop"
labels: ["backend"]
blocked_by: ["M2-07"]
estimate: "5h"
resources: []
needs: ["P-03", "P-11", "P-12"]
---

## Context
ADR 0009 launch packs include Deutsche Bank, BNP Paribas, ING and ZKB. Their public material
(`docs/research/notes/kickoff-domain.md` §5, evidence captured by M0-04 in `docs/evidence/`) adds
rules the generic pack does not have: Deutsche Bank wants the building number in its own element,
keeps .03 and .09 in use, and skips town/country validation for agents identified by BIC; BNP
Paribas lists when an address is mandatory and the countries that require a beneficiary address;
ING restricts `AdrLine` to two for some parties; ZKB states hybrid acceptance and a date that predates
Swift's 27 Aug 2026 deferral. Rubric: Potential Impact. Guide text is never copied.

## Scope
1. Write the Kiro spec first: `.kiro/specs/packs-continental/{requirements.md (EARS), design.md,
   tasks.md}` in Kiro (one EARS requirement per bank rule, citing its source section), and log it in
   `docs/kiro-usage.md`. `design.md` names **P-PACK-1** and **P-PACK-2**
   (exact inheritance), both from M2-07's spec, for each pack.
2. Packs, each `extends: "cbpr-plus-generic@1.0.0"` and containing only the differences:
   - `packages/rulepacks/packs/deutsche-bank/1.0.0.json`: .03 and .09; hybrid ≤ 2 `AdrLine`, town and
     country not repeated; building number in `BldgNb` (a `warn` when a number is left inside
     `StrtNm` or `AdrLine`); ultimate parties need town and country; no town/country check on agents
     with a BIC.
   - `packages/rulepacks/packs/bnp-paribas/1.0.0.json`: minimum `TwnNm` + `Ctry`; address mandatory
     for international, SCT/SCT Inst and SDD with a non-EEA debtor bank; the beneficiary-address
     country list. The July 2026 PDF predates the deferral: its dates are `predates_deferral`.
   - `packages/rulepacks/packs/ing/1.0.0.json`: SEPA Inst pain.001.001.09 format description (Aug 2025);
     `AdrLine` limited to 2 for the parties the guide names.
   - `packages/rulepacks/packs/zkb/1.0.0.json`: pain.001 hybrid accepted; the stated rejection date for
     unstructured addresses recorded with `status: predates_deferral`; `effective_from: "not_set"`.
   - Every pack: `effective_from: "not_set"` unless the bank's current page confirms a date.
3. Fixtures per pack in `packages/rulepacks/packs/<id>/fixtures/*.json` (synthetic, fictional
   parties): a passing and a failing case for every rule the pack adds or overrides.
4. Tests `packages/rulepacks/test/{deutsche-bank,bnp-paribas,ing,zkb}.test.ts` reusing M2-07's
   `test/helpers/pack-fixtures.ts`, `test/helpers/inheritance.ts` and the copied-text test.

## Out of scope
- ZKB's MT101 and QR-bill rules (packs target pain.001; log MT101 pack rules to `/backlog`).
- Nordic banks (M2-08). Any claim that a file will be accepted.

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/packs-continental/` with P-PACK-1 and P-PACK-2 named, and
   `docs/kiro-usage.md` has an entry.
2. `npm run packs:check -w packages/rulepacks` passes; every `sourceRef` resolves to a source with
   URL, document version, retrieval date and an existing `docs/evidence/` file.
3. P-PACK-1 passes for all four packs; P-PACK-2 passes as a fast-check property test (at least 300
   runs per pack).
4. A Deutsche Bank fixture with `StrtNm` "Wacholderweg 52a" and no `BldgNb` yields the building-number
   `warn`; an agent with a BIC and no town yields no town finding.
5. An ING fixture with 3 `AdrLine` on a named party yields `max-adrline`.
6. The ZKB and BNP Paribas packs have `effective_from: "not_set"`, and their guide dates appear only
   as `stated_dates` with `status: predates_deferral` (test).
7. The wording guard and the copied-text test pass for all four packs.

## Deliverables
- `.kiro/specs/packs-continental/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `packages/rulepacks/packs/{deutsche-bank,bnp-paribas,ing,zkb}/1.0.0.json` and their `fixtures/`
- `packages/rulepacks/test/{deutsche-bank,bnp-paribas,ing,zkb}.test.ts`

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
- **M2-21** pre-flights against these packs; the payment context fields used in `when` conditions
  (BIC presence on agents, debtor-bank EEA flag) are listed in `design.md`.
- **M2-24 / M2-26**: the storyboard's chosen bank pack (health report "412 would fail") is picked from
  M2-08 or this ticket; record which one fits the demo set best in the PR handoff.
