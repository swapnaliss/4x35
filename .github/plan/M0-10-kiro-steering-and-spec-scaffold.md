---
title: "M0-10 · .kiro steering and spec scaffold: ISO 20022 rules, never-invent, standards, and the capability index"
milestone: "M0 · Recon & Bootstrap"
labels: ["agent", "docs", "critical"]
blocked_by: ["M0-02", "M0-05"]
estimate: "3h"
resources: []
needs: []
---

## Context

ADR 0019 and the rubric's Technological Implementation criterion (20%) ask for steering that holds
the ISO 20022 rules and the never-invent principle, and one Kiro spec per capability. `/.kiro` must
be at the root and tracked, or the entry is disqualified (`PROJECT.md` §1). `WORKFLOW.md` says Kiro
and Claude Code read the same steering, so the domain rules in `CLAUDE.md` become steering files
here, and every capability ticket from M1 on begins with "write or update
`.kiro/specs/<capability>/` in Kiro and log it in `docs/kiro-usage.md`". This ticket fixes the
steering and the capability index those tickets rely on, using the formats M0-02 verified on the
installed Kiro.

The work is done **in Kiro** (the agent drafts from the sources below; the result is reviewed
against them) and every Kiro action is logged with its credit cost, because the free credits are
scarce.

## Scope

1. Write in Kiro, with the front matter and inclusion modes M0-02 verified:
   - `.kiro/steering/product.md` (always): what 4x35 is and is not (`PROJECT.md` §2, §9), users,
     the core journey, the wording rules: "checked against `<pack>@<version>`", never "the bank will
     accept/reject"; Swift's date deferred and not set, never imminent
   - `.kiro/steering/tech.md` (always): the stack and pinned versions (`PROJECT.md` §4), TypeScript
     6.0.x only, ESM, strict
   - `.kiro/steering/structure.md` (always): the workspace layout from ADR 0001 as created by
     M0-05, hot files, `packages/core` purity
   - `.kiro/steering/iso20022-addresses.md` (file match on `packages/core/**`,
     `packages/rulepacks/**`): PostalAddress24 element lengths, PostalAddress6 gaps for
     pain.001.001.03, PostalAddress27 for .12, the element map rule (ADR 0009), hybrid form (TwnNm +
     Ctry mandatory, ≤ 2 AdrLine, no duplication), never truncate (over-length is a finding)
   - `.kiro/steering/never-invent.md` (always): the six provenance kinds and auto-approvability
     (ADR 0008), unique-and-corroborated dataset matches (ADR 0007), the LLM returns labels and
     substrings only (ADR 0014), synthetic data only (`PROJECT.md` §9.1), no mocks or demo mode in
     the product path
   - `.kiro/steering/engineering-standards.md` (always): the architecture rules for every ticket
     from `docs/engineering-standards.md` §4 and the agent rules, linking to the full document
   - `.kiro/steering/specs.md` (always): how specs are written here: EARS requirements numbered
     `R<n>`, each invariant named as a property `P<n> <name>` (for example "P1 never invents a
     town") that maps to a fast-check test, `tasks.md` items reference the ticket ID, and every
     spec action is logged in `docs/kiro-usage.md`
2. `.kiro/specs/README.md`: the capability index. One row per `.kiro/specs/<capability>/` path named
   in any `.github/plan/*.md` ticket at the time this ticket runs (slug, ticket IDs, ADRs, the
   properties the ticket names). Slugs are taken from the tickets as written; two slugs for the same
   capability are reported to BL-01, not renamed here.
3. Confirm `.kiro` is tracked and not ignored, and add a landing check to
   `scripts/landing-checks.sh` that fails if `git check-ignore -q .kiro` succeeds or if any of the
   seven steering files is missing.
4. Append each Kiro action to `docs/kiro-usage.md` (date, surface, what ran, credits used).

## Out of scope

- Writing any capability's requirements, design or tasks (each capability ticket does its own)
- Hooks and the custom agent (M3-05), `.kiro/settings/mcp.json` (M3-02/M3-05), the power (M3-03)

## Acceptance Criteria

1. The seven steering files exist, each with front matter whose inclusion mode matches M0-02's
   verified format, and Kiro loads them (evidence: the Kiro steering panel or CLI listing, recorded
   in `docs/kiro-usage.md`).
2. `iso20022-addresses.md` lists all 13 PostalAddress24 elements with the lengths in `PROJECT.md`
   §1, the six elements missing from PostalAddress6, and the hybrid rule; a script check compares
   the lengths to `PROJECT.md` §1.
3. `never-invent.md` names all six provenance kinds and marks `dataset`, `inferred` and `external`
   as never auto-approvable.
4. `product.md` contains the "checked against" wording rule and the date rule, and no steering file
   says a bank "will accept" or "will reject" anything.
5. `.kiro/specs/README.md` lists every `.kiro/specs/<capability>` slug referenced in
   `.github/plan/*.md` (script check: zero missing).
6. `git check-ignore -q .kiro` fails (not ignored), `git ls-files .kiro` lists the steering files,
   and the new landing check passes.
7. `docs/kiro-usage.md` has an entry for each steering file authored in Kiro with credits used.

## Deliverables

- `.kiro/steering/{product,tech,structure,iso20022-addresses,never-invent,engineering-standards,specs}.md`
- `.kiro/specs/README.md`
- `scripts/landing-checks.sh` (steering guard), `docs/kiro-usage.md`

## Validation Gate

```bash
for f in product tech structure iso20022-addresses never-invent engineering-standards specs; do head -1 .kiro/steering/$f.md | grep -q '^---$' && echo "ok $f" || echo "MISSING front matter $f"; done
for e in "StrtNm 70" "BldgNb 16" "BldgNm 35" "Flr 70" "PstBx 16" "Room 70" "PstCd 16" "TwnNm 35" "TwnLctnNm 35" "DstrctNm 35" "CtrySubDvsn 35" "Ctry 2" "AdrLine 70"; do el=${e% *}; n=${e#* }; grep -qE "$el\b.*\b$n\b" .kiro/steering/iso20022-addresses.md && grep -qE "$el $n" PROJECT.md && echo "ok $el" || echo "MISMATCH $el"; done
for k in span transform dataset inferred human external; do grep -q "\`$k\`" .kiro/steering/never-invent.md || echo "MISSING $k"; done
grep -q 'checked against' .kiro/steering/product.md && echo wording-ok
grep -riE 'will (accept|reject)' .kiro/steering | grep -viE 'never|not say' | wc -l       # expect 0
comm -23 <(grep -ohE '\.kiro/specs/[a-z0-9-]+' .github/plan/*.md | sed 's#.kiro/specs/##' | sort -u) <(grep -oE '`[a-z0-9-]+`' .kiro/specs/README.md | tr -d '`' | sort -u)   # expect no output
git check-ignore -q .kiro && echo "IGNORED (fail)" || echo "tracked-ok"
git ls-files .kiro/steering | wc -l                                                  # expect 7
grep -c 'steering' docs/kiro-usage.md
./scripts/landing-checks.sh
```

## Handoff

- **Every capability ticket (M1-01 onward)**: the slug to use from `.kiro/specs/README.md`, the spec
  conventions in `.kiro/steering/specs.md` (R/P numbering, ticket IDs in tasks, logging).
- **M3-05**: steering file names the hooks and `rulepack-author` agent should reference.
- **M4-02**: `docs/kiro-usage.md` entries for steering with credit costs.
- **M0-GATE**: the steering guard in `landing-checks.sh`.
