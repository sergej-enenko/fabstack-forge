/**
 * Patcher gate checks (P1-P12) and patch application.
 * Evaluates safety gates before allowing autonomous code changes.
 */

/** Hard-coded forbidden baseline — never allow patches to these paths. */
const FORBIDDEN_BASELINE = [
  '.env',
  '.env.*',
  'secrets/**',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.github/workflows/**',
  'infra/**',
  'docker-compose.yml',
  'docker-compose.*.yml',
  'nginx/**',
  '.dockerignore',
  'CODEOWNERS',
  '.circleci/**',
  '.gitlab-ci.yml',
];

/**
 * Minimal glob matcher — converts glob patterns to RegExp.
 * Supports `*` (single segment) and `**` (any depth).
 * @param {string} path
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchGlob(path, patterns) {
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
    if (re.test(path)) return true;
  }
  return false;
}

/**
 * Count added/removed lines in a unified diff (ignoring file headers).
 * @param {string} diff
 * @returns {number}
 */
function countDiffLines(diff) {
  return diff
    .split('\n')
    .filter(
      (l) =>
        (l.startsWith('+') || l.startsWith('-')) &&
        !l.startsWith('+++') &&
        !l.startsWith('---'),
    ).length;
}

/**
 * Count number of files changed in a unified diff.
 * @param {string} diff
 * @returns {number}
 */
function countDiffFiles(diff) {
  return (diff.match(/^\+\+\+ /gm) || []).length;
}

/**
 * Evaluate all patch gates. Returns early on first failure.
 *
 * @param {object} investigation
 * @param {object} fix
 * @param {object} config
 * @param {object} state
 * @param {object} opts
 * @param {() => boolean} opts.pauseFileExists
 * @param {() => Promise<boolean>} opts.humanTouched24h
 * @param {() => Promise<boolean>} opts.workingTreeClean
 * @param {{ count: (key?: string) => number }} opts.rateLimiter
 * @returns {Promise<{pass: boolean, reason?: string}>}
 */
export async function evaluateGates(investigation, fix, config, state, opts) {
  const {
    pauseFileExists,
    humanTouched24h,
    workingTreeClean,
    rateLimiter,
  } = opts;

  // P10 — pause file (cheapest check first)
  if (pauseFileExists()) {
    return { pass: false, reason: 'P10: .forge-pause file exists — patching paused' };
  }

  // P1 — confidence must be high
  if (investigation.root_cause.confidence !== 'high') {
    return {
      pass: false,
      reason: `P1: confidence is "${investigation.root_cause.confidence}", must be "high"`,
    };
  }

  // P2 — fix class must be in allowlist
  const allowlist = config.patcher.fix_classes.allowlist;
  if (!allowlist.includes(fix.class)) {
    return {
      pass: false,
      reason: `P2: fix class "${fix.class}" not in allowlist`,
    };
  }

  // P3 — fix class must not be circuit-broken
  const disabledClasses = state.circuit_breaker.disabled_fix_classes;
  if (disabledClasses.some((entry) => (entry.class ?? entry) === fix.class)) {
    return {
      pass: false,
      reason: `P3: fix class "${fix.class}" is circuit-broken`,
    };
  }

  // P4 — daily PR cap
  if (
    state.circuit_breaker.daily_pr_count >=
    config.patcher.rate_limits.max_auto_prs_per_day
  ) {
    return {
      pass: false,
      reason: `P4: daily PR cap reached (${state.circuit_breaker.daily_pr_count}/${config.patcher.rate_limits.max_auto_prs_per_day})`,
    };
  }

  // P5 — forbidden paths (baseline + config)
  const forbiddenPatterns = [
    ...FORBIDDEN_BASELINE,
    ...(config.patcher.guardrails.forbidden_paths ?? []),
  ];
  if (matchGlob(investigation.location.file, forbiddenPatterns)) {
    return {
      pass: false,
      reason: `P5: file "${investigation.location.file}" matches forbidden path pattern`,
    };
  }

  // P6 — human-modified in 24h
  if (await humanTouched24h(investigation.location.file)) {
    return {
      pass: false,
      reason: `P6: file "${investigation.location.file}" was human-modified in last 24h`,
    };
  }

  // P7 — diff scope (skip for revert-recent-commit)
  if (fix.class !== 'revert-recent-commit') {
    const filesChanged = countDiffFiles(fix.diff);
    const linesChanged = countDiffLines(fix.diff);
    if (filesChanged !== 1 || linesChanged > 10) {
      return {
        pass: false,
        reason: `P7: diff scope too large (${filesChanged} files, ${linesChanged} lines)`,
      };
    }
  }

  // P8 — working tree clean
  if (!(await workingTreeClean())) {
    return {
      pass: false,
      reason: 'P8: working tree is not clean',
    };
  }

  // P12 — hourly rate limits
  if (rateLimiter.count() > 0) {
    return {
      pass: false,
      reason: 'P12: hourly rate limit exceeded',
    };
  }

  return { pass: true };
}
