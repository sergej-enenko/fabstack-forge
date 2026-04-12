# Fix Classes Reference

Fabstack Forge can autonomously propose fixes for these pattern classes. Each fix is created as a **draft PR** — never auto-merged.

## null-guard

Adds null/undefined checks where a TypeError occurs on property access.

**Before:** `const title = product.metadata.title;`
**After:** `const title = product.metadata?.title ?? "";`

**When appropriate:** TypeError on property access of a potentially undefined value.
**When NOT:** The undefined value indicates a deeper logic bug that a null check would mask.

## missing-optional-chain

Adds `?.` to unsafe property access chains.

**Before:** `data.items.map(fn)`
**After:** `data?.items?.map(fn) ?? []`

## missing-error-boundary

Wraps async calls in try/catch that logs the error.

**Before:** `const data = await fetchData();`
**After:** `let data; try { data = await fetchData(); } catch (e) { console.error(e); }`

## missing-await

Adds missing `await` to async function calls in async context.

**Before:** `saveData(record);` (where saveData is async)
**After:** `await saveData(record);`

## typo-in-literal

Fixes typos in string literals (log messages, display text).

## missing-i18n-key

Adds a missing translation key to message JSON files with a fallback value.

## unused-import-removal

Removes import statements that are never referenced in the file.

## unused-variable-removal

Removes variable declarations that are never read.

## revert-recent-commit

When a commit is identified as the likely cause of a regression (via git history correlation), proposes reverting it.

**When appropriate:** Error appeared immediately after a recent (<24h) single-file commit.
**When NOT:** The commit is old, touches multiple files, or the error has other likely causes.

This class is the riskiest and should be enabled last during the Phase 4 rollout.
