# Troubleshooting

## Common Issues

### "forge-logs branch is stale"

The GitHub Actions collector hasn't run recently. Check:
1. Is the workflow enabled? `gh workflow list -R owner/repo`
2. Did the last run succeed? `gh run list -R owner/repo --workflow=forge-collect.yml`
3. Are the SSH secrets still valid? Re-run the lockdown verification from the setup guide.

### "all sources failed to fetch"

Every log file on the `forge-logs` branch contains `FETCH_FAILED`. The collector couldn't SSH to the server. Check:
1. Is the server reachable? `ssh -i ~/.ssh/forge_<project>_ed25519 user@host "echo ok"`
2. Has the SSH key been rotated or removed from `authorized_keys`?
3. Is the `forge-readonly-shell` script still installed?

### Circuit breaker disabled a fix class

This means too many PRs of that class were rejected (closed without merge). Check:
1. `forge-status` to see which classes are disabled and when they re-enable
2. `forge-status --reenable=<class>` to manually re-enable if the rejections were for a different reason

### Self-disabled (3 consecutive failures)

The entire Forge pipeline failed 3 times in a row and self-disabled as a safety measure.
1. `forge-status` to see the failure reasons
2. Fix the underlying issue (usually SSH or API auth)
3. `forge-status --reenable-self` to restart

### Tests fail on auto-fix PR

This is expected behavior. The fix was proposed but didn't pass tests, so no PR was created. The proposed diff still appears in the GitHub Issue for manual review.

### "command rejected" from forge-readonly-shell

The SSH key tried to run a command not in the whitelist. This is the lockdown working correctly. If you need to add a command, edit `/usr/local/bin/forge-readonly-shell` on the server.

## Pausing Forge

Create a `.forge-pause` file at your project root:
```bash
touch .forge-pause
git add .forge-pause && git commit -m "pause forge" && git push
```

Remove it to resume:
```bash
rm .forge-pause
git add -u && git commit -m "resume forge" && git push
```

## Viewing the Audit Log

```bash
# Last 20 actions
tail -20 docs/monitoring/audit.log | jq

# All actions by the patcher
grep '"actor":"patcher"' docs/monitoring/audit.log | jq

# Actions from a specific run
grep '"run_id":"r-142"' docs/monitoring/audit.log | jq
```

## Getting Help

Open an issue at https://github.com/sergej-enenko/fabstack-forge/issues
