import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, ConfigError } from '../../skills/log-monitor/scripts/config-loader.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, '..', 'fixtures', 'configs');

describe('loadConfig', () => {
  it('loads and validates a minimal valid config', () => {
    const config = loadConfig(join(fixturesDir, 'valid-minimal.yml'));

    assert.equal(config.version, 1);
    assert.equal(config.project.name, 'test-project');
    assert.equal(config.project.mode, 'observe');
    assert.ok(Array.isArray(config.servers), 'servers must be an array');
    assert.equal(config.servers.length, 1);
    assert.equal(config.servers[0].name, 'production');
    assert.ok(Array.isArray(config.log_sources), 'log_sources must be an array');
    assert.equal(config.log_sources.length, 1);
  });

  it('applies defaults for optional fields', () => {
    const config = loadConfig(join(fixturesDir, 'valid-minimal.yml'));

    // time_window defaults
    assert.equal(config.time_window.lookback_hours, 2);
    assert.equal(config.time_window.buffer_minutes, 10);

    // classifier defaults
    assert.equal(config.classifier.rules_enabled, true);
    assert.equal(config.classifier.ai_layer_enabled, true);
    assert.equal(config.classifier.upgrade_only, true);
    assert.equal(config.classifier.max_errors_per_ai_batch, 100);
  });

  it('rejects missing servers', () => {
    assert.throws(
      () => loadConfig(join(fixturesDir, 'invalid-missing-servers.yml')),
      (err) => {
        assert.ok(err instanceof ConfigError, 'must be a ConfigError');
        return true;
      },
    );
  });

  it('rejects unknown schema version 99', () => {
    assert.throws(
      () => loadConfig(join(fixturesDir, 'invalid-schema-version.yml')),
      (err) => {
        assert.ok(err.message.includes('not supported'), 'message must mention "not supported"');
        return true;
      },
    );
  });

  it('rejects nonexistent file path', () => {
    assert.throws(
      () => loadConfig(join(fixturesDir, 'does-not-exist.yml')),
      (err) => {
        assert.ok(err instanceof ConfigError, 'must be a ConfigError');
        return true;
      },
    );
  });
});
