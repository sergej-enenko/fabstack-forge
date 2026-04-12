/**
 * Log fetcher for the hybrid architecture.
 *
 * Reads pre-collected logs from the forge-logs git branch via `git show`.
 * The GitHub Actions collector (Level 0) has already SSHed to production
 * and committed raw logs to that branch.
 *
 * Flow:
 *   1. git fetch origin <branch>
 *   2. Read logs/fetched-at.txt to check freshness
 *   3. List log files via git ls-tree
 *   4. For each log_sources entry, read via git show and route to parser
 *   5. Handle FETCH_FAILED markers gracefully
 *   6. Sort events by timestamp, return
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { parseDocker } from './parse-docker.mjs';
import { parseNginxAccess } from './parse-nginx-access.mjs';
import { parseNginxError } from './parse-nginx-error.mjs';
import { parseJournald } from './parse-journald.mjs';

const execFileAsync = promisify(execFileCb);

/** Parser routing map. */
const PARSERS = {
  docker: parseDocker,
  'nginx-access': parseNginxAccess,
  'nginx-error': parseNginxError,
  journald: parseJournald,
};

/**
 * Default git executor — shells out to real git.
 *
 * @param {string[]} args  git CLI arguments
 * @returns {Promise<string>}  stdout
 */
async function defaultGit(args) {
  const { stdout } = await execFileAsync('git', args);
  return stdout;
}

/**
 * Fetch logs from the forge-logs git branch.
 *
 * @param {Object} config
 * @param {Object} config.log_bridge
 * @param {string} config.log_bridge.branch
 * @param {string} config.log_bridge.logs_path
 * @param {number} config.log_bridge.max_age_hours
 * @param {Array<{ file: string, parser: string, source_name: string, severity_profile: string }>} config.log_sources
 * @param {Object} [opts]
 * @param {Function} [opts.git]         Mock-friendly git executor
 * @param {boolean}  [opts.returnMeta]  When true, return { events, failures, warnings }
 * @param {string}   [opts.projectId]   When set, prefix log paths with logs/{projectId}/ (hub mode)
 * @returns {Promise<Array|{ events: Array, failures: Array, warnings: Array }>}
 */
export async function fetchLogs(config, opts = {}) {
  const git = opts.git || defaultGit;
  const { branch, logs_path, max_age_hours } = config.log_bridge;
  const ref = `origin/${branch}`;
  const projectId = opts.projectId;

  // In hub mode (v2), logs are at logs/{projectId}/. In v1 mode, logs are at logs/.
  const logsDir = projectId ? `${logs_path}/${projectId}` : logs_path;

  const failures = [];
  const warnings = [];
  let allEvents = [];

  // 1. Fetch latest forge-logs branch
  await git(['fetch', 'origin', branch]);

  // 2. Check freshness via fetched-at.txt
  try {
    const fetchedAtRaw = await git(['show', `${ref}:${logsDir}/fetched-at.txt`]);
    const fetchedAt = new Date(fetchedAtRaw.trim());

    if (!isNaN(fetchedAt.getTime())) {
      const ageMs = Date.now() - fetchedAt.getTime();
      const ageHours = ageMs / (1000 * 60 * 60);

      if (ageHours > max_age_hours) {
        warnings.push(`stale: logs are ${ageHours.toFixed(1)}h old (max ${max_age_hours}h)`);
      }
    }
  } catch {
    warnings.push('fetched-at.txt missing or unreadable');
  }

  // 3. Read each configured log source
  for (const source of config.log_sources) {
    try {
      const content = await git(['show', `${ref}:${source.file}`]);

      // 4. Check for FETCH_FAILED marker
      const firstLine = content.split('\n')[0];
      if (firstLine.startsWith('FETCH_FAILED')) {
        failures.push({ source: source.source_name, reason: firstLine });
        continue;
      }

      // 5. Route to appropriate parser
      const parser = PARSERS[source.parser];
      if (!parser) {
        failures.push({ source: source.source_name, reason: `unknown parser: ${source.parser}` });
        continue;
      }

      const events = parser(content, {
        container: source.source_name,
        severity_profile: source.severity_profile,
      });

      // Tag each event with the configured source_name
      for (const event of events) {
        event.source = source.source_name;
      }

      allEvents.push(...events);
    } catch (err) {
      failures.push({ source: source.source_name, reason: err.message });
    }
  }

  // 6. If ALL sources failed, throw
  if (failures.length === config.log_sources.length) {
    throw new Error('all sources failed');
  }

  // 7. Sort events by timestamp ascending
  allEvents.sort((a, b) => {
    const tA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
    const tB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
    return tA - tB;
  });

  if (opts.returnMeta) {
    return { events: allEvents, failures, warnings };
  }

  return allEvents;
}
