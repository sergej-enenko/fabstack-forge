import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocker } from '../../skills/log-monitor/scripts/parse-docker.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(resolve(__dirname, '..', 'fixtures', 'logs', name), 'utf-8');

describe('parseDocker', () => {
  it('parses healthy log into info events', () => {
    const raw = fixture('medusa-healthy-2h.txt');
    const events = parseDocker(raw, {
      container: 'medusa',
      severity_profile: 'high',
    });

    assert.equal(events.length, 5);
    for (const e of events) {
      assert.equal(e.level, 'info');
      assert.equal(e.source, 'medusa');
      assert.equal(e.severity_profile, 'high');
      assert.ok(e.timestamp instanceof Date);
      assert.ok(!isNaN(e.timestamp.getTime()));
    }
  });

  it('parses crash log with stack trace into single error event', () => {
    const raw = fixture('medusa-with-crash.txt');
    const events = parseDocker(raw, {
      container: 'medusa',
      severity_profile: 'high',
    });

    // Should be: info (healthcheck), error (with 3 stack frames), warn
    const errorEvents = events.filter((e) => e.level === 'error');
    assert.equal(errorEvents.length, 1);

    const crash = errorEvents[0];
    assert.equal(crash.metadata.stack.length, 3);
    assert.match(crash.metadata.stack[0], /at getProductMetadata/);
    assert.match(crash.metadata.stack[1], /at processRequest/);
    assert.match(crash.metadata.stack[2], /at processTicksAndRejections/);
  });

  it('skips lines without valid timestamps', () => {
    const raw = 'no timestamp here\njust plain text\n';
    const events = parseDocker(raw, { container: 'test' });
    assert.equal(events.length, 0);
  });

  it('detects warn level', () => {
    const raw = fixture('medusa-with-crash.txt');
    const events = parseDocker(raw, {
      container: 'medusa',
      severity_profile: 'high',
    });

    const warnEvents = events.filter((e) => e.level === 'warn');
    assert.equal(warnEvents.length, 1);
    assert.match(warnEvents[0].message, /Container exiting with code 1/);
  });

  it('preserves raw line', () => {
    const raw = fixture('medusa-healthy-2h.txt');
    const events = parseDocker(raw, {
      container: 'medusa',
      severity_profile: 'high',
    });

    assert.equal(
      events[0].raw,
      '2026-04-12T00:05:12.456Z [info] Medusa server started on port 9000',
    );
  });
});
