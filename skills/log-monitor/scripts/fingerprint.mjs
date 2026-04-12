import { createHash } from 'node:crypto';

// UUID v1-v5 (standard 8-4-4-4-12 hex format)
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

// Short UUIDs (32 hex chars without dashes)
const SHORT_UUID_RE = /\b[0-9a-f]{32}\b/gi;

// ISO 8601 timestamps: 2026-04-11T14:32:09Z or 2026-04-11T14:32:09.123Z
const ISO_TS_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;

// Epoch timestamps (10 or 13 digit numbers)
const EPOCH_TS_RE = /\b\d{10,13}\b/g;

// Line:col numbers in stack frames — e.g. file.js:1234:56
const LINE_COL_RE = /(?<=\.(?:js|mjs|cjs|ts|mts|tsx|jsx)):\d+:\d+/g;

// Session IDs (common formats: hex strings of 24-64 chars, often prefixed)
const SESSION_ID_RE = /\b(?:sess?|sid|session)[_-]?[0-9a-zA-Z_-]{16,64}\b/gi;

/**
 * Normalize a text string by replacing variable tokens with stable placeholders.
 * This ensures that semantically identical log messages produce the same fingerprint.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  if (!text) return '';
  return text
    .replace(UUID_RE, '<UUID>')
    .replace(SHORT_UUID_RE, '<UUID>')
    .replace(ISO_TS_RE, '<TIMESTAMP>')
    .replace(EPOCH_TS_RE, '<EPOCH>')
    .replace(LINE_COL_RE, ':<LINE>')
    .replace(SESSION_ID_RE, '<SESSION>');
}

/**
 * Produce a stable SHA-256 fingerprint (first 16 hex chars) for a log event.
 * Invariant to UUIDs, timestamps, line numbers, and session IDs.
 *
 * @param {{ error_type?: string, first_stack_frame?: string, message?: string }} event
 * @returns {string} 16-char hex hash
 */
export function fingerprint(event) {
  const parts = [
    normalize(event.error_type ?? ''),
    normalize(event.first_stack_frame ?? ''),
    normalize(event.message ?? ''),
  ];
  const payload = parts.join('\x1f');
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
