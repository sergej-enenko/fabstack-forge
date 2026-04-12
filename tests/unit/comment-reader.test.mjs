import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseForgeCommand } from '../../skills/log-monitor/scripts/comment-reader.mjs';

describe('parseForgeCommand', () => {
  it('parses /forge ignore', () => {
    const result = parseForgeCommand('/forge ignore');
    assert.deepEqual(result, { cmd: 'ignore' });
  });

  it('parses /forge ignore-for 7d', () => {
    const result = parseForgeCommand('/forge ignore-for 7d');
    assert.deepEqual(result, { cmd: 'ignore-for', duration: '7d' });
  });

  it('parses /forge reclassify notable', () => {
    const result = parseForgeCommand('/forge reclassify notable');
    assert.deepEqual(result, { cmd: 'reclassify', target: 'notable' });
  });

  it('parses /forge reinvestigate', () => {
    const result = parseForgeCommand('/forge reinvestigate');
    assert.deepEqual(result, { cmd: 'reinvestigate' });
  });

  it('parses /forge wrong-fix-class null-guard', () => {
    const result = parseForgeCommand('/forge wrong-fix-class null-guard');
    assert.deepEqual(result, { cmd: 'wrong-fix-class', suggestion: 'null-guard' });
  });

  it('returns null for non-commands', () => {
    assert.equal(parseForgeCommand('Looks good to me'), null);
    assert.equal(parseForgeCommand('/other command'), null);
  });

  it('handles multi-line comment with forge command in the middle', () => {
    const body = 'Some context.\n/forge ignore\nMore context.';
    const result = parseForgeCommand(body);
    assert.deepEqual(result, { cmd: 'ignore' });
  });
});
