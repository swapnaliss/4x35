---
title: "M2-07 · CBPR+ generic and PMPG lint pack"
milestone: "M2 · Core Loop"
labels: ["backend"]
blocked_by: ["M2-06"]
estimate: "5h"
resources: []
needs: ["P-03", "P-11", "P-12"]
---

## Context
ADR 0009 lists "CBPR+ generic (public PMPG/FAQ material only)" as the base launch pack that every
bank pack extends. The PMPG Hybrid Grace Period Guide (Dec 2025) gives a "do not" list that is
directly codable as lint rules (placeholders, country in the town, the full address in the name,
duplication, line-length misuse), summarised in `docs/research/notes/kickoff-domain.md` §4–5 with
the guide evidence captured by M0-04 in `docs/evidence/`. Rubric: Potential Impact ("per-bank packs
with sources") and Innovation. Guide text is never copied; findings say "checked against
`cbpr-plus-generic@<version>`".

## Scope
1. Update the Kiro spec first: add a "CBPR+ generic pack" section to
   `.kiro/specs/rule-packs/{requirements.md (EARS), design.md, tasks.md}` in Kiro (one EARS requirement
   per rule, each citing its source), and log it in `docs/kiro-usage.md`. `design.md` names the
   properties **P-PACK-1**: every rule in the pack has a passing and a failing fixture, and evaluating the
   pack over its fixtures yields exactly the expected findings; and **P-PACK-2** (exact inheritance,
   used by bank packs).
2. Pack `packages/rulepacks/packs/cbpr-plus-generic/1.0.0.json`:
   - Sources: PMPG Grace Period Guide (Dec 2025), EPC153-22 v2.1, Betaalvereniging structured address
     page, Finance Finland ISO 20022 Payments Guide 2025, each with URL, document version, retrieval
     date and its `docs/evidence/` file.
   - `effective_from: "not_set"`; no `stated_dates` presented as current (Swift deferred the removal
     on 27 Aug 2026 and has not set a new date).
   - Message versions .03 and .09 with forms `structured` and `hybrid`; .12 `structured`, `hybrid`.
   - Rules: structured requires `TwnNm` and `Ctry` and forbids `AdrLine`; hybrid requires `TwnNm` and
     `Ctry`, allows at most 2 `AdrLine` of up to 70 characters, no structured value repeated in an
     `AdrLine`; fully unstructured addresses (more than 3 lines or lines over 35) flagged; placeholder
     values (`N/A`, `NA`, `NOTPROVIDED`, `UNKNOWN`, `-`, `.`, `999077` as a Hong Kong postcode) in any
     element; a country name in `TwnNm`; `TwnNm` equal to a postcode or street; a full postal address
     in the party name; an invalid ISO 3166 `Ctry`; characters outside the `cbpr-plus` charset.
   - Severity follows the source wording: a requirement the source states as mandatory or not allowed
     is `reject`; a "do not" practice recommendation is `warn`. The choice per rule is written in its
     `note` and in `design.md`.
3. Fixtures `packages/rulepacks/packs/cbpr-plus-generic/fixtures/*.json`: for every rule, at least one
   synthetic address that passes and one that fails, per relevant message version and form. Parties
   are fictional.
4. A pack test `packages/rulepacks/test/cbpr-plus-generic.test.ts` that runs P-PACK-1 and prints the
   label "checked against cbpr-plus-generic@1.0.0".
5. Shared test helpers for the bank packs, written here so M2-08 and M2-09 can run in parallel:
   `packages/rulepacks/test/helpers/pack-fixtures.ts` (P-PACK-1 over a pack's fixtures) and
   `packages/rulepacks/test/helpers/inheritance.ts` (**P-PACK-2**: a pack that `extends` another yields
   the parent's findings minus the rules it overrides plus its own, checked with fast-check).

## Out of scope
- Bank-specific rules (M2-08, M2-09). Rules from login-only material (Swift MyStandards CBPR+ usage
  guidelines): only public sources are encoded.
- Running the pack over files (M2-21).

## Acceptance Criteria
1. `.kiro/specs/rule-packs/` has the CBPR+ generic section with P-PACK-1 and P-PACK-2 named, and
   `docs/kiro-usage.md` has an entry.
2. `npm run packs:check -w packages/rulepacks` passes with the new pack, and every rule's `sourceRef`
   resolves to a source with a `docs/evidence/` file that exists.
3. P-PACK-1 passes: the fixture test yields exactly the expected findings for every fixture.
4. `effective_from` is `not_set` and a test asserts no pack file contains a date presented as the
   Swift cutover.
5. The wording guard from M2-06 passes, and a copied-text check passes: no `note` string of 12 or more
   words matches a sentence in the captured evidence text files (test reads `docs/evidence/*.txt`).
6. The P-PACK-2 helper passes against the test pack from M2-06 extended by a two-rule child pack.
7. A fixture with `TwnNm` "FRANCE" yields the `country-in-town` finding; a hybrid fixture with the
   postcode in both `PstCd` and `AdrLine` yields `no-duplication`; a name holding a full address yields
   `address-in-name`.

## Deliverables
- `.kiro/specs/rule-packs/` updated; entry in `docs/kiro-usage.md`
- `packages/rulepacks/packs/cbpr-plus-generic/1.0.0.json`
- `packages/rulepacks/packs/cbpr-plus-generic/fixtures/*.json`
- `packages/rulepacks/test/cbpr-plus-generic.test.ts`, `packages/rulepacks/test/no-copied-text.test.ts`
- `packages/rulepacks/test/helpers/{pack-fixtures,inheritance}.ts`

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
- **M2-08, M2-09** `extends: "cbpr-plus-generic@1.0.0"` and add only bank differences; they reuse
  `test/helpers/pack-fixtures.ts`, `test/helpers/inheritance.ts` and the copied-text test.
- **M2-16** shows these findings by rule and country; **M2-21** pre-flights against this pack when no
  bank is chosen.
- **M2-24** uses the PMPG failure patterns when generating the messy demo set.
