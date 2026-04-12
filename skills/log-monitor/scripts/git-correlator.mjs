// Git correlator: temporal commit correlation for root-cause analysis.
// Finds the "prime suspect" — a commit that landed shortly before the error appeared.

/**
 * Parse a git log line in the format: hash|author|date|subject
 *
 * @param {string} line
 * @returns {{ hash: string, author: string, date: string, subject: string } | null}
 */
function parseGitLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('|');
  if (parts.length < 4) return null;
  return {
    hash: parts[0],
    author: parts[1],
    date: parts[2],
    subject: parts.slice(3).join('|'),
  };
}

/**
 * Correlate an error event with recent git history for root-cause signal.
 *
 * @param {{ first_seen?: string }} event       — the error event
 * @param {string} file                          — file path from stack trace
 * @param {number} line                          — line number from stack trace
 * @param {object} config                        — config with correlation_window_minutes
 * @param {object} opts
 * @param {(args: string[]) => Promise<string>} opts.git — injected git command runner
 * @returns {Promise<{ recent_commits: Array, line_range_history: Array, prime_suspect: object|null }>}
 */
export async function correlate(event, file, line, config, opts) {
  const empty = { recent_commits: [], line_range_history: [], prime_suspect: null };
  const git = opts?.git;
  if (!git) return empty;

  const windowMinutes = config?.correlation_window_minutes ?? 60;
  const firstSeen = event?.first_seen ? new Date(event.first_seen) : new Date();

  // Build a "since" date: look back 24h from first_seen for recent commits
  const sinceDate = new Date(firstSeen.getTime() - 24 * 60 * 60 * 1000);
  const sinceStr = sinceDate.toISOString();

  let recent_commits = [];
  let line_range_history = [];

  // 1. Recent commits touching this file
  try {
    const logOutput = await git([
      'log',
      `--since=${sinceStr}`,
      '--pretty=format:%H|%an|%aI|%s',
      '--',
      file,
    ]);
    recent_commits = logOutput
      .split('\n')
      .map(parseGitLine)
      .filter(Boolean);
  } catch {
    return empty;
  }

  // 2. Line-range history
  try {
    const rangeStart = Math.max(1, line - 5);
    const rangeEnd = line + 5;
    const rangeOutput = await git([
      'log',
      `-L${rangeStart},${rangeEnd}:${file}`,
      '--pretty=format:%H|%an|%aI|%s',
      '--no-patch',
    ]);
    line_range_history = rangeOutput
      .split('\n')
      .map(parseGitLine)
      .filter(Boolean);
  } catch {
    // Line-range history may fail on some repos; not fatal
  }

  // 3. Find prime suspect: most recent commit where (first_seen - commit.date)
  //    is positive and within the correlation window
  let prime_suspect = null;
  for (const commit of recent_commits) {
    const commitDate = new Date(commit.date);
    const diffMs = firstSeen.getTime() - commitDate.getTime();
    const diffMinutes = diffMs / (60 * 1000);

    if (diffMinutes > 0 && diffMinutes <= windowMinutes) {
      if (
        prime_suspect === null ||
        diffMinutes < prime_suspect.minutes_before_error
      ) {
        prime_suspect = {
          hash: commit.hash,
          author: commit.author,
          date: commit.date,
          minutes_before_error: Math.round(diffMinutes),
        };
      }
    }
  }

  return { recent_commits, line_range_history, prime_suspect };
}
