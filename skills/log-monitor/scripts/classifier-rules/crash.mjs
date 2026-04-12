// Classifier rule: crash
// Matches error-level events that indicate process crashes, uncaught exceptions, or OOM kills.

const patterns = [
  /uncaught\s+(error|exception|typeerror|rangeerror|referenceerror)/i,
  /unhandledpromiserejection/i,
  /process\s+exited\s+with\s+code/i,
  /segmentation fault/i,
  /fatal error/i,
];

/**
 * @param {Array<object>} events
 * @returns {Array<{event: object, rule_id: string, reason: string}>}
 */
export function crashRule(events) {
  const results = [];
  for (const event of events) {
    if (event.level !== 'error') continue;

    const msg = event.message ?? '';

    for (const pattern of patterns) {
      if (pattern.test(msg)) {
        results.push({ event, rule_id: 'crash', reason: `message matches ${pattern}` });
        break;
      }
    }

    if (!results.length || results[results.length - 1].event !== event) {
      if (event.metadata?.event_type === 'oom_kill') {
        results.push({ event, rule_id: 'crash', reason: 'event_type is oom_kill' });
      }
    }
  }
  return results;
}
