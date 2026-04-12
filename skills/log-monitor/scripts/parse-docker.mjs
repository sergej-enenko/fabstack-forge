/**
 * Parse `docker logs` output (ISO timestamp + [level] + message) into LogEvent[].
 * Multi-line stack traces are assembled into a single event's metadata.stack array.
 */

const LOG_LINE_RE = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)\s+\[(\w+)\]\s+(.*)$/;
const STACK_FRAME_RE = /^\s*at\s+/;

/**
 * @typedef {Object} LogEvent
 * @property {Date}     timestamp
 * @property {string}   source
 * @property {string}   severity_profile
 * @property {string}   level
 * @property {string}   message
 * @property {string}   raw
 * @property {{ container: string, stack: string[] }} metadata
 */

/**
 * Parse raw docker log output into structured LogEvent objects.
 *
 * @param {string} raw          - Raw docker logs text
 * @param {Object} opts
 * @param {string} opts.container        - Container name (used as source)
 * @param {string} opts.severity_profile - Severity profile label
 * @returns {LogEvent[]}
 */
export function parseDocker(raw, opts = {}) {
  const { container = 'unknown', severity_profile = 'default' } = opts;
  const lines = raw.split('\n');
  const events = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(LOG_LINE_RE);

    if (match) {
      const [, ts, level, message] = match;

      // If the message is a stack frame, fold into the current event
      if (current && STACK_FRAME_RE.test(message)) {
        current.metadata.stack.push(message.trim());
        current.raw += '\n' + line;
        continue;
      }

      // Flush previous event
      if (current) {
        events.push(current);
      }

      current = {
        timestamp: new Date(ts),
        source: container,
        severity_profile,
        level,
        message,
        raw: line,
        metadata: {
          container,
          stack: [],
        },
      };
    } else if (current && STACK_FRAME_RE.test(line)) {
      // Bare stack frame line (no timestamp) — append to current event
      current.metadata.stack.push(line.trim());
      current.raw += '\n' + line;
    }
    // Lines without valid timestamps and not stack frames are skipped
  }

  // Flush last event
  if (current) {
    events.push(current);
  }

  return events;
}
