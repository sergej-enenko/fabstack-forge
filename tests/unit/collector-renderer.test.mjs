import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  renderCollectorWorkflow,
  buildFetchCommand,
} from '../../skills/log-monitor/scripts/collector-renderer.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatePath = join(
  __dirname,
  '..',
  '..',
  'skills',
  'log-monitor',
  'templates',
  'forge-collect.yml.template',
);
const template = readFileSync(templatePath, 'utf-8');

/** Minimal config that exercises every substitution variable. */
function makeConfig(overrides = {}) {
  return {
    log_bridge: { branch: 'forge-logs', logs_path: 'logs', max_age_hours: 3 },
    collector: {
      type: 'github-actions',
      schedule_cron: '3 */2 * * *',
      timeout_minutes: 5,
      secret_names: {
        ssh_private_key: 'SSH_PRIVATE_KEY',
        host: 'FORGE_HOST',
        user: 'FORGE_USER',
      },
      ssh: { connect_timeout_seconds: 15 },
      sources: [
        { type: 'docker', container: 'app', lines: 5000, since: '2h10m' },
      ],
      ...overrides,
    },
  };
}

describe('renderCollectorWorkflow', () => {
  it('renders a complete workflow with all substitutions', () => {
    const config = makeConfig();
    const output = renderCollectorWorkflow(template, config, '0.1.0');

    // Forge variables are substituted
    assert.ok(output.includes("cron: '3 */2 * * *'"), 'cron must be substituted');
    assert.ok(output.includes('timeout-minutes: 5'), 'timeout must be substituted');
    assert.ok(output.includes('origin forge-logs'), 'branch name must appear');
    assert.ok(output.includes('fabstack-forge v0.1.0'), 'plugin version must appear');
    assert.ok(output.includes('ConnectTimeout=15'), 'ssh timeout must be substituted');

    // GitHub Actions expressions survive intact
    assert.ok(output.includes('${{ secrets.SSH_PRIVATE_KEY }}'), 'SSH key secret must survive');
    assert.ok(output.includes('${{ secrets.FORGE_HOST }}'), 'host secret must survive');
    assert.ok(output.includes('${{ secrets.FORGE_USER }}'), 'user secret must survive');
    assert.ok(output.includes('${{ secrets.GITHUB_TOKEN }}'), 'GITHUB_TOKEN must survive');
    assert.ok(output.includes('${{ github.repository }}'), 'github.repository must survive');
    assert.ok(output.includes('${{ github.run_id }}'), 'github.run_id must survive');

    // No unrendered Forge placeholders remain
    assert.ok(!output.includes('<%='), 'no <%=...%> placeholders should remain');
  });

  it('generates correct fetch command for docker container', () => {
    const cmd = buildFetchCommand({
      type: 'docker',
      container: 'medusa',
      lines: 3000,
      since: '1h30m',
    });

    assert.ok(cmd.includes('fetch_or_mark logs/docker-medusa.log'), 'target file must use container name');
    assert.ok(cmd.includes('docker logs --since=1h30m --until=now medusa'), 'docker logs command must include since and container');
    assert.ok(cmd.includes('tail -3000'), 'must tail the configured line count');
  });

  it('generates correct fetch command for file path', () => {
    const cmd = buildFetchCommand({
      type: 'file',
      path: '/var/log/nginx/error.log',
      parser: 'nginx-error',
      lines: 2000,
    });

    assert.ok(cmd.includes('fetch_or_mark logs/nginx-error.log'), 'target file must use parser name');
    assert.ok(cmd.includes('tail -n 2000 /var/log/nginx/error.log'), 'must tail the configured path and line count');
  });
});
