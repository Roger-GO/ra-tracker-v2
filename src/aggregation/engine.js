/**
 * Cost Aggregation Engine for RA-Tracker
 * Handles hourly/daily/weekly/monthly rollups and trending calculations
 */

const Database = require('better-sqlite3');
const NodeCache = require('node-cache');
const path = require('path');
const fs = require('fs');

// Initialize cache with a TTL of 1 hour
const cache = new NodeCache({ stdTTL: 3600 });

// Singleton database connection
// NOTE: engine.js is in src/aggregation/, so go up two levels to project root, then into src/data/
// This matches manager.js which resolves to src/data/ra-tracker.db
const dbPath = process.env.RA_TRACKER_DB || path.join(__dirname, '..', 'data', 'ra-tracker.db');

// Ensure data directory exists before opening connection
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Close connection when process exits
process.on('exit', () => db.close());
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

/**
 * Aggregate token usage by time period (hourly/daily/weekly/monthly)
 * @param {string} period - One of 'hourly', 'daily', 'weekly', 'monthly'
 * @param {string} startDate - Optional start date (ISO format)
 * @param {string} endDate - Optional end date (ISO format)
 * @returns {Array} Aggregated results
 */
function aggregateTokenUsage(period, startDate, endDate) {
  const cacheKey = `token_usage_${period}_${startDate || 'all'}_${endDate || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Using module-level db connection
  let sql;
  let groupBy;

  switch (period) {
    case 'hourly':
      groupBy = "strftime('%Y-%m-%d %H:00:00', timestamp)";
      break;
    case 'daily':
      groupBy = "date(timestamp)";
      break;
    case 'weekly':
      groupBy = "strftime('%Y-%W', timestamp)";
      break;
    case 'monthly':
      groupBy = "strftime('%Y-%m', timestamp)";
      break;
    default:
      throw new Error(`Invalid period: ${period}`);
  }

  sql = `
    SELECT 
      ${groupBy} as period,
      SUM(input_tokens) as total_input_tokens,
      SUM(output_tokens) as total_output_tokens,
      SUM(total_tokens) as total_tokens,
      SUM(cost_input) as cost_input,
      SUM(cost_output) as cost_output,
      SUM(cost_total) as cost_total,
      COUNT(*) as request_count
    FROM token_usage
    WHERE 1=1
  `;

  const params = [];
  if (startDate) {
    sql += ' AND timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND timestamp <= ?';
    params.push(endDate);
  }

  sql += ` GROUP BY ${groupBy} ORDER BY period DESC`;

  const results = db.prepare(sql).all(...params);
  cache.set(cacheKey, results);
  return results;
}

/**
 * Get cost trends (day-over-day, week-over-week)
 * @param {string} trendType - One of 'day-over-day', 'week-over-week'
 * @param {string} startDate - Optional start date (ISO format)
 * @param {string} endDate - Optional end date (ISO format)
 * @returns {Array} Trend results
 */
function getCostTrends(trendType, startDate, endDate) {
  const cacheKey = `cost_trends_${trendType}_${startDate || 'all'}_${endDate || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Using module-level db connection
  let sql;

  if (trendType === 'day-over-day') {
    sql = `
      SELECT 
        date(timestamp) as date,
        SUM(cost_total) as cost_total,
        LAG(SUM(cost_total), 1, 0) OVER (ORDER BY date(timestamp)) as prev_day_cost,
        (SUM(cost_total) - LAG(SUM(cost_total), 1, 0) OVER (ORDER BY date(timestamp))) as cost_change,
        CASE WHEN LAG(SUM(cost_total), 1, 0) OVER (ORDER BY date(timestamp)) = 0 THEN NULL
          ELSE (SUM(cost_total) - LAG(SUM(cost_total), 1, 0) OVER (ORDER BY date(timestamp))) / LAG(SUM(cost_total), 1, 0) OVER (ORDER BY date(timestamp)) * 100
        END as cost_change_percent
      FROM token_usage
      WHERE 1=1
    `;
  } else if (trendType === 'week-over-week') {
    sql = `
      SELECT 
        strftime('%Y-%W', timestamp) as week,
        SUM(cost_total) as cost_total,
        LAG(SUM(cost_total), 1, 0) OVER (ORDER BY strftime('%Y-%W', timestamp)) as prev_week_cost,
        (SUM(cost_total) - LAG(SUM(cost_total), 1, 0) OVER (ORDER BY strftime('%Y-%W', timestamp))) as cost_change,
        CASE WHEN LAG(SUM(cost_total), 1, 0) OVER (ORDER BY strftime('%Y-%W', timestamp)) = 0 THEN NULL
          ELSE (SUM(cost_total) - LAG(SUM(cost_total), 1, 0) OVER (ORDER BY strftime('%Y-%W', timestamp))) / LAG(SUM(cost_total), 1, 0) OVER (ORDER BY strftime('%Y-%W', timestamp)) * 100
        END as cost_change_percent
      FROM token_usage
      WHERE 1=1
    `;
  } else {
    throw new Error(`Invalid trend type: ${trendType}`);
  }

  const params = [];
  if (startDate) {
    sql += ' AND timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND timestamp <= ?';
    params.push(endDate);
  }

  sql += ` GROUP BY ${trendType === 'day-over-day' ? 'date(timestamp)' : 'strftime("%Y-%W", timestamp)'}`;

  const results = db.prepare(sql).all(...params);
  cache.set(cacheKey, results);
  return results;
}

/**
 * Get costs by model, agent, or project
 * @param {string} groupBy - One of 'model', 'agent', 'project'
 * @param {string} startDate - Optional start date (ISO format)
 * @param {string} endDate - Optional end date (ISO format)
 * @returns {Array} Grouped results
 */
function getCostsByGroup(groupBy, startDate, endDate) {
  const cacheKey = `costs_by_${groupBy}_${startDate || 'all'}_${endDate || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Using module-level db connection
  let sql;

  switch (groupBy) {
    case 'model':
      sql = `
        SELECT 
          model,
          provider,
          SUM(input_tokens) as total_input_tokens,
          SUM(output_tokens) as total_output_tokens,
          SUM(total_tokens) as total_tokens,
          SUM(cost_input) as cost_input,
          SUM(cost_output) as cost_output,
          SUM(cost_total) as cost_total,
          COUNT(*) as request_count
        FROM token_usage
        WHERE 1=1
      `;
      break;
    case 'agent':
      sql = `
        SELECT 
          a.id,
          a.name,
          a.model as agent_model,
          SUM(tu.input_tokens) as total_input_tokens,
          SUM(tu.output_tokens) as total_output_tokens,
          SUM(tu.total_tokens) as total_tokens,
          SUM(tu.cost_input) as cost_input,
          SUM(tu.cost_output) as cost_output,
          SUM(tu.cost_total) as cost_total,
          COUNT(*) as request_count
        FROM token_usage tu
        LEFT JOIN agents a ON tu.agent_id = a.id
        WHERE 1=1
      `;
      break;
    case 'project':
      sql = `
        SELECT 
          p.id,
          p.name,
          SUM(tu.input_tokens) as total_input_tokens,
          SUM(tu.output_tokens) as total_output_tokens,
          SUM(tu.total_tokens) as total_tokens,
          SUM(tu.cost_input) as cost_input,
          SUM(tu.cost_output) as cost_output,
          SUM(tu.cost_total) as cost_total,
          COUNT(*) as request_count
        FROM token_usage tu
        JOIN sessions s ON tu.session_id = s.id
        LEFT JOIN projects p ON s.channel = p.channel OR s.group_id = p.thread_id
        WHERE 1=1
      `;
      break;
    default:
      throw new Error(`Invalid group by: ${groupBy}`);
  }

  const params = [];
  if (startDate) {
    sql += ' AND tu.timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND tu.timestamp <= ?';
    params.push(endDate);
  }

  sql += ` GROUP BY ${groupBy === 'model' ? 'model, provider' : groupBy === 'agent' ? 'a.id' : 'p.id'}`;
  sql += ` ORDER BY cost_total DESC`;

  const results = db.prepare(sql).all(...params);
  cache.set(cacheKey, results);
  return results;
}

/**
 * Get costs by task
 * @param {string} startDate - Optional start date (ISO format)
 * @param {string} endDate - Optional end date (ISO format)
 * @returns {Array} Cost results grouped by task
 */
function getCostsByTask(startDate, endDate) {
  const cacheKey = `costs_by_task_${startDate || 'all'}_${endDate || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let sql = `
    SELECT 
      s.task_label,
      s.sprint_id,
      sp.name as sprint_name,
      COUNT(DISTINCT s.id) as session_count,
      SUM(tu.input_tokens) as total_input_tokens,
      SUM(tu.output_tokens) as total_output_tokens,
      SUM(tu.total_tokens) as total_tokens,
      SUM(tu.cost_input) as cost_input,
      SUM(tu.cost_output) as cost_output,
      SUM(tu.cost_total) as cost_total,
      COUNT(*) as request_count
    FROM sessions s
    LEFT JOIN token_usage tu ON s.id = tu.session_id
    LEFT JOIN sprints sp ON s.sprint_id = sp.id
    WHERE s.task_label IS NOT NULL AND s.task_label != ''
  `;

  const params = [];
  if (startDate) {
    sql += ' AND tu.timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND tu.timestamp <= ?';
    params.push(endDate);
  }

  sql += ` GROUP BY s.task_label, s.sprint_id ORDER BY cost_total DESC`;

  const results = db.prepare(sql).all(...params);
  cache.set(cacheKey, results);
  return results;
}

/**
 * Get costs by sprint
 * @param {string} startDate - Optional start date (ISO format)
 * @param {string} endDate - Optional end date (ISO format)
 * @returns {Array} Cost results grouped by sprint
 */
function getCostsBySprint(startDate, endDate) {
  const cacheKey = `costs_by_sprint_${startDate || 'all'}_${endDate || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let sql = `
    SELECT 
      sp.id as sprint_id,
      sp.name as sprint_name,
      sp.start_date,
      sp.end_date,
      sp.status,
      COUNT(DISTINCT s.id) as session_count,
      COUNT(DISTINCT t.id) as task_count,
      SUM(tu.input_tokens) as total_input_tokens,
      SUM(tu.output_tokens) as total_output_tokens,
      SUM(tu.total_tokens) as total_tokens,
      SUM(tu.cost_input) as cost_input,
      SUM(tu.cost_output) as cost_output,
      SUM(tu.cost_total) as cost_total,
      COUNT(tu.id) as request_count
    FROM sprints sp
    LEFT JOIN sessions s ON sp.id = s.sprint_id
    LEFT JOIN tasks t ON sp.id = t.sprint_id
    LEFT JOIN token_usage tu ON s.id = tu.session_id
    WHERE 1=1
  `;

  const params = [];
  if (startDate) {
    sql += ' AND (tu.timestamp >= ? OR tu.timestamp IS NULL)';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND (tu.timestamp <= ? OR tu.timestamp IS NULL)';
    params.push(endDate);
  }

  sql += ` GROUP BY sp.id ORDER BY sp.id DESC`;

  const results = db.prepare(sql).all(...params);
  cache.set(cacheKey, results);
  return results;
}

/**
 * Get costs by model per task
 * @param {string} startDate - Optional start date (ISO format)
 * @param {string} endDate - Optional end date (ISO format)
 * @returns {Array} Cost results grouped by task and model
 */
function getCostsByModelAndTask(startDate, endDate) {
  const cacheKey = `costs_model_by_task_${startDate || 'all'}_${endDate || 'all'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let sql = `
    SELECT 
      s.task_label,
      s.sprint_id,
      sp.name as sprint_name,
      tu.model,
      tu.provider,
      SUM(tu.input_tokens) as input_tokens,
      SUM(tu.output_tokens) as output_tokens,
      SUM(tu.total_tokens) as total_tokens,
      SUM(tu.cost_total) as cost_total,
      COUNT(*) as request_count
    FROM sessions s
    JOIN token_usage tu ON s.id = tu.session_id
    LEFT JOIN sprints sp ON s.sprint_id = sp.id
    WHERE s.task_label IS NOT NULL AND s.task_label != ''
  `;

  const params = [];
  if (startDate) {
    sql += ' AND tu.timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND tu.timestamp <= ?';
    params.push(endDate);
  }

  sql += ` GROUP BY s.task_label, s.sprint_id, tu.model, tu.provider ORDER BY cost_total DESC`;

  const results = db.prepare(sql).all(...params);
  cache.set(cacheKey, results);
  return results;
}

module.exports = {
  aggregateTokenUsage,
  getCostTrends,
  getCostsByGroup,
  getCostsByTask,
  getCostsBySprint,
  getCostsByModelAndTask
};