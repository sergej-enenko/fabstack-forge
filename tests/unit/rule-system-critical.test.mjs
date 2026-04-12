import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { systemCriticalRule } from '../../skills/log-monitor/scripts/classifier-rules/system-critical.mjs';

describe('systemCriticalRule', () => {
  const config = { events: ['oom_kill', 'daemon_restart'] };

  it('matches oom_kill events', () => {
    const events = [
      { level: 'error', message: 'Out of memory', metadata: { event_type: 'oom_kill' } },
    ];
    const results = systemCriticalRule(events, config);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule_id, 'system_critical');
    assert.match(results[0].reason, /oom_kill/);
  });

  it('matches daemon_restart events', () => {
    const events = [
      { level: 'warn', message: 'Service restarted', metadata: { event_type: 'daemon_restart' } },
    ];
    const results = systemCriticalRule(events, config);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule_id, 'system_critical');
    assert.match(results[0].reason, /daemon_restart/);
  });

  it('ignores unlisted event types', () => {
    const events = [
      { level: 'info', message: 'Normal log rotation', metadata: { event_type: 'log_rotate' } },
      { level: 'error', message: 'Some error', metadata: { event_type: 'disk_warning' } },
      { level: 'info', message: 'No metadata at all' },
    ];
    const results = systemCriticalRule(events, config);
    assert.equal(results.length, 0);
  });
});
