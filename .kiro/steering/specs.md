---
inclusion: always
---

# How specs are written

The steering in this folder applies to every spec: never-invent, ISO 20022 address rules, engineering standards.

## Layout
- One spec per capability at `.kiro/specs/<slug>/{requirements.md,design.md,tasks.md,.config.kiro}`.
- Take the slug from `.kiro/specs/README.md` (the capability index). Never invent a slug.
- `.config.kiro` is `{"specId":"<uuid>","workflowType":"requirements-first","specType":"feature"}`.

## requirements.md
- Start with a Glossary. Name systems in `Snake_Case`.
- Write requirements in EARS, numbered `R<n>`. Acceptance criteria are `R<n>.<m>`.
  - `WHEN <trigger> THE <System> SHALL <response>`
  - `IF <condition> THEN THE <System> SHALL <response>`
  - `WHILE <state> THE <System> SHALL ...`
  - `THE <System> SHALL ...`
- Requirements come only from the ticket and the ADRs.
- Do not add requirements the ticket does not state. The reviewer diffs `requirements.md` against the ticket's scope and acceptance criteria and removes invented ones.

## design.md: properties
- Name every invariant as a property `P<n> <name>`, for example "P1 never invents a town".
- Write it as `FOR ALL ..., THE <System> SHALL satisfy ...`.
- Map each property to exactly one fast-check test. The test name contains the property ID.
- If the ticket already names the property (`P-never-invent`, `P-CSV-1`, `C1`), keep the ticket's ID verbatim next to the number.

## Property tests
- Use domain arbitraries, never bare `fc.string()`.
- Generate address lines with whitespace runs (including 3 or more), tabs and non-breaking spaces.
- Generate Unicode letters from the countries in scope: CJK, Devanagari, Arabic, Cyrillic, Latin with diacritics.
- Generate NFC and NFD forms.
- Generate lengths around each field limit in `iso20022-addresses.md`: 15, 16, 17; 34, 35, 36; 69, 70, 71.
- State `numRuns` from the ticket. Use at least the ticket's number.
- Show that every property catches a planted bug. The task that adds the property also records one deliberately wrong implementation it fails on (the counterexample and seed) before the real code is restored. A property that never failed proves nothing.

## tasks.md
- Write items as `- [ ] N. <title>`.
- Reference the ticket ID in each item, for example `(M1-01)`.
- Add `_Requirements: R1.1_` to each item.
- Property tasks say `**Validates: P1**`.
- Include a `## Task Dependency Graph` with JSON `{"waves":[...]}`.
- States are `[ ]`, `[-]` and `[x]`.

## Running Kiro headless
- `kiro-cli chat --no-interactive --trust-all-tools --trust-workspace --mode spec "<prompt>"` creates a spec, refines it, or runs its tasks ("Run all tasks in the <slug> spec in order").
- Kiro's refinement pass can add requirements nobody asked for, and a task can be marked `[x]` before its tests pass. Review both before accepting them.

## Logging
- Log every spec action (create, refine, run tasks) as a row in `docs/kiro-usage.md`.
- Each row has the date, ticket, surface, what ran, Kiro version, and credits used (from `/usage` before and after).

Sources: [PROJECT.md](../../PROJECT.md), [WORKFLOW.md](../../WORKFLOW.md), [ADR 0019](../../docs/adr/0019-kiro-surfaces.md)
