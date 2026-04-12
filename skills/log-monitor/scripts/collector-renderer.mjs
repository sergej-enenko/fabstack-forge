/**
 * Collector workflow renderer.
 *
 * Takes the forge-collect.yml.template (which uses <%=var%> delimiters for
 * Forge variables and leaves ${{ }} GitHub Actions expressions untouched),
 * substitutes all Forge variables from the project config, generates the
 * fetch_or_mark command block from config.collector.sources, and returns
 * the rendered YAML string ready to write to .github/workflows/.
 */

/**
 * Build fetch_or_mark shell lines for a single collector source.
 *
 * @param {Object} source
 * @param {string} source.type      'docker' | 'file' | 'journalctl'
 * @param {string} [source.container]  container name (docker type)
 * @param {string} [source.path]       file path (file type)
 * @param {string} [source.parser]     parser name for file-based sources
 * @param {number} [source.lines]      tail line count
 * @param {string} [source.since]      time window (docker / journalctl)
 * @returns {string} indented shell lines
 */
function buildFetchCommand(source) {
  const indent = '          ';
  const lines = source.lines || 5000;

  switch (source.type) {
    case 'docker': {
      const container = source.container;
      const since = source.since || '2h';
      const targetFile = `logs/docker-${container}.log`;
      const cmd = `docker logs --since=${since} ${container} 2>&1 | tail -${lines}`;
      return `${indent}fetch_or_mark ${targetFile} "${cmd}"`;
    }

    case 'file': {
      const filePath = source.path;
      const parser = source.parser || 'nginx-error';
      const targetFile = `logs/${parser}.log`;
      const cmd = `tail -n ${lines} ${filePath}`;
      return `${indent}fetch_or_mark ${targetFile} "${cmd}"`;
    }

    case 'journalctl': {
      const since = source.since || '2h';
      const targetFile = 'logs/journald.log';
      const cmd = `journalctl --since='${since} ago' --no-pager`;
      return `${indent}fetch_or_mark ${targetFile} "${cmd}"`;
    }

    default:
      throw new Error(`Unknown collector source type: ${source.type}`);
  }
}

/**
 * Render the collector workflow from a template and config.
 *
 * @param {string} template       Raw template content (<%=var%> placeholders)
 * @param {Object} config         Loaded forge config
 * @param {string} pluginVersion  Plugin version string (e.g. "0.1.0")
 * @returns {string} Rendered GitHub Actions YAML
 */
export function renderCollectorWorkflow(template, config, pluginVersion) {
  const collector = config.collector;
  if (!collector) {
    throw new Error('config.collector is required');
  }

  // Build fetch commands block from sources
  const fetchLines = (collector.sources || []).map(buildFetchCommand);
  const fetchBlock = fetchLines.join('\n');

  // Substitution map: template variable name -> value
  const vars = {
    plugin_version: pluginVersion,
    schedule_cron: collector.schedule_cron,
    timeout_minutes: String(collector.timeout_minutes || 5),
    forge_logs_branch: config.log_bridge?.branch || 'forge-logs',
    ssh_private_key_secret: collector.secret_names?.ssh_private_key || 'SSH_PRIVATE_KEY',
    host_secret: collector.secret_names?.host || 'FORGE_HOST',
    user_secret: collector.secret_names?.user || 'FORGE_USER',
    ssh_connect_timeout: String(collector.ssh?.connect_timeout_seconds || 15),
    fetch_commands: fetchBlock,
  };

  // Replace all <%=key%> placeholders
  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.replaceAll(`<%=${key}%>`, value);
  }

  return output;
}

// Also export buildFetchCommand for targeted unit testing.
export { buildFetchCommand };
