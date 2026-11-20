---
title: "M0-01 · User outreach drafts (organiser questions answered 20 Nov)"
milestone: "M0 · Recon & Bootstrap"
labels: ["owner", "recon"]
blocked_by: []
estimate: "1h"
resources: []
needs: []
---

## Context

The organiser questions are closed: the answers of 20 Nov 2026 are in `PROJECT.md` §1 (hosted demo
without login allowed; public datasets and open-source models allowed within their licences;
non-Kiro AI tools for assets allowed). This ticket is **user outreach only**.

Requirement R1 in `docs/architecture.md` (list sizes of 100–5,000 rows, CSV/XLSX/pain.001/MT101
inputs) is marked *assumed, validated by user outreach (M0-01)*. Potential Impact (20% of the
rubric) rests on "handle real messy formats"; a few answers from AP clerks, payroll bureaus and
treasury or ERP admins either confirm the formats and volumes or change them before M2 builds the
ingest adapters.

A worker drafts; **the owner sends**. Nothing is posted by a worker.

## Scope

1. Draft three short outreach messages in `docs/outreach/` (gitignored, private from day one):
   - `ap-payroll.md`: AP clerks and payroll specialists or bureaus (forums such as the IFS
     Community thread quoted in `PROJECT.md` §2, accounting and payroll communities)
   - `treasury-erp.md`: treasury analysts and ERP admins
   - `small-bank-ops.md`: operations teams at small banks or fintechs
2. Each draft asks at most five questions, all tied to an assumption: file formats they export
   (CSV, XLSX, pain.001 version, MT101), typical row count, which bank(s) they send files to, what a
   bank rejection or address warning looks like for them, and whether a human approves every change
   today. Each states plainly that 4x35 is a hackathon project, does not send payments, and asks
   for **no files and no real addresses**.
3. `docs/outreach/tracker.md`: a table (channel, draft, sent date, answers count, assumption
   confirmed or changed) the owner fills in. Answers are recorded without names or contact details.
4. When answers arrive, any finding that changes R1 is logged to BL-01 with
   `**Owner ticket:** M0-01`; `docs/architecture.md` R1 is corrected in the same change.

## Out of scope

- Organiser questions (answered 20 Nov, `PROJECT.md` §1)
- Sending or posting anything (owner only)
- Collecting any file, address or personal data from respondents

## Acceptance Criteria

1. `docs/outreach/ap-payroll.md`, `treasury-erp.md`, `small-bank-ops.md` and `tracker.md` exist and
   are non-empty.
2. All four files are ignored by git (`git check-ignore` succeeds for each) and none is tracked.
3. Each draft has at most five questions and each question names the assumption it tests (R1 row
   counts, formats, banks, review practice).
4. No draft presents a Swift cutover date as imminent or says a bank "will accept" or "will reject"
   a file (grep finds none of the forbidden phrases).
5. Each draft says it asks for no files or real addresses.
6. Owner checklist comment on this issue: which channels to post to, in which order.

## Deliverables

- `docs/outreach/ap-payroll.md`, `docs/outreach/treasury-erp.md`,
  `docs/outreach/small-bank-ops.md`, `docs/outreach/tracker.md` (all gitignored)
- Owner checklist comment on this issue

## Validation Gate

```bash
for f in ap-payroll treasury-erp small-bank-ops tracker; do test -s docs/outreach/$f.md && git check-ignore -q docs/outreach/$f.md && echo "ok $f"; done
git ls-files docs/outreach | wc -l                                   # expect 0
for f in ap-payroll treasury-erp small-bank-ops; do echo "$f questions: $(grep -cE '^[0-9]+\. ' docs/outreach/$f.md)"; done   # each <= 5
grep -inE 'will (accept|reject)|deadline (is|on) (14|15) nov|cutover (is|on) ' docs/outreach/*.md | wc -l   # expect 0
grep -il 'no files' docs/outreach/ap-payroll.md docs/outreach/treasury-erp.md docs/outreach/small-bank-ops.md | wc -l   # expect 3
./scripts/landing-checks.sh
```

## Handoff

- **M2-01, M2-02, M2-03, M2-04** (ingest): any answer that changes formats or row counts arrives as
  a BL-01 entry owned by M0-01; check it before building.
- **M3-08** (load test): confirmed row counts feed the load profile.
- **M4-01** (README): anonymised answers may be cited only as counts ("n of m respondents"), never
  with names.
