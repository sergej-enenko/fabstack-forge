import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJournald } from '../../skills/log-monitor/scripts/parse-journald.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = readFileSync(
  resolve(__dirname, '../fixtures/logs/journald-oom.txt'),
  'utf-8',
);

describe('parseJournald', () => {
  it('parses OOM lines and marks them error with event_type oom_kill', () => {
    const entries = parseJournald(fixture);
    const oomEntries = entries.filter(e => e.metadata.event_type === 'oom_kill');

    assert.equal(oomEntries.length, 2);
    for (const entry of oomEntries) {
      assert.equal(entry.level, 'error');
      assert.equal(entry.source, 'journald');
      assert.equal(entry.metadata.host, 'labong-server');
      assert.equal(entry.metadata.event_type, 'oom_kill');
    }
    assert.match(oomEntries[0].message, /Out of memory/);
    assert.match(oomEntries[1].message, /Killed process/);
  });

  it('detects daemon restart with event_type daemon_restart', () => {
    const entries = parseJournald(fixture);
    const restartEntries = entries.filter(
      e => e.metadata.event_type === 'daemon_restart',
    );

    assert.equal(restartEntries.length, 1);
    assert.equal(restartEntries[0].level, 'error');
    assert.equal(restartEntries[0].source, 'journald');
    assert.equal(restartEntries[0].metadata.host, 'labong-server');
    assert.equal(restartEntries[0].metadata.unit, 'dockerd[567]');
    assert.match(restartEntries[0].message, /restarted/);
  });

  it('skips unparseable lines and returns empty array for random text', () => {
    const result = parseJournald('just some random text\nmore nonsense here');
    assert.deepStrictEqual(result, []);
  });
});
