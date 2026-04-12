/**
 * Collector workflow renderer.
 *
 * Supports both v1 (single-project) and v2 (multi-project hub) configs.
 *
 * v1: Single server, flat logs/ directory. Uses <%=var%> template placeholders.
 * v2: Multiple servers, logs organized in per-project subdirectories.
 *     Generates one SSH setup + fetch block per project.
 */

/**
 * Build a fetch_or_mark shell line for a single collector source.
 *
 * @param {Object} source       Collector source definition
 * @param {string} [projectId]  If provided, prefix target files with logs/{projectId}/
 * @returns {string} indented shell line
 */
function buildFetchCommand(source, projectId) {
  const indent = '          ';
  const lines = source.lines || 5000;
  const prefix = projectId ? `logs/${projectId}/` : 'logs/';

  switch (source.type) {
    case 'docker': {
      const container = source.container;
      const since = source.since || '2h';
      const targetFile = `${prefix}docker-${container}.log`;
      const cmd = `docker logs --since=${since} ${container} 2>&1 | tail -${lines}`;
      return `${indent}fetch_or_mark ${targetFile} "${cmd}"`;
    }

    case 'file': {
      const filePath = source.path;
      const parser = source.parser || 'nginx-error';
      const targetFile = `${prefix}${parser}.log`;
      const cmd = `tail -n ${lines} ${filePath}`;
      return `${indent}fetch_or_mark ${targetFile} "${cmd}"`;
    }

    case 'journalctl': {
      const since = source.since || '2h';
      const targetFile = `${prefix}journald.log`;
      const cmd = `journalctl --since='${since} ago' --no-pager`;
      return `${indent}fetch_or_mark ${targetFile} "${cmd}"`;
    }

    default:
      throw new Error(`Unknown collector source type: ${source.type}`);
  }
}

/**
 * Build the SSH setup + fetch block for a single project's server.
 * Used in v2 multi-project mode.
 *
 * @param {Object} project        Project config from v2 projects array
 * @param {string} pluginVersion  Plugin version string
 * @returns {string} YAML step blocks for this project
 */
function buildServerBlock(project, pluginVersion) {
  const id = project.id;
  const server = project.server;
  const sshKeySecret = server.ssh_key_secret;
  const hostSecret = server.host_secret;
  const userSecret = server.user_secret;
  const connectTimeout = server.ssh_connect_timeout || 15;

  // Resolve collector sources: use project.collector.sources if available, else project.log_sources
  const sources = project.collector?.sources || project.log_sources || [];
  const fetchLines = sources.map((s) => buildFetchCommand(s, id));
  const fetchBlock = fetchLines.join('\n');

  return `
      # --- ${id} ---
      - name: Setup SSH for ${id}
        run: |
          mkdir -p ~/.ssh
          chmod 700 ~/.ssh
          echo "\${{ secrets.${sshKeySecret} }}" > ~/.ssh/forge_${id}
          chmod 600 ~/.ssh/forge_${id}
          ssh-keyscan -H \${{ secrets.${hostSecret} }} >> ~/.ssh/known_hosts 2>/dev/null
        continue-on-error: true

      - name: Fetch logs for ${id}
        env:
          HOST: \${{ secrets.${hostSecret} }}
          USER: \${{ secrets.${userSecret} }}
        run: |
          cd forge-logs-workspace
          mkdir -p logs/${id}

          fetch_or_mark() {
            local target_file="$1"
            local command="$2"
            if ssh -i ~/.ssh/forge_${id} \\
                   -o BatchMode=yes \\
                   -o ConnectTimeout=${connectTimeout} \\
                   -o StrictHostKeyChecking=yes \\
                   "$USER@$HOST" "$command" > "$target_file" 2>&1; then
              echo "  fetched: $target_file ($(wc -l < "$target_file") lines)"
            else
              echo "FETCH_FAILED: $command" > "$target_file"
              echo "  FAILED: $target_file"
            fi
          }

${fetchBlock}

          date -u +%Y-%m-%dT%H:%M:%SZ > logs/${id}/fetched-at.txt
          echo "\${{ github.run_id }}" > logs/${id}/run-id.txt
        continue-on-error: true`;
}

// ---------------------------------------------------------------------------
// v1 renderer (single-project, original behavior)
// ---------------------------------------------------------------------------

function renderV1(template, config, pluginVersion) {
  const collector = config.collector;
  const fetchLines = (collector.sources || []).map((s) => buildFetchCommand(s));
  const fetchBlock = fetchLines.join('\n');

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

  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.replaceAll(`<%=${key}%>`, value);
  }
  return output;
}

// ---------------------------------------------------------------------------
// v2 renderer (multi-project hub)
// ---------------------------------------------------------------------------

function renderV2(template, config, pluginVersion) {
  const projects = config.projects;
  const serverBlocks = projects.map((p) => buildServerBlock(p, pluginVersion)).join('\n');
  const projectIdsCsv = projects.map((p) => p.id).join(', ');
  const timeoutMinutes = 5 + 3 * projects.length;

  const vars = {
    plugin_version: pluginVersion,
    schedule_cron: config.collector?.schedule_cron || '3 */2 * * *',
    timeout_minutes: String(config.collector?.timeout_minutes || timeoutMinutes),
    forge_logs_branch: config.log_bridge?.branch || 'forge-logs',
    server_blocks: serverBlocks,
    project_ids_csv: projectIdsCsv,
  };

  let output = template;
  for (const [key, value] of Object.entries(vars)) {
    output = output.replaceAll(`<%=${key}%>`, value);
  }
  return output;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the collector workflow from a template and config.
 * Automatically detects v1 vs v2 config and uses the appropriate renderer.
 *
 * @param {string} template       Raw template content
 * @param {Object} config         Loaded forge config (v1 or v2)
 * @param {string} pluginVersion  Plugin version string
 * @returns {string} Rendered GitHub Actions YAML
 */
export function renderCollectorWorkflow(template, config, pluginVersion) {
  if (config.version === 2 || config.projects) {
    return renderV2(template, config, pluginVersion);
  }
  return renderV1(template, config, pluginVersion);
}

export { buildFetchCommand, buildServerBlock };
