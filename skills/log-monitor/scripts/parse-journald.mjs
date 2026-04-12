/**
 * Parse journalctl short-precise output.
 * Detects OOM kills, disk-full events, and daemon restarts as special
 * event_type metadata fields.
 */

// journald short-precise format:
// TIMESTAMP HOSTNAME UNIT: MESSAGE
const JOURNALD_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{4})?)\s+(\S+)\s+([^:]+):\s+(.*)$/;

/**
 * Detect special event types from the log message content.
 *
 * @param {string} message
 * @returns {string|null}
 */
function detectEventType(message) {
  const lower = message.toLowerCase();
  if (lower.includes('out of memory') || lower.includes('oom-killer') || lower.includes('killed process')) {
    return 'oom_kill';
  }
  if (lower.includes('disk full') || lower.includes('no space left')) {
    return 'disk_full_90_percent';
  }
  if (lower.includes('restarted') || lower.includes('daemon restart') || /docker.*restart/i.test(message)) {
    return 'daemon_restart';
  }
  return null;
}

/**
 * Parse raw journalctl short-precise output into structured log entries.
 *
 * @param {string} raw - Raw journalctl output
 * @param {{ severity_profile?: string }} [opts={}]
 * @returns {Array<{ timestamp: string, level: string, message: string, source: string, metadata: { host: string, unit: string, event_type: string|null } }>}
 */
export function parseJournald(raw, opts = {}) {
  if (!raw || typeof raw !== 'string') return [];

  const lines = raw.split('\n').filter(l => l.trim() !== '');
  const entries = [];

  for (const line of lines) {
    const match = line.match(JOURNALD_RE);
    if (!match) continue;

    const [, timestamp, host, unit, message] = match;
    const event_type = detectEventType(message);

    entries.push({
      timestamp,
      level: event_type ? 'error' : 'info',
      message,
      source: 'journald',
      metadata: {
        host,
        unit: unit.trim(),
        event_type,
      },
    });
  }

  return entries;
}
