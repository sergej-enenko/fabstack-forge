import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../../skills/log-monitor/scripts/classifier.mjs';

/**
 * Helper: build a config with crash rule enabled.
 */
function makeConfig(overrides = {}) {
  return {
    severity_rules: {
      rules: [
        { id: 'crash', enabled: true },
      ],
    },
    max_errors_per_ai_batch: 100,
    ...overrides,
  };
}

const emptyState = { known_errors: [] };

describe('classify (L1 rules + L2 AI)', () => {
  it('rule-matched events are classified critical with classifier=rule', async () => {
    const events = [
      { level: 'error', message: 'Uncaught exception: null pointer' },
    ];

    const mockAi = async (batch) => batch.map((e) => ({
      event_id: e._batch_id,
      classification: 'noise',
      reason: 'seems fine',
    }));

    const results = await classify(events, emptyState, makeConfig(), { aiClassify: mockAi });

    assert.equal(results.length, 1);
    assert.equal(results[0].classification, 'critical');
    assert.equal(results[0].classifier, 'rule');
    assert.equal(results[0].rule_id, 'crash');
    assert.ok(results[0].fingerprint, 'should have a fingerprint');
  });

  it('AI can escalate non-rule events to critical with classifier=ai and ai_reason', async () => {
    const events = [
      { level: 'info', message: 'Something subtle but dangerous' },
    ];

    const mockAi = async (batch) => batch.map((e) => ({
      event_id: e._batch_id,
      classification: 'critical',
      reason: 'AI thinks it looks concerning',
    }));

    const results = await classify(events, emptyState, makeConfig(), { aiClassify: mockAi });

    assert.equal(results.length, 1);
    assert.equal(results[0].classification, 'critical');
    assert.equal(results[0].classifier, 'ai');
    assert.equal(results[0].ai_reason, 'AI thinks it looks concerning');
  });

  it('AI cannot downgrade rule-matched critical (still critical with classifier=rule)', async () => {
    const events = [
      { level: 'error', message: 'Uncaught exception: crash detected' },
    ];

    // AI tries to downgrade to noise — should be ignored for rule-matched events
    const mockAi = async (batch) => batch.map((e) => ({
      event_id: e._batch_id,
      classification: 'noise',
      reason: 'AI says this is fine',
    }));

    const results = await classify(events, emptyState, makeConfig(), { aiClassify: mockAi });

    assert.equal(results.length, 1);
    assert.equal(results[0].classification, 'critical');
    assert.equal(results[0].classifier, 'rule');
    assert.equal(results[0].rule_id, 'crash');
  });

  it('falls back to rules only when AI throws (rule-matched event still works)', async () => {
    const events = [
      { level: 'error', message: 'Uncaught exception: crash' },
      { level: 'info', message: 'Normal log line' },
    ];

    const warnings = [];
    const mockAi = async () => {
      throw new Error('API rate limit exceeded');
    };

    const results = await classify(events, emptyState, makeConfig(), {
      aiClassify: mockAi,
      logger: { warn: (msg) => warnings.push(msg) },
    });

    assert.equal(results.length, 2);

    // Rule-matched event should still be critical
    assert.equal(results[0].classification, 'critical');
    assert.equal(results[0].classifier, 'rule');

    // Non-rule event falls through to noise (passthrough)
    assert.equal(results[1].classification, 'noise');
    assert.equal(results[1].classifier, 'passthrough');

    // Warning should have been logged
    assert.ok(warnings.length > 0, 'should have logged a warning');
    assert.match(warnings[0], /rate limit/);
  });

  it('notable classification from AI annotates but does not create critical', async () => {
    const events = [
      { level: 'warn', message: 'Disk usage at 85%' },
    ];

    const mockAi = async (batch) => batch.map((e) => ({
      event_id: e._batch_id,
      classification: 'notable',
      reason: 'Disk space trending toward threshold',
    }));

    const results = await classify(events, emptyState, makeConfig(), { aiClassify: mockAi });

    assert.equal(results.length, 1);
    assert.equal(results[0].classification, 'notable');
    assert.equal(results[0].classifier, 'ai');
    assert.equal(results[0].ai_reason, 'Disk space trending toward threshold');
    assert.ok(results[0].fingerprint, 'should have a fingerprint');
  });
});
