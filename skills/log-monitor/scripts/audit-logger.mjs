import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * Append-only JSONL audit logger.
 * Records every action the Forge agent takes as one JSON line per call.
 *
 * @param {{ path: string, runId: string, runMode: string }} opts
 * @returns {{ log: (entry: object) => void }}
 */
export function createAuditLogger({ path, runId, runMode }) {
  mkdirSync(dirname(path), { recursive: true });

  return {
    log(entry) {
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        run_id: runId,
        run_mode: runMode,
        actor: entry.actor,
        action: entry.action,
        target: entry.target ?? null,
        reason: entry.reason ?? null,
        context: entry.context ?? null,
        result: entry.result ?? 'ok',
        duration_ms: entry.duration_ms ?? null,
      });
      appendFileSync(path, line + '\n', 'utf-8');
    },
  };
}
