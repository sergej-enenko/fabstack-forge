/**
 * Nginx combined-format access log parser.
 *
 * Parses lines matching the Nginx combined log format into LogEvent objects
 * with HTTP metadata. Classifies status codes: 5xx = error, 4xx = warn, rest = info.
 */

const COMBINED_RE =
  /^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\w+)\s+([^"]+?)\s+HTTP\/[\d.]+"\s+(\d{3})\s+(\S+)\s+"([^"]*)"\s+"([^"]*)"/;

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Parse Nginx date format: "12/Apr/2026:00:00:12 +0200"
 * @param {string} raw
 * @returns {string} ISO 8601 timestamp
 */
function parseNginxDate(raw) {
  // Format: DD/Mon/YYYY:HH:MM:SS +ZZZZ
  const match = raw.match(
    /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})$/,
  );
  if (!match) return raw;

  const [, day, mon, year, hour, min, sec, tz] = match;
  const month = MONTHS[mon];
  if (month === undefined) return raw;

  // Parse timezone offset
  const tzSign = tz[0] === '+' ? 1 : -1;
  const tzHours = parseInt(tz.slice(1, 3), 10);
  const tzMinutes = parseInt(tz.slice(3, 5), 10);
  const offsetMs = tzSign * (tzHours * 60 + tzMinutes) * 60_000;

  // Build UTC date by subtracting the offset
  const local = new Date(
    parseInt(year, 10),
    month,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(min, 10),
    parseInt(sec, 10),
  );
  const utc = new Date(local.getTime() - offsetMs);
  return utc.toISOString();
}

/**
 * Classify HTTP status code into log level.
 * @param {number} status
 * @returns {'error' | 'warn' | 'info'}
 */
function classifyStatus(status) {
  if (status >= 500) return 'error';
  if (status >= 400) return 'warn';
  return 'info';
}

/**
 * Parse raw Nginx combined-format access log text into LogEvent[].
 *
 * @param {string} raw — raw log text (multi-line)
 * @param {{ severity_profile?: string }} [opts]
 * @returns {Array<{
 *   timestamp: string,
 *   level: 'error' | 'warn' | 'info',
 *   message: string,
 *   source: 'nginx-access',
 *   metadata: {
 *     http_method: string,
 *     http_path: string,
 *     http_status: number,
 *     remote_addr: string,
 *     user_agent: string,
 *     referer: string,
 *   }
 * }>}
 */
export function parseNginxAccess(raw, opts = {}) {
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  const events = [];

  for (const line of lines) {
    const m = COMBINED_RE.exec(line);
    if (!m) continue;

    const [, remoteAddr, dateStr, method, path, statusStr, , referer, ua] = m;
    const status = parseInt(statusStr, 10);

    events.push({
      timestamp: parseNginxDate(dateStr),
      level: classifyStatus(status),
      message: `${method} ${path} ${statusStr}`,
      source: 'nginx-access',
      metadata: {
        http_method: method,
        http_path: path,
        http_status: status,
        remote_addr: remoteAddr,
        user_agent: ua,
        referer,
      },
    });
  }

  return events;
}
