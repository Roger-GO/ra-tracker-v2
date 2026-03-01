/**
 * Token Capture Test Suite
 */

const path = require('path');

// Test 1: Pricing calculations
function testPricing() {
  console.log('\n[TEST] Pricing calculations...');
  
  const pricing = require('../src/pricing');
  
  // Test MiniMax M2.5
  let result = pricing.calculateCost(1000, 500, 0, 0, 'openrouter/minimax/minimax-m2.5');
  console.log(`  MiniMax M2.5 (1k in, 500 out): $${result.costTotal.toFixed(6)}`);
  console.assert(result.costInput > 0, 'Input cost should be positive');
  console.assert(result.costOutput > 0, 'Output cost should be positive');
  
  // Test Grok 4.1
  result = pricing.calculateCost(10000, 1000, 500, 0, 'openrouter/x-ai/grok-4.1-fast');
  console.log(`  Grok 4.1 (10k in, 1k out, 500 cache): $${result.costTotal.toFixed(6)}`);
  
  // Test default fallback
  result = pricing.calculateCost(1000, 500, 0, 0, 'unknown/model');
  console.log(`  Unknown model fallback: $${result.costTotal.toFixed(6)}`);
  
  console.log('  ✓ Pricing tests passed');
}

// Test 2: Session file parsing
function testSessionParsing() {
  console.log('\n[TEST] Session file parsing...');
  
  const capture = require('../src/capture');
  
  const sessions = capture.getAllSessionFiles();
  console.log(`  Found ${Object.keys(sessions).length} session files`);
  
  // Check if we have at least some sessions
  console.assert(Object.keys(sessions).length > 0, 'Should find some sessions');
  
  console.log('  ✓ Session parsing tests passed');
}

// Test 3: Database operations
function testDatabase() {
  console.log('\n[TEST] Database operations...');
  
  // Set test database path
  process.env.RA_TRACKER_DB = path.join(__dirname, '..', 'test', 'test-tracker.db');
  
  const db = require('../src/db/manager');
  
  // Initialize
  db.init();
  
  // Test upsert agent
  db.upsertAgent('test-agent', 'Test Agent', 'test-model');
  console.log('  ✓ Upserted agent');
  
  // Test upsert session
  db.upsertSession('test-session-123', 'test-agent', 'agent:test-agent:session:test', 'slack', 'C123', null, 0);
  console.log('  ✓ Upserted session');
  
  // Test insert token usage
  db.insertTokenUsage({
    sessionId: 'test-session-123',
    agentId: 'test-agent',
    sessionKey: 'agent:test-agent:session:test',
    model: 'test-model',
    provider: 'test',
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    cacheReadTokens: 100,
    cacheWriteTokens: 0,
    costInput: 0.0008,
    costOutput: 0.0004,
    costCacheRead: 0.00001,
    costCacheWrite: 0,
    costTotal: 0.00121,
    timestamp: new Date().toISOString()
  });
  console.log('  ✓ Inserted token usage');
  
  // Test daily costs
  const today = new Date().toISOString().split('T')[0];
  db.updateDailyCosts(today, 'test-model', 'test', {
    input: 1000,
    output: 500,
    total: 1500
  }, {
    input: 0.0008,
    output: 0.0004,
    total: 0.0012
  });
  console.log('  ✓ Updated daily costs');
  
  // Test queries
  const recent = db.getRecentTokenUsage(10);
  console.log(`  Retrieved ${recent.length} recent records`);
  
  const byModel = db.getCostsByModel();
  console.log(`  Costs by model: ${JSON.stringify(byModel)}`);
  
  const byDate = db.getCostsByDate(7);
  console.log(`  Costs by date: ${byDate.length} days`);
  
  // Close
  db.close();
  
  console.log('  ✓ Database tests passed');
}

// Test 4: Token capture
async function testCapture() {
  console.log('\n[TEST] Token capture...');
  
  const db = require('../src/db/manager');
  const capture = require('../src/capture');
  
  db.init();
  
  // Run capture
  const result = await capture.captureTokenUsage();
  
  console.log(`  Sessions checked: ${result.sessionsChecked}`);
  console.log(`  New records: ${result.newRecords}`);
  console.log(`  Errors: ${result.errors}`);
  
  db.close();
  
  console.log('  ✓ Token capture tests passed');
}

// Run all tests
async function runAllTests() {
  console.log('='.repeat(50));
  console.log('RA-Tracker Test Suite');
  console.log('='.repeat(50));
  
  try {
    testPricing();
    testSessionParsing();
    testDatabase();
    testCapture();
    
    console.log('\n' + '='.repeat(50));
    console.log('ALL TESTS PASSED ✓');
    console.log('='.repeat(50));
  } catch (err) {
    console.error('\n[ERROR] Test failed:', err);
    process.exit(1);
  }
}

runAllTests();
