---
name: forge-run
description: Execute Fabstack Forge pipeline now
---

# /forge-run

Execute a scheduled-mode Forge run immediately without waiting for the next cron fire.

## Flags
- `--validation` — read-only: fetch+classify+investigate but no commits, no PRs, no state writes. Output to terminal only.
- `--dry-run` — parse+classify only, no AI calls. For debugging parsers.
- (no flag) — full pipeline, identical to what the scheduled trigger does.

## Flow
Invoke the `log-monitor` skill in `scheduled` mode. The skill reads `docs/monitoring/config.yml` and follows the SKILL.md runbook exactly.
