import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createPromptsLoader } from '../../skills/log-monitor/scripts/prompts-loader.mjs';

const fixturesDir = join(import.meta.dirname, '..', 'fixtures', 'prompts');

describe('createPromptsLoader', () => {
  it('loads a prompt and parses frontmatter', async () => {
    const loader = createPromptsLoader({ dir: fixturesDir });
    const prompt = await loader.load('sample-prompt');

    assert.equal(prompt.metadata.id, 'sample-prompt');
    assert.equal(prompt.metadata.version, 1);
    assert.equal(prompt.metadata.model, 'claude-haiku-4-5');
    assert.equal(prompt.metadata.max_tokens, 500);
    assert.equal(prompt.metadata.temperature, 0);
    assert.ok(prompt.body.includes('Sample Prompt'));
  });

  it('substitutes variables correctly', async () => {
    const loader = createPromptsLoader({ dir: fixturesDir });
    const result = await loader.substitute('sample-prompt', {
      input: 'test data',
      context: 'unit testing',
    });

    assert.ok(result.includes('Analyze this: test data'));
    assert.ok(result.includes('Context: unit testing'));
    assert.ok(!result.includes('{{input}}'));
    assert.ok(!result.includes('{{context}}'));
  });

  it('throws on missing variable', async () => {
    const loader = createPromptsLoader({ dir: fixturesDir });

    await assert.rejects(
      () => loader.substitute('sample-prompt', { input: 'test data' }),
      (err) => {
        assert.ok(err.message.includes('context'));
        return true;
      },
    );
  });

  it('caches loaded prompts', async () => {
    const loader = createPromptsLoader({ dir: fixturesDir });
    const first = await loader.load('sample-prompt');
    const second = await loader.load('sample-prompt');

    assert.equal(first, second);
  });

  it('throws on missing prompt file', async () => {
    const loader = createPromptsLoader({ dir: fixturesDir });

    await assert.rejects(
      () => loader.load('nonexistent-prompt'),
      (err) => {
        assert.ok(err.message.includes('nonexistent-prompt'));
        return true;
      },
    );
  });
});
