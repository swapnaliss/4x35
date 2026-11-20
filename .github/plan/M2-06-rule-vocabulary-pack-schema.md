---
title: "M2-06 · Rule vocabulary, pack schema and per-version element map"
milestone: "M2 · Core Loop"
labels: ["backend", "critical"]
blocked_by: ["M1-GATE"]
estimate: "6h"
resources: []
needs: []
---

## Context
Pillar P3 (versioned rule packs) and ADR 0009: packs are JSON validated by a zod schema in
`packages/rulepacks`, with id, version, source URL, retrieved date, `effective_from` (date or
`not_set`), message versions and allowed forms, party scope, and rules that reference a fixed
vocabulary implemented once in core (DRY), severity `reject | strip | warn`. A per-message-version
element map (.03 PostalAddress6, .09 PostalAddress24, .12 PostalAddress27) decides where a value can
go. Results say "checked against `<pack>@<version>`", never that a bank will accept a file. Swift's
cutover date is not set and must never look imminent (PROJECT.md §1). R6: never truncate.

## Scope
1. Write the Kiro spec first: `.kiro/specs/rule-packs/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro, and log it in `docs/kiro-usage.md`. `design.md` names the properties: **P-RULE-1**
   evaluation is deterministic (same address, context and pack version → same findings, same order);
   **P-RULE-2** every finding names a rule present in the pack (or an inherited pack) and a vocabulary
   check; **P-RULE-3** the element map never outputs a value longer than its element's maximum and never
   shortens one (over-length is a finding); **P-RULE-4** .03 output never contains `BldgNm`, `Flr`,
   `PstBx`, `Room`, `TwnLctnNm` or `DstrctNm`; **P-RULE-5** hybrid output never has more than 2
   `AdrLine` and never repeats a structured value in an `AdrLine`.
2. Pack schema in `packages/rulepacks/schema.ts` (hot file): `id`, `version` (semver), `title`,
   `extends` (optional `<id>@<version>`), `sources[] {url, title, docVersion, retrieved, evidence}`
   (`evidence` points into `docs/evidence/`), `effective_from` (ISO date or `not_set`),
   `stated_dates[] {date, scope, sourceRef, status: confirmed | predates_deferral}`,
   `messageVersions {pain.001.001.03 | .09 | .12: {forms[], adrLineOverflow: bool}}`, `charset`
   (an id from the vocabulary), `rules[] {id, check, params, parties[], when?, severity, sourceRef,
   note}`. Rules carry no copied guide text: `note` is our own one-line paraphrase.
3. Vocabulary in `packages/core/src/rules/vocabulary/` (pure, one file per check), each with a
   message i18n key and params: `required-elements`, `forbidden-elements`, `max-adrline`,
   `min-adrline`, `adrline-length`, `no-duplication`, `max-length`, `charset`, `placeholder-value`,
   `country-in-town`, `town-is-postcode`, `address-in-name`, `country-code-valid`,
   `address-required-when`. `when` conditions: service level, cross-border (debtor country ≠ creditor
   country), party role, currency. Charsets as data with source: `cbpr-plus`, `sepa-latin`, `swift-x`.
4. Element map in `packages/core/src/rules/element-map.ts`: per version, the allowed elements and
   maximum lengths (from the XSD lengths in PROJECT.md §1 and `docs/research/notes/kickoff-domain.md`
   §4, including PostalAddress27's `CareOf` and `UnitNb` and its 140-character elements), and `place(fields, version, form, pack)` → `{elements, findings}`: a value for an element the
   version lacks goes to `AdrLine` in hybrid form only when the pack allows overflow and the line limit
   holds, otherwise it becomes the finding `element.unavailable_in_version`.
5. `evaluate(pack, version, party, address, context)` → `Finding[] {ruleId, check, severity,
   messageKey, params, element?}` and `checkedAgainst(pack)` → the label params for
   "checked against `<pack>@<version>`" (i18n key `rules.checked_against`).
6. Loader `packages/rulepacks/src/index.ts`: reads `packages/rulepacks/packs/<id>/<version>.json`,
   validates with the schema, resolves `extends`, rejects unknown checks, missing sources or a rule
   whose `sourceRef` does not resolve. `npm run packs:check -w packages/rulepacks` validates every pack.
7. A guard test over `packages/rulepacks/packs/**` and `apps/web/src/i18n/**`: no text matching
   "will be accepted", "will accept", "will reject", "will be rejected" or "guaranteed".
8. A test pack `packages/rulepacks/packs/_test/0.0.1.json` used only by tests.

## Out of scope
- Real packs (M2-07 generic + PMPG lint, M2-08, M2-09). Running packs over a payment file (M2-21).
- The Kiro hook that runs pack tests on save (M3-05).

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/rule-packs/` with P-RULE-1..5 named, and `docs/kiro-usage.md`
   has an entry.
2. P-RULE-1..5 pass as fast-check property tests (at least 500 runs each) over generated addresses,
   contexts and the test pack.
3. Each vocabulary check has unit tests with a passing and a failing case, and its message key exists
   in `apps/web/src/i18n/en/rules.json`.
4. The loader rejects, with a distinct error each: an unknown check, a rule without `sourceRef`, an
   `effective_from` that is neither a date nor `not_set`, a `stated_dates` entry without `status`, and
   an `extends` cycle.
5. `place` with a `DstrctNm` value for .03 hybrid with overflow allowed puts it in an `AdrLine`; with
   overflow not allowed, or for structured form, returns `element.unavailable_in_version`.
6. The wording guard test passes, and fails when a fixture string "the bank will accept" is added.
7. `npm run packs:check -w packages/rulepacks` exits 0 with the test pack.

## Deliverables
- `.kiro/specs/rule-packs/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `packages/rulepacks/schema.ts`, `packages/rulepacks/src/index.ts`, `packages/rulepacks/packs/_test/0.0.1.json`
- `packages/core/src/rules/vocabulary/*.ts`, `packages/core/src/rules/{element-map,evaluate,charsets,index}.ts` and tests
- `apps/web/src/i18n/en/rules.json`
- `packages/rulepacks/test/wording-guard.test.ts`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npx vitest run packages/core/src/rules
npx vitest run packages/rulepacks
npm run packs:check -w packages/rulepacks
npx tsc -b
npx biome check packages/core/src/rules packages/rulepacks
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-07, M2-08, M2-09** write packs against this schema; bank packs `extends` the generic pack.
- **M2-10** reads the pack `charset` to decide when transliteration transforms apply.
- **M2-15** uses findings severity; **M2-16** groups findings by `ruleId` and country.
- **M2-21** calls `evaluate` per party with the payment context from M2-03.
- **M2-22** calls `place` before `renderPostalAddress` (M2-03) and adds a test that the element map's
  elements and lengths agree with M2-03's `postal-address-order.ts` for each version (the two tickets
  run in parallel, so neither can test the other).
- **M2-24** uses the test pack only in tests, never in the demo.
