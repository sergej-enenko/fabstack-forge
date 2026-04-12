// Classifier rule: new_signature
// Flags error events whose fingerprint has not been seen before.

/**
 * @param {Array<object>} events
 * @param {object} state
 * @param {Array<{fingerprint: string}>} state.known_errors
 * @returns {Array<{event: object, rule_id: string, reason: string}>}
 */
export function newSignatureRule(events, state) {
  const known = new Set((state.known_errors ?? []).map((e) => e.fingerprint));
  const results = [];

  for (const event of events) {
    if (event.level !== 'error') continue;
    if (event.fingerprint == null) continue;
    if (known.has(event.fingerprint)) continue;

    results.push({
      event,
      rule_id: 'new_signature',
      reason: `fingerprint ${event.fingerprint} not in known_errors`,
    });
  }

  return results;
}
