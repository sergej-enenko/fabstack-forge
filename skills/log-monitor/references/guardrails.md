# Guardrails

Two sets of guardrails protect the codebase from autonomous damage:
- **G-series (General):** Apply to all operations at all times.
- **P-series (Patcher):** Apply specifically to the patch-and-PR step.

## General Guardrails (G1-G24)

| ID | Rule | Enforced by | Rationale |
|---|---|---|---|
| G1 | Never push to `main` | Claude agent | All changes go through PRs from `forge/fix-*` branches |
| G2 | Never auto-merge any PR — always Draft | Claude agent | Human must review and approve every code change |
| G3 | Never use `--force` on any git command | Claude agent | Force-push can destroy history and other people's work |
| G4 | Never use `--no-verify` on git commit/push | Claude agent | Hooks exist for a reason; bypassing them is unsafe |
| G5 | Never use `--no-gpg-sign` | Claude agent | Commit signing policy must be respected |
| G6 | Never use `--amend` on any commit | Claude agent | Amending rewrites history; create new commits instead |
| G7 | Never SSH to any server | Claude agent | Level 0 (GitHub Actions) handles all server access |
| G8 | Always check `.forge-pause` before starting work | Claude agent | Humans must be able to pause the system instantly |
| G9 | Always use git worktree for patch operations | Claude agent | Isolates patch work from the main checkout |
| G10 | Never modify `.env` or `*.env.*` files | Claude agent + patcher gates | Secrets must never be touched by automation |
| G11 | Never modify lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) | Claude agent + patcher gates | Lockfile changes require human review of dependency diffs |
| G12 | Never modify CI configs (`.github/workflows/**`, `.circleci/**`, `.gitlab-ci.yml`) | Claude agent + patcher gates | CI changes can disable safety checks |
| G13 | Never modify infrastructure files (`infra/**`, `docker-compose.yml`, `nginx/**`) | Claude agent + patcher gates | Infrastructure changes require ops review |
| G14 | Never modify `CODEOWNERS` | Claude agent + patcher gates | Ownership changes affect review routing |
| G15 | Never modify security-critical files (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `secrets/**`) | Claude agent + patcher gates | Credential and certificate files are out of scope |
| G16 | Always write audit log entries for every action | Claude agent | Full traceability of what the agent did and why |
| G17 | Never exceed rate limits (hourly API calls, git pushes, PRs) | Rate limiter | Prevents runaway behavior and API abuse |
| G18 | Self-disable after 3 consecutive complete failures | State manager | Prevents infinite retry loops on systemic issues |
| G19 | Always back up state.json before overwriting | State manager | Corruption recovery path |
| G20 | Never process more than `max_errors_per_ai_batch` events in one AI call | Classifier | Bounds token cost and latency per run |
| G21 | AI classification is upgrade-only — cannot downgrade rule matches | Classifier | Rules are the safety floor; AI adds signal but cannot remove it |
| G22 | Always cleanup git worktrees in finally blocks | Patcher | Prevents worktree accumulation and disk exhaustion |
| G23 | Direct commits only to `monitoring` branch (and `docs/monitoring/` during setup) | Claude agent | All code changes go through PRs |
| G24 | Retry git push at most once (with rebase), then abort | Claude agent | Prevents infinite push-retry loops on conflicts |

## Patcher Gates (P1-P12)

These gates are evaluated in order before any patch is applied. The patcher short-circuits on the first failure.

| ID | Gate | Check | Failure action |
|---|---|---|---|
| P1 | Confidence is high | `investigation.root_cause.confidence === "high"` | Downgrade to diff-in-Issue |
| P2 | Fix class in allowlist | `config.patcher.fix_classes.allowlist.includes(fix.class)` | Downgrade to diff-in-Issue |
| P3 | Fix class not circuit-broken | `fix.class` not in `state.circuit_breaker.disabled_fix_classes` | Downgrade to diff-in-Issue |
| P4 | Daily PR cap not reached | `state.circuit_breaker.daily_pr_count < config.patcher.rate_limits.max_auto_prs_per_day` | Downgrade to diff-in-Issue |
| P5 | File not in forbidden paths | File does not match `FORBIDDEN_BASELINE` or `config.patcher.guardrails.forbidden_paths` | Downgrade to diff-in-Issue |
| P6 | File not human-modified in 24h | `humanTouched24h(file)` returns false | Downgrade to diff-in-Issue |
| P7 | Diff scope within limits | Exactly 1 file changed AND <= 10 lines changed (skipped for `revert-recent-commit`) | Downgrade to diff-in-Issue |
| P8 | Working tree clean | `git status` shows no uncommitted changes | Downgrade to diff-in-Issue |
| P9 | (reserved) | — | — |
| P10 | No `.forge-pause` file | `.forge-pause` does not exist on monitoring branch | Skip all patching |
| P11 | (reserved) | — | — |
| P12 | Hourly rate limit not exceeded | `rateLimiter.count() === 0` for the patcher key | Downgrade to diff-in-Issue |

**Forbidden baseline paths (P5):**

These paths are hard-coded and cannot be overridden by config:

```
.env
.env.*
secrets/**
*.pem
*.key
*.p12
*.pfx
package-lock.json
yarn.lock
pnpm-lock.yaml
.github/workflows/**
infra/**
docker-compose.yml
docker-compose.*.yml
nginx/**
.dockerignore
CODEOWNERS
.circleci/**
.gitlab-ci.yml
```

Additional forbidden paths can be added via `config.patcher.guardrails.forbidden_paths`.

## What happens when a gate fails

The fix is **not discarded** — it is downgraded. Instead of creating a branch, running tests, and opening a draft PR, the patcher includes the proposed diff directly in the GitHub Issue body. This way the human reviewer still sees the suggestion but must apply it manually.

## Circuit breaker

The circuit breaker in `state.json` tracks:
- `daily_pr_count` — auto-PRs created today (resets at midnight UTC)
- `disabled_fix_classes` — fix classes manually disabled via `/forge wrong-fix-class`
- `self_disabled` — true if 3 consecutive runs failed completely
- `consecutive_failures` — counter for self-disable logic
