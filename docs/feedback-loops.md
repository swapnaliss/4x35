# Feedback loops (R10)

Budgets from requirement R10 (`docs/architecture.md`): local fast check ≤ 2 min, PR CI ≤ 5 min,
environment reset ≤ 2 min (measured by M0-06). Measured in M0-05 on 24 Nov 2026.

## Local (owner workstation, Node 24.22.1, npm 11.19.1, Docker 29.1.3; other workers running)

| Loop | Command | Measured | Budget | Verdict |
|---|---|---|---|---|
| Clean install | `rm -rf node_modules && npm ci` | 2.9 s | n/a | |
| Landing checks, cold (no `dist/`, no `*.tsbuildinfo`, no vitest cache) | `time ./scripts/landing-checks.sh` | 16.1 s | ≤ 2 min | within |
| Landing checks, warm | `time ./scripts/landing-checks.sh` | 17.1 s | ≤ 2 min | within |
| Landing checks `--fast` (this branch changes root config, so it runs everything) | `time ./scripts/landing-checks.sh --fast` | 17.2 s | ≤ 2 min | within |
| Docker build, cold | `docker build --no-cache -t 4x35:m0-05 …` | 37.9 s | n/a | |
| Docker build, warm (layer cache) | `docker build -t 4x35:m0-05 …` | 3.8 s | n/a | |

Cold and warm landing checks are within a second of each other: the time is tool start-up (tsc,
biome, ten vitest workers at ~0.2–0.4 s each), not work. The image is 345 MB.

## PR CI (GitHub Actions, `ci.yml`: three parallel jobs)

The first runs on PR #74 started no job (account billing). On 2026-11-24 the owner made the repo
public instead (P-39), so Actions minutes on standard runners are free. Times come from the
GitHub API (`run_started_at` → `updated_at`; job `started_at` → `completed_at`).

| Run | npm cache | Wall time | Landing checks | gitleaks | Docker build and smoke |
|---|---|---|---|---|---|
| 45367308183 attempt 2 (first run that executed) | miss ("npm cache is not found"), saved after | 28 s | 17 s | 6 s | 22 s |
| 45382798370 (commit 27b7e38, second run) | **hit** ("Cache restored from key: node-cache-Linux-x64-npm-0f38848e…", ~54 MB) | 23 s | 18 s | 5 s | 21 s |

| Loop | Measured | Budget | Verdict |
|---|---|---|---|
| PR CI wall time | 28 s with a cold npm cache, 23 s with a warm one | ≤ 5 min | within |
| Actions minutes per run | 45 s of job time; 3 billable minutes on a private repo (each job rounds up to a whole minute) | 2,000 min/month if private | public since 24 Nov: free |

Projection had the repo stayed private: 3 min × ~2 runs per PR × ~70 PRs ≈ 420 min, plus `main`
and gate runs, well under 2,000 min/month. The block was billing state, not volume.
