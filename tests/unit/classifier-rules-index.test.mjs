import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyRules } from '../../skills/log-monitor/scripts/classifier-rules/index.mjs';

describe('applyRules orchestrator', () => {
  it('applies enabled rules — event matching both crash AND new_signature returns 2 matches', () => {
    const events = [
      {
        level: 'error',
        message: 'Uncaught exception: something broke',
        fingerprint: 'abc123',
      },
    ];

    const state = { known_errors: [] };

    const config = {
      severity_rules: {
        rules: [
          { id: 'crash', enabled: true },
          { id: 'new_signature', enabled: true },
        ],
      },
    };

    const results = applyRules(events, state, config);
    assert.equal(results.length, 2);

    const ruleIds = results.map((r) => r.rule_id);
    assert.ok(ruleIds.includes('crash'), 'should include crash match');
    assert.ok(ruleIds.includes('new_signature'), 'should include new_signature match');
  });

  it('skips disabled rules — crash disabled returns 0 matches for a crash event', () => {
    const events = [
      {
        level: 'error',
        message: 'Uncaught exception: something broke',
      },
    ];

    const state = {};

    const config = {
      severity_rules: {
        rules: [
          { id: 'crash', enabled: false },
        ],
      },
    };

    const results = applyRules(events, state, config);
    assert.equal(results.length, 0);
  });
});
