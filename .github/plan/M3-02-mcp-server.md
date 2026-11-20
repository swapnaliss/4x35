---
title: "M3-02 · MCP server (stdio) with bundled packs + contract tests"
milestone: "M3 · Developer Surfaces & Proof"
labels: ["backend", "agent"]
blocked_by: ["M3-01"]
estimate: "6h"
resources: ["LOCK"]
needs: []
---

## Context
The project's own MCP server is a developer surface (P6) and a Technological Implementation item:
Kiro uses it while building (`.kiro/settings/mcp.json`, wired in M3-03) and the Kiro power (M3-03)
ships it to any Kiro user. ADR 0019 fixes the shape: it runs **locally over stdio with bundled rule
packs, so no data leaves the machine**. It calls `packages/core` and `packages/formats` (the pure pain.001/CSV readers, ADR 0001) directly; it does not call the hosted
API and needs no token. Domain rules apply unchanged: never invent, never truncate, provenance on every
value, "checked against `<pack>@<version>`" wording (ADR 0008, ADR 0009). ADR 0020 requires contract
tests for MCP.

## Scope
1. Write or update the Kiro spec `.kiro/specs/mcp-server/{requirements.md (EARS), design.md, tasks.md}`
   in Kiro and log the session in `docs/kiro-usage.md`. Name these properties in the spec:
   **P-MCP-1** every value in a `structure_address` result has a valid provenance kind and no value is
   longer than its element limit (never truncated: over-length is a finding);
   **P-MCP-2** same input + same pack version → byte-identical tool output;
   **P-MCP-3** the server opens no network socket (bundled packs only).
2. New workspace `apps/mcp` using `@modelcontextprotocol/sdk` 1.32.2 (PROJECT.md §4), stdio transport,
   bin `4x35-mcp`. LOCK is claimed because this adds a workspace and its dependencies to
   `package-lock.json`.
3. Tools, with zod input/output schemas shared with the API where one exists (M3-01 handoff):
   - `list_packs` → id, version, source URL, retrieved date, `effective_from`, message versions
   - `structure_address` `{lines: string[1..4], countryHint?, packId, form: structured|hybrid,
     messageVersion}` → fields with element, value, provenance, confidence, plus findings. Deterministic
     path only: no LLM, and no `dataset` provenance because the datasets live in Postgres (architecture
     §9 degradation rule: a missing dataset means that kind is not offered).
   - `preflight_pain001` `{path, packId}` → per-transaction results; reads the file locally, rejects
     `<!DOCTYPE`, never writes the file.
   - `explain_rule` `{packId, ruleId}` → rule text written by us, the pack source URL and retrieved date
     (never copied guide text).
4. Packs are bundled at build time from `packages/rulepacks` into `apps/mcp/dist/packs/`.
5. Contract tests: start the built server as a child process, call `tools/list` and each tool through
   the SDK client, and compare against committed golden responses on synthetic inputs.
6. A `--version` flag and a startup log line on stderr only (stdout is the protocol channel).

## Out of scope
- HTTP/SSE transport, authentication, calls to the hosted API
- LLM labelling and dataset lookups in the MCP path
- Writing corrected files (the hosted app exports; this server checks)
- Packaging as a Kiro power and the `.kiro/settings/mcp.json` wiring (M3-03)

## Acceptance Criteria
1. `tools/list` returns exactly the four tools with JSON Schemas derived from the zod schemas; the
   contract test compares them to `apps/mcp/test/golden/tools-list.json`.
2. Golden contract tests pass for each tool on at least 12 synthetic inputs covering JP, IN, DE, GB, US
   and a hybrid case, plus one pain.001.001.03 and one .09 file from the M2-24 synthetic set.
3. P-MCP-1 and P-MCP-2 fast-check properties pass (≥ 500 runs each).
4. P-MCP-3: a test starts the server with a preload module (`--import`) that makes `net.connect`,
   `net.Socket.prototype.connect` and `dns.lookup` throw, then runs every tool once; all calls succeed.
5. `preflight_pain001` on a file containing `<!DOCTYPE` returns a structured error and reads nothing
   beyond the prolog.
6. Every tool response that reports a result says "checked against `<pack>@<version>`"; a test greps
   golden outputs for "will accept" / "will reject" and finds none.
7. Malformed input returns an MCP error with a zod issue list; the server stays up (next call succeeds).
8. `npx 4x35-mcp --version` works from a packed tarball (`npm pack -w apps/mcp`) installed into an empty
   temp directory.

## Deliverables
- `.kiro/specs/mcp-server/requirements.md`, `design.md`, `tasks.md`; entry in `docs/kiro-usage.md`
- `apps/mcp/package.json`, `apps/mcp/src/server.ts`, `apps/mcp/src/tools/*.ts`, `apps/mcp/scripts/bundle-packs.ts`
- `apps/mcp/test/contract.test.ts`, `apps/mcp/test/properties.test.ts`, `apps/mcp/test/golden/*.json`
- `apps/mcp/README.md` (install, tools, privacy: local only)
- `package-lock.json` update

## Validation Gate
```bash
set -euo pipefail
npm ci
npm run build -w apps/mcp
npm run test -w apps/mcp
grep -rniE 'will (accept|reject)' apps/mcp/test/golden && exit 1 || true
tmp=$(mktemp -d "$TMPDIR/mcp.XXXX")
npm pack -w apps/mcp --pack-destination "$tmp" >/dev/null
(cd "$tmp" && npm init -y >/dev/null && npm install ./*.tgz >/dev/null && npx 4x35-mcp --version)
./scripts/landing-checks.sh
```

## Handoff
- **M3-03 (Kiro power)**: the bin name, the built entry path, the tool list and the bundle step; the
  exact `command`/`args` a `mcp.json` needs.
- **M3-05 (hooks)** and **M4-02 (Kiro write-up)**: which spec tasks ran in Kiro.
- **M3-GATE**: `npm run test -w apps/mcp` is the MCP contract proof.
