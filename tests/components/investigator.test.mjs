import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { investigate } from '../../skills/log-monitor/scripts/investigator.mjs';

describe('investigator', () => {
  // Create temp dir for tests
  const tmpDir = mkdtempSync(join(tmpdir(), 'investigator-test-'));

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('investigates file-based error with AI mock', async () => {
    // Create test file at src/page.ts with line 42
    const srcDir = join(tmpDir, 'test1', 'src');
    mkdirSync(srcDir, { recursive: true });
    const lines = [];
    for (let i = 1; i <= 60; i++) {
      if (i === 42) {
        lines.push('const title = metadata.title');
      } else {
        lines.push(`// line ${i}`);
      }
    }
    writeFileSync(join(srcDir, 'page.ts'), lines.join('\n'));

    const repoRoot = join(tmpDir, 'test1');

    const criticals = [
      {
        first_stack_frame: 'at Page (src/page.ts:42:15)',
        message: 'TypeError: Cannot read property title of null',
        first_seen: new Date().toISOString(),
      },
    ];

    const config = {};

    const mockAi = async (prompt) => ({
      root_cause: {
        hypothesis: 'metadata is null when page loads before data fetch completes',
        confidence: 'high',
        reasoning: 'The metadata object is accessed without null check',
      },
      proposed_fixes: [
        {
          class: 'null-guard',
          diff: '- const title = metadata.title\n+ const title = metadata?.title ?? ""',
          explanation: 'Add optional chaining and fallback',
        },
      ],
    });

    const mockBlame = async () => 'abc123 (Alice 2026-04-10) const title = metadata.title';

    const results = await investigate(criticals, config, {
      repoRoot,
      ai: mockAi,
      gitBlame: mockBlame,
      gitCorrelate: async () => ({ recent_commits: [], line_range_history: [], prime_suspect: null }),
      activeDevZone: async () => false,
    });

    assert.equal(results.length, 1);
    const r = results[0];
    assert.ok(r.location, 'should have location');
    assert.equal(r.location.file, 'src/page.ts');
    assert.equal(r.location.line, 42);
    assert.ok(r.root_cause, 'should have root_cause');
    assert.equal(r.root_cause.confidence, 'high');
    assert.equal(r.proposed_fixes.length, 1);
    assert.equal(r.proposed_fixes[0].class, 'null-guard');
    assert.ok(r.git_blame, 'should have git_blame');
  });

  it('caps confidence at medium for security-sensitive files', async () => {
    // Create test file at src/auth/login.ts
    const authDir = join(tmpDir, 'test2', 'src', 'auth');
    mkdirSync(authDir, { recursive: true });
    const lines = [];
    for (let i = 1; i <= 30; i++) {
      lines.push(`// auth line ${i}`);
    }
    writeFileSync(join(authDir, 'login.ts'), lines.join('\n'));

    const repoRoot = join(tmpDir, 'test2');

    const criticals = [
      {
        first_stack_frame: 'at Login (src/auth/login.ts:10:5)',
        message: 'Error: invalid token',
        first_seen: new Date().toISOString(),
      },
    ];

    const config = {
      security_sensitive_patterns: ['**/auth/**'],
    };

    const mockAi = async () => ({
      root_cause: {
        hypothesis: 'Token validation missing',
        confidence: 'high',
        reasoning: 'No token check before access',
      },
      proposed_fixes: [
        {
          class: 'error-handling',
          diff: '+ if (!token) throw new AuthError()',
          explanation: 'Add token validation',
        },
      ],
    });

    const results = await investigate(criticals, config, {
      repoRoot,
      ai: mockAi,
      gitCorrelate: async () => ({ recent_commits: [], line_range_history: [], prime_suspect: null }),
      activeDevZone: async () => false,
    });

    assert.equal(results.length, 1);
    const r = results[0];
    assert.equal(r.root_cause.confidence, 'medium');
    assert.equal(r.confidence_downgrade_reason, 'security-sensitive');
  });

  it('detects node_modules errors and returns dependency_info', async () => {
    const repoRoot = join(tmpDir, 'test3');
    mkdirSync(repoRoot, { recursive: true });

    const criticals = [
      {
        first_stack_frame: 'at Parser (node_modules/some-lib/x.js:5:10)',
        message: 'SyntaxError: unexpected token',
        first_seen: new Date().toISOString(),
      },
    ];

    const config = {};

    const mockCheckDep = async (filePath) => ({
      package: 'some-lib',
      current: '2.0.0',
      latest: '2.1.0',
      deprecated: false,
      advisory_url: null,
    });

    const results = await investigate(criticals, config, {
      repoRoot,
      ai: async () => ({}),
      checkDep: mockCheckDep,
    });

    assert.equal(results.length, 1);
    const r = results[0];
    assert.ok(r.dependency_info, 'should have dependency_info');
    assert.equal(r.dependency_info.package, 'some-lib');
    assert.equal(r.skipped_reason, 'node_modules');
    assert.equal(r.proposed_fixes.length, 0);
  });
});
