// Classifier rules orchestrator
// Composes all 5 rules, applies only enabled ones from config, returns all matches.

import { crashRule } from './crash.mjs';
import { ssrErrorRule } from './ssr-error.mjs';
import { http5xxClusterRule } from './http-5xx-cluster.mjs';
import { newSignatureRule } from './new-signature.mjs';
import { systemCriticalRule } from './system-critical.mjs';

const RULES = {
  crash: (events, cfg, state) => crashRule(events, cfg),
  ssr_error: (events, cfg, state) => ssrErrorRule(events, cfg),
  http_5xx_cluster: (events, cfg, state) => http5xxClusterRule(events, cfg),
  new_signature: (events, cfg, state) => newSignatureRule(events, state),
  system_critical: (events, cfg, state) => systemCriticalRule(events, cfg),
};

/**
 * Apply all enabled classifier rules to a batch of events.
 *
 * @param {Array<object>} events
 * @param {object} state
 * @param {object} config
 * @param {Array<{id: string, enabled: boolean}>} config.severity_rules.rules
 * @returns {Array<{event: object, rule_id: string, reason: string}>}
 */
export function applyRules(events, state, config) {
  const ruleConfigs = config.severity_rules?.rules || [];
  const results = [];
  for (const ruleCfg of ruleConfigs) {
    if (!ruleCfg.enabled) continue;
    const fn = RULES[ruleCfg.id];
    if (!fn) throw new Error(`Unknown rule: ${ruleCfg.id}`);
    results.push(...fn(events, ruleCfg, state));
  }
  return results;
}
