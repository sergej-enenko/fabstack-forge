import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { correlate } from '../../skills/log-monitor/scripts/git-correlator.mjs';

describe('git-correlator', () => {
  it('identifies prime suspect when commit landed 15 min before error', async () => {
    const firstSeen = new Date('2026-04-11T10:00:00Z');
    const commitDate = new Date(firstSeen.getTime() - 15 * 60 * 1000); // 15 min before

    const event = { first_seen: firstSeen.toISOString() };
    const config = { correlation_window_minutes: 60 };

    const mockGit = async (args) => {
      if (args[0] === 'log' && args.includes('--')) {
        // Recent commits for the file
        return [
          `abc123|Alice|${commitDate.toISOString()}|fix: null check`,
        ].join('\n');
      }
      if (args[0] === 'log' && args.some((a) => a.startsWith('-L'))) {
        // Line-range history
        return `abc123|Alice|${commitDate.toISOString()}|fix: null check`;
      }
      return '';
    };

    const result = await correlate(event, 'src/page.ts', 42, config, { git: mockGit });

    assert.equal(result.recent_commits.length, 1);
    assert.equal(result.recent_commits[0].hash, 'abc123');
    assert.equal(result.recent_commits[0].author, 'Alice');
    assert.ok(result.prime_suspect, 'should have a prime suspect');
    assert.equal(result.prime_suspect.hash, 'abc123');
    assert.equal(result.prime_suspect.minutes_before_error, 15);
  });

  it('no prime suspect when no commit in correlation window', async () => {
    const firstSeen = new Date('2026-04-11T10:00:00Z');
    // Commit was 2 hours before — outside 60-min window
    const commitDate = new Date(firstSeen.getTime() - 120 * 60 * 1000);

    const event = { first_seen: firstSeen.toISOString() };
    const config = { correlation_window_minutes: 60 };

    const mockGit = async (args) => {
      if (args[0] === 'log' && args.includes('--')) {
        return `def456|Bob|${commitDate.toISOString()}|refactor: rename`;
      }
      return '';
    };

    const result = await correlate(event, 'src/page.ts', 10, config, { git: mockGit });

    assert.equal(result.recent_commits.length, 1);
    assert.equal(result.prime_suspect, null);
  });

  it('returns empty arrays on git error', async () => {
    const event = { first_seen: new Date().toISOString() };
    const config = {};

    const mockGit = async () => {
      throw new Error('fatal: not a git repository');
    };

    const result = await correlate(event, 'src/page.ts', 1, config, { git: mockGit });

    assert.deepEqual(result.recent_commits, []);
    assert.deepEqual(result.line_range_history, []);
    assert.equal(result.prime_suspect, null);
  });
});
