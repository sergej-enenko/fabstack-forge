import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNginxError } from '../../skills/log-monitor/scripts/parse-nginx-error.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = readFileSync(
  resolve(__dirname, '../fixtures/logs/nginx-error-upstream-timeout.log'),
  'utf-8',
);

describe('parseNginxError', () => {
  it('parses error events from fixture', () => {
    const events = parseNginxError(FIXTURE);

    assert.equal(events.length, 3);

    assert.equal(events[0].level, 'error');
    assert.ok(events[0].message.includes('upstream timed out'));
    assert.equal(events[0].source, 'nginx-error');
    assert.equal(events[0].timestamp, '2026-04-12T01:15:00Z');

    assert.equal(events[1].level, 'error');
    assert.ok(events[1].message.includes('prematurely closed'));
    assert.equal(events[1].source, 'nginx-error');
  });

  it('extracts warn level', () => {
    const events = parseNginxError(FIXTURE);
    const warn = events[2];

    assert.equal(warn.level, 'warn');
    assert.ok(warn.message.includes('invalid header line'));
    assert.equal(warn.source, 'nginx-error');
    assert.equal(warn.timestamp, '2026-04-12T01:20:00Z');
  });

  it('skips malformed lines', () => {
    const events = parseNginxError('just some random text\nanother bad line\n');
    assert.equal(events.length, 0);
  });
});
