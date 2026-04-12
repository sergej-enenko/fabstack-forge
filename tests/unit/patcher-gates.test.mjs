import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateGates } from '../../skills/log-monitor/scripts/patcher.mjs';

const baseConfig = {
  project: { mode: 'fix' },
  patcher: {
    fix_classes: { allowlist: ['null-guard', 'missing-await'] },
    confidence_threshold: 'high',
    scope_limits: { max_files_per_pr: 1, max_lines_per_diff: 10 },
    rate_limits: { max_auto_prs_per_day: 3 },
    guardrails: {
      forbidden_paths: ['docs/**'],
      security_sensitive_patterns: ['**/auth/**'],
    },
  },
};

const baseState = {
  circuit_breaker: {
    daily_pr_count: 0,
    disabled_fix_classes: [],
    self_disabled: false,
  },
};

const goodInvestigation = {
  root_cause: { confidence: 'high', hypothesis: 'x', reasoning: 'y' },
  location: { file: 'src/app/page.tsx', line: 42 },
  proposed_fixes: [
    {
      class: 'null-guard',
      diff: '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y',
      explanation: 'z',
    },
  ],
};

function makeOpts(overrides = {}) {
  return {
    humanTouched24h: async () => false,
    workingTreeClean: async () => true,
    pauseFileExists: () => false,
    rateLimiter: { count: () => 0 },
    ...overrides,
  };
}

describe('evaluateGates', () => {
  it('all gates pass for valid investigation', async () => {
    const fix = goodInvestigation.proposed_fixes[0];
    const result = await evaluateGates(
      goodInvestigation,
      fix,
      baseConfig,
      baseState,
      makeOpts(),
    );
    assert.deepEqual(result, { pass: true });
  });

  it('fails P1 when confidence < high', async () => {
    const investigation = {
      ...goodInvestigation,
      root_cause: { ...goodInvestigation.root_cause, confidence: 'medium' },
    };
    const fix = investigation.proposed_fixes[0];
    const result = await evaluateGates(
      investigation,
      fix,
      baseConfig,
      baseState,
      makeOpts(),
    );
    assert.equal(result.pass, false);
    assert.match(result.reason, /P1/);
  });

  it('fails P2 when class not in allowlist', async () => {
    const fix = { class: 'unknown-class', diff: '--- a\n+++ b\n@@ -1 +1 @@\n-x\n+y' };
    const result = await evaluateGates(
      goodInvestigation,
      fix,
      baseConfig,
      baseState,
      makeOpts(),
    );
    assert.equal(result.pass, false);
    assert.match(result.reason, /P2/);
  });

  it('fails P3 when class is circuit-broken', async () => {
    const state = {
      ...baseState,
      circuit_breaker: {
        ...baseState.circuit_breaker,
        disabled_fix_classes: [{ class: 'null-guard', reason: 'flaky' }],
      },
    };
    const fix = goodInvestigation.proposed_fixes[0];
    const result = await evaluateGates(
      goodInvestigation,
      fix,
      baseConfig,
      state,
      makeOpts(),
    );
    assert.equal(result.pass, false);
    assert.match(result.reason, /P3/);
  });

  it('fails P4 when daily PR cap reached', async () => {
    const state = {
      ...baseState,
      circuit_breaker: {
        ...baseState.circuit_breaker,
        daily_pr_count: 3,
      },
    };
    const fix = goodInvestigation.proposed_fixes[0];
    const result = await evaluateGates(
      goodInvestigation,
      fix,
      baseConfig,
      state,
      makeOpts(),
    );
    assert.equal(result.pass, false);
    assert.match(result.reason, /P4/);
  });

  it('fails P5 when file matches forbidden pattern', async () => {
    const investigation = {
      ...goodInvestigation,
      location: { file: 'docs/README.md', line: 1 },
    };
    const fix = goodInvestigation.proposed_fixes[0];
    const result = await evaluateGates(
      investigation,
      fix,
      baseConfig,
      baseState,
      makeOpts(),
    );
    assert.equal(result.pass, false);
    assert.match(result.reason, /P5/);
  });

  it('fails P7 when diff exceeds line limit', async () => {
    const addedLines = Array.from({ length: 15 }, (_, i) => `+line${i}`).join('\n');
    const diff = `--- a/src/app/page.tsx\n+++ b/src/app/page.tsx\n@@ -1,1 +1,15 @@\n${addedLines}`;
    const fix = { class: 'null-guard', diff };
    const result = await evaluateGates(
      goodInvestigation,
      fix,
      baseConfig,
      baseState,
      makeOpts(),
    );
    assert.equal(result.pass, false);
    assert.match(result.reason, /P7/);
  });

  it('fails P10 when .forge-pause exists', async () => {
    const fix = goodInvestigation.proposed_fixes[0];
    const result = await evaluateGates(
      goodInvestigation,
      fix,
      baseConfig,
      baseState,
      makeOpts({ pauseFileExists: () => true }),
    );
    assert.equal(result.pass, false);
    assert.match(result.reason, /P10/);
  });
});
