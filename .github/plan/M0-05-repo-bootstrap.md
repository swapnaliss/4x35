---
title: "M0-05 · Repo bootstrap: npm workspaces, biome, TypeScript 6.0.3, vitest, CI with cache, Docker, gitleaks, licence, feedback-loop budgets"
milestone: "M0 · Recon & Bootstrap"
labels: ["infra", "critical"]
blocked_by: ["M0-00"]
estimate: "6h"
resources: ["LOCK"]
needs: ["P-01", "P-02", "P-03", "P-28", "P-29", "P-32", "P-33"]
---

## Context

ADR 0001 fixes the layout (npm workspaces `packages/{core,rulepacks,db,llm}`,
`apps/{server,web,mcp}`, `integrations/kiro-power`), ADR 0002 the runtime (Node 24, TypeScript
6.0.3, ESM, strict; 7.x is ruled out by drizzle-kit's peer range), ADR 0016 the delivery chain
(multi-stage Docker image, GitHub Actions with biome, tsc, vitest, gitleaks and an npm cache) and
ADR 0021 the licence (Apache-2.0 + NOTICE, shown in the repo's About; an OSI licence is a hackathon
requirement). Requirement R10 sets the feedback-loop budgets: local fast check ≤ 2 min, PR CI
≤ 5 min. Every later ticket lands through `./scripts/landing-checks.sh`, which needs the npm
scripts this ticket creates.

This is infrastructure, not a product capability, so it has no Kiro spec; any Kiro use is logged in
`docs/kiro-usage.md`.

## Scope

Claims **LOCK**: it creates every workspace and the first `package-lock.json`.

1. Root `package.json`: `"private": true`, `"type": "module"`, `"license": "Apache-2.0"`,
   `engines.node` `>=24 <25`, `workspaces` `["packages/*", "apps/*", "integrations/*"]`, scripts
   `typecheck`, `lint`, `format`, `test`, `test:unit`, `test:prop`, `build`, each delegating to
   workspaces with `--workspaces --if-present` where per-workspace. `.nvmrc` = `24`. Exact pins
   (`save-exact=true` in `.npmrc`).
2. Eight workspaces, each with `package.json` (`@4x35/<name>`, `"type": "module"`), `tsconfig.json`
   extending `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`,
   ESM, project references), `src/index.ts` and one vitest test. `packages/core` gets a fast-check
   smoke property test and an import guard test proving `packages/core` imports no Node built-in or
   I/O module (architecture rule: the core is pure).
3. Dev dependencies at the `PROJECT.md` §4 versions: `typescript` 6.0.3, `@biomejs/biome` 2.6.8,
   `vitest` 5.1.0, `fast-check` 4.10.2. Runtime for the hello server: `hono` 4.13.19,
   `@hono/node-server` 2.1.8, `zod` 4.6.7. Nothing else is installed here; later tickets add their
   own dependencies.
4. **Verify on the npm registry and record in `PROJECT.md` §4** (no install): the encoding
   detection library (a chardet-class package) and `iconv-lite`, and `@tanstack/react-query`, each
   with version, publish date, licence and weekly downloads, as `PROJECT.md` §4 requires ("verified
   in M0-05"). These packages are not in §4 yet, so each is "version verified on the npm registry
   in this ticket".
5. `biome.json`: formatter + linter for TS, JSON and Markdown-free paths; ignores `schemas/xsd`,
   `data/raw`, `fixtures/**/*.json` formatting.
6. `apps/server` hello: `src/main.ts` reads `NODE_ENV`, `MODE` (`web | worker | all`), `PORT`,
   `LOG_LEVEL` from the environment and serves `GET /healthz` (`{status:"ok", version, commit}`)
   and `GET /readyz`; `MODE=worker` starts no HTTP listener. The commit comes from a build arg.
7. `Dockerfile` (multi-stage: `node:24-slim` build stage with `npm ci` and `npm run build`; slim
   runtime stage, non-root user, `NODE_ENV=production`, only production dependencies and built
   output, `HEALTHCHECK` on `/healthz`) and `.dockerignore` (excludes `.env*`, `.git`, `docs/research`,
   `docs/outreach`, `docs/recon`, `data/raw`, `media`, `node_modules`).
8. `.github/workflows/ci.yml` on pull requests and pushes to main: checkout, `actions/setup-node`
   with Node 24 and `cache: npm` keyed on `package-lock.json`, `npm ci`, `./scripts/landing-checks.sh`
   (biome, tsc, vitest, secret scan), a gitleaks job (`.gitleaks.toml` extends the default rules
   with a rule for the `4x35_` API-token prefix from ADR 0013), a Docker build job, and
   `concurrency` that cancels superseded runs. Workflow permissions: `contents: read`.
9. Licence: confirm `LICENSE` is the Apache-2.0 text and `NOTICE` exists; confirm GitHub detects it
   (`gh repo view --json licenseInfo`).
10. Feedback loops (R10): measure `./scripts/landing-checks.sh` locally (cold and warm), the PR CI
    wall time, and `docker build` time; record them and the budgets in `docs/feedback-loops.md`.
    Over budget → a BL-01 entry with the slowest step.

## Out of scope

- Docker Compose, Postgres and migrations (M0-06)
- `render.yaml` and deploying (M0-07)
- pino logging (M1-05), the React app (M1-06/M1-07), Playwright (M2-26)
- Any product code beyond the hello server

## Acceptance Criteria

1. `npm ci` on a clean checkout succeeds, and `npm ls --workspaces --depth=0` lists all eight
   workspaces.
2. `npm run typecheck`, `npm run lint` and `npm test` pass; `npm test` runs at least one test per
   workspace and the fast-check smoke property in `packages/core`.
3. The core purity test fails if `packages/core/src` imports `node:fs` (proved by a temporary
   import that is reverted).
4. `npx tsc --version` prints `Version 6.0.3`; installed versions of the §4 packages match exactly.
5. `docker build` succeeds; the container started with `MODE=all PORT=8080` answers
   `GET /healthz` with 200 and `status:"ok"`; with `MODE=worker` nothing listens on the port.
6. The image contains no `.env`, `docs/research` or `data/raw` content (`docker run … ls` check).
7. CI is green on the PR: landing checks, gitleaks and Docker build jobs all pass; a second run
   shows an npm cache hit.
8. gitleaks flags a synthetic `4x35_` token in a scratch file (run locally against a temp dir, never
   committed).
9. `gh repo view --json licenseInfo` reports Apache License 2.0.
10. `docs/feedback-loops.md` records measured local and CI times against the R10 budgets.
11. `PROJECT.md` §4 lists the verified encoding-detection, `iconv-lite` and TanStack Query versions.

## Deliverables

- `package.json`, `package-lock.json`, `.npmrc`, `.nvmrc`, `tsconfig.base.json`, `biome.json`,
  `vitest.workspace.ts`
- `packages/{core,rulepacks,db,llm}/`, `apps/{server,web,mcp}/`, `integrations/kiro-power/`
  (each `package.json`, `tsconfig.json`, `src/index.ts`, one test)
- `apps/server/src/main.ts`, `Dockerfile`, `.dockerignore`
- `.github/workflows/ci.yml`, `.gitleaks.toml`
- `docs/feedback-loops.md`, `PROJECT.md` §4 update

## Validation Gate

```bash
rm -rf node_modules && npm ci
npm ls --workspaces --depth=0 | grep -c '@4x35/'                       # expect 8
npx tsc --version                                                        # Version 6.0.3
time ./scripts/landing-checks.sh                                         # <= 2 min warm (R10)
docker build -t 4x35:m0-05 --build-arg COMMIT=$(git rev-parse --short HEAD) .
docker run -d --rm --name m005 -e MODE=all -e PORT=8080 -p 18080:8080 4x35:m0-05 && sleep 3
curl -fsS localhost:18080/healthz | jq -e '.status=="ok"'; docker stop m005
docker run --rm --entrypoint sh 4x35:m0-05 -c 'ls -a; test ! -e .env && test ! -d docs/research && test ! -d data/raw && echo clean'
mkdir -p "$TMPDIR/gl" && printf 'token = "4x35_%s"\n' "$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9)" > "$TMPDIR/gl/t.txt"
gitleaks detect --no-git --config .gitleaks.toml --source "$TMPDIR/gl" >/dev/null 2>&1; echo "gitleaks exit $? (expect 1)"
gh repo view --json licenseInfo -q .licenseInfo.name
gh run list --branch "$(git branch --show-current)" --limit 1 --json conclusion -q '.[0].conclusion'   # success
test -s docs/feedback-loops.md
```

## Handoff

- **M0-06**: workspace names, root scripts, `vitest.workspace.ts` (add an integration project),
  `ci.yml` job layout (add the Postgres service job), the hot-file rule for `package-lock.json`.
- **M0-07**: the Docker image, `/healthz` contract (`status`, `version`, `commit`), `MODE` and
  `PORT` handling.
- **M0-08, M0-09**: workspaces to place loaders and spike code; `npm test` layout.
- **M0-10**: the repo layout the steering must describe.
- **Every later ticket**: `./scripts/landing-checks.sh` is now meaningful; measured R10 numbers.
