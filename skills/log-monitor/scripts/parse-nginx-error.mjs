/**
 * Nginx error log parser.
 *
 * Parses lines matching the Nginx error format:
 *   YYYY/MM/DD HH:MM:SS [level] pid#tid: *conn_id message
 *
 * @module parse-nginx-error
 */

const LINE_RE = /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+(.*)$/;

/**
 * Convert an Nginx timestamp (2026/04/12 01:15:00) to ISO 8601.
 *
 * @param {string} raw  e.g. "2026/04/12 01:15:00"
 * @returns {string}     e.g. "2026-04-12T01:15:00Z"
 */
function toISO(raw) {
  return raw.replace(/\//g, '-').replace(' ', 'T') + 'Z';
}

/**
 * Parse raw Nginx error log text into LogEvent[].
 *
 * @param {string} raw                Raw log text (multiline string)
 * @param {{ severity_profile?: string }} [opts={}]  Options (reserved for future use)
 * @returns {Array<{ timestamp: string, level: string, message: string, source: string, metadata: Record<string, unknown> }>}
 */
export function parseNginxError(raw, opts = {}) {
  if (!raw) return [];

  const lines = raw.split('\n');
  const events = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(LINE_RE);
    if (!match) continue;

    const [, ts, level, message] = match;

    events.push({
      timestamp: toISO(ts),
      level,
      message,
      source: 'nginx-error',
      metadata: {},
    });
  }

  return events;
}
