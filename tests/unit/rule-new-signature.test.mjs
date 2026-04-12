import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { newSignatureRule } from '../../skills/log-monitor/scripts/classifier-rules/new-signature.mjs';

describe('newSignatureRule', () => {
  it('marks events with never-seen fingerprint as new_signature', () => {
    const events = [
      { level: 'error', fingerprint: 'abc123', message: 'something new' },
      { level: 'error', fingerprint: 'def456', message: 'another new one' },
    ];
    const state = { known_errors: [{ fingerprint: 'xyz999' }] };
    const results = newSignatureRule(events, state);
    assert.equal(results.length, 2);
    assert.equal(results[0].rule_id, 'new_signature');
    assert.equal(results[1].rule_id, 'new_signature');
  });

  it('skips info-level events', () => {
    const events = [
      { level: 'info', fingerprint: 'abc123', message: 'just info' },
    ];
    const state = { known_errors: [] };
    const results = newSignatureRule(events, state);
    assert.equal(results.length, 0);
  });

  it('returns empty when all fingerprints are known', () => {
    const events = [
      { level: 'error', fingerprint: 'abc123', message: 'known error' },
      { level: 'error', fingerprint: 'def456', message: 'also known' },
    ];
    const state = {
      known_errors: [{ fingerprint: 'abc123' }, { fingerprint: 'def456' }],
    };
    const results = newSignatureRule(events, state);
    assert.equal(results.length, 0);
  });
});
