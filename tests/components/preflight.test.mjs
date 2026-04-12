import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runPreflight } from '../../skills/log-monitor/scripts/preflight.mjs';

/**
 * Build a standard config for preflight tests.
 */
function makeConfig(overrides = {}) {
  return {
    project: {
      name: 'test-project',
      github_repo: 'org/test-project',
      workspaces: ['backend', 'storefront'],
      ...(overrides.project || {}),
    },
    ssh: {
      key_path: '~/.ssh/forge_ed25519',
      ...(overrides.ssh || {}),
    },
    servers: overrides.servers || [
      { host: '10.0.0.1', user: 'deploy' },
    ],
  };
}

/**
 * Build a mocks object where everything succeeds.
 */
function makeGreenMocks(overrides = {}) {
  return {
    git: overrides.git || (async () => 'true'),
    gh: overrides.gh || (async (args) => {
      if (args.includes('secret') && args.includes('list')) {
        return 'SSH_PRIVATE_KEY\nFORGE_HOST\nFORGE_USER\n';
      }
      return '';
    }),
    ssh: overrides.ssh || (async () => 'ok'),
    fs: {
      exists: overrides.fsExists || (async () => true),
      stat: overrides.fsStat || (async () => ({ mode: 0o100600 })),
      ...(overrides.fs || {}),
    },
    env: overrides.env || { GITHUB_TOKEN: 'ghp_test123' },
    packageJson: overrides.packageJson || (async () => ({ name: 'test', version: '1.0.0' })),
  };
}

describe('runPreflight', () => {
  it('all green config returns pass: true with no failures', async () => {
    const config = makeConfig();
    const mocks = makeGreenMocks();

    const result = await runPreflight(config, mocks);

    assert.equal(result.pass, true);
    assert.equal(result.failures.length, 0);
    assert.ok(result.passes.length > 0, 'should have at least one pass');
  });

  it('missing GITHUB_TOKEN in env returns failure mentioning GITHUB_TOKEN', async () => {
    const config = makeConfig();
    const mocks = makeGreenMocks({ env: {} });

    const result = await runPreflight(config, mocks);

    assert.equal(result.pass, false);
    const tokenFailure = result.failures.find((f) =>
      f.check.includes('GITHUB_TOKEN') || f.fix.includes('GITHUB_TOKEN'),
    );
    assert.ok(tokenFailure, 'should have a failure mentioning GITHUB_TOKEN');
  });

  it('SSH connection failure returns failure mentioning SSH', async () => {
    const config = makeConfig();
    const mocks = makeGreenMocks({
      ssh: async () => { throw new Error('Connection refused'); },
    });

    const result = await runPreflight(config, mocks);

    assert.equal(result.pass, false);
    const sshFailure = result.failures.find((f) =>
      f.check.includes('SSH connection'),
    );
    assert.ok(sshFailure, 'should have a failure mentioning SSH connection');
  });
});
