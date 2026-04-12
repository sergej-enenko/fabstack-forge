/**
 * State manager for Forge run state.
 * Handles load/save with atomic writes, backup/restore, and lock acquire/release.
 */

import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';

const EMPTY_STATE = {
  version: 1,
  last_run: null,
  run_count_total: 0,
  known_errors: [],
  circuit_breaker: {
    daily_pr_count: 0,
    daily_pr_count_reset_at: null,
    disabled_fix_classes: [],
    self_disabled: false,
    self_disabled_reason: null,
    consecutive_failures: 0,
  },
  regression_watch: [],
  rejection_log: [],
};

export class StateCorruptError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'StateCorruptError';
  }
}

/**
 * @param {{ statePath: string, backupPath: string, lockPath: string }} opts
 */
export function createStateManager({ statePath, backupPath, lockPath }) {
  return {
    /**
     * Load state from disk. Returns empty state if file missing.
     * Throws StateCorruptError on invalid JSON.
     */
    load() {
      if (!existsSync(statePath)) {
        return structuredClone(EMPTY_STATE);
      }

      const raw = readFileSync(statePath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1) {
          throw new StateCorruptError(`Unsupported state version: ${parsed.version}`);
        }
        return parsed;
      } catch (err) {
        if (err instanceof StateCorruptError) throw err;
        throw new StateCorruptError(`Failed to parse state.json: ${err.message}`);
      }
    },

    /**
     * Save state atomically: write to .tmp, then rename over the real file.
     * @param {object} state
     */
    save(state) {
      const tmpPath = statePath + '.tmp';
      writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
      renameSync(tmpPath, statePath);
    },
  };
}
