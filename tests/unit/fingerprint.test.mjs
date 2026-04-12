import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, normalize } from '../../skills/log-monitor/scripts/fingerprint.mjs';

describe('normalize', () => {
  it('strips UUIDs and replaces with <UUID>', () => {
    const input = 'Error in module 550e8400-e29b-41d4-a716-446655440000 failed';
    const result = normalize(input);
    assert.equal(result, 'Error in module <UUID> failed');
  });

  it('strips ISO timestamps and replaces with <TIMESTAMP>', () => {
    const input = 'Crash at 2026-04-11T14:32:09.123Z in handler';
    const result = normalize(input);
    assert.equal(result, 'Crash at <TIMESTAMP> in handler');
  });

  it('strips ISO timestamps without millis', () => {
    const input = 'Crash at 2026-04-11T14:32:09Z in handler';
    const result = normalize(input);
    assert.equal(result, 'Crash at <TIMESTAMP> in handler');
  });
});

describe('fingerprint', () => {
  it('is stable across invocations', () => {
    const event = {
      error_type: 'TypeError',
      first_stack_frame: 'at Object.<anonymous> (app.js:10:5)',
      message: 'Cannot read properties of undefined',
    };
    const a = fingerprint(event);
    const b = fingerprint(event);
    assert.equal(a, b);
    assert.equal(a.length, 16);
    assert.match(a, /^[0-9a-f]{16}$/);
  });

  it('ignores UUIDs — different UUIDs produce same hash', () => {
    const event1 = {
      error_type: 'TypeError',
      first_stack_frame: 'at handler (app.js:10:5)',
      message: 'User 550e8400-e29b-41d4-a716-446655440000 not found',
    };
    const event2 = {
      error_type: 'TypeError',
      first_stack_frame: 'at handler (app.js:10:5)',
      message: 'User a1b2c3d4-e5f6-7890-abcd-ef1234567890 not found',
    };
    assert.equal(fingerprint(event1), fingerprint(event2));
  });

  it('ignores ISO timestamps', () => {
    const event1 = {
      error_type: 'ReferenceError',
      first_stack_frame: 'at run (server.js:42:8)',
      message: 'Failure at 2026-01-15T08:00:00.000Z',
    };
    const event2 = {
      error_type: 'ReferenceError',
      first_stack_frame: 'at run (server.js:42:8)',
      message: 'Failure at 2026-12-25T23:59:59.999Z',
    };
    assert.equal(fingerprint(event1), fingerprint(event2));
  });

  it('ignores line numbers in minified file paths', () => {
    const event1 = {
      error_type: 'SyntaxError',
      first_stack_frame: 'at parse (chunk-a1b2.js:1234:56)',
      message: 'Unexpected token',
    };
    const event2 = {
      error_type: 'SyntaxError',
      first_stack_frame: 'at parse (chunk-a1b2.js:9999:22)',
      message: 'Unexpected token',
    };
    assert.equal(fingerprint(event1), fingerprint(event2));
  });

  it('differs for different error types', () => {
    const base = {
      first_stack_frame: 'at handler (app.js:10:5)',
      message: 'something went wrong',
    };
    const a = fingerprint({ ...base, error_type: 'TypeError' });
    const b = fingerprint({ ...base, error_type: 'RangeError' });
    assert.notEqual(a, b);
  });
});
