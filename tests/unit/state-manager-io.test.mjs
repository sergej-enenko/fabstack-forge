import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createStateManager, StateCorruptError } from '../../skills/log-monitor/scripts/state-manager.mjs';

const TMP_DIR = join(import.meta.dirname, '..', '..', '.tmp-test-state-io');
const FIXTURES = join(import.meta.dirname, '..', 'fixtures', 'state');

describe('state-manager load/save', () => {
  let statePath, backupPath, lockPath;

  beforeEach(() => {
    mkdirSync(TMP_DIR, { recursive: true });
    statePath = join(TMP_DIR, 'state.json');
    backupPath = join(TMP_DIR, 'state.backup.json');
    lockPath = join(TMP_DIR, 'state.lock');
  });

  afterEach(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it('loads empty state fixture', () => {
    const fixtureState = join(FIXTURES, 'empty.json');
    const mgr = createStateManager({ statePath: fixtureState, backupPath, lockPath });
    const state = mgr.load();
    assert.equal(state.version, 1);
    assert.equal(state.known_errors.length, 0);
    assert.equal(state.last_run, null);
    assert.equal(state.run_count_total, 0);
  });

  it('loads populated state fixture', () => {
    const fixtureState = join(FIXTURES, 'with-known-errors.json');
    const mgr = createStateManager({ statePath: fixtureState, backupPath, lockPath });
    const state = mgr.load();
    assert.equal(state.known_errors.length, 1);
    assert.equal(state.known_errors[0].fingerprint, 'abc123');
    assert.equal(state.run_count_total, 12);
    assert.equal(state.last_run, '2026-04-12T00:17:00Z');
  });

  it('returns empty state when file missing', () => {
    const mgr = createStateManager({ statePath, backupPath, lockPath });
    const state = mgr.load();
    assert.equal(state.version, 1);
    assert.equal(state.known_errors.length, 0);
    assert.equal(state.run_count_total, 0);
    assert.equal(state.last_run, null);
  });

  it('throws StateCorruptError on corrupt JSON', () => {
    writeFileSync(statePath, '{not valid json!!!', 'utf-8');
    const mgr = createStateManager({ statePath, backupPath, lockPath });
    assert.throws(
      () => mgr.load(),
      (err) => {
        assert.ok(err instanceof StateCorruptError);
        assert.ok(err instanceof Error);
        assert.match(err.message, /Failed to parse/);
        return true;
      },
    );
  });

  it('save writes atomically (tmp then rename)', () => {
    const mgr = createStateManager({ statePath, backupPath, lockPath });
    const data = {
      version: 1,
      last_run: '2026-04-12T01:00:00Z',
      run_count_total: 5,
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

    mgr.save(data);

    // tmp file should be cleaned up (renamed away)
    assert.equal(existsSync(statePath + '.tmp'), false);

    // Main file should have correct data
    const loaded = JSON.parse(readFileSync(statePath, 'utf-8'));
    assert.equal(loaded.version, 1);
    assert.equal(loaded.run_count_total, 5);
    assert.equal(loaded.last_run, '2026-04-12T01:00:00Z');
  });
});
