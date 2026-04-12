import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createAuditLogger } from '../../skills/log-monitor/scripts/audit-logger.mjs';

describe('createAuditLogger', () => {
  const tmpDirs = [];

  function makeTmpDir() {
    const dir = mkdtempSync(join(tmpdir(), 'audit-logger-test-'));
    tmpDirs.push(dir);
    return dir;
  }

  after(() => {
    for (const dir of tmpDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates log file on first write with correct fields', () => {
    const dir = makeTmpDir();
    const logPath = join(dir, 'audit.jsonl');
    const logger = createAuditLogger({ path: logPath, runId: 'run-001', runMode: 'auto' });

    logger.log({ actor: 'forge-agent', action: 'plan.created', target: 'issue-42' });

    const content = readFileSync(logPath, 'utf-8').trim();
    const entry = JSON.parse(content);

    assert.equal(entry.actor, 'forge-agent');
    assert.equal(entry.action, 'plan.created');
    assert.equal(entry.run_id, 'run-001');
    assert.equal(entry.run_mode, 'auto');
    assert.equal(entry.target, 'issue-42');
    assert.equal(entry.result, 'ok');
    assert.ok(entry.ts, 'ts field must be present');
    // Verify ts is a valid ISO string
    assert.ok(!isNaN(Date.parse(entry.ts)), 'ts must be a valid ISO timestamp');
  });

  it('appends subsequent entries on new lines', () => {
    const dir = makeTmpDir();
    const logPath = join(dir, 'audit.jsonl');
    const logger = createAuditLogger({ path: logPath, runId: 'run-002', runMode: 'supervised' });

    logger.log({ actor: 'forge-agent', action: 'step.started' });
    logger.log({ actor: 'forge-agent', action: 'step.completed' });
    logger.log({ actor: 'forge-agent', action: 'run.finished' });

    const lines = readFileSync(logPath, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 3);

    // Each line is valid JSON
    const entries = lines.map(line => JSON.parse(line));
    assert.equal(entries[0].action, 'step.started');
    assert.equal(entries[1].action, 'step.completed');
    assert.equal(entries[2].action, 'run.finished');
  });

  it('records duration_ms when provided', () => {
    const dir = makeTmpDir();
    const logPath = join(dir, 'audit.jsonl');
    const logger = createAuditLogger({ path: logPath, runId: 'run-003', runMode: 'auto' });

    logger.log({ actor: 'forge-agent', action: 'tool.executed', duration_ms: 1523 });

    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim());
    assert.equal(entry.duration_ms, 1523);
  });

  it('handles context object with nested JSON preserved', () => {
    const dir = makeTmpDir();
    const logPath = join(dir, 'audit.jsonl');
    const logger = createAuditLogger({ path: logPath, runId: 'run-004', runMode: 'auto' });

    const context = {
      files_changed: ['src/app.mjs', 'tests/app.test.mjs'],
      metrics: { lines_added: 42, lines_removed: 7 },
    };
    logger.log({ actor: 'forge-agent', action: 'commit.created', context });

    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim());
    assert.deepEqual(entry.context, context);
    assert.deepEqual(entry.context.files_changed, ['src/app.mjs', 'tests/app.test.mjs']);
    assert.equal(entry.context.metrics.lines_added, 42);
    assert.equal(entry.context.metrics.lines_removed, 7);
  });
});
