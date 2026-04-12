import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNodeModulesPath,
  extractPackageName,
  checkDependency,
} from '../../skills/log-monitor/scripts/dependency-checker.mjs';

describe('dependency-checker', () => {
  it('isNodeModulesPath detects node_modules paths', () => {
    assert.equal(isNodeModulesPath('node_modules/express/index.js'), true);
    assert.equal(isNodeModulesPath('/app/node_modules/@scope/pkg/lib/x.js'), true);
    assert.equal(isNodeModulesPath('src/utils/helper.js'), false);
    assert.equal(isNodeModulesPath(''), false);
    assert.equal(isNodeModulesPath(null), false);
  });

  it('extracts package name and checks versions (mock npm)', async () => {
    const mockNpm = async (args) => {
      if (args[0] === 'ls') {
        return JSON.stringify({
          dependencies: {
            express: { version: '1.2.3' },
          },
        });
      }
      if (args[0] === 'view') {
        return '1.3.0\n';
      }
      return '';
    };

    const result = await checkDependency('node_modules/express/lib/router.js', { npm: mockNpm });

    assert.ok(result, 'should return a result');
    assert.equal(result.package, 'express');
    assert.equal(result.current, '1.2.3');
    assert.equal(result.latest, '1.3.0');
    assert.equal(result.deprecated, false);
    assert.equal(result.advisory_url, null);
  });

  it('handles scoped packages (@scope/pkg)', async () => {
    const mockNpm = async (args) => {
      if (args[0] === 'ls') {
        return JSON.stringify({
          dependencies: {
            '@babel/core': { version: '7.24.0' },
          },
        });
      }
      if (args[0] === 'view') {
        return '7.25.0\n';
      }
      return '';
    };

    const name = extractPackageName('node_modules/@babel/core/lib/index.js');
    assert.equal(name, '@babel/core');

    const result = await checkDependency('node_modules/@babel/core/lib/index.js', { npm: mockNpm });

    assert.ok(result, 'should return a result');
    assert.equal(result.package, '@babel/core');
    assert.equal(result.current, '7.24.0');
    assert.equal(result.latest, '7.25.0');
  });

  it('returns null on npm error', async () => {
    const mockNpm = async () => {
      throw new Error('npm ERR! code E404');
    };

    const result = await checkDependency('node_modules/ghost-pkg/index.js', { npm: mockNpm });
    assert.equal(result, null);
  });
});
