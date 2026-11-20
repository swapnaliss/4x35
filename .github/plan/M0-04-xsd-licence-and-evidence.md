---
title: "M0-04 · ISO 20022 XSD licence and build-time fetch; bank guide and domain-fact evidence capture"
milestone: "M0 · Recon & Bootstrap"
labels: ["recon", "docs"]
blocked_by: ["M0-00"]
estimate: "3h"
resources: []
needs: []
---

## Context

ADR 0010 validates pain.001 files with `xmllint-wasm` against the ISO 20022 XSDs, and ADR 0021
commits them only if their licence allows. The licence is unverified (iso20022.org returned 403 to
the kickoff fetch). Third-party IP used outside its licence is a disqualifier (`PROJECT.md` §1), so
the default is to fetch the XSDs at build time into `schemas/xsd/` (already gitignored) and verify
them by hash.

Every domain fact in `PROJECT.md` §1 and the pain table in §2 says its source is in
`docs/evidence/`, filled by this ticket. ADR 0009 rule packs cite source URL, retrieval date and
`effective_from` (date or `not_set`); M2-07, M2-08 and M2-09 need those sources pinned. Bank guide
text is never copied: rules are encoded, sources are cited. Swift's cutover date is never presented
as imminent.

## Scope

1. **XSD licence**: find the terms that govern the ISO 20022 message schemas (iso20022.org terms of
   use, catalogue page, any licence statement inside the XSD files) for pain.001.001.03, .09 and
   .12. Record the exact wording location (URL, section), retrieval date and a decision in
   `docs/evidence/xsd-licence.md`: commit, or fetch at build time. If unclear, fetch at build time.
2. **Fetch script** `scripts/fetch-xsd.sh`: idempotent; downloads the three XSDs into `schemas/xsd/`
   from the pinned URLs in `schemas/xsd.lock.json` (`{file, url, sha256, retrieved}`), skips files
   whose hash already matches, fails non-zero on a hash mismatch, a non-200 response or a 30 s
   timeout. The lock path can be overridden with the `XSD_LOCK` shell variable (for the tamper
   test only). No other network use. If the licence allows committing, the files are committed and
   the script only verifies hashes.
3. **Smoke validation**: in a scratch directory under `$TMPDIR`, install `xmllint-wasm` 5.3.0 and
   validate one hand-written **synthetic** pain.001.001.09 file (one payment, a structured creditor
   address) against the fetched XSD; also confirm a file with an over-length `TwnNm` (36 chars)
   fails. Keep the synthetic file as `fixtures/xml/pain.001.001.09-min.xml` and the check as
   `scripts/recon/xsd-smoke.mjs <scratch-install-dir> <xsd> <xml> [--overlength-twnnm]`, which
   resolves `xmllint-wasm` from the scratch install (so `package-lock.json` is untouched) and prints
   `valid true` or `valid false`.
4. **Evidence index** `docs/evidence/sources.json`: one entry per source with `id`, `url`, `title`,
   `publisher`, `retrieved`, `sha256` of the downloaded document, `reproduction` (terms on copying,
   for example Bank of Ireland's no-reproduction note), `supports` (which `PROJECT.md` fact or which
   pack), and for bank guides `message_versions`, `forms` (structured/hybrid) and `effective_from`
   as stated, or `not_set`. Downloaded documents go to `data/raw/evidence/` (gitignored); they are
   never committed.
5. Cover: Swift's 27 Aug 2026 deferral notice and the market dates (Taiwan, Korea, Philippines,
   Malaysia); the PostalAddress24 element lengths and the PostalAddress6 gaps; the hybrid-address
   rule; the PMPG error list (Dec 2025); the pain quotes in `PROJECT.md` §2 (IFS Community, Kyriba);
   and the launch pack guides from ADR 0009 (CBPR+ generic public material, Nordea, Danske,
   Handelsbanken, SEB, Deutsche Bank, BNP Paribas, ING, ZKB).
6. `docs/evidence/README.md`: how to read the index, the rule that guide text is never copied, and
   the date wording rule ("deferred; new date not set" style, never "imminent").
7. Correct `PROJECT.md` §1 if a source contradicts it (same change).

## Out of scope

- Encoding any pack rules (M2-06 to M2-09)
- The SAX parser and byte splice (M2-03)
- The CI cache step for `schemas/xsd/` (added by M2-03, the first consumer in CI)
- Committing any bank guide or copied guide text

## Acceptance Criteria

1. `docs/evidence/xsd-licence.md` states the licence source (URL, section, retrieval date) and the
   decision (commit or fetch at build time).
2. `scripts/fetch-xsd.sh` run twice on an empty `schemas/xsd/` downloads three files on the first
   run, downloads nothing on the second, and exits 0 both times; it exits non-zero when a lock
   hash is altered (tested on a copy of the lock file under `$TMPDIR`).
3. The synthetic `fixtures/xml/pain.001.001.09-min.xml` validates against the fetched XSD with
   `xmllint-wasm`, and the same file with a 36-character `TwnNm` fails validation.
4. `docs/evidence/sources.json` parses, and has an entry with `url`, `retrieved` and `sha256` for
   every launch bank in ADR 0009 and for every domain fact in `PROJECT.md` §1 and pain row in §2.
5. Every bank guide entry has `message_versions`, `forms` and `effective_from` (a date or
   `not_set`).
6. No downloaded guide or XSD is tracked unless the licence decision allows it (`git ls-files
   data/raw schemas/xsd` lists only `.gitkeep` files in the fetch case).
7. No evidence file presents a Swift cutover date as imminent (grep check).

## Deliverables

- `docs/evidence/xsd-licence.md`, `docs/evidence/sources.json`, `docs/evidence/README.md`
- `scripts/fetch-xsd.sh`, `schemas/xsd.lock.json`, `scripts/recon/xsd-smoke.mjs`
- `fixtures/xml/pain.001.001.09-min.xml`

## Validation Gate

```bash
rm -f schemas/xsd/*.xsd        # fetch case only; skip if the licence decision commits the XSDs
./scripts/fetch-xsd.sh; echo "first exit $?"; ls schemas/xsd/*.xsd | wc -l   # expect 0 and 3
./scripts/fetch-xsd.sh; echo "second exit $? (expect 0, nothing downloaded)"
cp schemas/xsd.lock.json "$TMPDIR/xsd.lock.bad.json" && jq '.[0].sha256="0000"' "$TMPDIR/xsd.lock.bad.json" > "$TMPDIR/xsd.lock.bad2.json"
XSD_LOCK="$TMPDIR/xsd.lock.bad2.json" ./scripts/fetch-xsd.sh; echo "tampered exit $? (expect non-zero)"
mkdir -p "$TMPDIR/xsd-smoke" && (cd "$TMPDIR/xsd-smoke" && npm init -y >/dev/null && npm i xmllint-wasm@5.3.0 >/dev/null)
XSD=$(ls schemas/xsd/*001.001.09*.xsd)
node scripts/recon/xsd-smoke.mjs "$TMPDIR/xsd-smoke" "$XSD" fixtures/xml/pain.001.001.09-min.xml                       # expect valid true
node scripts/recon/xsd-smoke.mjs "$TMPDIR/xsd-smoke" "$XSD" fixtures/xml/pain.001.001.09-min.xml --overlength-twnnm   # expect valid false
jq -e '[.[]|select(.url and .retrieved and .sha256)]|length>0' docs/evidence/sources.json
for b in Nordea Danske Handelsbanken SEB Deutsche BNP ING ZKB; do jq -e --arg b "$b" '[.[]|select(.publisher|test($b;"i"))|select(.message_versions and .forms and .effective_from)]|length>0' docs/evidence/sources.json >/dev/null && echo "ok $b" || echo "MISSING $b"; done
git ls-files data/raw schemas/xsd
grep -riE 'imminent|is coming on (14|15) nov' docs/evidence | grep -viE 'never|not imminent' | wc -l   # expect 0
./scripts/landing-checks.sh
```

## Handoff

- **M2-03** (XML): `scripts/fetch-xsd.sh` and `schemas/xsd.lock.json`; add the CI cache step keyed
  on the lock file; `fixtures/xml/pain.001.001.09-min.xml` as the first round-trip fixture; the
  `xmllint-wasm` import path that worked.
- **M2-06 to M2-09** (packs): `docs/evidence/sources.json` ids to cite in each pack, with
  `effective_from` and forms per bank.
- **M3-12** (attribution page) and **M4-01** (README): the source list and the date wording rule.
- **M4-CLEANUP**: `data/raw/evidence/` stays untracked.
