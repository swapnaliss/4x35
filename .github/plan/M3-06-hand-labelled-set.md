---
title: "M3-06 · Hand-labelled set of at least 150 messy addresses (owner labels)"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["eval", "owner", "critical"]
blocked_by: ["M2-GATE"]
estimate: "6h"
resources: []
needs: []
---

## Context
The success metric (PROJECT.md §2) is led by a hand-labelled set of at least 150 messy addresses;
the synthetic set from M2-24 is reported apart because accuracy measured on data from the parser's own
templates is circular (ADR 0020). The owner labels; a worker drafts the candidate inputs and checks the
labels. Data policy (PROJECT.md §9.1): every record is synthetic, no real person's or company's
address. The labels are the ground truth M3-07 scores against and the README and video numbers rest on
(claims discipline).

## Scope
1. Write or update the Kiro spec `.kiro/specs/accuracy-eval/` (requirements in EARS, design, tasks;
   the dataset part) in Kiro and log the session in `docs/kiro-usage.md`. Name the property
   **P-GOLD-1**: every gold value is either empty or a value a human could read off the input lines
   (span, transform-table output, or a dataset value the labeller marks `dataset`), and fits its
   element limit for the target message version.
2. **Worker drafts candidates**: `evals/hand-labelled/scripts/draft-candidates.ts` writes at least 200
   candidate messy 4 × 35 inputs to `evals/hand-labelled/v1/candidates.csv`, built from **templates
   separate from the M2-24 generator** (separate file, separate author pass) and modelled on the PMPG
   error types (town in the street line, postcode glued to town, country name instead of code, district
   vs town in Japan, building names in India, mixed scripts, abbreviations, missing country). Fictional
   names and street numbers; town and postcode pairs are real places from GeoNames (place data, not
   personal data). Coverage: the 14 parser countries (JP, IN, CN, SG, HK, AE, BR, DE, GB, US, FR, NL, ES,
   IT) and at least 5 others, at least 6 inputs per parser country.
3. **Owner labels** in a spreadsheet exported from the candidates (`labelling-sheet.xlsx` in
   `$TMPDIR`, not committed): for each input, the expected element values for structured form and
   hybrid form, which fields must stay empty, and a `dataset`/`span` note. The owner may drop
   candidates; at least 150 must be labelled.
4. `evals/hand-labelled/scripts/import-labels.ts` converts the filled sheet to
   `evals/hand-labelled/v1/gold.jsonl` validated by a zod schema `evals/hand-labelled/schema.ts`.
5. **Worker review pass**: `evals/hand-labelled/scripts/check-gold.ts` flags over-length values, elements
   missing from pain.001.001.03 (element map, ADR 0009), hybrid violations (TwnNm + Ctry mandatory, ≤ 2
   AdrLine, no duplication), values not traceable to the input (P-GOLD-1), and duplicate inputs. The
   owner resolves each flag; the resolution log is `evals/hand-labelled/v1/review-log.md`.
6. `evals/hand-labelled/README.md`: how the set was made, who labelled it, the template separation, the
   per-country n table, and the licence (Apache-2.0 for our labels; GeoNames CC-BY 4.0 credited).

## Out of scope
- Scoring the structurer against the set and the accuracy page (M3-07)
- Any real supplier, employee or customer address

## Acceptance Criteria
1. `gold.jsonl` has at least 150 records, validates against the schema, and covers each of the 14
   parser countries with n ≥ 6 plus at least 5 other countries (printed by `check-gold.ts --stats`).
2. `check-gold.ts` reports zero open flags; `review-log.md` lists every flag raised and how the owner
   resolved it.
3. P-GOLD-1 passes for every record (a fast-check property over the set plus a direct check).
4. No candidate template is shared with the M2-24 generator: a test asserts no template string in
   `evals/hand-labelled/scripts/templates.ts` appears in `packages/synth/templates/*.ts`, and the drafting
   script does not import `packages/synth`.
5. A synthetic-data check passes: every party name comes from the drafting script's fictional word
   list (`evals/hand-labelled/scripts/fictional-names.ts`), and no record carries an email address, a
   phone number or an IBAN-shaped string.
6. The issue has the owner's comment confirming they labelled the set (owner action evidence).

## Deliverables
- `.kiro/specs/accuracy-eval/requirements.md`, `design.md`, `tasks.md` (dataset part); `docs/kiro-usage.md` entry
- `evals/hand-labelled/schema.ts`, `evals/hand-labelled/scripts/{draft-candidates,import-labels,check-gold}.ts`
- `evals/hand-labelled/v1/{candidates.csv,gold.jsonl,review-log.md}`, `evals/hand-labelled/README.md`
- `evals/hand-labelled/test/*.test.ts`

## Validation Gate
```bash
set -euo pipefail
npx tsx evals/hand-labelled/scripts/check-gold.ts evals/hand-labelled/v1/gold.jsonl --stats | tee "$TMPDIR/gold-stats.txt"
test "$(wc -l < evals/hand-labelled/v1/gold.jsonl)" -ge 150
grep -q 'open flags: 0' "$TMPDIR/gold-stats.txt"
npx vitest run evals/hand-labelled
grep -nE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' evals/hand-labelled/v1/gold.jsonl && exit 1 || true
./scripts/landing-checks.sh
```

## Handoff
- **M3-07 (accuracy page)**: the gold schema, the file path, the per-country n table and the version tag
  `v1`; any later relabelling becomes `v2`, never an in-place edit.
- **M3-11 (live LLM eval)**: may sample records from the set that the deterministic path cannot finish.
- **M4-01 / M4-03**: who labelled the set and how, in one sentence each.
