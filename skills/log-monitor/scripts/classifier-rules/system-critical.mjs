// Classifier rule: system_critical
// Matches events whose metadata.event_type appears in a configurable allow-list.

/**
 * @param {Array<object>} events
 * @param {object} config
 * @param {Array<string>} config.events — allowed event_type strings
 * @returns {Array<{event: object, rule_id: string, reason: string}>}
 */
export function systemCriticalRule(events, config) {
  const allowed = new Set(config.events ?? []);
  const results = [];

  for (const event of events) {
    const eventType = event.metadata?.event_type;
    if (eventType != null && allowed.has(eventType)) {
      results.push({
        event,
        rule_id: 'system_critical',
        reason: `event_type ${eventType} is in config.events`,
      });
    }
  }

  return results;
}
