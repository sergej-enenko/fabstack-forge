import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ssrErrorRule } from '../../skills/log-monitor/scripts/classifier-rules/ssr-error.mjs';

describe('ssrErrorRule', () => {
  it('matches TypeError in storefront source', () => {
    const events = [
      { source: 'storefront', level: 'error', message: 'TypeError: Cannot read properties of undefined' },
    ];
    const results = ssrErrorRule(events);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule_id, 'ssr_error');
    assert.equal(results[0].event, events[0]);
  });

  it('matches hydration mismatch', () => {
    const events = [
      { source: 'storefront', level: 'error', message: "Server rendered HTML didn't match client" },
    ];
    const results = ssrErrorRule(events);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule_id, 'ssr_error');
  });

  it('does NOT match medusa errors (wrong source)', () => {
    const events = [
      { source: 'medusa', level: 'error', message: 'TypeError: something broke in medusa' },
    ];
    const results = ssrErrorRule(events);
    assert.equal(results.length, 0);
  });
});
