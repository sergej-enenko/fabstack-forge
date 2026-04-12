import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateMarkdown } from '../../skills/log-monitor/scripts/reporter.mjs';

describe('generateMarkdown', () => {
  it('renders header with mode and timestamp', () => {
    const output = generateMarkdown({
      dedup: { new: [], continuing: [], returning: [], resolved: [] },
      investigations: [],
      patches: [],
      stats: { health_score: 95 },
      runId: 'run-abc-123',
      timestamp: '2026-04-11T10:00:00Z',
      mode: 'OBSERVE',
      config: { project_name: 'my-service' },
    });

    assert.ok(output.includes('Fabstack Forge Report'), 'should contain title');
    assert.ok(output.includes('OBSERVE'), 'should contain mode');
    assert.ok(output.includes('run-abc-123'), 'should contain run ID');
    assert.ok(output.includes('my-service'), 'should contain project name');
    assert.ok(output.includes('2026-04-11T10:00:00Z'), 'should contain timestamp');
  });

  it('lists new criticals with fix proposals', () => {
    const output = generateMarkdown({
      dedup: {
        new: [
          { fingerprint: 'fp-crash-001', classification: 'critical', message: 'TypeError: null ref' },
        ],
        continuing: [],
        returning: [],
        resolved: [],
      },
      investigations: [
        {
          fingerprint: 'fp-crash-001',
          location: 'src/app.mjs:42',
          hypothesis: 'Missing null check on user.profile',
          confidence: 0.85,
          fix_class: 'null-guard',
        },
      ],
      patches: [
        {
          fingerprint: 'fp-crash-001',
          diff: '- const name = user.profile.name;\n+ const name = user.profile?.name ?? "unknown";',
        },
      ],
      stats: { health_score: 70 },
      runId: 'run-fix-001',
      timestamp: '2026-04-11T12:00:00Z',
      mode: 'FIX',
      config: { project_name: 'my-service' },
    });

    assert.ok(output.includes('New Criticals'), 'should contain New Criticals section');
    assert.ok(output.includes('src/app.mjs:42'), 'should contain file:line location');
    assert.ok(output.includes('null-guard'), 'should contain fix class');
    assert.ok(output.includes('Missing null check on user.profile'), 'should contain hypothesis');
    assert.ok(output.includes('```diff'), 'should contain diff code block');
  });

  it('renders worth-watching section for notables', () => {
    const output = generateMarkdown({
      dedup: {
        new: [
          { fingerprint: 'fp-notable-001', classification: 'notable', message: 'Slow query detected', ai_reason: 'Query time > 5s' },
        ],
        continuing: [],
        returning: [],
        resolved: [],
      },
      investigations: [],
      patches: [],
      stats: {},
      runId: 'run-watch-001',
      timestamp: '2026-04-11T14:00:00Z',
      mode: 'OBSERVE',
      config: { project_name: 'my-service' },
    });

    assert.ok(output.includes('Worth Watching'), 'should contain Worth Watching section');
    assert.ok(output.includes('Slow query detected'), 'should contain the event message');
    assert.ok(output.includes('Query time > 5s'), 'should contain the AI reason');
  });
});
