// Dependency checker: detect installed vs latest versions for node_modules errors.
// When an error originates in node_modules, looks up package version info.

/**
 * Check if a file path is inside node_modules.
 *
 * @param {string} filePath
 * @returns {boolean}
 */
export function isNodeModulesPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return filePath.includes('node_modules/');
}

/**
 * Extract the package name from a node_modules path.
 * Handles scoped packages (@scope/pkg) and regular packages.
 *
 * @param {string} filePath
 * @returns {string|null}
 */
export function extractPackageName(filePath) {
  if (!filePath || typeof filePath !== 'string') return null;

  // Match scoped packages: node_modules/@scope/pkg/...
  const scopedMatch = filePath.match(/node_modules\/(@[^/]+\/[^/]+)/);
  if (scopedMatch) return scopedMatch[1];

  // Match regular packages: node_modules/pkg/...
  const regularMatch = filePath.match(/node_modules\/([^@][^/]*)/);
  if (regularMatch) return regularMatch[1];

  return null;
}

/**
 * Check dependency version info for a package found in a file path.
 *
 * @param {string} filePath          — path that triggered the error
 * @param {object} opts
 * @param {(args: string[]) => Promise<string>} opts.npm — injected npm command runner
 * @returns {Promise<{ package: string, current: string, latest: string, deprecated: boolean, advisory_url: null }|null>}
 */
export async function checkDependency(filePath, opts) {
  const npm = opts?.npm;
  if (!npm) return null;

  const pkg = extractPackageName(filePath);
  if (!pkg) return null;

  try {
    // Get current installed version via npm ls
    const lsOutput = await npm(['ls', pkg, '--json', '--depth=0']);
    const lsData = JSON.parse(lsOutput);

    let current = null;
    if (lsData.dependencies?.[pkg]?.version) {
      current = lsData.dependencies[pkg].version;
    }

    // Get latest version via npm view
    const latest = (await npm(['view', pkg, 'version'])).trim();

    return {
      package: pkg,
      current,
      latest,
      deprecated: false,
      advisory_url: null,
    };
  } catch {
    return null;
  }
}
