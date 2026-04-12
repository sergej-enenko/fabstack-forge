# Fabstack Forge

> Autonomous AI coder driven by runtime observability signals.

Fabstack Forge watches your production logs, detects errors, investigates root causes, and proposes fixes as draft pull requests — all autonomously, every 2 hours.

## How It Works

```
Production Server                    GitHub Actions               Anthropic Cloud
     |                                    |                            |
     | docker logs, nginx, journald       |                            |
     |---SSH (read-only, locked down)---->|                            |
     |                                    | commits to forge-logs      |
     |                                    | branch                     |
     |                                    |--------------------------->|
     |                                    |                            | Claude agent:
     |                                    |                            |  - reads logs
     |                                    |                            |  - classifies errors
     |                                    |                            |  - investigates root cause
     |                                    |                            |  - proposes fixes
     |                                    |                            |  - creates draft PRs
     |                                    |<---------------------------|
     |                                    | Issues, PRs, state on      |
     |                                    | monitoring branch          |
```

**Level 0** (GitHub Actions): Fetches logs via SSH every 2 hours. Keys are locked to read-only commands via `authorized_keys command=` restriction.

**Level 2** (Claude Schedule Trigger): Analyzes logs, classifies errors with rules + AI, investigates root causes with git history correlation, and creates draft PRs for high-confidence fixes.

## Installation

```bash
git clone https://github.com/sergej-enenko/fabstack-forge.git ~/.claude/plugins/fabstack-forge
cd ~/.claude/plugins/fabstack-forge
npm install
```

## Quick Start

In your project repository:

```bash
/forge-init          # Interactive setup wizard
/forge-run --validation  # Dry run to verify setup
/forge-status        # Check monitoring health
```

## Commands

| Command | Purpose |
|---------|---------|
| `/forge-init` | Initialize Forge in a project (one-time setup) |
| `/forge-run` | Execute a pipeline run now (without waiting for cron) |
| `/forge-inspect` | Ad-hoc analysis of pasted log content |
| `/forge-status` | View monitoring health, circuit breakers, recent PRs |
| `/forge-uninstall` | Cleanly remove Forge from a project |

## Fix Classes

Forge can autonomously propose fixes for these patterns:

| Class | What It Does |
|-------|-------------|
| `null-guard` | Add null/undefined checks where TypeError occurs |
| `missing-optional-chain` | Add `?.` to unsafe property access chains |
| `missing-error-boundary` | Wrap async calls in try/catch |
| `missing-await` | Add missing `await` to async calls |
| `unused-import-removal` | Remove imports never referenced |
| `unused-variable-removal` | Remove variables never used |
| `typo-in-literal` | Fix typos in string literals |
| `missing-i18n-key` | Add missing translation keys |
| `revert-recent-commit` | Revert a commit that likely caused a regression |

All fixes are **draft PRs only** — a human must review and merge.

## Safety

- **Never auto-merges** — all PRs are draft, requiring human review
- **Never writes to `main`** — state lives on dedicated branches
- **Never SSHes from the AI agent** — SSH is isolated to GitHub Actions with locked-down keys
- **Circuit breakers** — auto-disables fix classes after repeated rejections
- **Rate limits** — hourly caps on API calls, git pushes, and PR creation
- **Security-sensitive file detection** — auth/session/crypto files get extra scrutiny
- **Audit log** — every action recorded in append-only JSONL

## Configuration

See `docs/configuration.md` for the full config schema reference.

## Design Specification

The complete design document (2500+ lines) is at:
`docs/superpowers/specs/2026-04-12-fabstack-forge-design.md` (in the LaBong repo)

## License

MIT
