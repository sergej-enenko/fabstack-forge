// Classifier rule: ssr_error
// Matches error-level events from the storefront source that indicate SSR/hydration failures.

const patterns = [
  /typeerror/i,
  /rangeerror/i,
  /referenceerror/i,
  /hydration/i,
  /unhandledrejection/i,
  /server rendered html didn'?t match/i,
];

/**
 * @param {Array<object>} events
 * @param {object} [config]
 * @param {string} [config.source_match='storefront']
 * @returns {Array<{event: object, rule_id: string, reason: string}>}
 */
export function ssrErrorRule(events, config = {}) {
  const sourceMatch = config.source_match ?? 'storefront';
  const results = [];

  for (const event of events) {
    if (event.source !== sourceMatch) continue;
    if (event.level !== 'error') continue;

    const msg = event.message ?? '';

    for (const pattern of patterns) {
      if (pattern.test(msg)) {
        results.push({ event, rule_id: 'ssr_error', reason: `message matches ${pattern}` });
        break;
      }
    }
  }

  return results;
}
