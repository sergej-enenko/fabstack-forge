# Severity Rules — Layer 1 Classifier

These 5 deterministic rules form the Layer 1 classifier. They run before the AI classifier and their results are a **floor** — AI can only escalate, never downgrade a rule match.

All rule matches produce `classification: "critical"` and `classifier: "rule"`.

---

## Rule 1: `crash`

**What it detects:** Process crashes, uncaught exceptions, OOM kills — anything that means a process died or is about to die.

**Trigger conditions:**
- Event `level` must be `"error"`
- Message matches any of the crash patterns, OR `metadata.event_type === "oom_kill"`

**Patterns matched:**

| Pattern | What it catches |
|---|---|
| `uncaught (error\|exception\|typeerror\|rangeerror\|referenceerror)` | Unhandled JS errors |
| `unhandledpromiserejection` | Unhandled async errors |
| `process exited with code` | Container/process crash |
| `segmentation fault` | Native crash |
| `fatal error` | V8 fatal errors, heap OOM |

**Config options:** None (patterns are hard-coded).

**Example matching log lines:**
```
2026-04-11T10:32:00Z ERROR Uncaught TypeError: Cannot read properties of null (reading 'id')
2026-04-11T10:32:01Z ERROR UnhandledPromiseRejection: fetch failed
2026-04-11T10:32:02Z ERROR Process exited with code 137
2026-04-11T10:32:03Z ERROR FATAL ERROR: CALL_AND_RETRY_LAST Allocation failed - JavaScript heap out of memory
```

---

## Rule 2: `ssr_error`

**What it detects:** Server-side rendering and hydration failures in the storefront (Next.js).

**Trigger conditions:**
- Event `source` must match `config.source_match` (default: `"storefront"`)
- Event `level` must be `"error"`
- Message matches any of the SSR patterns

**Patterns matched:**

| Pattern | What it catches |
|---|---|
| `typeerror` | Runtime type errors during SSR |
| `rangeerror` | Array/number range errors |
| `referenceerror` | Undefined variable access |
| `hydration` | React hydration mismatch |
| `unhandledrejection` | Async errors during render |
| `server rendered html didn't match` | Hydration mismatch (React warning text) |

**Config options:**

| Key | Type | Default | Description |
|---|---|---|---|
| `source_match` | string | `"storefront"` | Event source to filter on |

**Example matching log lines:**
```
2026-04-11T10:32:00Z ERROR [storefront] TypeError: Cannot destructure property 'title' of undefined
2026-04-11T10:32:01Z ERROR [storefront] Hydration failed because the initial UI does not match what was rendered on the server
2026-04-11T10:32:02Z ERROR [storefront] ReferenceError: window is not defined
```

---

## Rule 3: `http_5xx_cluster`

**What it detects:** Clusters of HTTP 5xx errors on the same URL path within a sliding time window. A single 5xx is noise; a cluster means something is broken.

**Trigger conditions:**
- Event `source` must be `"nginx-access"`
- Event `http_status` must be >= 500
- At least `threshold` events on the same `http_path` within `window_minutes`

**Algorithm:** Sliding window per path group. All events within a triggering window are marked as matches (not just the Nth one).

**Config options:**

| Key | Type | Default | Description |
|---|---|---|---|
| `threshold` | number | `5` | Minimum 5xx count to trigger |
| `window_minutes` | number | `120` | Sliding window size in minutes |

**Example matching log lines:**
```
178.104.10.221 - - [11/Apr/2026:10:30:00] "GET /de/products/tapete-florenz HTTP/2" 502 0
178.104.10.221 - - [11/Apr/2026:10:31:00] "GET /de/products/tapete-florenz HTTP/2" 502 0
178.104.10.221 - - [11/Apr/2026:10:32:00] "GET /de/products/tapete-florenz HTTP/2" 502 0
178.104.10.221 - - [11/Apr/2026:10:33:00] "GET /de/products/tapete-florenz HTTP/2" 502 0
178.104.10.221 - - [11/Apr/2026:10:34:00] "GET /de/products/tapete-florenz HTTP/2" 502 0
```

---

## Rule 4: `new_signature`

**What it detects:** Error events whose fingerprint has never been seen before. A new fingerprint means a new class of error has appeared — always worth investigating.

**Trigger conditions:**
- Event `level` must be `"error"`
- Event must have a non-null `fingerprint`
- Fingerprint must NOT exist in `state.known_errors`

**Config options:** None (behavior is entirely driven by state).

**Note:** This rule depends on the fingerprinting module. Fingerprints are SHA-256 hashes (first 16 hex chars) of normalized `error_type + first_stack_frame + message`, with UUIDs, timestamps, and session IDs replaced by stable placeholders.

**Example:** Any error-level event with a fingerprint not in `state.known_errors` will match.

---

## Rule 5: `system_critical`

**What it detects:** Events whose `metadata.event_type` appears in a configurable allowlist of system-level critical events (disk full, certificate expiry, service down, etc.).

**Trigger conditions:**
- Event `metadata.event_type` is non-null
- Event `metadata.event_type` exists in `config.events` array

**Config options:**

| Key | Type | Default | Description |
|---|---|---|---|
| `events` | string[] | `[]` | List of event_type values to treat as critical |

**Typical event_type values:**

| event_type | Meaning |
|---|---|
| `oom_kill` | Kernel OOM killer invoked |
| `disk_full` | Filesystem usage above threshold |
| `cert_expiring` | TLS certificate expires within N days |
| `service_down` | Systemd unit entered failed state |
| `db_connection_pool_exhausted` | All database connections in use |

**Example matching log lines:**
```
2026-04-11T10:32:00Z WARN {"event_type": "disk_full", "usage_pct": 95, "mount": "/"}
2026-04-11T10:32:01Z ERROR {"event_type": "oom_kill", "process": "node", "pid": 12345}
```
