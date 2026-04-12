import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createStateManager } from '../../skills/log-monitor/scripts/state-manager.mjs';

const TMP_DIR = join(import.meta.dirname, '..', '..', '.tmp-test-state-lock');

describe('state-manager lock acquire/release', () => {
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

  it('acquires lock when none exists', () => {
    const result = mgr.acquireLock();
    assert.equal(result.status, 'acquired');
    assert.ok(existsSync(lockPath));
  });

  it('rejects lock when fresh lock exists', () => {
    // First acquire succeeds
    const now = Date.now();
    mgr.acquireLock({ now: () => now });

    // Second acquire at same time — rejected
    const result = mgr.acquireLock({ now: () => now });
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'another run in progress');
  });

  it('steals stale lock >2h old', () => {
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const oldTime = Date.now() - TWO_HOURS - 1000; // 2h + 1s ago

    // Write a stale lock manually
    const staleLock = {
      pid: 99999,
      started_at: new Date(oldTime).toISOString(),
      runtime: 'node',
    };
    writeFileSync(lockPath, JSON.stringify(staleLock), 'utf-8');

    // Acquire should steal it
    const result = mgr.acquireLock();
    assert.equal(result.status, 'stolen');
    assert.ok(existsSync(lockPath));
  });

  it('releases lock (file deleted)', () => {
    mgr.acquireLock();
    assert.ok(existsSync(lockPath));

    mgr.releaseLock();
    assert.equal(existsSync(lockPath), false);
  });

  it('release is idempotent when lock already missing', () => {
    // No lock file exists — should not throw
    assert.equal(existsSync(lockPath), false);
    mgr.releaseLock();
    assert.equal(existsSync(lockPath), false);
  });
});
