/**
 * OpenRouter Sync Service
 * Validates local token usage tracking against OpenRouter credit data
 */

// Load .env when run standalone (e.g. node sync.js --once)
const path = require('path');
const fs = require('fs');
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
} else {
  require('dotenv').config(); // fallback: cwd
}

const { OpenRouterClient } = require('./client');
const db = require('../db/manager');

async function getLocalTotals() {
  const dbInstance = db.getDb();
  
  const overall = dbInstance.prepare(`
    SELECT 
      COALESCE(SUM(cost_total), 0) as total_cost,
      COALESCE(SUM(input_tokens), 0) as total_input_tokens,
      COALESCE(SUM(output_tokens), 0) as total_output_tokens,
      COALESCE(SUM(total_tokens), 0) as total_tokens,
      COUNT(*) as request_count
    FROM token_usage
  `).get();

  const byModel = dbInstance.prepare(`
    SELECT model, provider,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost_total) as total_cost,
      COUNT(*) as request_count
    FROM token_usage
    GROUP BY model
    ORDER BY total_cost DESC
  `).all();

  const byDate = dbInstance.prepare(`
    SELECT date, model, provider,
      total_input_tokens, total_output_tokens, total_tokens,
      cost_total, request_count
    FROM daily_costs
    WHERE date >= date('now', '-30 days')
    ORDER BY date DESC, cost_total DESC
  `).all();

  return {
    totalCost: overall.total_cost,
    totalInputTokens: overall.total_input_tokens,
    totalOutputTokens: overall.total_output_tokens,
    totalTokens: overall.total_tokens,
    requestCount: overall.request_count,
    byModel,
    byDate,
  };
}

const DEFAULT_CONFIG = {
  managementKey: process.env.OPENROUTER_MANAGEMENT_KEY,
  checkIntervalMs: 60 * 60 * 1000,
};

let syncInterval = null;
let config = Object.assign({}, DEFAULT_CONFIG);

async function validateUsage() {
  if (!db.getDb()) { db.init(); }

  const client = new OpenRouterClient(config.managementKey);
  const orCredits = await client.getCredits();
  const local = await getLocalTotals();

  const orUsageTotal = orCredits.totalUsage || 0;
  // Baseline = OpenRouter usage before we started tracking. Set so "since baseline" matches existing local total.
  let baseline = null;
  try {
    const raw = db.getSetting('openrouter_baseline_usage');
    if (raw !== null && raw !== undefined && raw !== '') baseline = parseFloat(raw, 10);
  } catch (_) {}
  if (baseline === null || isNaN(baseline) || baseline >= orUsageTotal * 0.99) {
    baseline = Math.max(0, orUsageTotal - local.totalCost);
    db.setSetting('openrouter_baseline_usage', String(baseline));
  }
  const orUsageSinceBaseline = Math.max(0, orUsageTotal - baseline);

  const costPercent = orUsageSinceBaseline > 0
    ? ((local.totalCost - orUsageSinceBaseline) / orUsageSinceBaseline * 100).toFixed(2)
    : (local.totalCost > 0 ? '100.00' : '0.00');
  const difference = {
    cost: local.totalCost - orUsageSinceBaseline,
    costPercent,
    orUsageSinceBaseline,
    baseline,
  };

  const tolerance = 5;
  const costDiffPercent = Math.abs(parseFloat(difference.costPercent));
  const valid = costDiffPercent <= tolerance;

  const report = generateReport(local, orCredits, difference, valid);
  return { local, openrouter: orCredits, difference, valid, report };
}

function generateReport(local, or, diff, valid) {
  let lines = [
    '=== OpenRouter Usage Validation Report ===',
    '',
    'OpenRouter (account):',
    '  Total Purchased:  $' + or.totalCredits.toFixed(4),
    '  Total Used:       $' + or.totalUsage.toFixed(4),
    '  Baseline (pre-app): $' + (diff.baseline || 0).toFixed(4),
    '  Used since baseline: $' + (diff.orUsageSinceBaseline != null ? diff.orUsageSinceBaseline.toFixed(4) : or.totalUsage.toFixed(4)),
    '',
    'Local (tracked by app):',
    '  Total Cost:       $' + local.totalCost.toFixed(4),
    '  Input Tokens:     ' + local.totalInputTokens.toLocaleString(),
    '  Output Tokens:    ' + local.totalOutputTokens.toLocaleString(),
    '  Total Tokens:     ' + local.totalTokens.toLocaleString(),
    '  Requests:         ' + local.requestCount.toLocaleString(),
    '',
    'Difference (local vs since-baseline):',
    '  Cost Difference:  $' + diff.cost.toFixed(4) + ' (' + diff.costPercent + '%)',
    '',
    'Validation: ' + (valid ? 'PASSED' : 'FAILED') + ' (tolerance: 5%)',
    '',
  ];

  if (local.byModel.length > 0) {
    lines.push('Top Models by Cost:');
    local.byModel.slice(0, 5).forEach(function(m, i) {
      lines.push('  ' + (i + 1) + '. ' + m.model + ': $' + m.total_cost.toFixed(4) + ' (' + m.request_count + ' reqs)');
    });
    lines.push('');
  }
  return lines.join('\n');
}

async function runSync() {
  console.log('[OpenRouter Sync] Starting sync...');
  try {
    const result = await validateUsage();
    console.log('[OpenRouter Sync] Validation complete: ' + (result.valid ? 'PASSED' : 'FAILED'));
    console.log(result.report);
    if (db.getDb()) {
      db.setSetting('openrouter_last_validation', JSON.stringify({
        timestamp: new Date().toISOString(),
        valid: result.valid,
        localCost: result.local.totalCost,
        openrouterUsage: result.openrouter.totalUsage,
        openrouterCredits: result.openrouter.totalCredits,
        openrouterRemaining: (result.openrouter.totalCredits || 0) - (result.openrouter.totalUsage || 0),
        baseline: result.difference.baseline,
        difference: result.difference.cost,
        differencePercent: result.difference.costPercent,
      }));
    }
    return result;
  } catch (err) {
    console.error('[OpenRouter Sync] Error:', err.message);
    throw err;
  }
}

function startSync(options) {
  options = options || {};
  config = Object.assign({}, DEFAULT_CONFIG, options);
  if (!config.managementKey) {
    console.error('[OpenRouter Sync] No management key.');
    console.error('  Create a .env file in the project root (copy from .env.example) and set:');
    console.error('  OPENROUTER_MANAGEMENT_KEY=sk-or-v1-your-key');
    return;
  }
  console.log('[OpenRouter Sync] Starting continuous sync (interval: ' + config.checkIntervalMs + 'ms)');
  runSync().catch(function(err) { console.error('[OpenRouter Sync] Initial sync failed:', err.message); });
  syncInterval = setInterval(function() {
    runSync().catch(function(err) { console.error('[OpenRouter Sync] Periodic sync failed:', err.message); });
  }, config.checkIntervalMs);
}

function stopSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('[OpenRouter Sync] Stopped');
  }
}

function getLastValidation() {
  try {
    db.init();
    var setting = db.getSetting('openrouter_last_validation');
    return setting ? JSON.parse(setting) : null;
  } catch (err) {
    console.error('[OpenRouter Sync] Error:', err.message);
    return null;
  }
}

if (require.main === module) {
  var args = process.argv.slice(2);
  if (args[0] === '--once' || args[0] === '-o') {
    if (!process.env.OPENROUTER_MANAGEMENT_KEY) {
      console.error('[OpenRouter Sync] OPENROUTER_MANAGEMENT_KEY is not set.');
      console.error('  Create a .env file in the project root (copy from .env.example) and add:');
      console.error('  OPENROUTER_MANAGEMENT_KEY=sk-or-v1-your-key');
      process.exit(1);
    }
    db.init();
    runSync().then(function(result) {
      console.log('--- Final Report ---');
      console.log(result.report);
      process.exit(result.valid ? 0 : 1);
    }).catch(function(err) { console.error('Sync failed:', err.message); process.exit(1); });
  } else {
    console.log('Usage: node sync.js --once | --start [interval_ms]');
    process.exit(1);
  }
}

module.exports = { validateUsage, runSync, startSync, stopSync, getLastValidation, getLocalTotals };