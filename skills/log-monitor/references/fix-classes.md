# Allowed Fix Classes

The patcher only applies fixes whose `class` field is in this allowlist. Each fix class is a narrowly scoped, well-understood transformation with low risk of introducing new bugs.

---

## 1. `null-guard`

**What it does:** Adds a null/undefined check before accessing a property or calling a method on a potentially null value.

**When appropriate:**
- Stack trace shows `TypeError: Cannot read properties of null/undefined`
- The null value is clearly due to a missing guard, not a broken data flow

**When NOT appropriate:**
- The null value indicates a deeper data-fetching or state-management bug
- The code path should never reach this point with null data (mask a logic error)

**Example:**

Before:
```js
const title = product.metadata.title;
```

After:
```js
const title = product.metadata?.title ?? '';
```

---

## 2. `missing-error-boundary`

**What it does:** Wraps a React component or async operation in an error boundary or try/catch.

**When appropriate:**
- An unhandled exception crashes an entire page when only one component is broken
- The fix adds graceful degradation (fallback UI or error state)

**When NOT appropriate:**
- The root cause is in the component itself and should be fixed directly
- The error boundary would hide a critical failure that needs immediate attention

**Example:**

Before:
```tsx
export default function ProductCard({ product }) {
  return <div>{product.variants[0].title}</div>;
}
```

After:
```tsx
export default function ProductCard({ product }) {
  try {
    return <div>{product.variants[0].title}</div>;
  } catch {
    return <div className="error-fallback">Product unavailable</div>;
  }
}
```

---

## 3. `missing-optional-chain`

**What it does:** Replaces a bare property access chain with optional chaining (`?.`).

**When appropriate:**
- Stack trace shows `TypeError` on a nested property access
- The intermediate object can legitimately be undefined (API response, optional field)

**When NOT appropriate:**
- The object should never be undefined at that point (indicates broken contract)
- Optional chaining would silently produce `undefined` and break downstream logic

**Example:**

Before:
```js
const price = response.data.variants[0].prices.amount;
```

After:
```js
const price = response.data?.variants?.[0]?.prices?.amount;
```

---

## 4. `typo-in-literal`

**What it does:** Fixes a typo in a string literal (variable name, object key, CSS class, route path).

**When appropriate:**
- Error clearly caused by a misspelled key or identifier
- The correct spelling is obvious from context (e.g., `"prodcut"` → `"product"`)

**When NOT appropriate:**
- The "typo" might be intentional (different API version, legacy naming)
- Multiple possible corrections exist and the right one is ambiguous

**Example:**

Before:
```js
const name = product.metdata.display_name;
```

After:
```js
const name = product.metadata.display_name;
```

---

## 5. `missing-i18n-key`

**What it does:** Adds a missing translation key to a message file (JSON).

**When appropriate:**
- Error log shows "Missing message: <key>" from next-intl or similar
- The missing key has an obvious default value (English text, or copied from another locale)

**When NOT appropriate:**
- The key is missing because the feature is incomplete (not a fix, but unfinished work)
- The correct translation is unknown and needs human review

**Example:**

Before (de.json):
```json
{
  "header.home": "Startseite",
  "header.cart": "Warenkorb"
}
```

After (de.json):
```json
{
  "header.home": "Startseite",
  "header.cart": "Warenkorb",
  "header.search": "Suche"
}
```

---

## 6. `unused-import-removal`

**What it does:** Removes an import statement that is not referenced anywhere in the file.

**When appropriate:**
- Build warning or linting error about unused import
- The import was left behind after a refactor

**When NOT appropriate:**
- The import has side effects (CSS imports, polyfills, module augmentation)
- The import is used via a re-export or dynamic access pattern

**Example:**

Before:
```js
import { useState, useEffect, useCallback } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

After:
```js
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

---

## 7. `unused-variable-removal`

**What it does:** Removes a variable declaration that is assigned but never read.

**When appropriate:**
- Linting error about unused variable
- The variable was left behind after a refactor

**When NOT appropriate:**
- The variable is used for destructuring side effects (e.g., `const { important, ...rest } = obj`)
- The variable is a function parameter required by a callback signature
- Removing it changes the behavior of a spread or rest pattern

**Example:**

Before:
```js
const result = await fetchProducts();
const filtered = result.filter(p => p.active);
console.log(result.length);
```

After:
```js
const result = await fetchProducts();
console.log(result.length);
```

---

## 8. `missing-await`

**What it does:** Adds a missing `await` keyword before an async function call.

**When appropriate:**
- Error log shows a Promise object being used where a value was expected
- The function is clearly async and the caller is in an async context

**When NOT appropriate:**
- The Promise is intentionally not awaited (fire-and-forget pattern)
- Adding await would change control flow in a way that introduces race conditions
- The caller is not an async function (would require larger refactor)

**Example:**

Before:
```js
async function loadPage() {
  const data = fetchProductData(id);
  return renderTemplate(data);
}
```

After:
```js
async function loadPage() {
  const data = await fetchProductData(id);
  return renderTemplate(data);
}
```

---

## 9. `revert-recent-commit`

**What it does:** Reverts a specific recent commit identified by the git correlator as the prime suspect.

**When appropriate:**
- Git correlator found a commit that landed within the correlation window (default 60 min) before the error first appeared
- The commit touches the exact file/line range where the error originates
- High confidence that the commit introduced the regression

**When NOT appropriate:**
- The commit is a merge commit affecting many files
- The commit has already been built upon by subsequent commits
- The error existed before the commit (coincidental timing)

**Note:** This fix class bypasses the single-file / 10-line diff scope gate (P7) since reverts may be larger. All other gates still apply.

**Example:**

The patcher runs `git revert <hash>` in an isolated worktree, then creates a draft PR with the revert.
