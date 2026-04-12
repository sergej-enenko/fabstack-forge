---
name: forge-init
description: Initialize Fabstack Forge — first-time hub setup or add a project to an existing hub
---

# /forge-init

Initialize Fabstack Forge monitoring. Supports two modes:

- **`/forge-init`** (or `/forge-init --hub`) — First-time setup. Creates the hub with the first project.
- **`/forge-init --add-project`** — Adds a project to an existing hub.

## Prerequisites
- GitHub CLI authenticated (`gh auth status`)
- Repository has a remote on GitHub

---

## Mode A: First-Time Hub Setup (`/forge-init` or `/forge-init --hub`)

Creates the monitoring hub in the current repo with the first project.

### Phase 1 — Collect Information
1. Check for existing `docs/monitoring/config.yml` — if exists, suggest `--add-project` instead
2. Ask: hub repo (default: current repo's GitHub slug)
3. Ask: first project name (unique slug, e.g. `labong`)
4. Ask: project's GitHub repo slug (e.g. `sergej-enenko/labong`)
5. Ask: base branch (default: main)
6. Detect workspaces (find package.json / pyproject.toml files, confirm paths + test commands)
7. Ask: server host + SSH user for log collection
8. Ask: which log sources (docker containers, nginx paths, journalctl)
9. Ask: schedule cadence (default: every 2 hours)
10. Ask: mode — `observe` (default) or `fix`

### Phase 2 — Preflight & Collector Setup
11. Run preflight checks via `preflight.mjs`
12. SSH key setup for the first project's server:
    - Generate ed25519 key pair: `forge_{projectId}_ed25519`
    - Guide user to install lockdown script on server
    - Guide user to add public key to authorized_keys with command= restriction
    - Verify lockdown works (test SSH: allowed + blocked commands)
    - Set GitHub secrets: `FORGE_SSH_KEY_{PROJECT_ID_UPPER}`, `FORGE_HOST_{PROJECT_ID_UPPER}`, `FORGE_USER_{PROJECT_ID_UPPER}`
13. Generate `.github/workflows/forge-collect.yml` from v2 template using collector-renderer
14. Trigger a test run of the workflow via `gh workflow run`

### Phase 3 — Write Config & Activate
15. Write `docs/monitoring/config.yml` (v2 schema with one project)
16. Create project state directory: `docs/monitoring/projects/{projectId}/`
17. Write initial state files:
    - `projects/{projectId}/state.json`
    - `projects/{projectId}/state.json.backup`
    - `projects/{projectId}/forge-stats.json`
    - `projects/{projectId}/audit.jsonl` (empty)
18. Write `docs/monitoring/README.md` from team-readme template
19. Commit: `chore(forge): initialize Fabstack Forge hub with {projectId}`
20. Create Claude schedule trigger via `schedule` skill (or RemoteTrigger API)
21. Show cost estimate and next steps
22. Offer: run `/forge-run --validation` now?

---

## Mode B: Add Project (`/forge-init --add-project`)

Adds a new project to an existing hub. Does NOT recreate the trigger.

### Phase 1 — Collect Information
1. Read existing `docs/monitoring/config.yml` — must be v2 (or offer migration if v1)
2. Ask: project name (unique slug, must not already exist in config)
3. Ask: project's GitHub repo slug
4. Ask: base branch
5. Detect workspaces
6. Ask: server host + SSH user
7. Ask: which log sources
8. Ask: mode

### Phase 2 — Preflight & Collector Setup
9. Run preflight checks for the new server
10. SSH key setup for new server:
    - Generate ed25519 key pair: `forge_{projectId}_ed25519`
    - Install lockdown script on new server
    - Install public key with restriction
    - Verify lockdown
    - Set GitHub secrets: `FORGE_SSH_KEY_{PROJECT_ID_UPPER}`, `FORGE_HOST_{PROJECT_ID_UPPER}`, `FORGE_USER_{PROJECT_ID_UPPER}`
11. Regenerate `.github/workflows/forge-collect.yml` with the new server block added
12. Trigger a test collection for the new project

### Phase 3 — Update Hub Config & State
13. Append new project entry to `config.yml` projects array
14. Create project state directory: `docs/monitoring/projects/{projectId}/`
15. Write initial state files (same as Mode A step 17)
16. Commit: `chore(forge): add project {projectId} to hub`
17. Show summary

The CCR trigger does NOT need updating — it reads config.yml dynamically and processes all projects it finds.

---

## Secret Naming Convention

Each project's server gets 3 GitHub secrets with a standardized naming pattern:

| Secret | Pattern | Example (project: sortico) |
|---|---|---|
| SSH Key | `FORGE_SSH_KEY_{ID}` | `FORGE_SSH_KEY_SORTICO` |
| Host | `FORGE_HOST_{ID}` | `FORGE_HOST_SORTICO` |
| User | `FORGE_USER_{ID}` | `FORGE_USER_SORTICO` |

If two projects share a server, they can reference the same secret names.
