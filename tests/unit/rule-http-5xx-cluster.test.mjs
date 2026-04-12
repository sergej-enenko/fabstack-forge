import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { http5xxClusterRule } from '../../skills/log-monitor/scripts/classifier-rules/http-5xx-cluster.mjs';

function makeEvent(path, status, hoursOffset = 0) {
  const ts = new Date('2026-04-11T00:00:00Z');
  ts.setTime(ts.getTime() + hoursOffset * 60 * 60 * 1000);
  return {
    source: 'nginx-access',
    http_status: status,
    http_path: path,
    timestamp: ts.toISOString(),
    level: 'error',
  };
}

describe('http5xxClusterRule', () => {
  it('matches 5 identical 5xx on same path', () => {
    const events = Array.from({ length: 5 }, (_, i) => makeEvent('/api/products', 502, i * 0.1));
    const results = http5xxClusterRule(events);
    assert.equal(results.length, 5);
    for (const r of results) {
      assert.equal(r.rule_id, 'http_5xx_cluster');
    }
  });

  it('does NOT match fewer than threshold (4 events, threshold 5)', () => {
    const events = Array.from({ length: 4 }, (_, i) => makeEvent('/api/products', 500, i * 0.1));
    const results = http5xxClusterRule(events, { threshold: 5 });
    assert.equal(results.length, 0);
  });

  it('different paths do NOT cluster together', () => {
    const eventsA = Array.from({ length: 3 }, (_, i) => makeEvent('/a', 500, i * 0.1));
    const eventsB = Array.from({ length: 3 }, (_, i) => makeEvent('/b', 500, i * 0.1));
    const results = http5xxClusterRule([...eventsA, ...eventsB], { threshold: 5 });
    assert.equal(results.length, 0);
  });

  it('respects window boundary (3 at T=0h + 3 at T=5h, 2h window)', () => {
    const early = Array.from({ length: 3 }, (_, i) => makeEvent('/api', 503, i * 0.1));
    const late = Array.from({ length: 3 }, (_, i) => makeEvent('/api', 503, 5 + i * 0.1));
    const results = http5xxClusterRule([...early, ...late], { threshold: 5, window_minutes: 120 });
    assert.equal(results.length, 0);
  });
});
