---
title: "M2-12 · Country parsers: JP, IN, CN, SG, HK, AE, BR"
milestone: "M2 · Core Loop"
labels: ["backend", "critical"]
blocked_by: ["M2-10"]
estimate: "8h"
resources: []
needs: []
---

## Context
ADR 0007 names per-country line parsers for JP, IN, CN, SG, HK, AE and BR first, because the
pain in PROJECT.md §2 is concentrated there ("Country quirks surface only in bank testing",
"Japan/Asia district vs town", Kyriba) and libpostal and deepparse are weak on Japan and India. The
storyboard expands a Japanese and an Indian address (0:55–1:35). The quirks per country are in
`docs/research/notes/kickoff-domain.md` §6 (UPU guides, chromium-i18n). R6: every value is a span or
a declared transform; nothing is invented or truncated; a field the parser cannot settle stays empty
for review. Rubric: Potential Impact, Innovation.

## Scope
1. Write the Kiro spec first: `.kiro/specs/parsers-asia-mideast-brazil/{requirements.md (EARS),
   design.md, tasks.md}` in Kiro, and log it in `docs/kiro-usage.md`. `design.md` holds, per country,
   the element mapping with its source (UPU guide, chromium-i18n `fmt`), and names the properties
   for every parser: **P-PAR-1** never invent (P-STR-1); **P-PAR-2** never truncate; **P-PAR-3**
   determinism; **P-PAR-4** robustness: any string of up to 4 × 35 characters in any script returns
   without throwing within 50 ms; **P-PAR-5** no input character is assigned to two elements;
   **P-PAR-6** where the source does not settle an element, the parser emits nothing for it.
2. Parsers in `packages/core/src/structuring/parsers/asia-mideast-brazil/{jp,in,cn,sg,hk,ae,br}.ts`,
   registered only in that folder's `index.ts` (created by M2-10). Each takes NFC lines and the
   chromium-i18n format and returns candidates with spans:
   - **JP**: Latin order (`4-3-2, Hakusan Bunkyo-ku, TOKYO 112-0001`): postcode `\d{3}-?\d{4}`, city
     → `TwnNm`, ward (`-ku`) → `DstrctNm`, prefecture → `CtrySubDvsn`, town area and chōme-ban-gō as
     the spec's mapping says (they are not a `BldgNb`). Kanji input: emit kanji spans and the postcode
     only; romanised values come from Japan Post in M2-11, never from this parser.
   - **IN**: PIN `\d{6}`, including city and PIN merged (`MUMBAI 400001`, `Mumbai-400001`); state
     names → `CtrySubDvsn`; landmarks (`Near …`, `Opp. …`) never go into `StrtNm`.
   - **CN**: Latin small-to-big order with `District` → `DstrctNm`; postcode `\d{6}`; Chinese-script
     input yields spans only (no pinyin transform exists).
   - **SG**: `SINGAPORE 123456`; `Blk`, `#05-12` → floor and unit per the spec's mapping.
   - **HK**: no postcode; `999077` never becomes `PstCd` and yields `parser.hk.placeholder_postcode`; districts and the three areas; Flat,
     Floor and building names.
   - **AE**: no postcodes; `P.O. Box` / `PO Box` → `PstBx`; emirate names.
   - **BR**: CEP `\d{5}-?\d{3}` (dash insertion only through the `postcode-format` transform);
     `CIDADE - UF` → `TwnNm` + `CtrySubDvsn`; `Rua …, 123` → `StrtNm` + `BldgNb`; bairro → `DstrctNm`.
3. Hand-written synthetic fixtures `fixtures/structuring/parsers/{jp,in,cn,sg,hk,ae,br}.jsonl`, at
   least 15 per country, each with input lines and expected fields, including messy MT-style cases
   (all caps, name and account mixed into the lines, `C/O`, wrong line breaks, the country missing)
   and at least 3 per country whose expected result is "field left empty". Parties are fictional.
   These fixtures are written independently of the M2-24 generator templates (ADR 0020: no circular
   accuracy).
4. A per-country fixture report: the test writes per-field exact-match counts with n per country to
   `$TMPDIR/parsers-asia-mideast-brazil.json` and prints it.

## Out of scope
- Europe and the US (M2-13). Dataset lookups (M2-11). The LLM fallback (M2-14). Element placement per
  message version (M2-06's element map does that downstream).
- Accuracy claims: the measured numbers go to the accuracy page in M3-07 only.

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/parsers-asia-mideast-brazil/` with the per-country mapping
   and P-PAR-1..6 named, and `docs/kiro-usage.md` has an entry.
2. P-PAR-1..6 pass as fast-check property tests for each of the seven parsers (at least 1,000 runs
   each for P-PAR-1 and P-PAR-2, at least 300 for the others).
3. Every fixture in `fixtures/structuring/parsers/{jp,in,cn,sg,hk,ae,br}.jsonl` produces exactly its
   expected fields, including the "left empty" cases.
4. `4-3-2, Hakusan Bunkyo-ku, TOKYO 112-0001` yields `TwnNm` `TOKYO`, `DstrctNm` `Bunkyo-ku` and
   `PstCd` `112-0001`, all `span`; a kanji-only JP fixture yields no Latin values.
5. An HK fixture with `999077` yields no `PstCd` and the parser finding `parser.hk.placeholder_postcode`
   (the pack-level `placeholder-value` rule from M2-07 also catches it downstream); an AE fixture
   with `PO BOX 12345 DUBAI` yields `PstBx` `12345` and no `PstCd`.
6. The per-country report file is written with n per country and is attached to the PR.
7. Only files under `parsers/asia-mideast-brazil/` and the fixture folder change in
   `packages/core/src/structuring/` (checked in the PR diff).

## Deliverables
- `.kiro/specs/parsers-asia-mideast-brazil/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `packages/core/src/structuring/parsers/asia-mideast-brazil/{jp,in,cn,sg,hk,ae,br,index}.ts` and tests
- `fixtures/structuring/parsers/{jp,in,cn,sg,hk,ae,br}.jsonl`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
npx vitest run packages/core/src/structuring/parsers/asia-mideast-brazil
test -s "$TMPDIR/parsers-asia-mideast-brazil.json" && cat "$TMPDIR/parsers-asia-mideast-brazil.json"
git diff --name-only origin/main -- packages/core/src/structuring | grep -v '^packages/core/src/structuring/parsers/asia-mideast-brazil/' && exit 1 || true
npx tsc -b
npx biome check packages/core/src/structuring/parsers/asia-mideast-brazil fixtures/structuring/parsers
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-15** gets parser candidates with spans and validator flags (postcode regex matched, country
  agreement) per field.
- **M2-24** writes its generator templates independently of these fixtures; **M3-06** measures
  these countries on the hand-labelled set.
- **M2-26 / storyboard**: name in the PR the JP and IN fixtures that show "a field left empty rather
  than guessed".
