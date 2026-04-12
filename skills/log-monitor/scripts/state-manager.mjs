/**
 * State manager for Forge run state.
 * Handles load/save with atomic writes, backup/restore, and lock acquire/release.
 */

import { readFileSync, writeFileSync, renameSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';

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

      // Try primary file
      const raw = readFileSync(statePath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        if (parsed.version !== 1) {
          throw new StateCorruptError(`Unsupported state version: ${parsed.version}`);
        }
        return parsed;
      } catch (primaryErr) {
        // Primary corrupt — try backup
        if (!existsSync(backupPath)) {
          throw primaryErr instanceof StateCorruptError
            ? primaryErr
            : new StateCorruptError(`Failed to parse state.json: ${primaryErr.message}`);
        }

        const backupRaw = readFileSync(backupPath, 'utf-8');
        try {
          const backupParsed = JSON.parse(backupRaw);
          if (backupParsed.version !== 1) {
            throw new StateCorruptError(`Unsupported backup state version: ${backupParsed.version}`);
          }
          return backupParsed;
        } catch (backupErr) {
          throw backupErr instanceof StateCorruptError
            ? backupErr
            : new StateCorruptError(`Both state.json and backup are corrupt`);
        }
      }
    },

    /**
     * Save state atomically: write to .tmp, then rename over the real file.
     * @param {object} state
     */
    save(state) {
      // Back up existing state before overwriting
      if (existsSync(statePath)) {
        copyFileSync(statePath, backupPath);
      }

      const tmpPath = statePath + '.tmp';
      writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
      renameSync(tmpPath, statePath);
    },

    /**
     * Acquire an exclusive run lock.
     * @param {{ now?: () => number }} [opts]
     * @returns {{ status: 'acquired' | 'rejected' | 'stolen', reason?: string }}
     */
    acquireLock(opts = {}) {
      const now = opts.now ?? (() => Date.now());
      const STALE_MS = 2 * 60 * 60 * 1000; // 2 hours
      let stolen = false;

      if (existsSync(lockPath)) {
        const raw = readFileSync(lockPath, 'utf-8');
        const lock = JSON.parse(raw);
        const age = now() - new Date(lock.started_at).getTime();

        if (age < STALE_MS) {
          return { status: 'rejected', reason: 'another run in progress' };
        }

        // Stale lock — reclaim
        unlinkSync(lockPath);
        stolen = true;
      }

      const lockData = {
        pid: process.pid,
        started_at: new Date(now()).toISOString(),
        runtime: 'node',
      };
      writeFileSync(lockPath, JSON.stringify(lockData, null, 2), 'utf-8');

      return { status: stolen ? 'stolen' : 'acquired' };
    },

    /**
     * Release the run lock. Idempotent — does not throw if lock is already missing.
     */
    releaseLock() {
      try {
        unlinkSync(lockPath);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    },
  };
}
