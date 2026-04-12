import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dedup } from '../../skills/log-monitor/scripts/dedup.mjs';

const now = new Date('2026-04-12T02:00:00Z');
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);

/**
 * Build a minimal classified event with a fingerprint.
 */
function makeEvent(fingerprint, overrides = {}) {
  return {
    fingerprint,
    rule_id: 'crash',
    severity: 'critical',
    message: 'something failed',
    ...overrides,
  };
}

/**
 * Build a known_errors entry.
 */
function makeKnown(fingerprint, lastSeen, overrides = {}) {
  return {
    fingerprint,
    first_seen: hoursAgo(48).toISOString(),
    last_seen: lastSeen.toISOString(),
    count: 5,
    severity: 'critical',
    title: 'Known error',
    state: 'active',
    ...overrides,
  };
}

const baseConfig = { dedup: { resolve_after_hours: 24 } };

describe('dedup', () => {
  it('classifies new fingerprint as new (empty known_errors)', () => {
    const events = [makeEvent('fp_never_seen')];
    const state = { known_errors: [] };

    const result = dedup(events, state, baseConfig, { now });

    assert.equal(result.new.length, 1);
    assert.equal(result.new[0].fingerprint, 'fp_never_seen');
    assert.equal(result.continuing.length, 0);
    assert.equal(result.returning.length, 0);
    assert.equal(result.resolved.length, 0);
  });

  it('classifies active fingerprint with recent last_seen as continuing', () => {
    const events = [makeEvent('fp_active')];
    const state = {
      known_errors: [makeKnown('fp_active', hoursAgo(2))],
    };

    const result = dedup(events, state, baseConfig, { now });

    assert.equal(result.continuing.length, 1);
    assert.equal(result.continuing[0].fingerprint, 'fp_active');
    assert.equal(result.new.length, 0);
    assert.equal(result.returning.length, 0);
    assert.equal(result.resolved.length, 0);
  });

  it('classifies fingerprint with last_seen >24h ago reappearing as returning', () => {
    const events = [makeEvent('fp_old')];
    const state = {
      known_errors: [makeKnown('fp_old', hoursAgo(30))],
    };

    const result = dedup(events, state, baseConfig, { now });

    assert.equal(result.returning.length, 1);
    assert.equal(result.returning[0].fingerprint, 'fp_old');
    assert.equal(result.new.length, 0);
    assert.equal(result.continuing.length, 0);
    assert.equal(result.resolved.length, 0);
  });

  it('classifies active fingerprint not in current run AND last_seen >24h ago as resolved', () => {
    const events = []; // no events in current run
    const state = {
      known_errors: [makeKnown('fp_gone', hoursAgo(30))],
    };

    const result = dedup(events, state, baseConfig, { now });

    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0].fingerprint, 'fp_gone');
    assert.equal(result.new.length, 0);
    assert.equal(result.continuing.length, 0);
    assert.equal(result.returning.length, 0);
  });

  it('does NOT resolve active fingerprint not in current run when last_seen <24h ago', () => {
    const events = []; // no events in current run
    const state = {
      known_errors: [makeKnown('fp_quiet', hoursAgo(6))],
    };

    const result = dedup(events, state, baseConfig, { now });

    // Should not appear in any category — just quiet, not resolved
    assert.equal(result.resolved.length, 0);
    assert.equal(result.new.length, 0);
    assert.equal(result.continuing.length, 0);
    assert.equal(result.returning.length, 0);
  });
});
