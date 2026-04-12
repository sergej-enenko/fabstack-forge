/**
 * Preflight checks for /forge-init.
 * All external calls are injected via `mocks` parameter for testability.
 *
 * @param {object} config - project config with project, servers, ssh fields
 * @param {object} mocks - injectable dependencies
 * @param {function} mocks.git - runs git commands, async (args) => string
 * @param {function} mocks.gh - runs GitHub CLI commands, async (args) => string
 * @param {function} mocks.ssh - runs SSH commands, async (args) => string
 * @param {object} mocks.fs - file system helpers
 * @param {function} mocks.fs.exists - async (path) => boolean
 * @param {function} mocks.fs.stat - async (path) => { mode: number }
 * @param {object} mocks.env - environment variables object
 * @param {function} mocks.packageJson - async (path) => parsed package.json
 * @returns {Promise<{pass: boolean, failures: Array<{check: string, fix: string}>, passes: Array<{check: string}>}>}
 */
export async function runPreflight(config, mocks) {
  const failures = [];
  const passes = [];

  // Check 1: Git repo exists
  try {
    const result = await mocks.git(['rev-parse', '--is-inside-work-tree']);
    if (result.trim() === 'true') {
      passes.push({ check: 'Git repository detected' });
    } else {
      failures.push({
        check: 'Git repository detected',
        fix: 'Run `git init` to initialize a repository',
      });
    }
  } catch {
    failures.push({
      check: 'Git repository detected',
      fix: 'Run `git init` to initialize a repository',
    });
  }

  // Check 2: GitHub CLI authenticated
  try {
    await mocks.gh(['auth', 'status']);
    passes.push({ check: 'GitHub CLI authenticated' });
  } catch {
    failures.push({
      check: 'GitHub CLI authenticated',
      fix: 'Run `gh auth login` to authenticate the GitHub CLI',
    });
  }

  // Check 3: Workspaces exist
  const workspaces = config.project?.workspaces ?? [];
  for (const ws of workspaces) {
    const wsPath = typeof ws === 'string' ? ws : ws.path;
    const exists = await mocks.fs.exists(wsPath);
    if (exists) {
      passes.push({ check: `Workspace exists: ${wsPath}` });
    } else {
      failures.push({
        check: `Workspace exists: ${wsPath}`,
        fix: `Create directory ${wsPath} or update config`,
      });
    }
  }

  // Check 4: SSH key file exists
  const sshKeyPath = config.ssh?.key_path ?? '~/.ssh/forge_ed25519';
  const keyExists = await mocks.fs.exists(sshKeyPath);
  if (keyExists) {
    passes.push({ check: `SSH key exists: ${sshKeyPath}` });
  } else {
    failures.push({
      check: `SSH key exists: ${sshKeyPath}`,
      fix: `Generate an SSH key at ${sshKeyPath} or update config.ssh.key_path`,
    });
  }

  // Check 5: SSH key has correct permissions (600 or 400)
  if (keyExists) {
    try {
      const stat = await mocks.fs.stat(sshKeyPath);
      const perms = stat.mode & 0o777;
      if (perms === 0o600 || perms === 0o400) {
        passes.push({ check: `SSH key permissions correct (${perms.toString(8)})` });
      } else {
        failures.push({
          check: `SSH key permissions correct`,
          fix: `Run \`chmod 600 ${sshKeyPath}\` — current permissions: ${perms.toString(8)}`,
        });
      }
    } catch {
      failures.push({
        check: `SSH key permissions correct`,
        fix: `Unable to stat ${sshKeyPath} — check file permissions`,
      });
    }
  }

  // Check 6: GITHUB_TOKEN in environment
  if (mocks.env.GITHUB_TOKEN) {
    passes.push({ check: 'GITHUB_TOKEN environment variable set' });
  } else {
    failures.push({
      check: 'GITHUB_TOKEN environment variable set',
      fix: 'Set GITHUB_TOKEN in your environment or .env file',
    });
  }

  // Check 7: GitHub secrets exist
  try {
    const secretList = await mocks.gh(['secret', 'list']);
    const requiredSecrets = ['SSH_PRIVATE_KEY', 'FORGE_HOST', 'FORGE_USER'];
    for (const secret of requiredSecrets) {
      if (secretList.includes(secret)) {
        passes.push({ check: `GitHub secret exists: ${secret}` });
      } else {
        failures.push({
          check: `GitHub secret exists: ${secret}`,
          fix: `Run \`gh secret set ${secret}\` to add the secret`,
        });
      }
    }
  } catch {
    failures.push({
      check: 'GitHub secrets accessible',
      fix: 'Ensure `gh secret list` works — check GitHub CLI auth and repo permissions',
    });
  }

  // Check 8: SSH connection works
  const server = config.servers?.[0];
  if (server) {
    try {
      await mocks.ssh([`${server.user}@${server.host}`, 'echo', 'ok']);
      passes.push({ check: `SSH connection to ${server.host}` });
    } catch {
      failures.push({
        check: `SSH connection to ${server.host}`,
        fix: `Verify SSH access: \`ssh ${server.user}@${server.host} echo ok\``,
      });
    }
  }

  return {
    pass: failures.length === 0,
    failures,
    passes,
  };
}
