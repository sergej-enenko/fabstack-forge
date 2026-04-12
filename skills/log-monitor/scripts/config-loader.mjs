import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';

/**
 * Error thrown when config loading or validation fails.
 */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Default values for optional config sections.
 * Deep-merged underneath the loaded config so explicit values always win.
 */
const DEFAULTS = {
  time_window: {
    lookback_hours: 2,
    buffer_minutes: 10,
  },
  classifier: {
    rules_enabled: true,
    ai_layer_enabled: true,
    upgrade_only: true,
    max_errors_per_ai_batch: 100,
  },
  severity_rules: {
    fatal_patterns: [],
    error_patterns: [],
    warn_patterns: [],
  },
  dedup: {
    enabled: true,
    window_minutes: 60,
  },
  investigator: {
    enabled: true,
    max_parallel: 3,
    timeout_seconds: 120,
  },
  patcher: {
    enabled: false,
    require_tests: true,
    max_files_per_patch: 5,
  },
  reporter: {
    format: 'github-issue',
    include_raw_logs: false,
    max_log_lines: 50,
  },
};

/**
 * Deep-merge source into target. Source values override target values.
 * Arrays are replaced, not concatenated.
 *
 * @param {object} target - defaults
 * @param {object} source - user config (wins)
 * @returns {object} merged result
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal, srcVal);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

/**
 * Validate the parsed config against schema v1 rules.
 *
 * @param {object} config
 * @throws {ConfigError}
 */
function validate(config) {
  // Version check
  if (config.version !== 1) {
    throw new ConfigError(
      `Schema version ${config.version} is not supported (expected 1)`,
    );
  }

  // Project checks
  if (!config.project?.name) {
    throw new ConfigError('project.name is required');
  }
  if (!config.project?.github_repo) {
    throw new ConfigError('project.github_repo is required');
  }
  const validModes = ['observe', 'fix'];
  if (!validModes.includes(config.project?.mode)) {
    throw new ConfigError(
      `project.mode must be one of: ${validModes.join(', ')} (got "${config.project?.mode}")`,
    );
  }

  // Workspaces
  if (!Array.isArray(config.project?.workspaces) || config.project.workspaces.length === 0) {
    throw new ConfigError('project.workspaces must be a non-empty array');
  }

  // Servers
  if (!Array.isArray(config.servers) || config.servers.length === 0) {
    throw new ConfigError('servers must be a non-empty array');
  }
}

/**
 * Load a YAML config file, validate against schema v1, and apply defaults
 * for optional fields.
 *
 * @param {string} configPath - absolute or relative path to a .yml file
 * @returns {object} validated config with defaults applied
 * @throws {ConfigError} on missing file, parse error, or validation failure
 */
export function loadConfig(configPath) {
  // Check file exists
  if (!existsSync(configPath)) {
    throw new ConfigError(`Config file not found: ${configPath}`);
  }

  // Read and parse YAML
  let raw;
  try {
    const content = readFileSync(configPath, 'utf-8');
    raw = yaml.load(content);
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`Failed to parse config: ${err.message}`);
  }

  if (!raw || typeof raw !== 'object') {
    throw new ConfigError('Config file is empty or not a valid YAML mapping');
  }

  // Validate required fields
  validate(raw);

  // Deep-merge defaults underneath the loaded config
  const config = deepMerge(DEFAULTS, raw);

  // Mode-specific overrides: fix mode forces patcher.enabled = true
  if (config.project.mode === 'fix' && raw.patcher?.enabled === false) {
    config.patcher.enabled = true;
  }

  return config;
}
