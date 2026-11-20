---
title: "M2-03 · pain.001 SAX reader and byte splice (.03/.09/.12), signature detection, property tests"
milestone: "M2 · Core Loop"
labels: ["backend", "security", "blocker-risk"]
blocked_by: ["M1-GATE"]
estimate: "8h"
resources: ["LOCK"]
needs: ["P-03", "P-11", "P-12"]
---

## Context
The core journey ends with the corrected payment file (steps 6 to 8), and R1 requires reading and
writing pain.001.001.03 and .09 and reading .12. ADR 0010 fixes the method: a position-reporting SAX
parser finds each `PstlAdr` element's byte range and the writer splices new address XML into those
ranges only, proven by a property test; `ds:Signature` is detected and the user is warned and offered
a new MsgId; XSD validation with `xmllint-wasm` (no network) against the XSDs fetched at build time
(M0-04); `<!DOCTYPE` is rejected (STRIDE: XXE). PROJECT.md §4 leaves the SAX parser to this ticket.
Rubric: Potential Impact and Technological Implementation.

## Scope
1. Write the Kiro spec first: `.kiro/specs/ingest-pain001/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro, and log it in `docs/kiro-usage.md`. `design.md` names the properties:
   **P-XML-1** for any splice set, bytes outside the spliced ranges are unchanged and in order;
   **P-XML-2** splicing each `PstlAdr` with its own original bytes returns the original file;
   **P-XML-3** the reader finds the same parties and ranges in the output of a splice as the writer
   reported (ranges shift only by the length deltas); **P-XML-4** any input containing `<!DOCTYPE`
   is rejected before any other parsing.
2. Choose the SAX parser: it must report positions that map exactly to byte offsets for UTF-8 input
   (character offsets are acceptable only with an exact, tested conversion), be maintained, carry an
   OSI licence and have no native code. Record the comparison and choice in `design.md`; the chosen
   package's version is verified on the npm registry in this ticket. Add `xmllint-wasm` 5.3.0 if M0-04
   did not. LOCK: two dependencies change `package-lock.json`.
3. Reader in `packages/formats/src/pain001/read.ts` (pure, no DB access): detect the message
   version from the namespace (`pain.001.001.03`, `.09`, `.12`; anything else is rejected); for each
   party with a `PstlAdr` (Dbtr, Cdtr, UltmtDbtr, UltmtCdtr, InitgPty, and agents' `PstlAdr` where
   present) produce a Record with location `{xpath, byteStart, byteEnd, pmtInfIndex, txIndex,
   partyRole}`, the party name, original lines (AdrLine values, plus any structured elements already
   present), the IBAN/account and the payment context (service level, currencies, debtor and creditor
   countries) needed by packs and linking. Declared encodings other than UTF-8 are rejected with a
   finding in this ticket.
4. Writer in `.../pain001/splice.ts`: `splice(original, edits[{byteStart, byteEnd, xml}])` and
   `renderPostalAddress(fields, version, {prefix, indent, eol})`, which emits elements in the XSD
   sequence order for that version, XML-escapes values, reuses the namespace prefix and indentation
   of the replaced element, and refuses (error, not truncation) any value longer than the XSD length
   or any element the version does not have. The XSD sequence order per version lives in
   `.../pain001/postal-address-order.ts`; M2-06's element map decides placement.
5. Signature: `detectSignature(bytes)` finds any `Signature` element in the
   `http://www.w3.org/2000/09/xmldsig#` namespace; it is re-derived from the immutable original at
   export time, so no column is added. `replaceMsgId(bytes, newMsgId)` splices `GrpHdr/MsgId` only.
6. XSD check: `validateXsd(bytes, version)` runs xmllint-wasm with no network access against the
   build-time XSD cache from M0-04.
7. Upload route accepts pain.001 as `payment_file` batches through the existing ingest worker thread.
8. Synthetic fixtures in `fixtures/ingest/pain001/` for .03, .09 and .12: default namespace and
   prefixed (`ns2:`), CRLF and LF, tabs and spaces, multiple PmtInf, a signed file, a DOCTYPE file,
   an XXE attempt, a non-UTF-8 declaration. All parties are fictional.

## Out of scope
- Pre-flight and deciding which edits to make (M2-21), linking (M2-20), the export endpoint (M2-22).
- Re-signing a signed file.
- Writing .12 files (R1: read only).

## Acceptance Criteria
1. The Kiro spec exists at `.kiro/specs/ingest-pain001/` with P-XML-1..4 named and the SAX parser
   comparison recorded, and `docs/kiro-usage.md` has an entry.
2. P-XML-1..3 pass as fast-check property tests (at least 500 runs each) over generated pain.001
   documents (random party counts, prefixes, whitespace, EOL, non-ASCII names) and random splice sets.
3. P-XML-4: the DOCTYPE and XXE fixtures are rejected with problem+json, and a test proves no entity
   is resolved and no network or file access is attempted.
4. The reader returns the expected parties, roles, XPaths and byte ranges for every fixture; slicing
   the original bytes at each reported range yields a string that starts with `<…PstlAdr` and ends with
   `</…PstlAdr>`.
5. Rendering a .03 address that contains `BldgNm`, `Flr`, `PstBx`, `Room`, `TwnLctnNm` or `DstrctNm`
   is refused with an error naming the element; a value one character over its XSD length is refused,
   never truncated.
6. For each of .03 and .09, a fixture with every `PstlAdr` replaced by a rendered structured address
   passes `validateXsd`; the unchanged .12 fixture passes `validateXsd` for .12.
7. The signed fixture is detected; `replaceMsgId` changes only the `MsgId` text bytes (P-XML-1 applied).
8. Uploading a .09 fixture through the API creates one Record per party with an address, with
   location and payment context stored (integration test on the local Postgres).

## Deliverables
- `.kiro/specs/ingest-pain001/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `apps/server/package.json`, `package-lock.json`
- `packages/formats/src/pain001/{read,splice,render,postal-address-order,signature,xsd,index}.ts` and tests
- `apps/server/test/integration/ingest-pain001.test.ts`
- `fixtures/ingest/pain001/*.xml`

## Validation Gate
```bash
cd "$(git rev-parse --show-toplevel)"
make up && make migrate
npm ls xmllint-wasm -w apps/server
npx vitest run packages/formats/src/pain001
npx vitest run apps/server/test/integration/ingest-pain001.test.ts
npx tsc -b
npx biome check packages/formats/src/pain001
./scripts/landing-checks.sh --fast
```

## Handoff
- **M2-22** cross-checks `postal-address-order.ts` against M2-06's element map (elements and lengths
  per version); the two tickets run in parallel.
- **M2-20** matches payment-file parties using the Record's IBAN/account, name and location.
- **M2-21** runs packs using the payment context stored on each Record.
- **M2-22** calls `renderPostalAddress` + `splice`, `validateXsd` on the result, and, when
  `detectSignature` is true, warns and offers `replaceMsgId`.
- Record the chosen SAX package and version in the PR handoff so M3-02 (MCP) can reuse the reader.
