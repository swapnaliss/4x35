---
title: "M3-04 · Crew app in its own public repo (swapnaliss/4x35-crew)"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["agent", "backend", "blocker-risk"]
blocked_by: ["M3-01"]
estimate: "6h"
resources: []
needs: []
---

## Context
Best Kiro Crew App is a bonus target (PROJECT.md §1) and the Crew app is the storyboard's "same check
from a chat channel" scene (1:55–2:10). ADR 0019 puts it in its **own public, licensed repo**
`swapnaliss/4x35-crew`, as a thin client of the public API with a scoped token (M3-01). The M0-02
recon found that the Crew SDK (`@kirocrew/app-sdk`) is supplied by the Crew runtime and is not on npm,
so local tests replay the fixtures M0-02 recorded (PROJECT.md §10 risk). Security: the Crew token can
upload and read summaries only; chat replies carry counts only; review links need a login
(architecture §8).

## Scope
1. Create the repo `swapnaliss/4x35-crew` (public, Apache-2.0, `.kiro/` at its root and tracked). Write
   the Kiro spec `.kiro/specs/crew-app/{requirements.md (EARS), design.md, tasks.md}` in Kiro in that
   repo, and log the session in this repo's `docs/kiro-usage.md` with a link. Name these properties:
   **P-CREW-1** a chat reply never contains a name, address line or field value from a record (counts,
   pack id/version and a review link only); **P-CREW-2** the app sends only the token scopes
   `batches:upload` and `batches:read_summary`.
2. `app.json` manifest (format from the M0-02 recon), a handler that: receives a file dropped in a
   channel (CSV, XLSX, pain.001, MT101) → uploads it via `POST /api/v1/batches` with an
   `Idempotency-Key` → polls the batch summary with backoff (max 5 min) → replies with the health
   summary (rows, passing, failing, by-country counts, "checked against `<pack>@<version>`") and a link
   to the review queue that requires a login.
3. Config: `FOURX35_BASE_URL` and `FOURX35_API_TOKEN` read from the Crew runtime's secret store; the
   Crew repo's `.env.example` lists the names only. Default pack and form are chosen per channel by a
   `/4x35 pack <id>` command.
4. Errors: unsupported file, file too large (R1 limits), 401/403 from the API, timeout → a short,
   specific reply; no stack traces in chat.
5. Tests with vitest replaying the M0-02 Crew fixtures and recorded API responses from this repo's
   staging run; no mock of the 4x35 API in the shipped code path.
6. Live proof (this is the dedicated live ticket for Crew): install the app in the Crew runtime, drop a
   synthetic file from the M2-24 set in a test channel against production, and capture the reply.
7. Open the submission PR to the KiroCrew registry if the recon shows one is required, and link it on
   the issue.

## Out of scope
- Approving or editing records from chat (review happens in the web app)
- Any new API endpoint (M3-01 owns the contract; a missing endpoint is a blocker on M3-01)
- Bot frameworks outside the Crew runtime

## Acceptance Criteria
1. `swapnaliss/4x35-crew` is public, `gh repo view` shows licence Apache-2.0, and `.kiro/` is tracked
   (`git ls-files .kiro` non-empty; `git check-ignore .kiro` fails).
2. Replay tests pass for: CSV upload → summary; pain.001 upload → summary; unsupported type; 401; poll
   timeout.
3. P-CREW-1 property test: for generated batches with random names and address lines, the rendered
   reply contains none of them.
4. P-CREW-2: a test asserts the manifest and the token request list exactly the two scopes; a request
   with a `records:edit` token is refused at start-up with a clear message.
5. Live run evidence in `docs/evidence/crew/` of this repo: a screenshot of the reply in a channel for a
   synthetic file on production, with the batch id visible and matching an audit event with
   `actor_kind = token`.
6. No token value appears in either repo (`gitleaks detect` clean on both).
7. The reply wording passes the same "will accept/reject" and imminent-date grep as the app.

## Deliverables
- Repo `swapnaliss/4x35-crew`: `app.json`, `src/*.ts`, `test/*.test.ts`, `test/fixtures/` (from M0-02),
  `.kiro/specs/crew-app/*`, `README.md`, `LICENSE`, `.env.example`, CI workflow (lint, typecheck, test,
  gitleaks)
- This repo: `docs/evidence/crew/` (screenshot, notes), entry in `docs/kiro-usage.md`

## Validation Gate
```bash
set -euo pipefail
gh repo view swapnaliss/4x35-crew --json visibility,licenseInfo -q '.visibility+" "+.licenseInfo.spdxId' | grep -qx 'PUBLIC Apache-2.0'
tmp=$(mktemp -d "$TMPDIR/crew.XXXX") && gh repo clone swapnaliss/4x35-crew "$tmp/crew" -- -q
(cd "$tmp/crew" && test -n "$(git ls-files .kiro)" && ! git check-ignore -q .kiro \
  && npm ci && npm run typecheck && npm run lint && npm test \
  && gitleaks detect --source . --no-banner \
  && ! grep -rniE 'will (accept|reject)' src)
ls docs/evidence/crew/
gitleaks detect --source . --no-banner
```

## Handoff
- **M4-01 (README)**, **M4-02 (write-up)**, **M4-05 (Devpost)**: the Crew repo URL, the registry PR link
  (if any), and the evidence screenshot path.
- **M4-03 (video)**: the channel and the synthetic file used, so the scene can be re-recorded.
- **M4-SUBMIT**: the Crew repo is already public; confirm it is linked in the Devpost "Crew app" field.
