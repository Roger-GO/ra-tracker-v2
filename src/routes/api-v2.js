/**
 * RA-Tracker REST API v2
 * Enhanced Express routes for token usage, activity, agents, projects, and costs
 * 
 * KEY FEATURES:
 * - Cursor-based pagination (not offset) for infinite data scrolling
 * - Pre-computed cost rollups (daily, weekly, monthly) from daily_costs table
 * - Time-series token data with efficient date grouping
 * - Natural language query support (W5 NLP parser integration ready)
 * 
 * Endpoints:
 * - GET    /api/v2/tokens         - Time-series token usage with cursor pagination
 * - GET    /api/v2/tokens/:id     - Single token record detail
 * - GET    /api/v2/activity       - Activity events with cursor pagination
 * - GET    /api/v2/agents         - Agent list with stats
 * - GET    /api/v2/agents/:id    - Agent detail with history
 * - GET    /api/v2/projects       - Project list with aggregated costs
 * - GET    /api/v2/projects/:id  - Project detail with activity timeline
 * - GET    /api/v2/costs         - Cost summaries (daily/weekly/monthly pre-computed)
 * - GET    /api/v2/costs/tasks   - Cost by task
 * - GET    /api/v2/costs/sprints - Cost by sprint
 * - GET    /api/v2/costs/model-task - Cost by model per task
 * - POST   /api/v2/query          - Natural language query (W5 NLP integration)
 * - GET    /api/v2/health        - Health check
 */

const express = require('express');
const router = express.Router();

// Import NLP parser and executor
const { NLPParser, QueryExecutor } = require('../nlp/parser');

// Import aggregation engine
const aggregation = require('../aggregation/engine');

// Initialize NLP parser
const nlpParser = new NLPParser({ defaultLimit: 50, maxLimit: 100 });

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse cursor from request (cursor is base64 encoded timestamp:id)
 */
function parseCursor(cursor) {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const [timestamp, id] = decoded.split(':');
    return { timestamp, id: parseInt(id, 10) };
  } catch (e) {
    return null;
  }
}

/**
 * Create cursor string from timestamp and id
 */
function createCursor(timestamp, id) {
  return Buffer.from(`${timestamp}:${id}`).toString('base64');
}

/**
 * Parse pagination parameters for cursor-based pagination
 */
function parseCursorPagination(req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
  const cursor = parseCursor(req.query.cursor);
  return { limit, cursor };
}

/**
 * Parse date range filter (also supports relative dates like "last 7 days")
 */
function parseDateFilter(startDate, endDate) {
  let filter = '';
  const params = [];
  
  if (startDate) {
    filter += ' AND timestamp >= ?';
    params.push(startDate);
  }
  if (endDate) {
    filter += ' AND timestamp <= ?';
    params.push(endDate);
  }
  
  return { filter, params };
}

/**
 * Parse ISO date or relative date (e.g., "7 days ago")
 */
function parseRelativeDate(dateStr) {
  if (!dateStr) return null;
  
  // Check if it's already ISO format
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    return dateStr;
  }
  
  // Try to parse relative dates using chrono-node
  try {
    const chrono = require('chrono-node');
    const parsed = chrono.parse(dateStr);
    if (parsed && parsed[0]) {
      return parsed[0].start.date().toISOString().split('T')[0];
    }
  } catch (e) {
    // Fall through
  }
  
  return dateStr;
}

/**
 * Sanitize error messages to avoid leaking internal details
 * Only expose safe, user-friendly messages
 */
function sanitizeError(error) {
  if (!error) return 'An unknown error occurred';
  
  const message = error.message || String(error);
  
  // Check for common database/SQL errors that might leak internals
  if (message.includes('SQLITE_CANTOPEN') || message.includes('ENOENT') || message.includes('database')) {
    return 'Database connection error. Please try again later.';
  }
  
  if (message.includes('syntax error') || message.includes('near "')) {
    return 'Invalid request. Please check your query parameters.';
  }
  
  if (message.includes('UNIQUE constraint') || message.includes('constraint failed')) {
    return 'Duplicate entry. The resource already exists.';
  }
  
  // Generic fallback for any other errors
  return 'An internal error occurred. Please try again later.';
}

// ============================================================================
// Token Usage API - Cursor Pagination + Time Series
// ============================================================================

/**
 * GET /api/v2/tokens
 * Time-series token usage with cursor-based pagination
 * 
 * Query Parameters:
 * - cursor: Base64 encoded cursor (timestamp:id) for pagination
 * - limit: Results per page (default: 50, max: 100)
 * - agent_id: Filter by agent ID
 * - session_id: Filter by session ID
 * - model: Filter by model name (partial match)
 * - project: Filter by project name
 * - start_date: Filter by start date (ISO or relative like "7 days ago")
 * - end_date: Filter by end date
 * - sort: Sort field (default: timestamp DESC)
 * 
 * Example: GET /api/v2/tokens?agent_id=coder&start_date=2024-01-01&limit=20
 */
router.get('/tokens', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { limit, cursor } = parseCursorPagination(req);
    const { agent_id, session_id, model, project } = req.query;
    
    // Handle relative dates
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);
    const { filter: dateFilter, params: dateParams } = parseDateFilter(startDate, endDate);
    
    // Build query with cursor-based pagination
    let sql = `
      SELECT 
        tu.id,
        tu.session_id,
        tu.agent_id,
        tu.session_key,
        tu.model,
        tu.provider,
        tu.input_tokens,
        tu.output_tokens,
        tu.total_tokens,
        tu.cache_read_tokens,
        tu.cache_write_tokens,
        tu.cost_input,
        tu.cost_output,
        tu.cost_cache_read,
        tu.cost_cache_write,
        tu.cost_total,
        tu.timestamp,
        tu.message_id,
        a.name as agent_name,
        a.model as agent_model,
        s.channel,
        s.group_id,
        s.task_label,
        p.name as project_name
      FROM token_usage tu
      LEFT JOIN agents a ON tu.agent_id = a.id
      LEFT JOIN sessions s ON tu.session_id = s.id
      LEFT JOIN projects p ON s.channel = p.channel OR s.group_id = p.thread_id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Cursor-based pagination (timestamp + id for uniqueness)
    if (cursor) {
      const sortDir = req.query.sort?.split(' ')[1]?.toUpperCase() === 'ASC' ? '>=' : '<=';
      const sortField = req.query.sort?.split(' ')[0] || 'timestamp';
      
      if (sortField === 'timestamp' && sortDir === '<=') {
        sql += ` AND (tu.timestamp < ? OR (tu.timestamp = ? AND tu.id < ?))`;
        params.push(cursor.timestamp, cursor.timestamp, cursor.id);
      } else if (sortField === 'timestamp' && sortDir === '>=') {
        sql += ` AND (tu.timestamp > ? OR (tu.timestamp = ? AND tu.id > ?))`;
        params.push(cursor.timestamp, cursor.timestamp, cursor.id);
      } else {
        // Default: descending by timestamp
        sql += ` AND (tu.timestamp < ? OR (tu.timestamp = ? AND tu.id < ?))`;
        params.push(cursor.timestamp, cursor.timestamp, cursor.id);
      }
    }
    
    // Apply filters
    if (agent_id) {
      sql += ' AND tu.agent_id = ?';
      params.push(agent_id);
    }
    if (session_id) {
      sql += ' AND tu.session_id = ?';
      params.push(session_id);
    }
    if (model) {
      sql += ' AND tu.model LIKE ?';
      params.push(`%${model}%`);
    }
    if (project) {
      sql += ' AND p.name = ?';
      params.push(project);
    }
    
    // Add date filter
    sql += dateFilter;
    params.push(...dateParams);
    
    // Sorting
    const sortField = req.query.sort?.split(' ')[0] || 'timestamp';
    const sortDir = req.query.sort?.split(' ')[1]?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const allowedSortFields = ['timestamp', 'total_tokens', 'cost_total', 'model', 'id'];
    
    if (allowedSortFields.includes(sortField)) {
      sql += ` ORDER BY tu.${sortField} ${sortDir}, tu.id ${sortDir}`;
    } else {
      sql += ' ORDER BY tu.timestamp DESC, tu.id DESC';
    }
    
    // Get one more than limit to determine if there's more data
    sql += ' LIMIT ?';
    params.push(limit + 1);
    
    const tokens = db.prepare(sql).all(...params);
    
    // Determine if there's more data
    const hasMore = tokens.length > limit;
    if (hasMore) {
      tokens.pop(); // Remove the extra record
    }
    
    // Create next cursor from last record
    let nextCursor = null;
    if (hasMore && tokens.length > 0) {
      const lastToken = tokens[tokens.length - 1];
      nextCursor = createCursor(lastToken.timestamp, lastToken.id);
    }
    
    // Build time series data if grouping requested
    let timeSeries = null;
    if (req.query.group_by) {
      const groupBy = req.query.group_by; // 'day', 'week', 'month'
      let dateFormat;
      
      if (groupBy === 'week') {
        dateFormat = "strftime('%Y-W%W', timestamp)";
      } else if (groupBy === 'month') {
        dateFormat = "strftime('%Y-%m', timestamp)";
      } else {
        dateFormat = "date(timestamp)";
      }
      
      // Build same-filtered subquery for time series
      let tsSql = `
        SELECT 
          ${dateFormat} as period,
          SUM(total_tokens) as total_tokens,
          SUM(input_tokens) as input_tokens,
          SUM(output_tokens) as output_tokens,
          SUM(cost_total) as cost_total,
          COUNT(*) as request_count
        FROM token_usage tu
        LEFT JOIN sessions s ON tu.session_id = s.id
        LEFT JOIN projects p ON s.channel = p.channel OR s.group_id = p.thread_id
        WHERE 1=1
      `;
      
      const tsParams = [];
      if (agent_id) {
        tsSql += ' AND tu.agent_id = ?';
        tsParams.push(agent_id);
      }
      if (model) {
        tsSql += ' AND tu.model LIKE ?';
        tsParams.push(`%${model}%`);
      }
      if (project) {
        tsSql += ' AND p.name = ?';
        tsParams.push(project);
      }
      tsSql += dateFilter;
      tsParams.push(...dateParams);
      tsSql += ` GROUP BY ${dateFormat} ORDER BY period ${sortDir === 'ASC' ? 'ASC' : 'DESC'}`;
      
      timeSeries = db.prepare(tsSql).all(...tsParams);
    }
    
    res.json({
      data: tokens,
      pagination: {
        cursor: nextCursor,
        has_more: hasMore,
        limit
      },
      time_series: timeSeries
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/v2/tokens/:id
 * Get single token record detail
 */
router.get('/tokens/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    
    const token = db.prepare(`
      SELECT 
        tu.*,
        a.name as agent_name,
        a.model as agent_model,
        s.session_key,
        s.channel,
        s.group_id,
        p.name as project_name
      FROM token_usage tu
      LEFT JOIN agents a ON tu.agent_id = a.id
      LEFT JOIN sessions s ON tu.session_id = s.id
      LEFT JOIN projects p ON s.channel = p.channel OR s.group_id = p.thread_id
      WHERE tu.id = ?
    `).get(id);
    
    if (!token) {
      return res.status(404).json({ error: 'Token record not found' });
    }
    
    res.json(token);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// Activity Events API - Cursor Pagination
// ============================================================================

/**
 * GET /api/v2/activity
 * List activity events with cursor-based pagination
 * 
 * Query Parameters:
 * - cursor: Base64 encoded cursor (timestamp:id)
 * - limit: Results per page (default: 50, max: 100)
 * - agent_id: Filter by agent ID
 * - session_id: Filter by session ID
 * - event_type: Filter by event type (tool_call, spawn, completion)
 * - tool_name: Filter by tool name
 * - success: Filter by success (true/false)
 * - start_date: Filter by start date
 * - end_date: Filter by end date
 */
router.get('/activity', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { limit, cursor } = parseCursorPagination(req);
    const { agent_id, session_id, event_type, tool_name, success } = req.query;
    
    // Handle relative dates
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);
    const { filter: dateFilter, params: dateParams } = parseDateFilter(startDate, endDate);
    
    let sql = `
      SELECT 
        ae.id,
        ae.session_id,
        ae.agent_id,
        ae.session_key,
        ae.event_type,
        ae.event_data,
        ae.tool_name,
        ae.duration_ms,
        ae.success,
        ae.timestamp,
        a.name as agent_name,
        s.session_key as session_key,
        s.channel
      FROM activity_events ae
      LEFT JOIN agents a ON ae.agent_id = a.id
      LEFT JOIN sessions s ON ae.session_id = s.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Cursor-based pagination
    if (cursor) {
      sql += ` AND (ae.timestamp < ? OR (ae.timestamp = ? AND ae.id < ?))`;
      params.push(cursor.timestamp, cursor.timestamp, cursor.id);
    }
    
    // Filters
    if (agent_id) {
      sql += ' AND ae.agent_id = ?';
      params.push(agent_id);
    }
    if (session_id) {
      sql += ' AND ae.session_id = ?';
      params.push(session_id);
    }
    if (event_type) {
      sql += ' AND ae.event_type = ?';
      params.push(event_type);
    }
    if (tool_name) {
      sql += ' AND ae.tool_name = ?';
      params.push(tool_name);
    }
    if (success !== undefined) {
      sql += ' AND ae.success = ?';
      params.push(success === 'true' ? 1 : 0);
    }
    
    sql += dateFilter;
    params.push(...dateParams);
    
    // Sorting
    sql += ' ORDER BY ae.timestamp DESC, ae.id DESC';
    
    sql += ' LIMIT ?';
    params.push(limit + 1);
    
    const events = db.prepare(sql).all(...params);
    
    const hasMore = events.length > limit;
    if (hasMore) {
      events.pop();
    }
    
    let nextCursor = null;
    if (hasMore && events.length > 0) {
      const lastEvent = events[events.length - 1];
      nextCursor = createCursor(lastEvent.timestamp, lastEvent.id);
    }
    
    res.json({
      data: events,
      pagination: {
        cursor: nextCursor,
        has_more: hasMore,
        limit
      }
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// Agents API
// ============================================================================

/**
 * GET /api/v2/agents
 * List all agents with usage stats
 */
router.get('/agents', (req, res) => {
  try {
    const db = req.app.locals.db;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 100);
    const sortField = req.query.sort?.split(' ')[0] || 'name';
    const sortDir = req.query.sort?.split(' ')[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const allowedSortFields = ['name', 'created_at'];

    let nameCursor = null;
    if (req.query.cursor) {
      try {
        nameCursor = Buffer.from(req.query.cursor, 'base64').toString('utf8');
      } catch (_) {
        nameCursor = null;
      }
    }

    let sql = `
      SELECT 
        a.*,
        (SELECT COUNT(*) FROM sessions WHERE agent_id = a.id) as session_count,
        (SELECT COALESCE(SUM(total_tokens), 0) FROM token_usage WHERE agent_id = a.id) as total_tokens,
        (SELECT COALESCE(SUM(cost_total), 0) FROM token_usage WHERE agent_id = a.id) as total_cost,
        (SELECT COUNT(*) FROM activity_events WHERE agent_id = a.id) as event_count,
        (SELECT MAX(timestamp) FROM token_usage WHERE agent_id = a.id) as last_activity
      FROM agents a
      WHERE 1=1
    `;

    const params = [];
    if (nameCursor) {
      sql += sortDir === 'DESC' ? ' AND a.name < ?' : ' AND a.name > ?';
      params.push(nameCursor);
    }

    if (allowedSortFields.includes(sortField)) {
      sql += ` ORDER BY a.${sortField} ${sortDir}`;
    } else {
      sql += ' ORDER BY a.name ASC';
    }

    sql += ' LIMIT ?';
    params.push(limit + 1);

    const agents = db.prepare(sql).all(...params);
    const hasMore = agents.length > limit;
    if (hasMore) {
      agents.pop();
    }

    const total = db.prepare('SELECT COUNT(*) as total FROM agents').get().total;
    const nextCursor = hasMore && agents.length > 0
      ? Buffer.from(agents[agents.length - 1].name || '').toString('base64')
      : null;

    res.json({
      data: agents,
      pagination: {
        cursor: nextCursor,
        has_more: hasMore,
        limit,
        total
      }
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});
/**
 * GET /api/v2/agents/:id
 * Get single agent detail with history
 */
router.get('/agents/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { limit = 20 } = req.query;
    
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Get aggregated stats
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as session_count,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(cost_total), 0) as total_cost,
        COUNT(DISTINCT model) as model_count,
        MAX(timestamp) as last_activity,
        MIN(timestamp) as first_activity
      FROM token_usage 
      WHERE agent_id = ?
    `).get(id);
    
    // Get recent sessions
    const sessions = db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM token_usage WHERE session_id = s.id) as token_count,
        (SELECT COALESCE(SUM(cost_total), 0) FROM token_usage WHERE session_id = s.id) as session_cost
      FROM sessions s
      WHERE s.agent_id = ?
      ORDER BY s.started_at DESC
      LIMIT ?
    `).all(id, parseInt(limit));
    
    // Get recent activity
    const recentActivity = db.prepare(`
      SELECT ae.*, s.session_key
      FROM activity_events ae
      LEFT JOIN sessions s ON ae.session_id = s.id
      WHERE ae.agent_id = ?
      ORDER BY ae.timestamp DESC
      LIMIT ?
    `).all(id, parseInt(limit));
    
    // Get cost by model
    const costByModel = db.prepare(`
      SELECT 
        model,
        SUM(total_tokens) as total_tokens,
        SUM(input_tokens) as input_tokens,
        SUM(output_tokens) as output_tokens,
        SUM(cost_total) as cost_total,
        COUNT(*) as request_count
      FROM token_usage
      WHERE agent_id = ?
      GROUP BY model
      ORDER BY cost_total DESC
    `).all(id);
    
    // Get daily cost trend (last 30 days)
    const dailyTrend = db.prepare(`
      SELECT 
        date(timestamp) as date,
        SUM(total_tokens) as tokens,
        SUM(cost_total) as cost
      FROM token_usage
      WHERE agent_id = ? AND timestamp >= datetime('now', '-30 days')
      GROUP BY date(timestamp)
      ORDER BY date ASC
    `).all(id);
    
    res.json({
      ...agent,
      stats,
      sessions,
      recent_activity: recentActivity,
      cost_by_model: costByModel,
      daily_trend: dailyTrend
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// Projects API
// ============================================================================

/**
 * GET /api/v2/projects
 * List projects with aggregated costs
 */
router.get('/projects', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { limit, cursor } = parseCursorPagination(req);
    
    const total = db.prepare('SELECT COUNT(*) as total FROM projects').get().total;
    
    let sql = `
      SELECT 
        p.*,
        (SELECT COUNT(*) FROM sessions s 
         WHERE s.channel = p.channel OR s.group_id = p.thread_id) as session_count,
        (SELECT COUNT(DISTINCT s.agent_id) FROM sessions s 
         WHERE s.channel = p.channel OR s.group_id = p.thread_id) as agent_count,
        (SELECT COALESCE(SUM(tu.cost_total), 0) FROM token_usage tu
         JOIN sessions s ON tu.session_id = s.id
         WHERE s.channel = p.channel OR s.group_id = p.thread_id) as total_cost,
        (SELECT COALESCE(SUM(tu.total_tokens), 0) FROM token_usage tu
         JOIN sessions s ON tu.session_id = s.id
         WHERE s.channel = p.channel OR s.group_id = p.thread_id) as total_tokens,
        (SELECT MAX(tu.timestamp) FROM token_usage tu
         JOIN sessions s ON tu.session_id = s.id
         WHERE s.channel = p.channel OR s.group_id = p.thread_id) as last_activity
      FROM projects p
    `;
    
    const sortField = req.query.sort?.split(' ')[0] || 'name';
    const sortDir = req.query.sort?.split(' ')[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const allowedSortFields = ['name', 'created_at', 'total_cost', 'total_tokens', 'session_count'];
    
    if (sortField === 'name') {
      sql += ` ORDER BY p.name ${sortDir}`;
    } else if (sortField === 'created_at') {
      sql += ` ORDER BY p.created_at ${sortDir}`;
    } else {
      sql = `
        SELECT 
          p.*,
          (SELECT COUNT(*) FROM sessions s 
           WHERE s.channel = p.channel OR s.group_id = p.thread_id) as session_count,
          (SELECT COUNT(DISTINCT s.agent_id) FROM sessions s 
           WHERE s.channel = p.channel OR s.group_id = p.thread_id) as agent_count,
          (SELECT COALESCE(SUM(tu.cost_total), 0) FROM token_usage tu
           JOIN sessions s ON tu.session_id = s.id
           WHERE s.channel = p.channel OR s.group_id = p.thread_id) as total_cost,
          (SELECT COALESCE(SUM(tu.total_tokens), 0) FROM token_usage tu
           JOIN sessions s ON tu.session_id = s.id
           WHERE s.channel = p.channel OR s.group_id = p.thread_id) as total_tokens,
          (SELECT MAX(tu.timestamp) FROM token_usage tu
           JOIN sessions s ON tu.session_id = s.id
           WHERE s.channel = p.channel OR s.group_id = p.thread_id) as last_activity
        FROM projects p
        ORDER BY total_cost ${sortDir}
      `;
    }
    
    sql += ' LIMIT ? OFFSET ?';
    
    const offset = cursor ? parseInt(cursor.id) || 0 : 0;
    const projects = db.prepare(sql).all(limit, offset);
    
    res.json({
      data: projects,
      pagination: {
        total,
        limit,
        has_more: offset + projects.length < total
      }
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/v2/projects/:id
 * Get single project with activity timeline
 */
router.get('/projects/:id', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { limit = 50 } = req.query;
    
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get aggregated stats
    const stats = db.prepare(`
      SELECT 
        COUNT(DISTINCT s.id) as session_count,
        COUNT(DISTINCT s.agent_id) as agent_count,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(tu.output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(tu.cost_total), 0) as total_cost,
        COUNT(DISTINCT tu.model) as model_count
      FROM sessions s
      LEFT JOIN token_usage tu ON s.id = tu.session_id
      WHERE s.channel = ? OR s.group_id = ?
    `).get(project.channel, project.thread_id);
    
    // Get sessions
    const sessions = db.prepare(`
      SELECT s.*, a.name as agent_name,
        (SELECT COUNT(*) FROM token_usage WHERE session_id = s.id) as token_count,
        (SELECT COALESCE(SUM(cost_total), 0) FROM token_usage WHERE session_id = s.id) as session_cost
      FROM sessions s
      LEFT JOIN agents a ON s.agent_id = a.id
      WHERE s.channel = ? OR s.group_id = ?
      ORDER BY s.started_at DESC
      LIMIT ?
    `).all(project.channel, project.thread_id, parseInt(limit));
    
    // Get activity timeline
    const activity = db.prepare(`
      SELECT ae.*, a.name as agent_name, s.session_key
      FROM activity_events ae
      LEFT JOIN agents a ON ae.agent_id = a.id
      LEFT JOIN sessions s ON ae.session_id = s.id
      WHERE s.channel = ? OR s.group_id = ?
      ORDER BY ae.timestamp DESC
      LIMIT ?
    `).all(project.channel, project.thread_id, parseInt(limit));
    
    // Get cost by agent
    const costByAgent = db.prepare(`
      SELECT 
        a.id,
        a.name,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.cost_total), 0) as total_cost
      FROM agents a
      LEFT JOIN sessions s ON a.id = s.agent_id
      LEFT JOIN token_usage tu ON s.id = tu.session_id
      WHERE s.channel = ? OR s.group_id = ?
      GROUP BY a.id
      ORDER BY total_cost DESC
    `).all(project.channel, project.thread_id);
    
    // Get daily cost trend
    const dailyTrend = db.prepare(`
      SELECT 
        date(tu.timestamp) as date,
        SUM(tu.total_tokens) as tokens,
        SUM(tu.cost_total) as cost
      FROM token_usage tu
      JOIN sessions s ON tu.session_id = s.id
      WHERE (s.channel = ? OR s.group_id = ?) 
        AND tu.timestamp >= datetime('now', '-30 days')
      GROUP BY date(tu.timestamp)
      ORDER BY date ASC
    `).all(project.channel, project.thread_id);
    
    res.json({
      ...project,
      stats,
      sessions,
      activity_timeline: activity,
      cost_by_agent: costByAgent,
      daily_trend: dailyTrend
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// Costs API - Pre-computed Rollups (Daily/Weekly/Monthly)
// ============================================================================

/**
 * GET /api/v2/costs
 * Cost summaries using PRE-COMPUTED daily_costs table
 * Supports daily, weekly, and monthly aggregations
 * 
 * Query Parameters:
 * - period: Time period (daily, weekly, monthly) - default: daily
 * - start_date: Filter by start date
 * - end_date: Filter by end date
 * - group_by: Group results by (model, agent, date) - default: model
 */
/**
 * Date filter for tables with a `date` column (e.g. daily_costs).
 * Defaults end_date to today when not provided.
 */
function parseCostDateFilter(startDate, endDate) {
  let filter = '';
  const params = [];
  const today = new Date().toISOString().split('T')[0];
  const start = startDate || '2020-01-01';
  const end = endDate || today;
  filter += ' AND date >= ? AND date <= ?';
  params.push(start, end);
  return { filter, params };
}

/**
 * Date filter for token_usage (timestamp column) using same date range.
 */
function parseCostTimestampFilter(startDate, endDate) {
  const today = new Date().toISOString().split('T')[0];
  const start = startDate || '2020-01-01';
  const end = endDate || today;
  return {
    filter: ' AND date(timestamp) >= ? AND date(timestamp) <= ?',
    params: [start, end],
  };
}

router.get('/costs', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { period = 'daily' } = req.query;
    
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);
    const { filter: costDateFilter, params: costDateParams } = parseCostDateFilter(startDate, endDate);
    const { filter: costTsFilter, params: costTsParams } = parseCostTimestampFilter(startDate, endDate);
    
    let result = {};
    
    // Get overall summary using pre-computed daily_costs (uses date column)
    const summary = db.prepare(`
      SELECT 
        COALESCE(SUM(cost_total), 0) as total_cost,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(total_input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(total_output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(request_count), 0) as request_count,
        COUNT(DISTINCT model) as model_count,
        MIN(date) as period_start,
        MAX(date) as period_end
      FROM daily_costs
      WHERE 1=1 ${costDateFilter}
    `).get(...costDateParams);
    
    result.summary = summary;
    
    // Get cost by model (from pre-computed daily_costs)
    const byModel = db.prepare(`
      SELECT 
        model,
        provider,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(total_input_tokens), 0) as input_tokens,
        COALESCE(SUM(total_output_tokens), 0) as output_tokens,
        COALESCE(SUM(cost_total), 0) as cost_total,
        COALESCE(SUM(request_count), 0) as request_count
      FROM daily_costs
      WHERE 1=1 ${costDateFilter}
      GROUP BY model
      ORDER BY cost_total DESC
    `).all(...costDateParams);
    
    result.by_model = byModel;
    
    // Get cost by agent (from token_usage; uses timestamp for date range)
    const byAgent = db.prepare(`
      SELECT 
        a.id,
        a.name,
        a.model as agent_model,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.input_tokens), 0) as input_tokens,
        COALESCE(SUM(tu.output_tokens), 0) as output_tokens,
        COALESCE(SUM(tu.cost_total), 0) as cost_total,
        COUNT(*) as request_count
      FROM token_usage tu
      LEFT JOIN agents a ON tu.agent_id = a.id
      WHERE 1=1 ${costTsFilter}
      GROUP BY a.id
      ORDER BY cost_total DESC
    `).all(...costTsParams);
    
    result.by_agent = byAgent;
    
    // Get time-series data based on period
    let byDate;
    if (period === 'weekly') {
      // Weekly aggregation
      byDate = db.prepare(`
        SELECT 
          strftime('%Y-W%W', date) as period,
          strftime('%Y-%m-%d', MIN(date)) as period_start,
          strftime('%Y-%m-%d', MAX(date)) as period_end,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(total_input_tokens), 0) as input_tokens,
          COALESCE(SUM(total_output_tokens), 0) as output_tokens,
          COALESCE(SUM(cost_total), 0) as cost_total,
          COALESCE(SUM(request_count), 0) as request_count
        FROM daily_costs
        WHERE 1=1 ${costDateFilter}
        GROUP BY strftime('%Y-W%W', date)
        ORDER BY period DESC
      `).all(...costDateParams);
    } else if (period === 'monthly') {
      // Monthly aggregation
      byDate = db.prepare(`
        SELECT 
          strftime('%Y-%m', date) as period,
          strftime('%Y-%m-01', MIN(date)) as period_start,
          strftime('%Y-%m-31', MAX(date)) as period_end,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(total_input_tokens), 0) as input_tokens,
          COALESCE(SUM(total_output_tokens), 0) as output_tokens,
          COALESCE(SUM(cost_total), 0) as cost_total,
          COALESCE(SUM(request_count), 0) as request_count
        FROM daily_costs
        WHERE 1=1 ${costDateFilter}
        GROUP BY strftime('%Y-%m', date)
        ORDER BY period DESC
      `).all(...costDateParams);
    } else {
      // Daily (default) - return cost_total so frontend chart gets data
      byDate = db.prepare(`
        SELECT 
          date as period,
          date as period_start,
          date as period_end,
          total_tokens,
          total_input_tokens as input_tokens,
          total_output_tokens as output_tokens,
          cost_total,
          request_count
        FROM daily_costs
        WHERE 1=1 ${costDateFilter}
        ORDER BY date DESC
      `).all(...costDateParams);
    }
    
    result.by_date = byDate;
    result.period = period;
    
    // When daily_costs is empty, fall back to token_usage so graphs show data
    const hasDailyData = (summary.request_count || 0) > 0;
    if (!hasDailyData) {
      const tuSummary = db.prepare(`
        SELECT 
          COALESCE(SUM(cost_total), 0) as total_cost,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COUNT(*) as request_count
        FROM token_usage WHERE 1=1 ${costTsFilter}
      `).get(...costTsParams);
      if (tuSummary && tuSummary.request_count > 0) {
        result.summary = {
          ...summary,
          total_cost: tuSummary.total_cost,
          total_tokens: tuSummary.total_tokens,
          total_input_tokens: tuSummary.total_input_tokens,
          total_output_tokens: tuSummary.total_output_tokens,
          request_count: tuSummary.request_count,
        };
        const tuByModel = db.prepare(`
          SELECT model as model, provider,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens,
            COALESCE(SUM(cost_total), 0) as cost_total,
            COUNT(*) as request_count
          FROM token_usage WHERE 1=1 ${costTsFilter}
          GROUP BY model ORDER BY cost_total DESC
        `).all(...costTsParams);
        result.by_model = tuByModel;
        const tuByDate = db.prepare(`
          SELECT 
            date(timestamp) as period,
            date(timestamp) as period_start,
            date(timestamp) as period_end,
            COALESCE(SUM(total_tokens), 0) as total_tokens,
            COALESCE(SUM(input_tokens), 0) as input_tokens,
            COALESCE(SUM(output_tokens), 0) as output_tokens,
            COALESCE(SUM(cost_total), 0) as cost_total,
            COUNT(*) as request_count
          FROM token_usage WHERE 1=1 ${costTsFilter}
          GROUP BY date(timestamp) ORDER BY period DESC
        `).all(...costTsParams);
        result.by_date = tuByDate;
      }
    }
    
    // If group_by is specified, return only that grouping
    const groupBy = req.query.group_by;
    if (groupBy === 'model') {
      return res.json({ summary: result.summary, by_model: result.by_model });
    } else if (groupBy === 'agent') {
      return res.json({ summary: result.summary, by_agent: result.by_agent });
    } else if (groupBy === 'date') {
      return res.json({ summary: result.summary, by_date: result.by_date, period });
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// Task & Sprint Cost API
// ============================================================================

/**
 * GET /api/v2/costs/tasks
 * Get cost breakdown by task
 * 
 * Query Parameters:
 * - start_date: Filter by start date (ISO or relative like "7 days ago")
 * - end_date: Filter by end date
 * 
 * Returns cost per task with sprint association
 */
router.get('/costs/tasks', (req, res) => {
  try {
    // Handle relative dates
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);
    
    const costsByTask = aggregation.getCostsByTask(startDate, endDate);
    
    // Get total summary
    const totalCost = costsByTask.reduce((sum, t) => sum + (t.cost_total || 0), 0);
    const totalTokens = costsByTask.reduce((sum, t) => sum + (t.total_tokens || 0), 0);
    
    res.json({
      summary: {
        total_cost: totalCost,
        total_tokens: totalTokens,
        task_count: costsByTask.length
      },
      tasks: costsByTask
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/v2/costs/sprints
 * Get cost breakdown by sprint
 * 
 * Query Parameters:
 * - start_date: Filter by start date
 * - end_date: Filter by end date
 * 
 * Returns cost per sprint with task and session counts
 */
router.get('/costs/sprints', (req, res) => {
  try {
    // Handle relative dates
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);
    
    const costsBySprint = aggregation.getCostsBySprint(startDate, endDate);
    
    // Get total summary
    const totalCost = costsBySprint.reduce((sum, s) => sum + (s.cost_total || 0), 0);
    const totalTokens = costsBySprint.reduce((sum, s) => sum + (s.total_tokens || 0), 0);
    
    res.json({
      summary: {
        total_cost: totalCost,
        total_tokens: totalTokens,
        sprint_count: costsBySprint.length
      },
      sprints: costsBySprint
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/v2/costs/model-task
 * Get cost breakdown by model within each task
 * 
 * Query Parameters:
 * - start_date: Filter by start date
 * - end_date: Filter by end date
 * - task: Filter by specific task label
 * 
 * Returns detailed cost per task/model combination
 */
router.get('/costs/model-task', (req, res) => {
  try {
    // Handle relative dates
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);
    const taskFilter = req.query.task;
    
    let costsByModelTask = aggregation.getCostsByModelAndTask(startDate, endDate);
    
    // Filter by task if specified
    if (taskFilter) {
      costsByModelTask = costsByModelTask.filter(t => 
        t.task_label && t.task_label.toLowerCase().includes(taskFilter.toLowerCase())
      );
    }
    
    // Group by task for easier consumption
    const groupedByTask = {};
    for (const item of costsByModelTask) {
      const taskKey = item.task_label || 'unknown';
      if (!groupedByTask[taskKey]) {
        groupedByTask[taskKey] = {
          task_label: taskKey,
          sprint_id: item.sprint_id,
          sprint_name: item.sprint_name,
          models: [],
          total_cost: 0,
          total_tokens: 0
        };
      }
      groupedByTask[taskKey].models.push({
        model: item.model,
        provider: item.provider,
        input_tokens: item.input_tokens,
        output_tokens: item.output_tokens,
        total_tokens: item.total_tokens,
        cost_total: item.cost_total,
        request_count: item.request_count
      });
      groupedByTask[taskKey].total_cost += item.cost_total || 0;
      groupedByTask[taskKey].total_tokens += item.total_tokens || 0;
    }
    
    // Get total summary
    const totalCost = costsByModelTask.reduce((sum, t) => sum + (t.cost_total || 0), 0);
    const totalTokens = costsByModelTask.reduce((sum, t) => sum + (t.total_tokens || 0), 0);
    
    res.json({
      summary: {
        total_cost: totalCost,
        total_tokens: totalTokens,
        task_count: Object.keys(groupedByTask).length
      },
      by_task: Object.values(groupedByTask).sort((a, b) => b.total_cost - a.total_cost),
      flat: costsByModelTask
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// Natural Language Query API (W5 NLP Parser Integration)
// ============================================================================

/**
 * POST /api/v2/query
 * Natural language query endpoint with full NLP parsing
 * 
 * Request Body:
 * - query: Natural language query string
 * 
 * Supported query patterns:
 * - "how much did we spend Tuesday" → date filter on costs
 * - "how much did project X cost" → project filter on costs
 * - "what did agent Y do" → agent activity query
 * - "show me tokens for last 3 days" → date range + aggregation
 * - "which model is most expensive" → cost ranking
 * - "activity for project Z this week" → project + date + activity type
 * 
 * Uses chrono-node for date parsing and compromise.js for entity extraction
 */
router.post('/query', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    // Parse the natural language query using the NLP parser
    const parsedQuery = nlpParser.parse(query);
    
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: parsedQuery.error,
        query: query
      });
    }
    
    // Execute the parsed query
    const executor = new QueryExecutor(db);
    const result = executor.execute(parsedQuery);
    
    if (!result.success) {
      return res.status(500).json({
        error: result.error,
        query: query,
        parsed: parsedQuery.parsed
      });
    }
    
    // Return successful response with structured data
    res.json({
      query: query,
      status: 'success',
      parsed: parsedQuery.parsed,
      results: result.data,
      count: result.count,
      // Include raw date info for display purposes
      dateInfo: {
        rawDate: parsedQuery.rawDate,
        rawTimePeriod: parsedQuery.rawTimePeriod
      }
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// Aggregation Views API
// ============================================================================

/**
 * GET /api/v2/tasks
 * Return all tasks with costs from aggregation engine
 */
router.get('/tasks', (req, res) => {
  try {
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);
    
    const tasks = aggregation.getCostsByTask(startDate, endDate);
    
    res.json({
      data: tasks,
      count: tasks.length
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/v2/tasks/:id
 * Return single task detail with agent/model breakdown
 */
router.get('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.locals.db;

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const modelBreakdown = db.prepare(`
      SELECT
        tu.model,
        tu.provider,
        SUM(tu.input_tokens) as input_tokens,
        SUM(tu.output_tokens) as output_tokens,
        SUM(tu.total_tokens) as total_tokens,
        SUM(tu.cost_total) as cost_total,
        COUNT(*) as request_count
      FROM token_usage tu
      JOIN sessions s ON tu.session_id = s.id
      WHERE s.task_label = ?
      GROUP BY tu.model, tu.provider
      ORDER BY cost_total DESC
    `).all(task.name);

    const agentBreakdown = db.prepare(`
      SELECT
        a.id,
        a.name,
        SUM(tu.total_tokens) as total_tokens,
        SUM(tu.cost_total) as cost_total,
        COUNT(DISTINCT tu.session_id) as session_count
      FROM token_usage tu
      JOIN sessions s ON tu.session_id = s.id
      JOIN agents a ON tu.agent_id = a.id
      WHERE s.task_label = ?
      GROUP BY a.id, a.name
      ORDER BY cost_total DESC
    `).all(task.name);

    res.json({
      ...task,
      model_breakdown: modelBreakdown,
      agent_breakdown: agentBreakdown
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/v2/sprints
 * Return sprints with costs from aggregation engine
 */
router.get('/sprints', (req, res) => {
  try {
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);

    const sprints = aggregation.getCostsBySprint(startDate, endDate);

    res.json({
      data: sprints,
      count: sprints.length
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/v2/sprints/:id
 * Return sprint detail with task/daily/model breakdown
 */
router.get('/sprints/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.locals.db;

    const sprint = db.prepare('SELECT * FROM sprints WHERE id = ?').get(id);
    if (!sprint) {
      return res.status(404).json({ error: 'Sprint not found' });
    }

    const taskBreakdown = db.prepare(`
      SELECT
        t.id,
        t.name,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.cost_total), 0) as cost_total,
        COUNT(DISTINCT tu.session_id) as session_count
      FROM tasks t
      LEFT JOIN sessions s ON s.task_label = t.name
      LEFT JOIN token_usage tu ON tu.session_id = s.id
      WHERE t.sprint_id = ?
      GROUP BY t.id, t.name
      ORDER BY cost_total DESC
    `).all(id);

    const dailyBreakdown = db.prepare(`
      SELECT
        date(tu.timestamp) as day,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.cost_total), 0) as cost_total,
        COUNT(DISTINCT tu.session_id) as session_count
      FROM tasks t
      JOIN sessions s ON s.task_label = t.name
      JOIN token_usage tu ON tu.session_id = s.id
      WHERE t.sprint_id = ?
      GROUP BY day
      ORDER BY day ASC
    `).all(id);

    const modelBreakdown = db.prepare(`
      SELECT
        tu.model,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.cost_total), 0) as cost_total,
        COUNT(*) as request_count
      FROM tasks t
      JOIN sessions s ON s.task_label = t.name
      JOIN token_usage tu ON tu.session_id = s.id
      WHERE t.sprint_id = ?
      GROUP BY tu.model
      ORDER BY cost_total DESC
    `).all(id);

    res.json({
      ...sprint,
      task_breakdown: taskBreakdown,
      daily_breakdown: dailyBreakdown,
      model_breakdown: modelBreakdown
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

/**
 * GET /api/v2/projects/:id/detailed
 * Enhanced project with session/agent/model breakdown
 */
router.get('/projects/:id/detailed', (req, res) => {
  try {
    const { id } = req.params;
    const db = req.app.locals.db;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const sessionFilter = 'WHERE s.channel = ? OR s.group_id = ?';

    const taskBreakdown = db.prepare(`
      SELECT
        COALESCE(s.task_label, 'unlabeled') as name,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.cost_total), 0) as cost_total,
        COUNT(DISTINCT s.id) as session_count
      FROM sessions s
      LEFT JOIN token_usage tu ON tu.session_id = s.id
      ${sessionFilter}
      GROUP BY COALESCE(s.task_label, 'unlabeled')
      ORDER BY cost_total DESC
    `).all(project.channel || '', project.thread_id || '');

    const agentBreakdown = db.prepare(`
      SELECT
        a.id,
        a.name,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.cost_total), 0) as cost_total,
        COUNT(DISTINCT tu.session_id) as session_count
      FROM token_usage tu
      JOIN sessions s ON tu.session_id = s.id
      LEFT JOIN agents a ON tu.agent_id = a.id
      ${sessionFilter}
      GROUP BY a.id, a.name
      ORDER BY cost_total DESC
    `).all(project.channel || '', project.thread_id || '');

    const modelBreakdown = db.prepare(`
      SELECT
        tu.model,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COALESCE(SUM(tu.cost_total), 0) as cost_total,
        COUNT(*) as request_count
      FROM token_usage tu
      JOIN sessions s ON tu.session_id = s.id
      ${sessionFilter}
      GROUP BY tu.model
      ORDER BY cost_total DESC
    `).all(project.channel || '', project.thread_id || '');

    res.json({
      ...project,
      task_breakdown: taskBreakdown,
      agent_breakdown: agentBreakdown,
      model_breakdown: modelBreakdown
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});
/**
 * GET /api/v2/models/usage
 * Model usage with agent/task breakdown from aggregation engine
 */
router.get('/models/usage', (req, res) => {
  try {
    const startDate = parseRelativeDate(req.query.start_date);
    const endDate = parseRelativeDate(req.query.end_date);
    
    const modelUsage = aggregation.getCostsByModelAndTask(startDate, endDate);
    
    // Group by model for summary
    const modelSummary = {};
    modelUsage.forEach(item => {
      if (!modelSummary[item.model]) {
        modelSummary[item.model] = {
          model: item.model,
          provider: item.provider,
          total_tokens: 0,
          cost_total: 0,
          request_count: 0,
          tasks: 0
        };
      }
      modelSummary[item.model].total_tokens += item.total_tokens || 0;
      modelSummary[item.model].cost_total += item.cost_total || 0;
      modelSummary[item.model].request_count += item.request_count || 0;
      modelSummary[item.model].tasks++;
    });
    
    res.json({
      summary: Object.values(modelSummary).sort((a, b) => b.cost_total - a.cost_total),
      detailed: modelUsage
    });
  } catch (error) {
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// ============================================================================
// Health Check
// ============================================================================

/**
 * GET /api/v2/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  try {
    const db = req.app.locals.db;
    db.prepare('SELECT 1').get();
    
    // Get some basic stats
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM agents) as agents,
        (SELECT COUNT(*) FROM sessions) as sessions,
        (SELECT COUNT(*) FROM token_usage) as token_records,
        (SELECT COUNT(*) FROM activity_events) as events,
        (SELECT COUNT(*) FROM projects) as projects
    `).get();
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      stats
    });
  } catch (error) {
    res.status(503).json({ status: 'error', error: sanitizeError(error) });
  }
});

module.exports = router;


