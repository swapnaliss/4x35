---
title: "M0-GATE · Recon & Bootstrap gate: prerequisites, CI green, local stack, hello deployed, recon evidence"
milestone: "M0 · Recon & Bootstrap"
labels: ["gate"]
blocked_by: ["M0-00", "M0-01", "M0-02", "M0-03", "M0-04", "M0-05", "M0-06", "M0-07", "M0-08", "M0-09", "M0-10"]
estimate: "2h"
resources: ["DEPLOY"]
needs: ["P-02", "P-03", "P-04", "P-05", "P-18", "P-29", "P-32"]
---

## Context

`PROJECT.md` §8: M0 closes when `python3 scripts/check-prereqs.py` passes, CI is green and the hello
build is deployed. M1 assumes every M0 result is real: the workspaces and landing checks, a local
stack that resets in ≤ 2 min (R10), migrations on deploy to Render Frankfurt (ADR 0016, 0017),
verified Kiro formats and steering (ADR 0019), recorded LLM and Crew fixtures, pinned XSDs and
evidence, measured dataset and load numbers. This gate re-proves each from a clean state, run with
`/gate M0-GATE`.

## Scope

Claims **DEPLOY**: it triggers a deploy of main and reads production.

1. Confirm every ticket in `blocked_by` is closed.
2. Clean state: a fresh clone of main into `$TMPDIR/m0-gate`, `npm ci`, `make reset` (fresh
   Postgres volume, migrations, seed).
3. Run the Validation Gate below verbatim and walk every AC.
4. Post the results table on the gate issue (each AC: PASS with evidence or FAIL with reason), with
   measured times: `make reset`, landing checks, PR CI, deploy.

## Out of scope

- Fixing anything found (a FAIL goes back to its ticket or to BL-01; the gate stays open)
- M1 work

## Acceptance Criteria

1. `python3 scripts/check-prereqs.py` exits 0 (every required prerequisite present) — M0-00.
2. `docs/budget.md` carries the owner-approved ceiling; standing approvals are recorded in
   `CLAUDE.md` and `.claude/settings.json` — M0-00.
3. Every `.github/plan/*.md` has `needs:`; `python3 scripts/check-plan.py` exits 0 — M0-00.
4. The outreach drafts exist and are gitignored; nothing under `docs/outreach/` is tracked — M0-01.
5. `docs/recon/m0-02-kiro-crew.md` exists (gitignored) with every surface marked verified or not
   verified; `fixtures/kiro-crew/*.json` parse; `docs/kiro-usage.md` has entries — M0-02.
6. `fixtures/llm/anthropic/` holds 12 recorded responses; `fixtures/llm/SUMMARY.md` states the
   Bedrock result and total spend ≤ $1 — M0-03.
7. `scripts/fetch-xsd.sh` fetches and verifies the three XSDs in the clean clone; the synthetic
   pain.001.001.09 validates and the over-length variant fails; `docs/evidence/sources.json` covers
   every launch bank — M0-04.
8. In the clean clone: `npm ci`, `./scripts/landing-checks.sh` pass; 8 workspaces; TypeScript
   6.0.3; the Docker image builds and `/healthz` answers locally — M0-05.
9. The latest CI run on main is green, including the gitleaks and Postgres jobs — M0-05, M0-06.
10. `make reset` completes in ≤ 2 min; a second `make migrate` applies nothing — M0-06.
11. Production: a deploy of main's HEAD goes live through `preDeployCommand` migrations;
    `/healthz` returns 200 with that commit; region `frankfurt`, Postgres 17 — M0-07 (with M0-06).
12. `data/sources.json` and `data/chromium-i18n/` present; the fetch scripts verify hashes;
    `docs/evidence/datasets.md` reports unique-match rates and defects — M0-08.
13. `docs/evidence/load-spike.md` holds the 2 GB and 512 MB measurements and the recommended
    limits — M0-09.
14. The seven steering files are tracked, `.kiro` is not ignored, and `.kiro/specs/README.md` lists
    every capability slug named in the plan — M0-10.
15. `./scripts/check-no-secrets.sh` passes and no private path (`docs/research`, `docs/outreach`,
    `docs/recon`, `.review`, `.prp`, `.dev-refs.md`, `.kickoff-state.md`) is tracked.

## Deliverables

- Gate results comment on this issue (AC table, measured times, deploy ID)
- Screenshots or outputs, if any, under `.review/M0-GATE/` (gitignored)

## Validation Gate

```bash
python3 scripts/check-prereqs.py
python3 scripts/check-plan.py
grep -L '^needs:' .github/plan/*.md | wc -l                                         # expect 0
grep -A6 '^## Standing approvals' CLAUDE.md | grep -vq '^_Filled by M0-00' && echo approvals-recorded
rm -rf "$TMPDIR/m0-gate" && git clone --quiet "$(git remote get-url origin)" "$TMPDIR/m0-gate"
cd "$TMPDIR/m0-gate"
npm ci
npm ls --workspaces --depth=0 | grep -c '@4x35/'                                   # expect 8
npx tsc --version                                                                   # Version 6.0.3
time ./scripts/landing-checks.sh
time make reset                                                                     # <= 2 min
make migrate; echo "second migrate exit $?"
./scripts/fetch-xsd.sh && ls schemas/xsd/*.xsd | wc -l                              # expect 3
mkdir -p "$TMPDIR/xsd-smoke" && (cd "$TMPDIR/xsd-smoke" && npm init -y >/dev/null && npm i xmllint-wasm@5.3.0 >/dev/null)
XSD=$(ls schemas/xsd/*001.001.09*.xsd)
node scripts/recon/xsd-smoke.mjs "$TMPDIR/xsd-smoke" "$XSD" fixtures/xml/pain.001.001.09-min.xml
node scripts/recon/xsd-smoke.mjs "$TMPDIR/xsd-smoke" "$XSD" fixtures/xml/pain.001.001.09-min.xml --overlength-twnnm
for b in Nordea Danske Handelsbanken SEB Deutsche BNP ING ZKB; do jq -e --arg b "$b" '[.[]|select(.publisher|test($b;"i"))]|length>0' docs/evidence/sources.json >/dev/null || echo "MISSING $b"; done
for f in fixtures/kiro-crew/*.json; do jq -e . "$f" >/dev/null || echo "BAD $f"; done
ls fixtures/llm/anthropic/*.json | wc -l                                            # expect 12
grep -iE 'bedrock eu-central-1|total cost' fixtures/llm/SUMMARY.md
jq -e 'all(.[]; .sha256 and .licence)' data/sources.json && ls data/chromium-i18n | wc -l
test -s docs/evidence/datasets.md && test -s docs/evidence/load-spike.md && test -s docs/kiro-usage.md && echo evidence-ok
git check-ignore -q .kiro && echo "IGNORED (fail)" || echo kiro-tracked
git ls-files .kiro/steering | wc -l                                                 # expect 7
git ls-files | grep -E '^(docs/(research|outreach|recon)/|\.review/|\.prp/|\.dev-refs\.md$|\.kickoff-state\.md$)' | wc -l   # expect 0
docker build -t 4x35:m0-gate --build-arg COMMIT=$(git rev-parse --short HEAD) .
gh run list --branch main --limit 1 --json conclusion,name -q '.[0]'                # conclusion success
cd - >/dev/null
test -s docs/recon/m0-02-kiro-crew.md && git check-ignore -q docs/recon/m0-02-kiro-crew.md && echo recon-ok
ls docs/outreach/*.md | wc -l && git ls-files docs/outreach | wc -l                 # expect 4 and 0
./scripts/setup.sh --status | tee "$TMPDIR/render-status.json"
jq -e '.region=="frankfurt" and (.postgres_version|tostring|startswith("17")) and .last_deploy.status=="live"' "$TMPDIR/render-status.json"
curl -fsS "$(jq -r .url "$TMPDIR/render-status.json")/healthz" | jq -e --arg c "$(git rev-parse --short origin/main)" '.status=="ok" and (.commit|startswith($c))'
./scripts/check-no-secrets.sh
```

## Handoff

- **M1-01, M1-06** (first M1 tickets): M0 is proven; read the gate comment for measured R10 times,
  the production URL, and the recon numbers (LLM caps, dataset unique-match rates, load limits).
- **Post-gate sweep** (`/gate` step 8): open BL-01 entries owned by M0 tickets.
- On FAIL: the failing ACs and their owning tickets are listed on this issue and logged to BL-01;
  no M1 ticket starts.
