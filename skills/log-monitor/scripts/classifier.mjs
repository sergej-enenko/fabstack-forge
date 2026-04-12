// Classifier: Layer 1 (rules) + Layer 2 (AI, upgrade-only)
// Combines deterministic rule matching with AI-powered classification.
// AI can upgrade events to notable/critical but CANNOT downgrade rule-matched events.

import { fingerprint } from './fingerprint.mjs';
import { applyRules } from './classifier-rules/index.mjs';

/**
 * Classify a batch of events using rules (L1) then AI (L2, upgrade-only).
 *
 * @param {Array<object>} events
 * @param {object} state
 * @param {object} config
 * @param {object} opts
 * @param {(batch: Array<object>) => Promise<Array<{event_id: string, classification: string, reason: string}>>} opts.aiClassify
 * @param {{ warn?: Function }} [opts.logger]
 * @returns {Promise<Array<object>>} ClassifiedEvent[]
 */
export async function classify(events, state, config, opts) {
  const { aiClassify, logger } = opts;
  const maxBatch = config.max_errors_per_ai_batch ?? 100;

  // Step 1: ensure all events have fingerprints
  for (const event of events) {
    if (event.fingerprint == null) {
      event.fingerprint = fingerprint(event);
    }
  }

  // Step 2: apply rules (L1)
  const ruleMatches = applyRules(events, state, config);

  // Build a map of event -> rule match info
  const ruleMatchedEvents = new Map();
  for (const match of ruleMatches) {
    // First rule match wins per event
    if (!ruleMatchedEvents.has(match.event)) {
      ruleMatchedEvents.set(match.event, match);
    }
  }

  // Step 3: classify rule-matched events
  const classified = new Map();
  for (const event of events) {
    if (ruleMatchedEvents.has(event)) {
      const match = ruleMatchedEvents.get(event);
      classified.set(event, {
        ...event,
        classification: 'critical',
        classifier: 'rule',
        rule_id: match.rule_id,
        fingerprint: event.fingerprint,
      });
    }
  }

  // Step 4: AI classification for non-rule-matched events (L2)
  const candidates = events.filter((e) => !ruleMatchedEvents.has(e));
  const aiBatch = candidates.slice(0, maxBatch);

  if (aiBatch.length > 0 && aiClassify) {
    // Assign batch IDs for AI round-trip mapping
    const batchIdMap = new Map();
    const taggedBatch = aiBatch.map((event, i) => {
      const batchId = `batch_${i}`;
      batchIdMap.set(batchId, event);
      return { ...event, _batch_id: batchId };
    });

    try {
      const aiResults = await aiClassify(taggedBatch);

      // Map AI results back to events
      for (const result of aiResults) {
        const event = batchIdMap.get(result.event_id);
        if (!event) continue;

        const aiClass = result.classification;
        if (aiClass === 'critical' || aiClass === 'notable') {
          classified.set(event, {
            ...event,
            classification: aiClass,
            classifier: 'ai',
            ai_reason: result.reason,
            fingerprint: event.fingerprint,
          });
        }
      }
    } catch (err) {
      // Fall back to rule-only classification; don't abort
      if (logger?.warn) {
        logger.warn(`AI classification failed, falling back to rules: ${err.message}`);
      }
    }
  }

  // Step 5: fill in unclassified events as noise (passthrough)
  for (const event of events) {
    if (!classified.has(event)) {
      classified.set(event, {
        ...event,
        classification: 'noise',
        classifier: 'passthrough',
        fingerprint: event.fingerprint,
      });
    }
  }

  // Return in original order
  return events.map((e) => classified.get(e));
}
