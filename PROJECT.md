# 4x35: project spec

> **4x35** turns the four 35-character free-text address lines left over from SWIFT MT into
> bank-valid ISO 20022 structured or hybrid addresses. Every field carries a reason, nothing is
> invented, a human approves every change, and the payment file is pre-flighted against the chosen
> bank's published rules before the bank can reject it.

Entry to **Kiroween 2026** (AWS Kiro, Devpost), category **Resurrection**.

---

## 1. Hard facts

| Fact | Value | Source |
|---|---|---|
| Organiser | Amazon Web Services (Kiro); administrator Devpost, https://kiroween.devpost.com | Official Rules §2 |
| Submission deadline | **Fri 4 Dec 2026, 14:00 PT** (Sat 5 Dec, 03:30 IST). No extensions | Rules §3 |
| Kiro credits | request by 1 Dec 2026 12:00 PT; redeem by 4 Dec | Rules, credits page |
| Judging | 16 Dec 2026 → 29 Jan 2027. **The app must stay testable until 29 Jan 2027** | Rules §4 Testing |
| Winners | about 3 Feb 2027 | Rules §3 |
| Category | Resurrection ("Bring your favorite dead technology back to life") | owner's credit form |
| Bonus targets | Best Kiro Crew App (separate repo), Best Demo, Blog (mention "Kiroween 2026 hackathon"), Social Blitz (#KiroweenHackathon26) | Rules §6 |
| Rubric | 5 × 20%: Potential Impact · Technological Implementation (Kiro use) · Design · Innovation/Idea · Presentation. Stage One pass/fail: fits the theme and "reasonably applies the required tools" | Rules §6 |
| Artefacts | public GitHub repo with an OSI licence shown in About and `/.kiro` at the root (not gitignored) · app URL (credentials only if private) · description · public YouTube video under 3 minutes · Kiro usage write-up (IDE/CLI/Web/Crew, custom agents, hooks, specs, steering, MCP, property-based testing, powers) | Rules §4 |
| Disqualifiers | insufficient Kiro use · work before 30 Oct 2026 · undisclosed pre-existing code (**no code from any earlier project**) · `.kiro` missing or ignored · private repo or no licence · third-party IP used outside its licence | Rules §4, §7 |
| Organiser answers (20 Nov 2026) | hosted demo with sample data and no login: allowed · public datasets and open-source models: allowed within their licences · non-Kiro AI tools for assets: allowed if every requirement is met | organiser reply relayed by the owner |

Domain facts the product depends on (sources in `docs/evidence/`, filled by M0-04):
- Swift deferred the removal of unstructured addresses on 27 Aug 2026 and promised a new date "by
  December 2026". Some markets kept their own dates (Taiwan 5 Oct 2026, Korea and Philippines
  14 Nov 2026, Malaysia Feb 2027), and several bank guides still state 14/15 Nov 2026. **Never pitch
  a date as imminent.**
- ISO 20022 address element lengths (PostalAddress24): StrtNm 70, BldgNb 16, BldgNm 35, Flr 70,
  PstBx 16, Room 70, PstCd 16, TwnNm 35, TwnLctnNm 35, DstrctNm 35, CtrySubDvsn 35, Ctry 2,
  AdrLine 70 × 0..7. pain.001.001.03 (PostalAddress6) lacks BldgNm, Flr, PstBx, Room, TwnLctnNm and
  DstrctNm. Hybrid form: TwnNm and Ctry mandatory, at most 2 AdrLine, no duplicated content.

## 2. Product

### Pain

| Problem | Evidence | Who suffers |
|---|---|---|
| Banks ignore or reject free-text addresses | bank notice: "The unstructured address field PstlAdr/AdrLine will be ignored… TwnNm and Ctry will become mandatory" (IFS Community, Jul 2026) | AP and payroll clerks |
| ERP exports cannot produce structured addresses in time | "we haven't managed to get this format correct" (IFS Community) | ERP admins |
| Master data is thin and inconsistent | creditor records that "often had only the country populated" (Kyriba case) | treasury |
| Country quirks surface only in bank testing | Japan/Asia district vs town (Kyriba) | everyone paying into Asia |
| Tools exist only for banks and large treasury systems | Volante, Trace, Kyriba, Addresstune; Swift's model is a single-address parser, "as is" | small and mid-size payers |

No cost-per-repair figure is quoted as fact; none independent exists.

### Users
AP clerk (primary) · payroll specialist or bureau · treasury analyst or ERP admin · small bank or
fintech operations team (secondary). The buyer is the finance or treasury lead.

### Core journey
1. Sign in (invite-only) to a workspace.
2. Upload a supplier or employee list (CSV/XLSX), a pain.001 (.03/.09/.12) file or an MT101 file.
3. Map columns (auto-detected), pick a bank pack and the target form (structured or hybrid).
4. **Health report**: what passes, what fails and why, by country.
5. **Review queue**: risk-sorted; bulk-approve high-confidence proposals; fix flagged fields inline;
   mark unknowns. Every field shows its provenance and reason.
6. **Link** approved addresses into the payment file by IBAN or account plus normalised name;
   ambiguous matches go to review.
7. **Pre-flight** the payment file against the pack: per-transaction red → green.
8. **Export**: the corrected payment file, the corrected list in its original layout, and an audit
   report (record, before, after, approver, pack version).

### Demo storyboard (< 3:00), run for real at the end of M2

| Time | Scene |
|---|---|
| 0:00–0:20 | Pain: a bank notice saying the free-text address field will be ignored; a payroll clerk's 500 contractors in 30 countries. "SWIFT's MT messages died. Their addresses didn't." |
| 0:20–0:35 | Stakes: about 60% of addresses not ready; the cutover date being re-set; banks enforcing already (sources on screen) |
| 0:35–0:55 | Upload the messy export, pick the bank, health report: "412 would fail" |
| 0:55–1:35 | Review queue: a Japanese, an Indian and a German address expanded; reasons per field; a field left empty rather than guessed; bulk-approve 371 |
| 1:35–1:55 | Pre-flight the payment file: red → green |
| 1:55–2:10 | Export: corrected file, original layout, audit report; the same check from a chat channel (Crew app) |
| 2:10–2:45 | How Kiro built it: a spec per capability, property tests ("never invent a town", "fits field limits"), steering holding the ISO 20022 rules, hooks re-running pack tests |
| 2:45–3:00 | Who it is for, what is next, links |

### Success metric (measured in CI, shown in the README and on the app's accuracy page)
- **Invented values = 0**, enforced by property tests and the provenance checker.
- **Per-field exact match** and **all-mandatory-fields-correct rate**, led by a hand-labelled set
  of at least 150 messy addresses; a synthetic set from separate generator templates is reported
  apart; sample size per country shown.
- **Auto-approvable share** at the chosen threshold (the review-queue rate).
- **Time to clear 500 rows** (target under 10 minutes).

### Rubric → requirements

| Criterion | The product must |
|---|---|
| Potential Impact | handle real messy formats; per-bank packs with sources; show the before/after pass rate |
| Technological Implementation | one Kiro spec per capability; property tests for every invariant; steering for ISO 20022 rules; hooks; a custom agent; the project's MCP server; a Kiro power; a Crew app; a write-up covering every Kiro feature used |
| Design | keyboard-first review queue, field-level provenance, red → green pre-flight, WCAG 2.2 AA |
| Innovation | public datasets (chromium-i18n, GeoNames, Japan Post) + bank rule packs + a provenance-constrained LLM |
| Presentation | the storyboard above, run for real |

### Pillars
- **P1 Ingest anything, round-trip its layout**: CSV, XLSX, pain.001, MT101; same columns and values back.
- **P2 Never invent**: provenance-checked structuring, deterministic first.
- **P3 Versioned rule packs**: bank and country packs with sources and `effective_from`.
- **P4 Review and audit**: queue, decisions, four-eyes option, append-only audit.
- **P5 Pre-flight and export**: the payment file checked and corrected in place.
- **P6 Developer surfaces**: MCP server, Kiro power, Crew app.

## 3. Architecture
See [`docs/architecture.md`](docs/architecture.md) and the ADRs in [`docs/adr/`](docs/adr/).

## 4. Tech stack (versions verified on the npm registry, 17 Nov 2026)

| Component | Version | Why |
|---|---|---|
| Node.js | 24 LTS | owner stack; one runtime |
| TypeScript | 6.0.3 | drizzle-kit peer range `<6.1.0` rules out 7.x |
| Hono / @hono/node-server / @hono/zod-openapi | 4.13.19 / 2.1.8 / 1.6.3 | small typed API with generated OpenAPI |
| zod | 4.6.7 | shared schemas: API, packs, LLM output |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 | typed SQL + migrations |
| pg | 8.23.1 | Postgres driver |
| pg-boss | 12.38.2 | jobs in Postgres, no Redis |
| React / react-dom | 19.3.1 | SPA |
| Vite | 8.3.8 | build |
| @tanstack/react-router | 1.170.46 | typed routes |
| @tanstack/react-query | 5.108.4 (version verified on the npm registry in M0-05, 24 Nov 2026: published 23 Nov 2026, MIT, 91.97 M weekly downloads 16–22 Nov; peer `react ^18 \|\| ^19`) | server state in the SPA |
| tailwindcss / radix-ui / shadcn | 4.3.5 / 1.8.1 / 4.23.0 | accessible components |
| papaparse | 5.7.1 | CSV |
| SheetJS | 0.20.3 (cdn.sheetjs.com tarball, pinned integrity) | XLSX round-trip; npm `xlsx` 0.18.5 has advisories |
| xmllint-wasm | 5.3.0 | XSD validation (tested on Node 24) |
| SAX parser with byte positions | chosen and verified in M2-03 | byte-splice XML editing |
| chardet (encoding detection) / iconv-lite | 2.2.0 / 0.7.3 (versions verified on the npm registry in M0-05, 24 Nov 2026: chardet published 20 Jun 2026, MIT, no dependencies, 91.69 M weekly downloads; iconv-lite published 3 Jul 2026, MIT, one dependency `safer-buffer`, 449.42 M weekly downloads; downloads for 16–22 Nov) | CSV encoding round-trip |
| @node-rs/argon2 | 2.2.2 | password hashing |
| pino | 10.4.0 | structured logs |
| i18next | 27.1.3 | i18n keys from day one |
| @anthropic-ai/sdk | 1.9.0 | optional span labeller (`claude-haiku-5-5`) |
| @modelcontextprotocol/sdk | 1.32.2 | MCP server |
| vitest / fast-check / @playwright/test | 5.1.0 / 4.10.2 / 1.65.1 | unit, property, e2e |
| @biomejs/biome | 2.6.8 | lint + format |
| @types/node | 24.19.2 (added in M0-05: TypeScript 6 defaults `types` to `[]`, so the server and tests need Node types) | Node 24 type definitions |
| PostgreSQL | 17 | managed on Render; `postgres:17-alpine` locally |

## 5. Services and spend
- **Render (Frankfurt)**: web 1 CPU / 2 GB ($25/mo) + Postgres basic ($6/mo) + storage ≈ **$32/mo
  ≈ $78 to 29 Jan 2027**. Approved at Approval 2.
- **Anthropic API**: `claude-haiku-5-5`, opt-in per workspace, **cap $10/month**.
- **Kiro**: free credits requested (owner chose to wait rather than buy Pro, 20 Nov).
- **Not bought**: object storage, Redis, APM, Vercel, Neon (owner rule), libpostal hosting.
- Full budget and prerequisites: `M0-00` → `docs/budget.md`, `.github/plan/prereqs.json`.

## 6. Data model
See [`docs/architecture.md` § Data model](docs/architecture.md#data-model).

## 7. Deliverables → rubric

| Deliverable | Ticket | Criterion |
|---|---|---|
| Hosted app (Render) with judge sandboxes | M1-07, M3-09 | all |
| `.kiro/` specs, steering, hooks, agent, MCP settings | M0-10, M3-05, every spec-driven ticket | Technological Implementation |
| Kiro power | M3-03 | Technological Implementation |
| Crew app (separate public repo `swapnaliss/4x35-crew`) | M3-04 | Best Crew App |
| Accuracy page + CI report | M3-07 | Impact, Innovation |
| UX: design system and hero-screen specs (`ux-designer`), independent `ui-reviewer` on every frontend ticket | M1-06, all `frontend` tickets | Design |
| README for judges | M4-01 | Presentation |
| Kiro usage write-up | M4-02 | Technological Implementation |
| Demo video < 3 min | M4-03 | Presentation, Best Demo |
| Blog post + social post | M4-04 | bonuses |

## 8. Milestones

| Milestone | Due (IST) | Gate |
|---|---|---|
| M0 · Recon & Bootstrap | Sun 22 Nov 2026 | M0-GATE: `python3 scripts/check-prereqs.py`, CI green, hello deployed |
| M1 · Walking Skeleton | Tue 24 Nov 2026 | M1-GATE: thin slice runs on production from a clean state |
| M2 · Core Loop | Sun 29 Nov 2026 | M2-GATE: storyboard e2e passes on production |
| M3 · Developer Surfaces & Proof | Tue 1 Dec 2026 | M3-GATE: MCP, power, Crew app, accuracy, load test |
| M4 · Submission | Thu 3 Dec 2026 | M4-GATE from a clean clone after M4-CLEANUP; then M4-SUBMIT submit |

70 tickets, 312 h estimated. The tickets are in `.github/plan/`.

## 9. What this does not do
- It does not send payments or connect to banks.
- It does not certify compliance: results say "checked against `<pack>@<version>` (source, retrieved
  date)", never "the bank will accept it".
- It does not translate MT ↔ MX messages beyond addresses.
- It does not replace the ERP or TMS; it round-trips to their formats.
- It does not silently auto-fix anything: a human approves every change.
- Accuracy for scripts and countries with little open data (for example Japan without a postcode
  match, Arabic-script addresses) is measured and published per country, not claimed.

### 9.1 Data policy
- **Real**: ISO 20022 schemas and element rules; public bank usage guides (rules encoded, never text
  copied; source URL and retrieval date kept); chromium-i18n address metadata (CC-BY 4.0); GeoNames
  postal codes (CC-BY 4.0); Japan Post romanised data; the Anthropic API when a workspace opts in.
- **Synthetic**: every supplier, employee and payment record in the demo, tests and judge sandboxes.
  Addresses are personal data under GDPR and India's DPDP law, so no real person's data is used.
- **Retention**: uploads and derived records are deleted after 30 days; audit hashes are kept with
  the workspace; judge sandboxes are exempt until 29 Jan 2027.
- **Upgrade path**: a real customer uploads their own data under a privacy notice and DPA; the LLM
  step stays opt-in with the sub-processor disclosed.
- **No mocks or "demo mode" in the product path.** Tests replay recorded real responses.

## 10. Risk register

| Risk | Impact | Mitigation |
|---|---|---|
| Kiro free credits arrive late (owner chose to wait) | "insufficient Kiro use" disqualification; spec tasks not run in Kiro | M0-00 tracks the ID check daily; specs and steering are written with the free 50 credits; the owner can still buy Pro ($20) at any point |
| Anthropic key not available | LLM step off | the product works deterministically; records go to review |
| Accuracy for JP/IN/CN below expectations | weaker Impact claim | honest per-country page; review queue |
| ISO 20022 XSD licence unclear | cannot commit schemas | fetched at build time and cached in CI (M0-04) |
| Crew SDK exists only inside the Crew runtime | Crew app cannot be tested locally | M0-02 spike records fixtures; the app is a thin client of the public API |
| Bank guides change or are wrong | wrong findings | every pack cites source, retrieval date and `effective_from` (may be "not set") |
| Render outage or cost | app unreachable during judging | container is platform-neutral; daily synthetic check; budget approved to 29 Jan |
| Plan needs ~24 h/day against 8 h/day | milestones slip | parallel workers via `/start-milestone`; the owner sets the pace; scope is not cut |

## 11. Future vision
Continuous checks on the supplier master at entry time; more packs (every major bank, Fedwire in
Nov 2027, SEPA, CHAPS); the same review-plus-rules engine for other ISO 20022 data gaps (purpose
codes, LEIs, remittance information); distribution through payroll bureaus and small banks.

## 12. Conventions
- Branches: `<ticket-id>-<slug>` (for example `m1-03-identity`). One PR per ticket, linked to its issue.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`), present tense, with
  the ticket ID in the body. **No Claude co-author line in commits** (owner convention).
- Every ticket is built to [`docs/engineering-standards.md`](docs/engineering-standards.md).
- Kiro: every capability has a spec in `.kiro/specs/<capability>/`; work on a capability starts from
  its spec's tasks.
