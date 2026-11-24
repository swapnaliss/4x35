---
inclusion: always
---

# Product: 4x35

4x35 turns the four 35-character free-text address lines left over from SWIFT MT into ISO 20022 structured or hybrid addresses. Every field carries a reason. Nothing is invented. A human approves every change. The payment file is pre-flighted against the chosen bank's published rules.

## What it is not
- It does not send payments or connect to banks.
- It does not certify compliance.
- It does not translate MT to MX messages beyond addresses.
- It does not replace the ERP or TMS. It round-trips to their formats.
- It does not silently auto-fix anything.

## Users
- AP clerk (primary).
- Payroll specialist or bureau.
- Treasury analyst or ERP admin.
- Small bank or fintech operations team (secondary).
- The buyer is the finance or treasury lead.

## Core journey
1. Sign in (invite-only) to a workspace.
2. Upload a supplier or employee list (CSV/XLSX), a pain.001 (.03/.09/.12) file or an MT101 file.
3. Map columns (auto-detected), pick a bank pack and the target form (structured or hybrid).
4. Health report: what passes, what fails and why, by country.
5. Review queue: risk-sorted, bulk-approve high-confidence proposals, fix flagged fields inline, mark unknowns. Every field shows provenance and reason.
6. Link approved addresses into the payment file by IBAN or account plus normalised name. Ambiguous matches go to review.
7. Pre-flight the payment file against the pack, per transaction.
8. Export the corrected payment file, the corrected list in its original layout, and an audit report.

## Pillars
- P1 Ingest anything, round-trip its layout.
- P2 Never invent.
- P3 Versioned rule packs.
- P4 Review and audit.
- P5 Pre-flight and export.
- P6 Developer surfaces: MCP server, Kiro power, Crew app.

## Wording rules
- Say "checked against `<pack>@<version>`" with the pack source and retrieved date.
- Never say the bank will accept or reject a file.
- Swift deferred the removal of unstructured addresses on 27 Aug 2026. The new date is not set.
- Never present a cutover date as imminent.

## Claims rules
- Write no number in the README, app or video without a measurement in the repo.
- Report accuracy per country, with n.
- Accuracy for scripts and countries with little open data is measured and published, not claimed.

Source: [PROJECT.md](../../PROJECT.md)
