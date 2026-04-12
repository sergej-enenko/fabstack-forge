---
name: forge-init
description: Initialize Fabstack Forge in the current project
---

# /forge-init

Initialize Fabstack Forge monitoring for the current project.

## Prerequisites
- GitHub CLI authenticated (`gh auth status`)
- Repository has a remote on GitHub

## Flow

### Phase 1 — Collect Information
1. Check for existing `docs/monitoring/config.yml` — if exists, abort with suggestion to use `/forge-uninstall` first
2. Ask: project name (default from git remote)
3. Ask: GitHub repo slug (default from git remote)
4. Ask: base branch (default: main)
5. Detect workspaces (find package.json files, confirm paths + test commands)
6. Ask: server host + SSH user for log collection
7. Ask: which log sources (docker containers, nginx paths, journalctl)
8. Ask: schedule cadence (default: every 2 hours)
9. Ask: mode — `observe` (default) or `fix`

### Phase 2 — Preflight & Collector Setup
10. Run preflight checks via `preflight.mjs`
11. If SSH key for Forge doesn't exist yet, offer interactive setup wizard:
    - Generate ed25519 key pair for the collector
    - Guide user to install lockdown script on server
    - Guide user to add public key to authorized_keys with command= restriction
    - Verify lockdown works (test SSH with should-succeed and should-fail commands)
    - Add SSH_PRIVATE_KEY, FORGE_HOST, FORGE_USER to GitHub repo secrets
12. Generate `.github/workflows/forge-collect.yml` from template using collector-renderer
13. Trigger a test run of the workflow via `gh workflow run`

### Phase 3 — Write Config & Activate
14. Write `docs/monitoring/config.yml` from template
15. Write initial `docs/monitoring/state.json`
16. Write `docs/monitoring/state.json.backup`
17. Write `docs/monitoring/forge-stats.json`
18. Write `docs/monitoring/audit.log` (empty)
19. Create `docs/monitoring/history/.gitkeep`
20. Write `docs/monitoring/README.md` from team-readme template
21. Commit: `chore(forge): initialize Fabstack Forge for <project>`
22. Create Claude schedule trigger via `schedule` skill
23. Show cost estimate and next steps
24. Offer: run `/forge-run --validation` now?
