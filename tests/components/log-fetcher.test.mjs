import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLogs } from '../../skills/log-monitor/scripts/log-fetcher.mjs';

/**
 * Build a standard config for tests.
 */
function makeConfig(overrides = {}) {
  return {
    log_bridge: {
      type: 'github-actions-branch',
      branch: 'forge-logs',
      logs_path: 'logs',
      max_age_hours: 3,
      ...overrides.log_bridge,
    },
    log_sources: overrides.log_sources || [
      { file: 'logs/docker-medusa.log', parser: 'docker', source_name: 'medusa', severity_profile: 'high' },
      { file: 'logs/nginx-error.log', parser: 'nginx-error', source_name: 'nginx-error', severity_profile: 'high' },
    ],
  };
}

/**
 * Create a mock git executor that returns predetermined content per command.
 *
 * @param {Record<string, string>} responses  Map of stringified args → stdout
 */
function mockGit(responses) {
  return async (args) => {
    const key = args.join(' ');
    for (const [pattern, value] of Object.entries(responses)) {
      if (key.includes(pattern)) return value;
    }
    return '';
  };
}

describe('fetchLogs', () => {
  it('reads logs from forge-logs branch and maps to sources', async () => {
    const now = new Date().toISOString();

    const git = mockGit({
      'fetch origin forge-logs': '',
      'fetched-at.txt': now,
      'logs/docker-medusa.log': [
        '2026-04-12T00:05:12.456Z [info] Medusa server started on port 9000',
        '2026-04-12T01:10:00.000Z [error] Connection refused to database',
      ].join('\n'),
      'logs/nginx-error.log': [
        '2026/04/12 00:30:00 [error] upstream timed out',
        '2026/04/12 02:00:00 [warn] worker connections not enough',
      ].join('\n'),
    });

    const result = await fetchLogs(makeConfig(), { git, returnMeta: true });

    // 2 docker events + 2 nginx-error events = 4 total
    assert.equal(result.events.length, 4);
    assert.equal(result.failures.length, 0);
    assert.equal(result.warnings.length, 0);

    // Verify source names are correctly assigned
    const sources = new Set(result.events.map((e) => e.source));
    assert.ok(sources.has('medusa'));
    assert.ok(sources.has('nginx-error'));

    // Verify levels are present
    const levels = new Set(result.events.map((e) => e.level));
    assert.ok(levels.has('info'));
    assert.ok(levels.has('error'));

    // Verify sorted by timestamp ascending
    for (let i = 1; i < result.events.length; i++) {
      const prev = new Date(result.events[i - 1].timestamp).getTime();
      const curr = new Date(result.events[i].timestamp).getTime();
      assert.ok(prev <= curr, `events must be sorted by timestamp ascending (index ${i})`);
    }
  });

  it('skips FETCH_FAILED markers but continues', async () => {
    const now = new Date().toISOString();

    const git = mockGit({
      'fetch origin forge-logs': '',
      'fetched-at.txt': now,
      'logs/docker-medusa.log': 'FETCH_FAILED: connection refused',
      'logs/nginx-error.log': '2026/04/12 00:30:00 [error] upstream timed out',
    });

    const result = await fetchLogs(makeConfig(), { git, returnMeta: true });

    // Only nginx-error events should be present
    assert.ok(result.events.length > 0, 'should have events from the valid source');
    assert.equal(result.events[0].source, 'nginx-error');

    // Failures should record the FETCH_FAILED source
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].source, 'medusa');
    assert.match(result.failures[0].reason, /FETCH_FAILED/);
  });

  it('aborts when all sources have FETCH_FAILED', async () => {
    const now = new Date().toISOString();

    const git = mockGit({
      'fetch origin forge-logs': '',
      'fetched-at.txt': now,
      'logs/docker-medusa.log': 'FETCH_FAILED: connection refused',
      'logs/nginx-error.log': 'FETCH_FAILED: timeout',
    });

    await assert.rejects(
      () => fetchLogs(makeConfig(), { git, returnMeta: true }),
      /all sources failed/,
    );
  });

  it('warns when forge-logs branch is stale', async () => {
    // Timestamp 4 hours ago
    const staleDate = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

    const git = mockGit({
      'fetch origin forge-logs': '',
      'fetched-at.txt': staleDate,
      'logs/docker-medusa.log': '2026-04-12T00:05:12.456Z [info] Medusa server started on port 9000',
      'logs/nginx-error.log': '2026/04/12 00:30:00 [error] upstream timed out',
    });

    const result = await fetchLogs(makeConfig(), { git, returnMeta: true });

    assert.ok(result.warnings.length > 0, 'should have warnings');
    const staleWarning = result.warnings.find((w) => w.includes('stale'));
    assert.ok(staleWarning, 'should contain a stale warning');
  });
});
