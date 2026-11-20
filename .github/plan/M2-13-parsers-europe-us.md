---
title: "M2-13 · Country parsers: DE, GB, US, FR, NL, ES, IT"
milestone: "M2 · Core Loop"
labels: ["backend", "critical"]
blocked_by: ["M2-10"]
estimate: "8h"
resources: []
needs: ["P-03", "P-11", "P-12"]
---

## Context
ADR 0007 names per-country line parsers for DE, GB, US, FR, NL, ES and IT alongside the Asian
set. These cover the launch bank packs' home markets (Nordic and continental banks paying into the
EU, UK and US) and the German address in the storyboard (0:55–1:35). Quirks are in
`docs/research/notes/kickoff-domain.md` §6 and chromium-i18n. R6: every value is a span or a declared
transform; nothing is invented, expanded or truncated (`Str.` stays `Str.`). Rubric: Potential Impact.

## Scope
1. Write the Kiro spec first: `.kiro/specs/parsers-europe-us/{requirements.md (EARS), design.md,
   tasks.md}` in Kiro, and log it in `docs/kiro-usage.md`. `design.md` holds, per country, the
   element mapping with its source (UPU guide, chromium-i18n `fmt`), and names the same properties
   as M2-12 for every parser: **P-PAR-1** never invent; **P-PAR-2** never truncate; **P-PAR-3**
   determinism; **P-PAR-4** robustness (any 4 × 35 input returns without throwing within 50 ms);
   **P-PAR-5** no input character assigned to two elements; **P-PAR-6** unsettled elements are not
   emitted. Abbreviations are never expanded (expansion is not in the transform table).
2. Parsers in `packages/core/src/structuring/parsers/europe-us/{de,gb,us,fr,nl,es,it}.ts`,
   registered only in that folder's `index.ts` (created by M2-10):
   - **DE**: 5-digit PLZ before the town (a `D-`/`DE-` prefix removed only through the
     `postcode-format` transform); `Wacholderweg 52a` → `StrtNm` + `BldgNb` with the letter suffix;
     `Postfach` → `PstBx`; `Packstation` left for review.
   - **GB**: every postcode form (`AN NAA` … `AANA NAA`, `GIR 0AA`, BFPO); the post town before the
     postcode; number before the street; flat and building names; the county is optional.
   - **US**: `City, ST 12345` and ZIP+4 → `TwnNm`, `CtrySubDvsn`, `PstCd`; `Suite`, `Apt`, `#` units;
     `PO Box` → `PstBx`.
   - **FR**: 5-digit code before the town; `CEDEX` handled as the spec's mapping says; `BP` → `PstBx`;
     number before the street.
   - **NL**: `1234 AB` postcode; street then number with suffixes (`123-A`, `123 hs`).
   - **ES**: 5-digit code; `Calle Mayor, 5, 3º B` → street, number, floor and door per the mapping;
     province in parentheses.
   - **IT**: 5-digit CAP, town and two-letter province (`00184 ROMA RM`); `Via …` + number.
3. Hand-written synthetic fixtures `fixtures/structuring/parsers/{de,gb,us,fr,nl,es,it}.jsonl`, at
   least 15 per country, including MT-style mess (all caps, the name and account in the lines, `C/O`,
   wrong line breaks, the country missing) and at least 3 per country whose expected result is "field
   left empty". Parties are fictional. Written independently of the M2-24 generator templates.
4. A per-country fixture report written to `$TMPDIR/parsers-europe-us.json` with n per country.

## Out of scope
- JP, IN, CN, SG, HK, AE, BR (M2-12). Dataset lookups (M2-11). The LLM fallback (M2-14).
- Expanding abbreviations or correcting spelling (both would invent values).

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/parsers-europe-us/` with the per-country mapping and
   P-PAR-1..6 named, and `docs/kiro-usage.md` has an entry.
2. P-PAR-1..6 pass as fast-check property tests for each of the seven parsers (at least 1,000 runs
   each for P-PAR-1 and P-PAR-2, at least 300 for the others).
3. Every fixture in `fixtures/structuring/parsers/{de,gb,us,fr,nl,es,it}.jsonl` produces exactly its
   expected fields, including the "left empty" cases.
4. `WACHOLDERWEG 52A / D-10115 BERLIN` yields `StrtNm` `WACHOLDERWEG`, `BldgNb` `52A`, `TwnNm`
   `BERLIN` (`span`) and `PstCd` `10115` (`transform`, `postcode-format`).
5. `HAUPTSTR. 5` keeps `HAUPTSTR.` as the street value; a GB fixture with `GIR 0AA` and one with a
   BFPO number yield the expected `PstCd`.
6. The per-country report file is written with n per country and is attached to the PR.
7. Only files under `parsers/europe-us/` and the fixture folder change in
   `packages/core/src/structuring/` (checked in the PR diff).

## Deliverables
- `.kiro/specs/parsers-europe-us/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `packages/core/src/structuring/parsers/europe-us/{de,gb,us,fr,nl,es,it,index}.ts` and tests
- `fixtures/structuring/parsers/{de,gb,us,fr,nl,es,it}.jsonl`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npx vitest run packages/core/src/structuring/parsers/europe-us
test -s "$TMPDIR/parsers-europe-us.json" && cat "$TMPDIR/parsers-europe-us.json"
git diff --name-only origin/main -- packages/core/src/structuring | grep -v '^packages/core/src/structuring/parsers/europe-us/' && exit 1 || true
npx tsc -b
npx biome check packages/core/src/structuring/parsers/europe-us fixtures/structuring/parsers
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-15** gets parser candidates with spans and validator flags per field.
- **M2-24** writes its generator templates independently of these fixtures; **M3-06** measures these
  countries on the hand-labelled set.
- **M2-26 / storyboard**: name in the PR the German fixture used for the expanded-address scene.
