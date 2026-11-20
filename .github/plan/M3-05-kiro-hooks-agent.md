---
title: "M3-05 · Kiro hooks + rulepack-author custom agent"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["agent", "infra"]
blocked_by: ["M2-GATE"]
estimate: "4h"
resources: []
needs: ["P-03", "P-10", "P-11", "P-12"]
---

## Context
Hooks and a custom agent are named items in the Kiro usage write-up and in the Technological
Implementation criterion (PROJECT.md §2, ADR 0019). They also do real work: pack JSON saved → schema
check and pack tests; a core file saved → property tests; spec tasks completed → an entry appended to
`docs/kiro-usage.md` (WORKFLOW.md says the log is appended by a hook from this ticket). The custom
agent `rulepack-author` reads a public bank guide and drafts a pack plus tests, and never copies guide
text (ADR 0009, CLAUDE.md "Never").

## Scope
1. Write or update the Kiro spec `.kiro/specs/kiro-automation/{requirements.md (EARS), design.md,
   tasks.md}` in Kiro and log the session in `docs/kiro-usage.md`. Name the property **P-AUTH-1**: a
   pack drafted by `rulepack-author` shares no run of 12 or more consecutive words with the guide text
   captured in `docs/evidence/` (M0-04).
2. Hooks in `.kiro/hooks/` (format from the M0-02 recon):
   - `rulepack-saved.json`: on save of `packages/rulepacks/packs/<id>/<version>.json` → `npm run
     packs:check -w packages/rulepacks` and the pack's tests
   - `core-saved.json`: on save of `packages/core/src/**/*.ts` → `npm run test:property -w packages/core`
   - `spec-task-done.json`: on a spec task completed → `node scripts/kiro/log-usage.mjs` appends a dated
     line (spec, task, outcome) to `docs/kiro-usage.md`
   Each hook calls a script in `scripts/kiro/` so the same action runs from a shell and from Kiro.
3. Custom agent `.kiro/agents/rulepack-author.md`: inputs a bank guide URL and the retrieved capture in
   `docs/evidence/`; outputs a draft pack JSON in our own words, rule references to the fixed
   vocabulary, `effective_from` (date or `not_set`), source URL, retrieved date, and a pack test file.
   Instructions forbid copying sentences, logos or tables.
4. `scripts/kiro/check-copied-text.mjs` implementing P-AUTH-1 over a pack file and an evidence capture,
   added to the `rulepack-saved` hook.
5. Exercise the agent once in Kiro on the source of one launch pack (for example Nordea) and compare its
   draft with the committed pack; differences that are real gaps go to `BL-01`. Save the transcript to
   `docs/evidence/kiro-agent/`.

## Out of scope
- New bank packs for production (packs are M2-07 to M2-09); the agent's draft is evidence, not a pack
- Steering files (M0-10)

## Acceptance Criteria
1. Each hook JSON validates against the recorded hook format (`node scripts/kiro/validate-hooks.mjs`).
2. Each hook's script runs from a shell and exits 0 on the current tree, and non-zero on a planted
   failure (an invalid pack in a temp copy; a failing property in a temp copy of a core test).
3. `log-usage.mjs` appends exactly one well-formed line per call and is idempotent for a repeated
   (spec, task) pair.
4. Evidence that each hook fired in real Kiro: a screenshot or Kiro log excerpt per hook in
   `docs/evidence/kiro-hooks/`, and the `spec-task-done` hook's appended line present in
   `docs/kiro-usage.md`.
5. P-AUTH-1: `check-copied-text.mjs` passes on every committed pack against its evidence capture, and
   fails on a fixture that contains a copied 12-word run.
6. `docs/evidence/kiro-agent/` holds the agent transcript and the draft-vs-committed comparison;
   `check-copied-text.mjs` passes on the draft.

## Deliverables
- `.kiro/specs/kiro-automation/requirements.md`, `design.md`, `tasks.md`
- `.kiro/hooks/{rulepack-saved,core-saved,spec-task-done}.json`, `.kiro/agents/rulepack-author.md`
- `scripts/kiro/{log-usage,check-copied-text,validate-hooks}.mjs`, `scripts/kiro/test/*.test.mjs`
- `docs/evidence/kiro-hooks/`, `docs/evidence/kiro-agent/`, entries in `docs/kiro-usage.md`

## Validation Gate
```bash
set -euo pipefail
node scripts/kiro/validate-hooks.mjs .kiro/hooks
node --test scripts/kiro/test/
for p in $(find packages/rulepacks/packs -name "*.json" -not -path "*/_test/*"); do node scripts/kiro/check-copied-text.mjs "$p"; done
if node scripts/kiro/check-copied-text.mjs scripts/kiro/test/fixtures/copied-pack.json; then echo "copied text not detected"; exit 1; fi
cp docs/kiro-usage.md "$TMPDIR/ku.md"
node scripts/kiro/log-usage.mjs --file "$TMPDIR/ku.md" --spec demo --task 1 --outcome done
node scripts/kiro/log-usage.mjs --file "$TMPDIR/ku.md" --spec demo --task 1 --outcome done
test "$(grep -c 'demo' "$TMPDIR/ku.md")" -eq "$(( $(grep -c 'demo' docs/kiro-usage.md) + 1 ))"
ls docs/evidence/kiro-hooks/ docs/evidence/kiro-agent/
./scripts/landing-checks.sh
```

## Handoff
- **M4-02 (Kiro write-up)**: hook names, what each does, the evidence paths, and the agent transcript.
- **Every later spec-driven ticket**: the `spec-task-done` hook now appends to `docs/kiro-usage.md`;
  manual entries are only for work the hook cannot see.
