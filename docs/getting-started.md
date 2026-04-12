# Getting Started with Fabstack Forge

## Prerequisites

- Node.js 22+
- GitHub CLI (`gh`) installed and authenticated
- Claude Code with plugin support
- A production server with Docker containers you want to monitor

## Step 1: Install the Plugin

```bash
git clone https://github.com/sergej-enenko/fabstack-forge.git ~/.claude/plugins/fabstack-forge
cd ~/.claude/plugins/fabstack-forge
npm install
```

## Step 2: Initialize in Your Project

Navigate to your project repository and run:

```
/forge-init
```

The interactive wizard will:
1. Ask about your project (name, GitHub repo, workspaces)
2. Ask about your production server (host, SSH user)
3. Ask which log sources to monitor (Docker containers, Nginx, journald)
4. Run preflight checks (SSH connectivity, GitHub permissions)
5. Walk you through setting up the SSH lockdown key
6. Generate the GitHub Actions collector workflow
7. Write the monitoring config and initial state
8. Create the scheduled trigger

## Step 3: Validate

Run a validation pass to see what Forge would detect without making any changes:

```
/forge-run --validation
```

Review the output. If the detections look reasonable, you're ready.

## Step 4: Go Live

Your Forge setup starts in `observe` mode by default. In this mode:
- Logs are fetched and analyzed every 2 hours
- GitHub Issues are created for detected problems
- **No auto-fix PRs are created**

After 3-5 days of observation, when you trust the classifications, switch to `fix` mode:

1. Edit `docs/monitoring/config.yml`
2. Change `project.mode: observe` to `project.mode: fix`
3. Commit and push

Fix classes are enabled gradually per the rollout plan in the design spec.

## What Happens Next

Every 2 hours:
1. GitHub Actions fetches fresh logs from your server
2. Claude analyzes them: classifies errors, deduplicates, investigates root causes
3. New critical errors get GitHub Issues with root-cause analysis
4. High-confidence fixes get draft PRs (in `fix` mode)
5. You review and merge (or close) at your convenience
