import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createStateManager, StateCorruptError } from '../../skills/log-monitor/scripts/state-manager.mjs';

const TMP_DIR = join(import.meta.dirname, '..', '..', '.tmp-test-state-backup');

describe('state-manager backup + restore', () => {
  let statePath, backupPath, lockPath, mgr;

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    statePath = join(TMP_DIR, 'state.json');
    backupPath = join(TMP_DIR, 'state.backup.json');
    lockPath = join(TMP_DIR, 'state.lock');
    mgr = createStateManager({ statePath, backupPath, lockPath });
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('backup created before save when state.json exists', () => {
    // First save — creates state.json with old data
    const oldData = {
      version: 1, last_run: '2026-04-11T00:00:00Z', run_count_total: 1,
      known_errors: [], circuit_breaker: {
        daily_pr_count: 0, daily_pr_count_reset_at: null,
        disabled_fix_classes: [], self_disabled: false,
        self_disabled_reason: null, consecutive_failures: 0,
      },
      regression_watch: [], rejection_log: [],
    };
    mgr.save(oldData);

    // Second save — should back up old data first
    const newData = { ...oldData, run_count_total: 5, last_run: '2026-04-12T00:00:00Z' };
    mgr.save(newData);

    // Backup should contain old data
    assert.ok(existsSync(backupPath));
    const backup = JSON.parse(readFileSync(backupPath, 'utf-8'));
    assert.equal(backup.run_count_total, 1);
    assert.equal(backup.last_run, '2026-04-11T00:00:00Z');

    // Main file should contain new data
    const main = JSON.parse(readFileSync(statePath, 'utf-8'));
    assert.equal(main.run_count_total, 5);
    assert.equal(main.last_run, '2026-04-12T00:00:00Z');
  });

  it('no backup on first save (no prior state)', () => {
    const data = {
      version: 1, last_run: null, run_count_total: 0,
      known_errors: [], circuit_breaker: {
        daily_pr_count: 0, daily_pr_count_reset_at: null,
        disabled_fix_classes: [], self_disabled: false,
        self_disabled_reason: null, consecutive_failures: 0,
      },
      regression_watch: [], rejection_log: [],
    };
    mgr.save(data);

    // State file should exist
    assert.ok(existsSync(statePath));
    // Backup should NOT exist — nothing to back up
    assert.equal(existsSync(backupPath), false);
  });

  it('load falls back to backup when state.json is corrupt', () => {
    // Write valid backup
    const goodState = {
      version: 1, last_run: '2026-04-10T00:00:00Z', run_count_total: 7,
      known_errors: [], circuit_breaker: {
        daily_pr_count: 0, daily_pr_count_reset_at: null,
        disabled_fix_classes: [], self_disabled: false,
        self_disabled_reason: null, consecutive_failures: 0,
      },
      regression_watch: [], rejection_log: [],
    };
    writeFileSync(backupPath, JSON.stringify(goodState), 'utf-8');

    // Corrupt primary
    writeFileSync(statePath, '!!!not json!!!', 'utf-8');

    const state = mgr.load();
    assert.equal(state.run_count_total, 7);
    assert.equal(state.last_run, '2026-04-10T00:00:00Z');
  });

  it('throws when both state.json and backup are corrupt', () => {
    writeFileSync(statePath, '!!!corrupt!!!', 'utf-8');
    writeFileSync(backupPath, '!!!also corrupt!!!', 'utf-8');

    assert.throws(
      () => mgr.load(),
      (err) => {
        assert.ok(err instanceof StateCorruptError);
        assert.match(err.message, /corrupt/i);
        return true;
      },
    );
  });
});
