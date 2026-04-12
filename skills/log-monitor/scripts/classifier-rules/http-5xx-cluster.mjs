// Classifier rule: http_5xx_cluster
// Detects clusters of 5xx errors on the same path within a sliding time window.

/**
 * @param {Array<object>} events
 * @param {object} [config]
 * @param {number} [config.threshold=5]
 * @param {number} [config.window_minutes=120]
 * @returns {Array<{event: object, rule_id: string, reason: string}>}
 */
export function http5xxClusterRule(events, config = {}) {
  const threshold = config.threshold ?? 5;
  const windowMs = (config.window_minutes ?? 120) * 60 * 1000;

  // Step 1: filter to nginx-access events with status >= 500
  const fiveXx = events.filter(
    (e) => e.source === 'nginx-access' && e.http_status >= 500,
  );

  // Step 2: group by http_path
  const groups = new Map();
  for (const event of fiveXx) {
    const path = event.http_path;
    if (!groups.has(path)) groups.set(path, []);
    groups.get(path).push(event);
  }

  const matched = new Set();

  // Step 3: sliding window per path group
  for (const [, group] of groups) {
    group.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let left = 0;
    for (let right = 0; right < group.length; right++) {
      const rightTime = new Date(group[right].timestamp).getTime();

      // Advance left pointer past the window boundary
      while (new Date(group[left].timestamp).getTime() < rightTime - windowMs) {
        left++;
      }

      // Check if current window has enough events
      if (right - left + 1 >= threshold) {
        // Mark all events in this window
        for (let i = left; i <= right; i++) {
          matched.add(group[i]);
        }
      }
    }
  }

  // Step 4: return results preserving original order
  return events
    .filter((e) => matched.has(e))
    .map((event) => ({
      event,
      rule_id: 'http_5xx_cluster',
      reason: `${threshold}+ 5xx errors on ${event.http_path} within ${config.window_minutes ?? 120}m`,
    }));
}
