/**
 * Database initialization and management
 * RA-Tracker - Token usage tracking for OpenClaw
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.RA_TRACKER_DB || path.join(__dirname, '..', 'data', 'ra-tracker.db');

let db = null;

/**
 * Initialize the database connection
 */
function init() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Apply base schema first to guarantee core tables exist.
  const baseSchemaPath = path.join(__dirname, '..', '..', 'db', '001_initial_schema.sql');
  if (fs.existsSync(baseSchemaPath)) {
    db.exec(fs.readFileSync(baseSchemaPath, 'utf8'));
  }

  // Run migrations
  runMigrations();
  
  console.log(`[DB] Initialized: ${DB_PATH}`);
  return db;
}

/**
 * Run database migrations
 */
function runMigrations() {
  // Migration files are in db/migrations relative to project root
  // manager.js is in src/db/, so we go up to src/ then down to db/migrations
  let migrationsDir = path.join(__dirname, '..', '..', 'db', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    // Fallback: db/ directory
    migrationsDir = path.join(__dirname, '..', '..', 'db');
  }
  if (!fs.existsSync(migrationsDir)) {
    console.log('[DB] No migrations directory found at', migrationsDir);
    return;
  }
  console.log('[DB] Migrations directory:', migrationsDir);
  
  if (!fs.existsSync(migrationsDir)) {
    console.log('[DB] No migrations directory found');
    return;
  }
  
  // Get migration files
  const migrations = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  // Create migrations tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Get applied migrations
  const applied = db.prepare('SELECT name FROM migrations').all().map(r => r.name);
  
  // Apply pending migrations
  for (const migration of migrations) {
    if (!applied.includes(migration)) {
      console.log(`[DB] Applying migration: ${migration}`);
      const sql = fs.readFileSync(path.join(migrationsDir, migration), 'utf8');
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migration);
      console.log(`[DB] Applied: ${migration}`);
    }
  }
}

/**
 * Get the database instance
 */
function getDb() {
  if (!db) {
    init();
  }
  return db;
}

/**
 * Close database connection
 */
function close() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Closed');
  }
}

/**
 * Upsert an agent
 */
function upsertAgent(agentId, name, model) {
  const stmt = getDb().prepare(`
    INSERT INTO agents (id, name, model, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      model = excluded.model,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(agentId, name, model);
}

/**
 * Upsert a session
 */
function upsertSession(sessionId, agentId, sessionKey, channel, groupId, spawnedBy, spawnDepth, taskLabel, sprintId) {
  const stmt = getDb().prepare(`
    INSERT INTO sessions (id, agent_id, session_key, channel, group_id, spawned_by, spawn_depth, task_label, sprint_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      channel = excluded.channel,
      group_id = excluded.group_id,
      spawned_by = excluded.spawned_by,
      spawn_depth = excluded.spawn_depth,
      task_label = COALESCE(excluded.task_label, sessions.task_label),
      sprint_id = COALESCE(excluded.sprint_id, sessions.sprint_id),
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(sessionId, agentId, sessionKey, channel, groupId, spawnedBy, spawnDepth, taskLabel, sprintId);
}

/**
 * Insert token usage record
 */
function insertTokenUsage(data) {
  const stmt = getDb().prepare(`
    INSERT INTO token_usage (
      session_id, agent_id, session_key, model, provider,
      input_tokens, output_tokens, total_tokens,
      cache_read_tokens, cache_write_tokens,
      cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total,
      timestamp, message_id, parent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  return stmt.run(
    data.sessionId,
    data.agentId,
    data.sessionKey,
    data.model,
    data.provider,
    data.inputTokens,
    data.outputTokens,
    data.totalTokens,
    data.cacheReadTokens || 0,
    data.cacheWriteTokens || 0,
    data.costInput,
    data.costOutput,
    data.costCacheRead,
    data.costCacheWrite,
    data.costTotal,
    data.timestamp,
    data.messageId,
    data.parentId
  );
}

/**
 * Insert activity event
 */
function insertActivityEvent(data) {
  const stmt = getDb().prepare(`
    INSERT INTO activity_events (
      session_id, agent_id, session_key, event_type, event_data,
      tool_name, duration_ms, success, source_event_id, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
  `);

  return stmt.run(
    data.sessionId,
    data.agentId,
    data.sessionKey,
    data.eventType,
    data.eventData,
    data.toolName,
    data.durationMs,
    data.success ? 1 : 0,
    data.sourceEventId || null,
    data.timestamp || null
  );
}

/**
 * Update daily costs (aggregated)
 */
function updateDailyCosts(date, model, provider, tokens, costs) {
  const stmt = getDb().prepare(`
    INSERT INTO daily_costs (date, model, provider, total_input_tokens, total_output_tokens, total_tokens, cost_input, cost_output, cost_total, request_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(date, model) DO UPDATE SET
      total_input_tokens = total_input_tokens + excluded.total_input_tokens,
      total_output_tokens = total_output_tokens + excluded.total_output_tokens,
      total_tokens = total_tokens + excluded.total_tokens,
      cost_input = cost_input + excluded.cost_input,
      cost_output = cost_output + excluded.cost_output,
      cost_total = cost_total + excluded.cost_total,
      request_count = request_count + 1
  `);
  
  return stmt.run(
    date,
    model,
    provider,
    tokens.input,
    tokens.output,
    tokens.total,
    costs.input,
    costs.output,
    costs.total
  );
}

/**
 * Get recent token usage
 */
function getRecentTokenUsage(limit = 100) {
  return getDb().prepare(`
    SELECT tu.*, s.channel, s.group_id
    FROM token_usage tu
    LEFT JOIN sessions s ON tu.session_id = s.id
    ORDER BY tu.timestamp DESC
    LIMIT ?
  `).all(limit);
}

/**
 * Get total costs by model
 */
function getCostsByModel() {
  return getDb().prepare(`
    SELECT model, provider,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost_input) as cost_input,
      SUM(cost_output) as cost_output,
      SUM(cost_total) as cost_total,
      COUNT(*) as request_count
    FROM token_usage
    GROUP BY model
    ORDER BY cost_total DESC
  `).all();
}

/**
 * Get costs by date
 */
function getCostsByDate(days = 30) {
  return getDb().prepare(`
    SELECT date, model, provider,
      total_input_tokens, total_output_tokens, total_tokens,
      cost_input, cost_output, cost_total, request_count
    FROM daily_costs
    WHERE date >= date('now', '-' || ? || ' days')
    ORDER BY date DESC, cost_total DESC
  `).all(days);
}

/**
 * Get a setting value by key
 */
function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

/**
 * Set a setting value (upsert)
 */
function setSetting(key, value) {
  const stmt = getDb().prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);
  return stmt.run(key, value);
}

/**
 * Delete a setting by key
 */
function deleteSetting(key) {
  return getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
}

/**
 * Create or get a sprint by name
 * Returns the sprint ID (creates if doesn't exist)
 */
function getOrCreateSprint(name) {
  // Try to find existing sprint
  let sprint = getDb().prepare('SELECT id FROM sprints WHERE name = ?').get(name);
  if (sprint) {
    return sprint.id;
  }
  
  // Create new sprint with smart date calculation
  const sprintNum = parseInt(name.replace(/\D/g, '') || '1', 10);
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - (sprintNum * 7));
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 6);
  
  const result = getDb().prepare(`
    INSERT INTO sprints (name, start_date, end_date, status)
    VALUES (?, ?, ?, 'active')
  `).run(
    name.startsWith('Sprint') ? name : `Sprint ${sprintNum}`,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  );
  
  return result.lastInsertRowid;
}

/**
 * Create or get a task by name and sprint
 * Returns the task ID (creates if doesn't exist)
 */
function getOrCreateTask(name, sprintId) {
  // Try to find existing task
  let task = getDb().prepare('SELECT id FROM tasks WHERE name = ? AND sprint_id = ?').get(name, sprintId);
  if (task) {
    return task.id;
  }
  
  // Create new task
  const result = getDb().prepare(`
    INSERT INTO tasks (name, sprint_id, status)
    VALUES (?, ?, 'pending')
  `).run(name, sprintId);
  
  return result.lastInsertRowid;
}

/**
 * Get sprint by ID
 */
function getSprint(id) {
  return getDb().prepare('SELECT * FROM sprints WHERE id = ?').get(id);
}

/**
 * Get all sprints
 */
function getSprints() {
  return getDb().prepare('SELECT * FROM sprints ORDER BY id DESC').all();
}

/**
 * Get task by ID
 */
function getTask(id) {
  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
}

/**
 * Get tasks by sprint
 */
function getTasksBySprint(sprintId) {
  return getDb().prepare('SELECT * FROM tasks WHERE sprint_id = ? ORDER BY id').all(sprintId);
}

module.exports = {
  init,
  getDb,
  close,
  upsertAgent,
  upsertSession,
  insertTokenUsage,
  insertActivityEvent,
  updateDailyCosts,
  getRecentTokenUsage,
  getCostsByModel,
  getCostsByDate,
  getSetting,
  setSetting,
  deleteSetting,
  getOrCreateSprint,
  getOrCreateTask,
  getSprint,
  getSprints,
  getTask,
  getTasksBySprint
};
