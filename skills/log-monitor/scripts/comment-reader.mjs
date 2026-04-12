/**
 * Comment reader — parses /forge slash commands from GitHub Issue comment bodies.
 *
 * Returns a structured command object or null if no /forge command is found.
 */

const PATTERNS = [
  { re: /^\/forge\s+ignore-for\s+(\d+[smhd])$/, parse: (m) => ({ cmd: 'ignore-for', duration: m[1] }) },
  { re: /^\/forge\s+(?:ignore|noise)$/, parse: () => ({ cmd: 'ignore' }) },
  { re: /^\/forge\s+reclassify\s+(noise|notable|critical)$/, parse: (m) => ({ cmd: 'reclassify', target: m[1] }) },
  { re: /^\/forge\s+reinvestigate$/, parse: () => ({ cmd: 'reinvestigate' }) },
  { re: /^\/forge\s+wrong-fix-class\s+([\w-]+)$/, parse: (m) => ({ cmd: 'wrong-fix-class', suggestion: m[1] }) },
];

/**
 * @param {string} body — the full comment body text
 * @returns {{ cmd: string, [key: string]: string } | null}
 */
export function parseForgeCommand(body) {
  if (!body) return null;

  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    for (const pattern of PATTERNS) {
      const match = trimmed.match(pattern.re);
      if (match) {
        return pattern.parse(match);
      }
    }
  }

  return null;
}
