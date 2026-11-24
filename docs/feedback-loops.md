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

## PR CI (GitHub Actions)

| Loop | Measured | Budget | Verdict |
|---|---|---|---|
| PR CI wall time (`ci.yml`: landing checks, gitleaks, Docker build and smoke, parallel jobs) | **not measured**: on PR #74 (run 45366945266) no job started. GitHub: "The job was not started because recent account payments have failed or your spending limit needs to be increased." | ≤ 5 min | blocked (owner action P-39) |
| Actions minutes per CI run (sum of the three jobs, each rounded up to a whole minute) | not measured (same reason) | 2,000 min/month on a private repo | blocked |

Projection once measured: minutes per run × runs per PR × ~70 PRs (plus gate and `main` runs)
against 2,000 min/month; see the BL-01 entry on Actions minutes.
