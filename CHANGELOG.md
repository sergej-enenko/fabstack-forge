# Changelog

## [0.1.0] - 2026-04-12

### Added

**Core Pipeline**
- `log-monitor` skill with 7-component pipeline (fetch, classify, dedup, investigate, patch, report, state)
- Log fetcher reads from `forge-logs` git branch (hybrid architecture)
- 4 log parsers: Docker, Nginx access, Nginx error, journald
- Classifier with Layer 1 deterministic rules (5 rules) + Layer 2 AI upgrade-only
- Dedup engine with fingerprint-based new/continuing/returning/resolved categorization
- Investigator with git-history temporal correlation, dependency detection, security-sensitive file detection
- Patcher with git worktree isolation, 12 gate checks, draft-PR-only mode
- Reporter with structured Markdown output + GitHub Issue integration
- Comment reader for `/forge` feedback commands (ignore, reclassify, reinvestigate, wrong-fix-class)

**Fix Classes (9)**
- null-guard, missing-error-boundary, missing-optional-chain, typo-in-literal, missing-i18n-key
- unused-import-removal, unused-variable-removal, missing-await, revert-recent-commit

**Commands (5)**
- `/forge-init` — interactive project setup with preflight checks and collector wizard
- `/forge-run` — manual pipeline execution (with --validation and --dry-run modes)
- `/forge-inspect` — ad-hoc analysis of user-provided logs
- `/forge-status` — monitoring health dashboard
- `/forge-uninstall` — clean project removal

**Infrastructure**
- GitHub Actions collector workflow (Level 0) with SSH lockdown via `authorized_keys command=` restriction
- Server-side `forge-readonly-shell` whitelist script
- Collector workflow renderer with template substitution
- Append-only JSONL audit log
- Sliding-window rate limiter (CB6) with hourly caps
- State manager with atomic writes, backup/restore, and stale-lock reclaim
- Config loader with schema validation and deep-merge defaults
- Prompts loader with markdown frontmatter and variable substitution
- Fingerprint utility with UUID/timestamp/line-number normalization

**Safety**
- 24 general guardrails (G1-G24) + 12 patcher gates (P1-P12)
- 6 circuit breakers (daily PR cap, rejection rate, test-failure rate, regression watch, self-disable, hourly rate limits)
- Security-sensitive file pattern detection (hard-coded baseline + config extension)
- Git worktree isolation for all patch operations
- Hard-coded forbidden paths baseline (cannot be removed by config)

**Testing**
- 127 tests (unit + component + E2E)
- E2E test detects the LaBong metadata TypeError through the full pipeline
- All external calls mockable via dependency injection

**Documentation**
- SKILL.md runbook with 11-step scheduled pipeline + 7-step inspect pipeline
- 6 reference documents (severity rules, fix classes, guardrails, state schema, security patterns, collector setup)
- 4 AI prompt templates as versioned markdown
- 5 project templates (config, state, stats, report, team README)
- Getting started guide, configuration reference, fix classes reference, troubleshooting guide
