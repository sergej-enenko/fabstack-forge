import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseNginxAccess } from '../../skills/log-monitor/scripts/parse-nginx-access.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name) =>
  readFileSync(resolve(__dirname, '..', 'fixtures', 'logs', name), 'utf-8');

describe('parseNginxAccess', () => {
  it('parses normal access lines', () => {
    const raw = fixture('nginx-access-normal.log');
    const events = parseNginxAccess(raw);

    assert.equal(events.length, 3);

    const first = events[0];
    assert.equal(first.metadata.http_method, 'GET');
    assert.equal(first.metadata.http_path, '/products');
    assert.equal(first.metadata.http_status, 200);
    assert.equal(first.source, 'nginx-access');
    assert.equal(first.level, 'info');
  });

  it('parses 5xx cluster', () => {
    const raw = fixture('nginx-access-5xx-cluster.log');
    const events = parseNginxAccess(raw);

    assert.equal(events.length, 5);
    for (const event of events) {
      assert.equal(event.metadata.http_status, 500);
      assert.equal(event.level, 'error');
    }
  });

  it('classifies 4xx as warn', () => {
    const line =
      '178.104.10.221 - - [12/Apr/2026:02:00:00 +0200] "GET /missing HTTP/1.1" 404 162 "-" "Mozilla/5.0"';
    const events = parseNginxAccess(line);

    assert.equal(events.length, 1);
    assert.equal(events[0].metadata.http_status, 404);
    assert.equal(events[0].level, 'warn');
  });

  it('skips malformed lines', () => {
    const garbage = 'this is not a log line\nneither is this\n';
    const events = parseNginxAccess(garbage);

    assert.equal(events.length, 0);
  });
});
