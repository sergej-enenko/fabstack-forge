// Investigator: full root-cause analysis pipeline for critical events.
// Orchestrates stack parsing, file reading, git blame/correlate, dependency check,
// security cap, and AI root-cause hypothesis.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { isNodeModulesPath } from './dependency-checker.mjs';

/**
 * Simple glob matcher for security-sensitive patterns.
 * Supports ** (any path) and * (single segment).
 *
 * @param {string} filePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchGlob(filePath, patterns) {
  if (!patterns || patterns.length === 0) return false;
  for (const p of patterns) {
    const re = new RegExp(
      '^' +
        p
          .replace(/\./g, '\\.')
          .replace(/\*\*/g, '::')
          .replace(/\*/g, '[^/]*')
          .replace(/::/g, '.*') +
        '$',
    );
    if (re.test(filePath)) return true;
  }
  return false;
}

/**
 * Parse a stack frame to extract file and line number.
 * Handles formats like:
 *   at Page (src/page.ts:42:15)
 *   at src/page.ts:42:15
 *
 * @param {string} stackFrame
 * @returns {{ file: string, line: number } | null}
 */
function parseLocation(stackFrame) {
  if (!stackFrame) return null;
  // Try parenthesized format first: at Fn (file:line:col)
  const paren = stackFrame.match(/\(([^)]+?):(\d+)(?::(\d+))?\)/);
  if (paren) return { file: paren[1], line: parseInt(paren[2], 10) };
  // Bare format: at file:line:col
  const bare = stackFrame.match(/\s(\S+?):(\d+)(?::(\d+))?/);
  if (bare) return { file: bare[1], line: parseInt(bare[2], 10) };
  return null;
}

/** Allowed fix classes */
const ALLOWED_FIX_CLASSES = [
  'null-guard',
  'type-coercion',
  'bounds-check',
  'error-handling',
  'config-fix',
  'import-fix',
  'retry-logic',
  'revert-recent-commit',
];

/**
 * Investigate a list of critical events for root-cause analysis.
 *
 * @param {Array<object>} criticals — classified critical events
 * @param {object} config
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {(prompt: object) => Promise<object>} opts.ai
 * @param {(event, file, line, config, opts) => Promise<object>} [opts.gitCorrelate]
 * @param {(file: string) => Promise<string>} [opts.gitBlame]
 * @param {() => Promise<boolean>} [opts.activeDevZone]
 * @param {(path: string, opts: object) => Promise<object|null>} [opts.checkDep]
 * @returns {Promise<Array<object>>} InvestigationResult[]
 */
export async function investigate(criticals, config, opts) {
  const {
    repoRoot,
    ai,
    gitCorrelate,
    gitBlame,
    activeDevZone,
    checkDep,
  } = opts;

  const results = [];

  for (const event of criticals) {
    const result = {
      event,
      location: null,
      git_blame: null,
      git_history: null,
      dependency_info: null,
      root_cause: null,
      confidence_downgrade_reason: undefined,
      proposed_fixes: [],
      skipped_reason: undefined,
    };

    // Step 1: Parse stack trace for file + line
    const stackFrame = event.first_stack_frame || event.stack_frame || '';
    const location = parseLocation(stackFrame);
    if (!location) {
      result.skipped_reason = 'no-parseable-stack';
      results.push(result);
      continue;
    }
    result.location = location;

    // Step 2: Check if node_modules — dependency check, skip code fix
    if (isNodeModulesPath(location.file)) {
      if (checkDep) {
        try {
          result.dependency_info = await checkDep(location.file, opts);
        } catch {
          // non-fatal
        }
      }
      result.skipped_reason = 'node_modules';
      results.push(result);
      continue;
    }

    // Step 3: Check file existence
    const absPath = join(repoRoot, location.file);
    if (!existsSync(absPath)) {
      result.skipped_reason = 'file-not-found';
      results.push(result);
      continue;
    }

    // Step 4: Read file with +/-20 lines context
    let codeContext = '';
    try {
      const content = readFileSync(absPath, 'utf-8');
      const lines = content.split('\n');
      const start = Math.max(0, location.line - 21);
      const end = Math.min(lines.length, location.line + 20);
      codeContext = lines
        .slice(start, end)
        .map((l, i) => `${start + i + 1}: ${l}`)
        .join('\n');
    } catch {
      result.skipped_reason = 'file-read-error';
      results.push(result);
      continue;
    }

    // Step 5: Git blame
    if (gitBlame) {
      try {
        result.git_blame = await gitBlame(location.file);
      } catch {
        // non-fatal
      }
    }

    // Step 6: Git correlator for temporal correlation
    let gitHistory = null;
    if (gitCorrelate) {
      try {
        gitHistory = await gitCorrelate(event, location.file, location.line, config, opts);
        result.git_history = gitHistory;
      } catch {
        // non-fatal
      }
    }

    // Step 7: Check active-dev-zone
    let inActiveDevZone = false;
    if (activeDevZone) {
      try {
        inActiveDevZone = await activeDevZone();
      } catch {
        // non-fatal
      }
    }

    // Step 8: Check security-sensitive patterns
    const securityPatterns = config?.security_sensitive_patterns || [];
    const isSecuritySensitive = matchGlob(location.file, securityPatterns);

    // Step 9: Call AI for root-cause hypothesis + fix proposal
    if (ai) {
      try {
        const aiResult = await ai({
          event,
          location,
          code_context: codeContext,
          git_blame: result.git_blame,
          git_history: gitHistory,
        });

        if (aiResult?.root_cause) {
          result.root_cause = { ...aiResult.root_cause };

          // Security cap: cap confidence at medium
          if (isSecuritySensitive && result.root_cause.confidence === 'high') {
            result.root_cause.confidence = 'medium';
            result.confidence_downgrade_reason = 'security-sensitive';
          }
        }

        // Step 10: Validate AI output — fix class in allowlist
        if (aiResult?.proposed_fixes && !inActiveDevZone) {
          result.proposed_fixes = aiResult.proposed_fixes.filter(
            (fix) => ALLOWED_FIX_CLASSES.includes(fix.class),
          );
        }

        // Step 11: If prime_suspect + primary fix, add revert-recent-commit alternative
        if (
          gitHistory?.prime_suspect &&
          result.proposed_fixes.length > 0
        ) {
          result.proposed_fixes.push({
            class: 'revert-recent-commit',
            diff: null,
            explanation: `Revert commit ${gitHistory.prime_suspect.hash} by ${gitHistory.prime_suspect.author} (${gitHistory.prime_suspect.minutes_before_error} min before error)`,
            target_commit: gitHistory.prime_suspect.hash,
          });
        }
      } catch {
        // AI failure is non-fatal
      }
    }

    results.push(result);
  }

  return results;
}
