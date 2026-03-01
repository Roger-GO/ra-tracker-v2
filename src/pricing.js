/**
 * Model Pricing Data
 * USD per 1 million tokens
 * Updated: 2026-02-22
 */

const PRICING = {
  // OpenRouter Models (https://openrouter.ai/docs/models)
  'openrouter/x-ai/grok-4.1-fast': {
    provider: 'x-ai',
    input: 2.00,      // $2.00 per 1M input
    output: 10.00,    // $10.00 per 1M output
    cacheRead: 0.125, // $0.125 per 1M cache read
    cacheWrite: 0.50  // $0.50 per 1M cache write
  },
  'openrouter/minimax/minimax-m2.5': {
    provider: 'minimax',
    input: 0.80,
    output: 0.80,
    cacheRead: 0.10,
    cacheWrite: 0.10
  },
  'openrouter/deepseek/deepseek-chat': {
    provider: 'deepseek',
    input: 0.27,
    output: 1.10,
    cacheRead: 0.01,
    cacheWrite: 0.01
  },
  'openrouter/moonshotai/kimi-k2.5': {
    provider: 'moonshotai',
    input: 1.20,
    output: 12.00,
    cacheRead: 0.15,
    cacheWrite: 0.15
  },
  'openrouter/anthropic/claude-sonnet-4.6': {
    provider: 'anthropic',
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 3.00
  },
  'openrouter/arcee-ai/trinity-large-preview': {
    provider: 'arcee-ai',
    input: 0.70,
    output: 2.80,
    cacheRead: 0.07,
    cacheWrite: 0.07
  },
  
  // Fallback default pricing (generous estimate)
  'default': {
    provider: 'unknown',
    input: 3.00,
    output: 15.00,
    cacheRead: 0.30,
    cacheWrite: 0.30
  }
};

/**
 * Get pricing for a model
 * @param {string} modelId - Full model ID (e.g., 'openrouter/minimax/minimax-m2.5')
 * @returns {object} Pricing object with input, output, cacheRead, cacheWrite
 */
function getPricing(modelId) {
  if (!modelId) return PRICING['default'];

  // Exact match
  if (PRICING[modelId]) return PRICING[modelId];

  // Try with openrouter/ prefix added (JSONL stores model without prefix)
  const withPrefix = `openrouter/${modelId}`;
  if (PRICING[withPrefix]) return PRICING[withPrefix];

  // Try without openrouter/ prefix (in case stored with prefix)
  const withoutPrefix = modelId.replace(/^openrouter\//, '');
  if (PRICING[withoutPrefix]) return PRICING[withoutPrefix];

  // Try matching on the final segment (e.g. "kimi-k2.5" matches "openrouter/moonshotai/kimi-k2.5")
  const baseModel = modelId.split('/').pop();
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (key !== 'default' && key.endsWith(baseModel)) return pricing;
  }

  return PRICING['default'];
}

/**
 * Calculate cost for token usage
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens  
 * @param {number} cacheReadTokens - Number of cache read tokens
 * @param {number} cacheWriteTokens - Number of cache write tokens
 * @param {string} modelId - Model ID for pricing lookup
 * @returns {object} Cost breakdown
 */
function calculateCost(inputTokens, outputTokens, cacheReadTokens = 0, cacheWriteTokens = 0, modelId = 'default') {
  const pricing = getPricing(modelId);
  
  const costInput = (inputTokens / 1_000_000) * pricing.input;
  const costOutput = (outputTokens / 1_000_000) * pricing.output;
  const costCacheRead = (cacheReadTokens / 1_000_000) * pricing.cacheRead;
  const costCacheWrite = (cacheWriteTokens / 1_000_000) * pricing.cacheWrite;
  
  return {
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens,
    costInput: Math.round(costInput * 1000000) / 1000000, // Round to 6 decimals
    costOutput: Math.round(costOutput * 1000000) / 1000000,
    costCacheRead: Math.round(costCacheRead * 1000000) / 1000000,
    costCacheWrite: Math.round(costCacheWrite * 1000000) / 1000000,
    costTotal: Math.round((costInput + costOutput + costCacheRead + costCacheWrite) * 1000000) / 1000000,
    modelId,
    provider: pricing.provider
  };
}

/**
 * Get all known models
 * @returns {string[]} Array of model IDs
 */
function getKnownModels() {
  return Object.keys(PRICING).filter(k => k !== 'default');
}

module.exports = {
  PRICING,
  getPricing,
  calculateCost,
  getKnownModels
};
