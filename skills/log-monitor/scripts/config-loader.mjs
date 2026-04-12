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
 * Default values for optional per-project config sections.
 * Deep-merged underneath each project's config so explicit values always win.
 */
const PROJECT_DEFAULTS = {
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
    resolve_after_hours: 24,
  },
  investigator: {
    enabled: true,
    max_parallel: 3,
    max_investigations_per_run: 10,
    timeout_seconds: 120,
  },
  patcher: {
    enabled: false,
    require_tests: true,
    max_files_per_patch: 1,
    max_lines_per_patch: 10,
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

// ---------------------------------------------------------------------------
// v1 validation (single-project, backward compat)
// ---------------------------------------------------------------------------

function validateV1(config) {
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
  if (!Array.isArray(config.project?.workspaces) || config.project.workspaces.length === 0) {
    throw new ConfigError('project.workspaces must be a non-empty array');
  }
  if (!Array.isArray(config.servers) || config.servers.length === 0) {
    throw new ConfigError('servers must be a non-empty array');
  }
}

// ---------------------------------------------------------------------------
// v1 → v2 upgrade
// ---------------------------------------------------------------------------

/**
 * Convert a v1 single-project config into the v2 hub format.
 * The single project becomes the only entry in the projects array.
 */
function upgradeV1toV2(v1) {
  const server = v1.servers?.[0] ?? {};
  const project = {
    id: v1.project.name,
    github_repo: v1.project.github_repo,
    base_branch: v1.project.base_branch ?? 'main',
    mode: v1.project.mode,
    server: {
      host_secret: v1.collector?.secret_names?.host ?? 'FORGE_HOST',
      user_secret: v1.collector?.secret_names?.user ?? 'FORGE_USER',
      ssh_key_secret: v1.collector?.secret_names?.ssh_private_key ?? 'FORGE_SSH_KEY',
    },
    workspaces: v1.project.workspaces,
    log_sources: v1.log_sources ?? [],
  };

  // Carry over per-project overridable sections if they existed in v1
  for (const key of ['severity_rules', 'classifier', 'dedup', 'investigator', 'patcher', 'reporter', 'time_window']) {
    if (v1[key]) project[key] = v1[key];
  }
  if (v1.security_sensitive_patterns) {
    project.security_patterns = v1.security_sensitive_patterns;
  }

  return {
    version: 2,
    hub: { github_repo: v1.project.github_repo },
    projects: [project],
    defaults: {},
    schedule: v1.schedule ?? { cron: '17 */2 * * *', timezone: 'UTC' },
    state: v1.state ?? { branch: 'monitoring' },
    log_bridge: v1.log_bridge ?? { branch: 'forge-logs', logs_path: 'logs', max_age_hours: 3 },
    collector: {
      schedule_cron: v1.collector?.schedule_cron ?? '3 */2 * * *',
      timeout_minutes: v1.collector?.timeout_minutes ?? 5,
    },
  };
}

// ---------------------------------------------------------------------------
// v2 validation (multi-project hub)
// ---------------------------------------------------------------------------

function validateV2(config) {
  if (!config.hub?.github_repo) {
    throw new ConfigError('hub.github_repo is required');
  }
  if (!Array.isArray(config.projects) || config.projects.length === 0) {
    throw new ConfigError('projects must be a non-empty array');
  }
  const ids = new Set();
  for (const proj of config.projects) {
    if (!proj.id) throw new ConfigError('Each project must have an id');
    if (ids.has(proj.id)) throw new ConfigError(`Duplicate project id: ${proj.id}`);
    ids.add(proj.id);
    if (!proj.github_repo) throw new ConfigError(`projects[${proj.id}].github_repo is required`);
    const validModes = ['observe', 'fix'];
    if (!validModes.includes(proj.mode)) {
      throw new ConfigError(`projects[${proj.id}].mode must be one of: ${validModes.join(', ')}`);
    }
    if (!proj.server?.ssh_key_secret) {
      throw new ConfigError(`projects[${proj.id}].server.ssh_key_secret is required`);
    }
  }
}

/**
 * Apply defaults to each project: global PROJECT_DEFAULTS ← config.defaults ← project overrides.
 */
function applyProjectDefaults(config) {
  const globalDefaults = config.defaults
    ? deepMerge(PROJECT_DEFAULTS, config.defaults)
    : PROJECT_DEFAULTS;

  config.projects = config.projects.map((proj) => {
    const merged = deepMerge(globalDefaults, proj);
    // Mode-specific: fix mode forces patcher.enabled
    if (merged.mode === 'fix') merged.patcher = { ...merged.patcher, enabled: true };
    return merged;
  });
  return config;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load a YAML config file. Supports both v1 (single-project) and v2 (hub).
 * v1 configs are transparently upgraded to v2 format.
 *
 * @param {string} configPath
 * @returns {object} validated v2 config with defaults applied to each project
 */
export function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    throw new ConfigError(`Config file not found: ${configPath}`);
  }

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

  let config;
  if (raw.version === 1) {
    validateV1(raw);
    config = upgradeV1toV2(raw);
  } else if (raw.version === 2) {
    validateV2(raw);
    config = raw;
  } else {
    throw new ConfigError(
      `Schema version ${raw.version} is not supported (expected 1 or 2)`,
    );
  }

  return applyProjectDefaults(config);
}

/**
 * Get a single project's resolved config by id.
 * Convenience wrapper for use in the pipeline loop.
 *
 * @param {object} hubConfig - loaded v2 config
 * @param {string} projectId
 * @returns {object} project config with all defaults applied
 */
export function getProject(hubConfig, projectId) {
  const proj = hubConfig.projects.find((p) => p.id === projectId);
  if (!proj) throw new ConfigError(`Project not found: ${projectId}`);
  return proj;
}
