# State Schema — `state.json` v1

The state file tracks everything the forge agent needs to persist between runs. It lives on the `monitoring` branch and is managed by the state-manager module.

## Schema

```json
{
  "version": 1,
  "last_run": "2026-04-11T10:45:00.000Z",
  "run_count_total": 42,
  "known_errors": [
    {
      "fingerprint": "a1b2c3d4e5f60718",
      "first_seen": "2026-04-10T08:00:00.000Z",
      "last_seen": "2026-04-11T10:30:00.000Z",
      "count": 15,
      "classification": "critical",
      "state": "active",
      "source": "storefront",
      "message": "TypeError: Cannot read properties of null (reading 'id')",
      "rule_id": "crash",
      "issue_number": 23,
      "suppressed_until": null
    }
  ],
  "circuit_breaker": {
    "daily_pr_count": 1,
    "daily_pr_count_reset_at": "2026-04-11T00:00:00.000Z",
    "disabled_fix_classes": [
      {
        "class": "typo-in-literal",
        "disabled_at": "2026-04-10T14:00:00.000Z",
        "reason": "user feedback via /forge wrong-fix-class"
      }
    ],
    "self_disabled": false,
    "self_disabled_reason": null,
    "consecutive_failures": 0
  },
  "regression_watch": [
    {
      "fingerprint": "a1b2c3d4e5f60718",
      "fixed_by_pr": 45,
      "watch_until": "2026-04-18T10:00:00.000Z"
    }
  ],
  "rejection_log": [
    {
      "fingerprint": "b2c3d4e5f6071829",
      "action": "ignore",
      "issued_by": "octocat",
      "issued_at": "2026-04-10T16:00:00.000Z",
      "reason": "Known issue, vendor fix incoming"
    }
  ]
}
```

## Field Descriptions

### Top-level

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | number | yes | Schema version. Must be `1`. |
| `last_run` | string (ISO 8601) or null | yes | Timestamp of the most recent completed run. Null if never run. |
| `run_count_total` | number | yes | Total number of completed runs since initialization. |
| `known_errors` | array | yes | All error fingerprints the agent has ever seen. |
| `circuit_breaker` | object | yes | Safety limits and self-disable state. |
| `regression_watch` | array | yes | Fingerprints under post-fix monitoring. |
| `rejection_log` | array | yes | Human feedback actions recorded via /forge commands. |

### `known_errors[]`

| Field | Type | Description |
|---|---|---|
| `fingerprint` | string (16 hex chars) | SHA-256 based fingerprint from the fingerprint module. |
| `first_seen` | string (ISO 8601) | When this error class was first observed. |
| `last_seen` | string (ISO 8601) | When this error class was most recently observed. |
| `count` | number | Total occurrences across all runs. |
| `classification` | `"noise"` / `"notable"` / `"critical"` | Current classification. |
| `state` | `"active"` / `"resolved"` | Whether the error is currently occurring. |
| `source` | string | Log source name (e.g., `"storefront"`, `"medusa"`). |
| `message` | string | Representative error message (first occurrence). |
| `rule_id` | string or null | Which rule matched (null if AI-classified). |
| `issue_number` | number or null | GitHub Issue number if one was created. |
| `suppressed_until` | string (ISO 8601) or null | If `/forge ignore-for` was used, suppress until this time. |

### `circuit_breaker`

| Field | Type | Description |
|---|---|---|
| `daily_pr_count` | number | Auto-PRs created since `daily_pr_count_reset_at`. |
| `daily_pr_count_reset_at` | string (ISO 8601) or null | When the daily counter was last reset (midnight UTC). |
| `disabled_fix_classes` | array | Fix classes disabled by human feedback. |
| `disabled_fix_classes[].class` | string | The fix class name (e.g., `"typo-in-literal"`). |
| `disabled_fix_classes[].disabled_at` | string (ISO 8601) | When it was disabled. |
| `disabled_fix_classes[].reason` | string | Why it was disabled. |
| `self_disabled` | boolean | True if the agent disabled itself after consecutive failures. |
| `self_disabled_reason` | string or null | Explanation of why self-disabled. |
| `consecutive_failures` | number | Number of consecutive runs that failed completely. Resets to 0 on success. |

### `regression_watch[]`

| Field | Type | Description |
|---|---|---|
| `fingerprint` | string | The error fingerprint to watch for recurrence. |
| `fixed_by_pr` | number | PR number that fixed this error. |
| `watch_until` | string (ISO 8601) | Stop watching after this date (typically 7 days post-fix). |

### `rejection_log[]`

| Field | Type | Description |
|---|---|---|
| `fingerprint` | string | The error fingerprint the feedback applies to. |
| `action` | string | One of: `"ignore"`, `"ignore-for"`, `"reclassify"`, `"reinvestigate"`, `"wrong-fix-class"`. |
| `issued_by` | string | GitHub username who issued the command. |
| `issued_at` | string (ISO 8601) | When the command was issued. |
| `reason` | string or null | Optional human-provided reason. |

## Backup and Recovery

- Before every save, the current `state.json` is copied to `state.json.backup`.
- On load, if `state.json` fails to parse, the state-manager falls back to `state.json.backup`.
- If both are corrupt, a `StateCorruptError` is thrown and the run aborts.

## Lock File

The run lock is a separate file (not part of state.json) with this structure:

```json
{
  "pid": 12345,
  "started_at": "2026-04-11T10:45:00.000Z",
  "runtime": "node"
}
```

A lock is considered stale after 2 hours and will be stolen by the next run.
