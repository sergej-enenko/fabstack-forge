import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Parse YAML-like frontmatter key-value lines.
 * Auto-casts numbers and booleans.
 */
function parseFrontmatter(raw) {
  const metadata = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(':');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    metadata[key] = castValue(val);
  }
  return metadata;
}

/**
 * Cast a string value to number or boolean when appropriate.
 */
function castValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val !== '' && !isNaN(Number(val))) return Number(val);
  return val;
}

/**
 * Parse a markdown file with frontmatter delimited by --- markers.
 * Returns { metadata, body }.
 */
function parsePrompt(content) {
  const parts = content.split('---');
  if (parts.length < 3) {
    return { metadata: {}, body: content.trim() };
  }
  const metadata = parseFrontmatter(parts[1]);
  const body = parts.slice(2).join('---').trim();
  return { metadata, body };
}

/**
 * Factory: creates a prompts loader scoped to a directory.
 * @param {{ dir: string }} options
 * @returns {{ load(name: string): Promise<{metadata, body}>, substitute(name: string, vars: Record<string,string>): Promise<string> }}
 */
export function createPromptsLoader({ dir }) {
  const cache = new Map();

  async function load(name) {
    if (cache.has(name)) return cache.get(name);

    const filePath = join(dir, `${name}.md`);
    let content;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (err) {
      throw new Error(`Prompt file not found: ${name} (${filePath})`);
    }

    const prompt = parsePrompt(content);
    cache.set(name, prompt);
    return prompt;
  }

  async function substitute(name, vars) {
    const prompt = await load(name);
    let text = prompt.body;

    // Find all placeholders in the template
    const placeholders = [...text.matchAll(/\{\{(\w+)\}\}/g)];
    const missing = [];
    for (const match of placeholders) {
      const key = match[1];
      if (!(key in vars)) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      throw new Error(`Missing variables: ${missing.join(', ')}`);
    }

    // Replace all placeholders with provided values
    text = text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key]);
    return text;
  }

  return { load, substitute };
}
