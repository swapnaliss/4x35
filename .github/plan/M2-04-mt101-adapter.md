---
title: "M2-04 · MT101 adapter"
milestone: "M2 · Core Loop"
labels: ["backend"]
blocked_by: ["M1-GATE"]
estimate: "3h"
resources: []
needs: []
---

## Context
R1 includes MT101 (fields 50 and 59, 4 × 35 lines): the "dead technology" the product resurrects
(PROJECT.md, category Resurrection). Corporates still send MT101 to banks that take hybrid addresses
through the F options (ZKB fact sheet, `docs/research/notes/kickoff-domain.md` §5). Pillar P1 asks
for a round-trip in the same format, and R6 for immutable originals and no truncation.

## Scope
1. Write the Kiro spec first: `.kiro/specs/ingest-mt101/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro, and log it in `docs/kiro-usage.md`. `design.md` names the properties:
   **P-MT-1** bytes outside a replaced field are unchanged; **P-MT-2** re-emitting every field
   unchanged returns the original bytes; **P-MT-3** every emitted line is at most 35 characters and in
   the SWIFT X character set, or the write is refused with a finding.
2. Reader in `packages/formats/src/mt101/read.ts` (pure): split the message into blocks,
   sequence A and repeating sequence B; for fields `50a` (options C, F, G, H, L) and `59a` (no letter,
   A, F) produce a Record with location `{txIndex, tag, option, byteStart, byteEnd}`, the account
   (line starting `/`), name and address lines. Option F lines keep their `1/`, `2/`, `3/` codes so the
   structuring stage sees them as spans. Options without an address (C, G, L, 59A) produce no Record.
3. Writer in `.../mt101/write.ts`: `renderField59F(account, nameLines, fields)` and the matching 50F,
   building `1/` name, `2/` address and `3/` `CC/Town` lines from approved fields; it never shortens a
   value: a value that cannot fit 35-character lines is a finding (`mt101.value_too_long`) and the
   original field is kept. `spliceField(original, location, newText)` replaces only that field's bytes.
4. Characters outside the SWIFT X set in new values are a finding (`mt101.charset`), never replaced.
5. Upload route accepts MT101 as a `payment_file` batch through the existing ingest worker thread.
6. Synthetic fixtures in `fixtures/ingest/mt101/`: several transactions, each 50/59 option, CRLF,
   a 4 × 35 address with "C/O" and a PO box. All parties are fictional.

## Out of scope
- MT-to-MX conversion beyond addresses (PROJECT.md §9); fields other than 50a and 59a.
- MT101-specific bank pack rules (packs in M2-07..09 target pain.001).

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/ingest-mt101/` with P-MT-1..3 named, and `docs/kiro-usage.md`
   has an entry.
2. P-MT-1..3 pass as fast-check property tests (at least 500 runs each) over generated MT101 messages.
3. The reader returns the expected Records (tag, option, account, name, lines, byte range) for every
   fixture, and none for 50C, 50G, 50L and 59A.
4. A 59F built from fields with a 40-character street yields `mt101.value_too_long` and the output is
   identical to the input.
5. Uploading an MT101 fixture through the API creates the expected Records (integration test on the
   local Postgres).

## Deliverables
- `.kiro/specs/ingest-mt101/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `packages/formats/src/mt101/{read,write,charset,index}.ts` and tests
- `apps/server/test/integration/ingest-mt101.test.ts`
- `fixtures/ingest/mt101/*.txt`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
make up && make migrate
npx vitest run packages/formats/src/mt101
npx vitest run apps/server/test/integration/ingest-mt101.test.ts
npx tsc -b
npx biome check packages/formats/src/mt101
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-20** links MT101 parties by the account line and normalised name, like pain.001 parties.
- **M2-22** exports a corrected MT101 with `renderField59F`/`renderField50F` + `spliceField`, and
  surfaces `mt101.value_too_long` and `mt101.charset` findings in the audit report.
