/**
 * Sliding-window rate limiter with per-key counters.
 * Enforces hourly caps for API calls, SSH fetches, git pushes, etc.
 */

export class RateLimitExceededError extends Error {
  /**
   * @param {string} key
   * @param {number} cap
   */
  constructor(key, cap) {
    super(`Rate limit exceeded for "${key}" (cap: ${cap})`);
    this.name = 'RateLimitExceededError';
    this.key = key;
    this.cap = cap;
  }
}

/**
 * @param {Record<string, { cap: number, window_ms: number }>} config
 * @param {{ now?: () => number }} [opts]
 */
export function createRateLimiter(config, opts = {}) {
  const now = opts.now ?? (() => Date.now());

  /** @type {Record<string, number[]>} */
  const buckets = Object.create(null);
  for (const key of Object.keys(config)) {
    buckets[key] = [];
  }

  function assertKey(key) {
    if (!(key in config)) {
      throw new Error(`Unknown rate-limiter key: "${key}"`);
    }
  }

  function prune(key) {
    const cutoff = now() - config[key].window_ms;
    const arr = buckets[key];
    // Entries are sorted chronologically — find first valid index
    let i = 0;
    while (i < arr.length && arr[i] <= cutoff) i++;
    if (i > 0) arr.splice(0, i);
  }

  return {
    /**
     * Record one use of `key`. Throws RateLimitExceededError if cap reached.
     * @param {string} key
     */
    consume(key) {
      assertKey(key);
      prune(key);
      if (buckets[key].length >= config[key].cap) {
        throw new RateLimitExceededError(key, config[key].cap);
      }
      buckets[key].push(now());
    },

    /**
     * Return current count for `key` within the active window (no side effects).
     * @param {string} key
     * @returns {number}
     */
    count(key) {
      assertKey(key);
      prune(key);
      return buckets[key].length;
    },

    /**
     * Serialize all bucket timestamps for persistence.
     * @returns {Record<string, number[]>}
     */
    serialize() {
      const out = Object.create(null);
      for (const key of Object.keys(config)) {
        out[key] = buckets[key].slice();
      }
      return out;
    },

    /**
     * Restore previously serialized state.
     * @param {Record<string, number[]>} state
     */
    restore(state) {
      for (const key of Object.keys(state)) {
        if (key in config) {
          buckets[key] = state[key].slice();
        }
      }
    },
  };
}
