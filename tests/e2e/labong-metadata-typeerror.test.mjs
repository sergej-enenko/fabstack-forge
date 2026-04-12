import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../skills/log-monitor/scripts/config-loader.mjs';
import { classify } from '../../skills/log-monitor/scripts/classifier.mjs';
import { parseDocker } from '../../skills/log-monitor/scripts/parse-docker.mjs';
import { dedup } from '../../skills/log-monitor/scripts/dedup.mjs';
import { investigate } from '../../skills/log-monitor/scripts/investigator.mjs';

const FIXTURE = join(import.meta.dirname, '..', 'fixtures', 'e2e', 'labong-day-1');

describe('E2E: labong-day-1 — metadata TypeError detection', () => {
  test('detects metadata TypeError as critical and proposes null-guard fix', async () => {
    // 1. Load fixture config
    const config = loadConfig(join(FIXTURE, 'config.yml'));

    // 2. Parse fixture logs directly (bypass log-fetcher)
    const storefrontRaw = readFileSync(join(FIXTURE, 'logs', 'storefront.txt'), 'utf8');
    const medusaRaw = readFileSync(join(FIXTURE, 'logs', 'medusa.txt'), 'utf8');
    const events = [
      ...parseDocker(storefrontRaw, { container: 'storefront', severity_profile: 'high' }),
      ...parseDocker(medusaRaw, { container: 'medusa', severity_profile: 'high' })
    ];

    // Verify we have events including the error
    assert.ok(events.length >= 10, `expected >=10 events, got ${events.length}`);
    const errors = events.filter(e => e.level === 'error');
    assert.ok(errors.length >= 1, 'at least one error event expected');

    // Enrich error events: promote first stack frame from metadata.stack
    // (The docker parser folds stack frames into metadata.stack; the investigator
    // reads first_stack_frame. A real orchestrator bridges this gap.)
    for (const event of events) {
      if (event.metadata?.stack?.length > 0 && !event.first_stack_frame) {
        event.first_stack_frame = event.metadata.stack[0];
      }
    }

    // 3. Classify (AI disabled in fixture config, rules only)
    const state = { known_errors: [] };
    const classified = await classify(events, state, config, {
      aiClassify: async () => []
    });

    // 4. Check classification
    const criticals = classified.filter(e => e.classification === 'critical');
    assert.ok(criticals.length >= 1, `expected >=1 critical, got ${criticals.length}`);

    // The TypeError should match the 'ssr_error' rule (source=storefront + /typeerror/i)
    const typeErrorCritical = criticals.find(c =>
      c.message && c.message.includes('TypeError')
    );
    assert.ok(typeErrorCritical, 'TypeError should be classified as critical');
    assert.equal(typeErrorCritical.classifier, 'rule');

    // 5. Dedup — all should be "new" since state is empty
    const deduped = dedup(classified, state, config);
    assert.ok(deduped.new.length >= 1, 'at least one new critical');

    // 6. Investigate with mock AI
    const newCriticals = deduped.new.filter(e => e.classification === 'critical');

    const mockAi = async ({ event, location }) => ({
      root_cause: {
        hypothesis: 'product.metadata is undefined when accessed at line 42',
        confidence: 'high',
        reasoning: 'The error shows metadata.title access on undefined. The function getProductMetadata does not check if metadata exists before accessing .title.',
      },
      proposed_fixes: [
        {
          class: 'null-guard',
          diff: [
            '--- a/storefront/src/app/[locale]/page.tsx',
            '+++ b/storefront/src/app/[locale]/page.tsx',
            '@@ -42,2 +42,2 @@',
            '-  const title = product.metadata.title;',
            '-  const description = product.metadata.description;',
            '+  const title = product.metadata?.title ?? "";',
            '+  const description = product.metadata?.description ?? "";'
          ].join('\n'),
          explanation: 'Add optional chaining and nullish coalescing to safely access metadata properties'
        }
      ]
    });

    const investigations = await investigate(newCriticals, config, {
      repoRoot: join(FIXTURE, 'repo-snapshot'),
      ai: mockAi,
      gitCorrelate: async () => ({ recent_commits: [], line_range_history: [], prime_suspect: null }),
      gitBlame: async () => ({ author: 'dev', commit: 'abc123', date: new Date('2026-04-10'), days_ago: 2 }),
      activeDevZone: async () => false
    });

    // 7. Verify investigation result
    assert.ok(investigations.length >= 1, 'at least one investigation');

    const inv = investigations.find(i =>
      i.event.message && i.event.message.includes('TypeError')
    );
    assert.ok(inv, 'TypeError investigation should exist');
    assert.equal(inv.root_cause.confidence, 'high');
    assert.ok(inv.proposed_fixes.length >= 1, 'at least one fix proposed');
    assert.equal(inv.proposed_fixes[0].class, 'null-guard');
    assert.ok(inv.proposed_fixes[0].diff.includes('metadata?.title'), 'diff should contain optional chaining');
    assert.ok(inv.location, 'location should be found');
    assert.ok(inv.location.file.includes('page.tsx'), 'should point to page.tsx');
  });
});
