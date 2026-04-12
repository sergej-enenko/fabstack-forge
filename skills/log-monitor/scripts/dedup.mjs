/**
 * Dedup engine — categorizes classified events by cross-referencing fingerprints
 * against state.known_errors.
 *
 * Categories:
 *   new        — fingerprint not in state.known_errors at all
 *   continuing — fingerprint active in state AND last_seen within resolve_after_hours
 *   returning  — fingerprint in state but last_seen older than resolve_after_hours (came back)
 *   resolved   — fingerprint active in state, NOT seen in current run,
 *                AND last_seen older than resolve_after_hours
 */

const DEFAULT_RESOLVE_AFTER_HOURS = 24;

/**
 * @param {Array<{fingerprint: string}>} events  - classified events from the current run
 * @param {{known_errors: Array<{fingerprint: string, last_seen: string, state: string}>}} state
 * @param {{dedup?: {resolve_after_hours?: number}}} config
 * @param {{now?: Date}} [opts]
 * @returns {{
 *   new: Array<object>,
 *   continuing: Array<object>,
 *   returning: Array<object>,
 *   resolved: Array<object>
 * }}
 */
export function dedup(events, state, config, opts = {}) {
  const now = opts.now ?? new Date();
  const resolveAfterHours =
    config.dedup?.resolve_after_hours ?? DEFAULT_RESOLVE_AFTER_HOURS;
  const resolveAfterMs = resolveAfterHours * 60 * 60 * 1000;

  // Index known errors by fingerprint for O(1) lookup
  const knownByFp = new Map();
  for (const entry of state.known_errors ?? []) {
    knownByFp.set(entry.fingerprint, entry);
  }

  // Track which known fingerprints appear in the current run
  const seenFingerprints = new Set();

  const result = {
    new: [],
    continuing: [],
    returning: [],
    resolved: [],
  };

  for (const event of events) {
    const fp = event.fingerprint;
    seenFingerprints.add(fp);

    const known = knownByFp.get(fp);

    if (!known) {
      // Never seen before
      result.new.push(event);
      continue;
    }

    const lastSeenAt = new Date(known.last_seen).getTime();
    const elapsed = now.getTime() - lastSeenAt;

    if (elapsed < resolveAfterMs) {
      // Recently seen — still active
      result.continuing.push(event);
    } else {
      // Was quiet long enough to be considered resolved, but came back
      result.returning.push(event);
    }
  }

  // Check for resolved errors: active in state, NOT in current run,
  // AND last_seen older than resolve_after_hours
  for (const entry of state.known_errors ?? []) {
    if (entry.state !== 'active') continue;
    if (seenFingerprints.has(entry.fingerprint)) continue;

    const lastSeenAt = new Date(entry.last_seen).getTime();
    const elapsed = now.getTime() - lastSeenAt;

    if (elapsed >= resolveAfterMs) {
      result.resolved.push(entry);
    }
  }

  return result;
}
