/**
 * Reporter — generates a Markdown report from dedup results, investigations,
 * patches, and run metadata.
 *
 * Returns a plain string (Markdown).
 */

/**
 * @param {object} params
 * @param {{ new: Array, continuing: Array, returning: Array, resolved: Array }} params.dedup
 * @param {Array<{ fingerprint: string, location?: string, hypothesis?: string, confidence?: number, fix_class?: string }>} params.investigations
 * @param {Array<{ fingerprint: string, diff?: string, pr_url?: string }>} params.patches
 * @param {{ health_score?: number }} params.stats
 * @param {string} params.runId
 * @param {string} params.timestamp
 * @param {string} params.mode — "OBSERVE" or "FIX"
 * @param {{ project_name?: string }} params.config
 * @returns {string}
 */
export function generateMarkdown({ dedup, investigations, patches, stats, runId, timestamp, mode, config }) {
  const lines = [];
  const projectName = config?.project_name ?? 'unknown';
  const healthScore = stats?.health_score ?? null;

  // Index investigations and patches by fingerprint
  const investigationsByFp = new Map();
  for (const inv of investigations ?? []) {
    investigationsByFp.set(inv.fingerprint, inv);
  }

  const patchesByFp = new Map();
  for (const patch of patches ?? []) {
    patchesByFp.set(patch.fingerprint, patch);
  }

  // --- Header ---
  lines.push('# Fabstack Forge Report');
  lines.push('');
  lines.push(`**Project:** ${projectName}`);
  lines.push(`**Run ID:** ${runId}`);
  lines.push(`**Timestamp:** ${timestamp}`);
  lines.push(`**Mode:** ${mode}`);
  if (healthScore != null) {
    lines.push(`**Health Score:** ${healthScore}`);
  }
  lines.push('');

  // --- Summary ---
  lines.push('## Summary');
  lines.push('');
  lines.push(`- New criticals: ${dedup.new.length}`);
  lines.push(`- Continuing: ${dedup.continuing.length}`);
  lines.push(`- Returning: ${dedup.returning.length}`);
  lines.push(`- Resolved: ${dedup.resolved.length}`);

  // Count notables: events classified as notable across all dedup buckets
  const allEvents = [...dedup.new, ...dedup.continuing, ...dedup.returning];
  const worthWatching = allEvents.filter((e) => e.classification === 'notable');
  lines.push(`- Worth watching: ${worthWatching.length}`);

  // Count auto-fixes
  const autoFixes = (patches ?? []).filter((p) => p.pr_url);
  lines.push(`- Auto-fixes: ${autoFixes.length}`);
  lines.push('');

  // --- New Criticals ---
  if (dedup.new.length > 0) {
    lines.push('## New Criticals');
    lines.push('');
    for (const event of dedup.new) {
      const fp = event.fingerprint;
      const inv = investigationsByFp.get(fp);
      const patch = patchesByFp.get(fp);

      lines.push(`### ${fp}`);
      lines.push('');
      if (inv?.location) {
        lines.push(`**Location:** ${inv.location}`);
      }
      if (inv?.hypothesis) {
        lines.push(`**Root cause:** ${inv.hypothesis}`);
      }
      if (inv?.confidence != null) {
        lines.push(`**Confidence:** ${inv.confidence}`);
      }
      if (inv?.fix_class) {
        lines.push(`**Fix class:** ${inv.fix_class}`);
      }
      if (patch?.diff) {
        lines.push('');
        lines.push('**Proposed fix:**');
        lines.push('');
        lines.push('```diff');
        lines.push(patch.diff);
        lines.push('```');
      }
      if (patch?.pr_url) {
        lines.push('');
        lines.push(`**Auto-fix PR:** ${patch.pr_url}`);
      }
      lines.push('');
    }
  }

  // --- Continuing ---
  if (dedup.continuing.length > 0) {
    lines.push('## Continuing');
    lines.push('');
    for (const event of dedup.continuing) {
      const msg = event.message ?? event.fingerprint;
      lines.push(`- \`${event.fingerprint}\` — ${msg}`);
    }
    lines.push('');
  }

  // --- Returning ---
  if (dedup.returning.length > 0) {
    lines.push('## Returning');
    lines.push('');
    for (const event of dedup.returning) {
      const msg = event.message ?? event.fingerprint;
      lines.push(`- \`${event.fingerprint}\` — ${msg}`);
    }
    lines.push('');
  }

  // --- Resolved ---
  if (dedup.resolved.length > 0) {
    lines.push('## Resolved');
    lines.push('');
    for (const event of dedup.resolved) {
      const lastSeen = event.last_seen ?? 'unknown';
      lines.push(`- \`${event.fingerprint}\` — last seen ${lastSeen}`);
    }
    lines.push('');
  }

  // --- Worth Watching ---
  if (worthWatching.length > 0) {
    lines.push('## Worth Watching');
    lines.push('');
    for (const event of worthWatching) {
      const msg = event.message ?? event.fingerprint;
      const reason = event.ai_reason ? ` (${event.ai_reason})` : '';
      lines.push(`- ${msg}${reason}`);
    }
    lines.push('');
  }

  // --- Monitor Meta ---
  lines.push('## Monitor Meta');
  lines.push('');
  if (healthScore != null) {
    lines.push(`**Health Score:** ${healthScore}`);
  }
  lines.push('See `forge-stats.json` for full metrics.');
  lines.push('');

  return lines.join('\n');
}
