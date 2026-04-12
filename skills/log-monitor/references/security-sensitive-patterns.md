# Security-Sensitive Patterns

When an error originates in a file that matches a security-sensitive pattern, the agent applies extra caution:

1. **Confidence is capped at `"medium"`** — even if the AI investigator returns `"high"`.
2. **No auto-PR is created** — the fix is always downgraded to diff-in-Issue only.
3. **The downgrade reason is recorded** as `"security-sensitive"` in the investigation result.

This ensures that changes to authentication, authorization, payment, and credential-handling code always require human review.

## Hard-coded Baseline Patterns

These patterns are built into the investigator and cannot be disabled:

| Pattern | What it matches |
|---|---|
| `**/auth/**` | Authentication modules, middleware, guards |
| `**/middleware/auth*` | Auth middleware files |
| `**/*secret*` | Files with "secret" in the name |
| `**/*credential*` | Credential management files |
| `**/*token*` | Token generation, validation, storage |
| `**/payment*` | Payment processing code |
| `**/stripe*` | Stripe integration code |
| `**/webhook*` | Webhook handlers (often verify signatures) |
| `**/.env*` | Environment files (also blocked by forbidden paths) |
| `**/secrets/**` | Secrets directory (also blocked by forbidden paths) |
| `**/*.pem` | TLS certificates |
| `**/*.key` | Private keys |
| `**/session*` | Session management code |
| `**/csrf*` | CSRF protection code |
| `**/cors*` | CORS configuration |
| `**/encrypt*` | Encryption/decryption logic |
| `**/decrypt*` | Encryption/decryption logic |
| `**/password*` | Password handling |
| `**/oauth*` | OAuth integration |
| `**/saml*` | SAML integration |
| `**/jwt*` | JWT handling |
| `**/api-key*` | API key management |

## How Matching Works

The investigator uses a glob matcher that supports:
- `**` — matches any number of path segments (including zero)
- `*` — matches a single path segment (no `/`)

File paths are matched against the combined list of hard-coded baseline patterns and any additional patterns from config.

## Extending via Config

Projects can add custom security-sensitive patterns in their config file:

```yaml
security_sensitive_patterns:
  - "**/admin/**"
  - "**/rbac/**"
  - "**/permissions*"
  - "**/billing/**"
```

These are merged with the hard-coded baseline — config patterns can only ADD to the list, never remove baseline entries.

## Interaction with Patcher Gates

Security-sensitive pattern matching happens during investigation (Step 6 of the pipeline), BEFORE the patcher gates (Step 7). The confidence cap at `"medium"` causes P1 (`confidence must be high`) to fail, which prevents auto-PR creation. The diff is still included in the GitHub Issue for human review.

This is a defense-in-depth design: even if a bug in the confidence cap logic were introduced, the forbidden paths (P5) would still block changes to many security-sensitive files.
