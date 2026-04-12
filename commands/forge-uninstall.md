---
name: forge-uninstall
description: Remove Fabstack Forge from the current project
---

# /forge-uninstall

Cleanly remove Fabstack Forge. Interactive, symmetric to `/forge-init`.

## Flow
1. Verify `docs/monitoring/config.yml` exists — abort if not
2. Show summary: known errors, open Issues, pending PRs, last run
3. Prompt one at a time:
   - Disable scheduled trigger?
   - Close open forge-labeled Issues with explanation comment?
   - Close open forge-authored draft PRs?
   - Remove `.github/workflows/forge-collect.yml`?
   - Delete `forge-logs` branch?
   - Delete GitHub secrets (SSH_PRIVATE_KEY, FORGE_HOST, FORGE_USER)?
   - Delete `docs/monitoring/` content? (keep all / delete state only / delete all)
   - Delete local SSH key pair?
4. Apply confirmed actions
5. Commit: `chore(forge): uninstall Fabstack Forge`
6. Print summary + re-init hint

## Flags
- `--dry-run` — show what would be removed without doing anything
