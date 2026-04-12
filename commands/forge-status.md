---
name: forge-status
description: Show Fabstack Forge health and monitoring state
---

# /forge-status

Read-only dashboard of the current Forge monitoring state.

## Displays
- Last run: timestamp, result, runtime
- Health score
- Known errors: count by severity, new in last 7d
- Circuit breakers: disabled classes, daily PR counter
- Recent PRs: last 5 with status
- Regression watches
- `.forge-pause` status

## Flags
- `--reenable=<class>` — re-enable a circuit-broken fix class
- `--reenable-self` — clear self-disabled state (requires confirmation)
- `--verbose` — full state dump
- `--audit` — show last 50 audit log entries
