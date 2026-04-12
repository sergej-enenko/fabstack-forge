import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch } from '../../skills/log-monitor/scripts/patcher.mjs';

const config = {
  project: {
    github_repo: 'sergej-enenko/labong',
    base_branch: 'main',
    workspaces: [
      {
        path: 'src',
        test_command: 'npm test',
        build_command: 'npm run build',
        typecheck_command: 'npm run typecheck',
      },
    ],
  },
};

const investigation = {
  root_cause: { confidence: 'high', hypothesis: 'x', reasoning: 'y' },
  location: { file: 'src/app/page.tsx', line: 42 },
  proposed_fixes: [
    {
      class: 'null-guard',
      diff: '--- a/src/app/page.tsx\n+++ b/src/app/page.tsx\n@@ -1 +1 @@\n-x\n+y',
      explanation: 'add null guard',
    },
  ],
};

/**
 * Create mock functions that record calls and return configurable results.
 */
function createMocks({ npmThrowsOnTest = false } = {}) {
  const calls = { git: [], npm: [], gh: [], fs: [] };

  const git = async (args, opts) => {
    calls.git.push({ args, opts });
    return '';
  };

  const npm = async (args, opts) => {
    calls.npm.push({ args, opts });
    if (npmThrowsOnTest && args.includes('test')) {
      throw new Error('test suite failed: 2 tests failed');
    }
    return '';
  };

  const gh = async (args) => {
    calls.gh.push({ args });
    return 'https://github.com/sergej-enenko/labong/pull/42\n';
  };

  const fs = {
    async writeFile(path, content) {
      calls.fs.push({ op: 'writeFile', path, content });
    },
    async remove(path) {
      calls.fs.push({ op: 'remove', path });
    },
  };

  return { mocks: { git, npm, gh, fs }, calls };
}

describe('applyPatch', () => {
  it('successful patch creates PR and cleans up worktree', async () => {
    const { mocks, calls } = createMocks();
    const fix = investigation.proposed_fixes[0];

    const result = await applyPatch(investigation, fix, config, {
      repoRoot: '/tmp/repo',
      worktreeRoot: '/tmp/worktrees',
      issueId: 12,
      mocks,
    });

    assert.equal(result.status, 'pr_created');
    assert.ok(result.pr_url.includes('github.com'));

    // Verify worktree remove was called in cleanup
    const worktreeRemoveCalls = calls.git.filter(
      (c) => c.args[0] === 'worktree' && c.args[1] === 'remove',
    );
    assert.ok(worktreeRemoveCalls.length > 0, 'worktree remove should be called');

    // Verify gh pr create was called
    const ghCreateCalls = calls.gh.filter(
      (c) => c.args.includes('pr') && c.args.includes('create'),
    );
    assert.ok(ghCreateCalls.length > 0, 'gh pr create should be called');
  });

  it('test failure deletes branch and returns rejection without PR', async () => {
    const { mocks, calls } = createMocks({ npmThrowsOnTest: true });
    const fix = investigation.proposed_fixes[0];

    const result = await applyPatch(investigation, fix, config, {
      repoRoot: '/tmp/repo',
      worktreeRoot: '/tmp/worktrees',
      issueId: 12,
      mocks,
    });

    assert.equal(result.status, 'rejected_by_tests');
    assert.ok(result.rejection_reason.includes('test suite failed'));

    // Verify gh pr create was NOT called
    const ghCreateCalls = calls.gh.filter(
      (c) => c.args.includes('pr') && c.args.includes('create'),
    );
    assert.equal(ghCreateCalls.length, 0, 'gh pr create should NOT be called on test failure');

    // Verify worktree remove was still called (finally block)
    const worktreeRemoveCalls = calls.git.filter(
      (c) => c.args[0] === 'worktree' && c.args[1] === 'remove',
    );
    assert.ok(worktreeRemoveCalls.length > 0, 'worktree remove should still be called');
  });
});
