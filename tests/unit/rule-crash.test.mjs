import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crashRule } from '../../skills/log-monitor/scripts/classifier-rules/crash.mjs';

describe('crashRule', () => {
  it('matches uncaught exception', () => {
    const events = [
      { level: 'error', message: 'Uncaught exception: Cannot read property of null' },
    ];
    const results = crashRule(events);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule_id, 'crash');
    assert.equal(results[0].event, events[0]);
  });

  it('matches process exit', () => {
    const events = [
      { level: 'error', message: 'process exited with code 137' },
    ];
    const results = crashRule(events);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule_id, 'crash');
  });

  it('matches oom_kill event_type from journald', () => {
    const events = [
      { level: 'error', message: 'Out of memory', metadata: { event_type: 'oom_kill' } },
    ];
    const results = crashRule(events);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule_id, 'crash');
    assert.match(results[0].reason, /oom_kill/);
  });

  it('does NOT match info-level events', () => {
    const events = [
      { level: 'info', message: 'Uncaught exception handled gracefully' },
      { level: 'info', message: 'process exited with code 0', metadata: { event_type: 'oom_kill' } },
    ];
    const results = crashRule(events);
    assert.equal(results.length, 0);
  });
});
