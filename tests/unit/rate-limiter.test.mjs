import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, RateLimitExceededError } from '../../skills/log-monitor/scripts/rate-limiter.mjs';

const hour = 60 * 60 * 1000;

function makeConfig(overrides = {}) {
  return {
    api_calls: { cap: 3, window_ms: hour },
    ssh_fetches: { cap: 2, window_ms: hour },
    ...overrides,
  };
}

describe('createRateLimiter', () => {
  it('allows operations under the cap', () => {
    const limiter = createRateLimiter(makeConfig());
    limiter.consume('api_calls');
    limiter.consume('api_calls');
    // 2 of 3 — should not throw
    assert.equal(limiter.count('api_calls'), 2);
  });

  it('throws RateLimitExceededError on cap overflow', () => {
    const limiter = createRateLimiter(makeConfig());
    limiter.consume('api_calls');
    limiter.consume('api_calls');
    limiter.consume('api_calls');
    assert.throws(
      () => limiter.consume('api_calls'),
      (err) => {
        assert.ok(err instanceof RateLimitExceededError);
        assert.ok(err instanceof Error);
        assert.match(err.message, /api_calls/);
        assert.equal(err.key, 'api_calls');
        assert.equal(err.cap, 3);
        return true;
      },
    );
  });

  it('slides window — expired entries free up capacity', () => {
    let clock = 0;
    const limiter = createRateLimiter(
      { pings: { cap: 2, window_ms: 1000 } },
      { now: () => clock },
    );

    // Fill to cap at t=0
    limiter.consume('pings');
    limiter.consume('pings');
    assert.equal(limiter.count('pings'), 2);

    // Still at t=0 — should be blocked
    assert.throws(() => limiter.consume('pings'), RateLimitExceededError);

    // Advance past window — entries expire
    clock = 1001;
    assert.equal(limiter.count('pings'), 0);

    // Should succeed again
    limiter.consume('pings');
    assert.equal(limiter.count('pings'), 1);
  });

  it('serializes and deserializes state for persistence', () => {
    let clock = 100;
    const config = makeConfig();
    const limiter1 = createRateLimiter(config, { now: () => clock });

    limiter1.consume('api_calls');
    limiter1.consume('ssh_fetches');
    limiter1.consume('api_calls');

    const state = limiter1.serialize();

    // State should be a plain object with timestamp arrays
    assert.deepEqual(Object.keys(state).sort(), ['api_calls', 'ssh_fetches']);
    assert.equal(state.api_calls.length, 2);
    assert.equal(state.ssh_fetches.length, 1);
    assert.deepEqual(state.api_calls, [100, 100]);
    assert.deepEqual(state.ssh_fetches, [100]);

    // Restore into a fresh limiter
    const limiter2 = createRateLimiter(config, { now: () => clock });
    limiter2.restore(state);

    assert.equal(limiter2.count('api_calls'), 2);
    assert.equal(limiter2.count('ssh_fetches'), 1);

    // One more api_call fills the cap
    limiter2.consume('api_calls');
    assert.throws(() => limiter2.consume('api_calls'), RateLimitExceededError);
  });

  it('reports counts without consuming', () => {
    const limiter = createRateLimiter(makeConfig());
    assert.equal(limiter.count('api_calls'), 0);
    assert.equal(limiter.count('ssh_fetches'), 0);

    limiter.consume('api_calls');
    assert.equal(limiter.count('api_calls'), 1);
    // count should not change the counter
    assert.equal(limiter.count('api_calls'), 1);
  });

  it('unknown key throws Error', () => {
    const limiter = createRateLimiter(makeConfig());
    assert.throws(
      () => limiter.consume('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(!(err instanceof RateLimitExceededError));
        assert.match(err.message, /nonexistent/);
        return true;
      },
    );
    assert.throws(
      () => limiter.count('nonexistent'),
      (err) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /nonexistent/);
        return true;
      },
    );
  });
});
