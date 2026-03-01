/**
 * RA-Tracker Natural Language Query Parser
 * 
 * Parses natural language queries into structured query objects that can be
 * used to build SQL queries against the ra-tracker database.
 * 
 * Supported query patterns:
 * - "how much did we spend Tuesday" → date filter on costs
 * - "how much did project X cost" → project filter on costs
 * - "what did agent Y do" → agent activity query
 * - "show me tokens for last 3 days" → date range + aggregation
 * - "which model is most expensive" → cost ranking
 * - "activity for project Z this week" → project + date + activity type
 * 
 * Uses:
 * - chrono-node for date extraction
 * - compromise.js for entity recognition
 * - Regex patterns for entity matching
 * - Intent → Entities → SQL Query Builder pattern
 */

const chrono = require('chrono-node');
const compromise = require('compromise');

// ============================================================================
// Shared time-period utility (used by both QueryBuilder and NLPParser)
// Uses new Date(y,m,d) constructor everywhere to avoid setHours() mutation bugs
// ============================================================================

function timePeriodRange(period) {
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth(), d = now.getDate();
  const p = period.toLowerCase();
  let start, end;

  if (p === 'today') {
    start = new Date(y, mo, d);
    end   = new Date();
  } else if (p === 'yesterday') {
    start = new Date(y, mo, d - 1);
    end   = new Date(y, mo, d - 1, 23, 59, 59, 999);
  } else if (p === 'this week' || p === 'current week') {
    start = new Date(y, mo, d - now.getDay());
    end   = new Date();
  } else if (p === 'last week' || p === 'previous week') {
    const s = new Date(y, mo, d - now.getDay() - 7);
    start = s;
    end   = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6, 23, 59, 59, 999);
  } else if (p === 'this month' || p === 'current month') {
    start = new Date(y, mo, 1);
    end   = new Date();
  } else if (p === 'last month' || p === 'previous month') {
    start = new Date(y, mo - 1, 1);
    end   = new Date(y, mo, 0, 23, 59, 59, 999);
  } else {
    const daysMatch  = p.match(/(?:last|past)\s+(\d+)\s+days?/);
    const weeksMatch = p.match(/(?:last|past)\s+(\d+)\s+weeks?/);
    const monsMatch  = p.match(/(?:last|past)\s+(\d+)\s+months?/);
    if (daysMatch) {
      start = new Date(y, mo, d - parseInt(daysMatch[1]));
      end   = new Date();
    } else if (weeksMatch) {
      start = new Date(y, mo, d - parseInt(weeksMatch[1]) * 7);
      end   = new Date();
    } else if (monsMatch) {
      start = new Date(y, mo - parseInt(monsMatch[1]), d);
      end   = new Date();
    } else {
      // Default: last 7 days
      start = new Date(y, mo, d - 7);
      end   = new Date();
    }
  }

  return { start: start.toISOString(), end: end.toISOString() };
}

// ============================================================================
// Intent Definitions
// ============================================================================

const INTENTS = {
  COST_QUERY: 'cost_query',
  ACTIVITY_QUERY: 'activity_query',
  TOKEN_QUERY: 'token_query',
  RANKING: 'ranking',
  UNKNOWN: 'unknown'
};

// Intent keywords for classification
const INTENT_KEYWORDS = {
  [INTENTS.COST_QUERY]: [
    'cost', 'spend', 'spent', 'expensive', 'price', 'pricing', 'charge', 'fee'
  ],
  [INTENTS.ACTIVITY_QUERY]: [
    'activity', 'did', 'doing', 'action', 'actions', 'what did', 'worked on',
    'use', 'used', 'tool', 'tools', 'call', 'spawn', 'complete'
  ],
  [INTENTS.TOKEN_QUERY]: [
    'token', 'tokens', 'input', 'output', 'usage', 'consumed'
  ],
  [INTENTS.RANKING]: [
    'most', 'least', 'top', 'bottom', 'ranking', 'rank', 'which', 'highest', 'lowest'
  ]
};

// ============================================================================
// Entity Type Definitions
// ============================================================================

const ENTITY_TYPES = {
  DATE: 'date',
  AGENT: 'agent',
  PROJECT: 'project',
  MODEL: 'model',
  TIME_PERIOD: 'time_period'
};

// ============================================================================
// Query Builder Class
// ============================================================================

class QueryBuilder {
  constructor() {
    this.intent = INTENTS.UNKNOWN;
    this.entities = {
      date: null,
      dateRange: null,
      agent: null,
      project: null,
      model: null,
      timePeriod: null,
      aggregation: null,
      sortOrder: 'DESC',
      limit: 50
    };
    this.filters = [];
    this.params = [];
    this.originalQuery = '';
  }

  /**
   * Set the query intent
   */
  setIntent(intent) {
    this.intent = intent;
    return this;
  }

  /**
   * Set the original query (for context detection)
   */
  setOriginalQuery(query) {
    this.originalQuery = query;
    return this;
  }

  /**
   * Add a date filter
   */
  setDate(dateObj) {
    this.entities.date = dateObj;
    return this;
  }

  /**
   * Add a date range filter
   */
  setDateRange(startDate, endDate) {
    this.entities.dateRange = { start: startDate, end: endDate };
    return this;
  }

  /**
   * Add agent filter
   */
  setAgent(agentName) {
    this.entities.agent = agentName;
    return this;
  }

  /**
   * Add project filter
   */
  setProject(projectName) {
    this.entities.project = projectName;
    return this;
  }

  /**
   * Add model filter
   */
  setModel(modelName) {
    this.entities.model = modelName;
    return this;
  }

  /**
   * Set time period (relative like "last 3 days")
   */
  setTimePeriod(period) {
    this.entities.timePeriod = period;
    return this;
  }

  /**
   * Set aggregation type
   */
  setAggregation(agg) {
    this.entities.aggregation = agg;
    return this;
  }

  /**
   * Set sort order
   */
  setSortOrder(order) {
    this.entities.sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    return this;
  }

  /**
   * Set result limit
   */
  setLimit(limit) {
    this.entities.limit = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    return this;
  }

  /**
   * Add custom filter
   */
  addFilter(filter, ...params) {
    this.filters.push(filter);
    this.params.push(...params);
    return this;
  }

  /**
   * Build the final query object
   */
  build() {
    return {
      intent: this.intent,
      entities: { ...this.entities },
      filters: [...this.filters],
      params: [...this.params],
      sql: this.toSQL(),
      sqlParams: this.getSQLParams()
    };
  }

  /**
   * Generate SQL based on intent and entities
   */
  toSQL() {
    const { intent, entities } = this;
    
    switch (intent) {
      case INTENTS.COST_QUERY:
        return this._buildCostQuery();
      case INTENTS.ACTIVITY_QUERY:
        return this._buildActivityQuery();
      case INTENTS.TOKEN_QUERY:
        return this._buildTokenQuery();
      case INTENTS.RANKING:
        return this._buildRankingQuery();
      default:
        return this._buildDefaultQuery();
    }
  }

  /**
   * Build cost query SQL
   */
  _buildCostQuery() {
    const { entities } = this;
    let sql = `
      SELECT 
        COALESCE(SUM(tu.cost_total), 0) as total_cost,
        COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
        COUNT(*) as request_count
      FROM token_usage tu
      LEFT JOIN agents a ON tu.agent_id = a.id
      LEFT JOIN sessions s ON tu.session_id = s.id
      LEFT JOIN projects p ON s.channel = p.channel OR s.group_id = p.thread_id
      WHERE 1=1
    `;
    const params = [];

    // Add agent filter
    if (entities.agent) {
      sql += ' AND a.name LIKE ?';
      params.push(`%${entities.agent}%`);
    }

    // Add project filter
    if (entities.project) {
      sql += ' AND p.name LIKE ?';
      params.push(`%${entities.project}%`);
    }

    // Add date filter
    if (entities.date) {
      sql += ' AND date(tu.timestamp) = date(?)';
      params.push(entities.date);
    }

    // Add date range filter
    if (entities.dateRange) {
      sql += ' AND tu.timestamp >= ? AND tu.timestamp <= ?';
      params.push(entities.dateRange.start, entities.dateRange.end);
    }

    // Add time period filter
    if (entities.timePeriod) {
      const { start, end } = this._getTimePeriodRange(entities.timePeriod);
      sql += ' AND tu.timestamp >= ? AND tu.timestamp <= ?';
      params.push(start, end);
    }

    return { sql, params };
  }

  /**
   * Build activity query SQL
   */
  _buildActivityQuery() {
    const { entities } = this;
    let sql = `
      SELECT 
        ae.*,
        a.name as agent_name,
        s.session_key,
        s.channel
      FROM activity_events ae
      LEFT JOIN agents a ON ae.agent_id = a.id
      LEFT JOIN sessions s ON ae.session_id = s.id
      LEFT JOIN projects p ON s.channel = p.channel OR s.group_id = p.thread_id
      WHERE 1=1
    `;
    const params = [];

    // Add agent filter
    if (entities.agent) {
      sql += ' AND a.name LIKE ?';
      params.push(`%${entities.agent}%`);
    }

    // Add project filter
    if (entities.project) {
      sql += ' AND p.name LIKE ?';
      params.push(`%${entities.project}%`);
    }

    // Add date filter
    if (entities.date) {
      sql += ' AND date(ae.timestamp) = date(?)';
      params.push(entities.date);
    }

    // Add date range filter
    if (entities.dateRange) {
      sql += ' AND ae.timestamp >= ? AND ae.timestamp <= ?';
      params.push(entities.dateRange.start, entities.dateRange.end);
    }

    // Add time period filter
    if (entities.timePeriod) {
      const { start, end } = this._getTimePeriodRange(entities.timePeriod);
      sql += ' AND ae.timestamp >= ? AND ae.timestamp <= ?';
      params.push(start, end);
    }

    // Add sorting and limit
    sql += ' ORDER BY ae.timestamp DESC LIMIT ?';
    params.push(entities.limit);

    return { sql, params };
  }

  /**
   * Build token query SQL
   */
  _buildTokenQuery() {
    const { entities } = this;
    let sql = `
      SELECT 
        tu.*,
        a.name as agent_name,
        s.session_key,
        s.channel,
        p.name as project_name
      FROM token_usage tu
      LEFT JOIN agents a ON tu.agent_id = a.id
      LEFT JOIN sessions s ON tu.session_id = s.id
      LEFT JOIN projects p ON s.channel = p.channel OR s.group_id = p.thread_id
      WHERE 1=1
    `;
    const params = [];

    // Add agent filter
    if (entities.agent) {
      sql += ' AND a.name LIKE ?';
      params.push(`%${entities.agent}%`);
    }

    // Add project filter
    if (entities.project) {
      sql += ' AND p.name LIKE ?';
      params.push(`%${entities.project}%`);
    }

    // Add date filter
    if (entities.date) {
      sql += ' AND date(tu.timestamp) = date(?)';
      params.push(entities.date);
    }

    // Add date range filter
    if (entities.dateRange) {
      sql += ' AND tu.timestamp >= ? AND tu.timestamp <= ?';
      params.push(entities.dateRange.start, entities.dateRange.end);
    }

    // Add time period filter
    if (entities.timePeriod) {
      const { start, end } = this._getTimePeriodRange(entities.timePeriod);
      sql += ' AND tu.timestamp >= ? AND tu.timestamp <= ?';
      params.push(start, end);
    }

    // Add sorting and limit
    sql += ' ORDER BY tu.timestamp DESC LIMIT ?';
    params.push(entities.limit);

    return { sql, params };
  }

  /**
   * Build ranking query SQL
   */
  _buildRankingQuery() {
    const { entities } = this;
    
    // Determine ranking type based on entities
    let sql = '';
    const params = [];

    // Check if ranking by model cost
    if (entities.model || this._isModelRankingContext()) {
      sql = `
        SELECT 
          model,
          provider,
          COALESCE(SUM(cost_total), 0) as total_cost,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COUNT(*) as request_count
        FROM token_usage
        WHERE 1=1
      `;

      // Add date filter
      if (entities.date) {
        sql += ' AND date(timestamp) = date(?)';
        params.push(entities.date);
      }

      // Add date range filter
      if (entities.dateRange) {
        sql += ' AND timestamp >= ? AND timestamp <= ?';
        params.push(entities.dateRange.start, entities.dateRange.end);
      }

      // Add time period filter
      if (entities.timePeriod) {
        const { start, end } = this._getTimePeriodRange(entities.timePeriod);
        sql += ' AND timestamp >= ? AND timestamp <= ?';
        params.push(start, end);
      }

      sql += ' GROUP BY model ORDER BY total_cost DESC LIMIT ?';
      params.push(entities.limit);
    } 
    // Ranking by agent cost
    else if (entities.agent || this._isAgentRankingContext()) {
      sql = `
        SELECT 
          a.id,
          a.name,
          a.model as agent_model,
          COALESCE(SUM(tu.cost_total), 0) as total_cost,
          COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
          COUNT(*) as request_count
        FROM agents a
        LEFT JOIN token_usage tu ON a.id = tu.agent_id
        WHERE 1=1
      `;

      // Add date filter
      if (entities.date) {
        sql += ' AND date(tu.timestamp) = date(?)';
        params.push(entities.date);
      }

      // Add date range filter
      if (entities.dateRange) {
        sql += ' AND tu.timestamp >= ? AND tu.timestamp <= ?';
        params.push(entities.dateRange.start, entities.dateRange.end);
      }

      // Add time period filter
      if (entities.timePeriod) {
        const { start, end } = this._getTimePeriodRange(entities.timePeriod);
        sql += ' AND tu.timestamp >= ? AND tu.timestamp <= ?';
        params.push(start, end);
      }

      sql += ' GROUP BY a.id ORDER BY total_cost DESC LIMIT ?';
      params.push(entities.limit);
    }
    // Ranking by project cost (default)
    else {
      sql = `
        SELECT 
          p.id,
          p.name as project_name,
          COALESCE(SUM(tu.cost_total), 0) as total_cost,
          COALESCE(SUM(tu.total_tokens), 0) as total_tokens,
          COUNT(DISTINCT s.id) as session_count
        FROM projects p
        LEFT JOIN sessions s ON s.channel = p.channel OR s.group_id = p.thread_id
        LEFT JOIN token_usage tu ON s.id = tu.session_id
        WHERE 1=1
      `;

      // Add date filter
      if (entities.date) {
        sql += ' AND date(tu.timestamp) = date(?)';
        params.push(entities.date);
      }

      // Add date range filter
      if (entities.dateRange) {
        sql += ' AND tu.timestamp >= ? AND tu.timestamp <= ?';
        params.push(entities.dateRange.start, entities.dateRange.end);
      }

      // Add time period filter
      if (entities.timePeriod) {
        const { start, end } = this._getTimePeriodRange(entities.timePeriod);
        sql += ' AND tu.timestamp >= ? AND tu.timestamp <= ?';
        params.push(start, end);
      }

      sql += ' GROUP BY p.id ORDER BY total_cost DESC LIMIT ?';
      params.push(entities.limit);
    }

    return { sql, params };
  }

  /**
   * Build default query (fallback)
   */
  _buildDefaultQuery() {
    return {
      sql: 'SELECT * FROM token_usage ORDER BY timestamp DESC LIMIT ?',
      params: [this.entities.limit]
    };
  }

  /**
   * Check if query is about model ranking
   */
  _isModelRankingContext() {
    const query = this.originalQuery.toLowerCase();
    // Check for model-related ranking keywords
    const modelRankingPatterns = [
      /which\s+model/i,
      /model.*most/i,
      /model.*least/i,
      /most\s+expensive.*model/i,
      /model.*ranking/i,
      /rank.*model/i,
      /top\s+model/i
    ];
    return modelRankingPatterns.some(pattern => pattern.test(query));
  }

  /**
   * Check if query is about agent ranking
   */
  _isAgentRankingContext() {
    const query = this.originalQuery.toLowerCase();
    // Check for agent-related ranking keywords
    const agentRankingPatterns = [
      /which\s+agent/i,
      /agent.*most/i,
      /agent.*least/i,
      /most\s+expensive.*agent/i,
      /agent.*ranking/i,
      /rank.*agent/i,
      /top\s+agent/i
    ];
    return agentRankingPatterns.some(pattern => pattern.test(query));
  }

  /**
   * Get date range from time period string — delegates to shared timePeriodRange()
   */
  _getTimePeriodRange(period) {
    return timePeriodRange(period);
  }

  /**
   * Get SQL and params
   */
  getSQLParams() {
    const sqlObj = this.toSQL();
    return sqlObj.params || [];
  }
}

// ============================================================================
// NLP Parser Class
// ============================================================================

class NLPParser {
  constructor(options = {}) {
    this.options = {
      defaultLimit: 50,
      maxLimit: 100,
      ...options
    };
    
    // Initialize compromise
    this.nlp = null;
  }

  /**
   * Parse a natural language query
   * @param {string} query - The natural language query
   * @returns {Object} Parsed query object with intent, entities, and SQL
   */
  parse(query) {
    if (!query || typeof query !== 'string') {
      return this._createErrorResponse('Query must be a non-empty string');
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return this._createErrorResponse('Query is empty');
    }

    try {
      // Step 1: Detect intent
      const intent = this._detectIntent(trimmedQuery);

      // Step 2: Extract entities
      const entities = this._extractEntities(trimmedQuery);

      // Step 3: Build query
      const builder = new QueryBuilder();
      builder.setIntent(intent)
        .setOriginalQuery(trimmedQuery)
        .setLimit(this.options.defaultLimit);

      // Apply extracted entities to builder
      if (entities.date) {
        builder.setDate(entities.date);
      }
      if (entities.dateRange) {
        builder.setDateRange(entities.dateRange.start, entities.dateRange.end);
      }
      if (entities.agent) {
        builder.setAgent(entities.agent);
      }
      if (entities.project) {
        builder.setProject(entities.project);
      }
      if (entities.model) {
        builder.setModel(entities.model);
      }
      if (entities.timePeriod) {
        builder.setTimePeriod(entities.timePeriod);
      }
      if (entities.limit) {
        builder.setLimit(entities.limit);
      }
      if (entities.sortOrder) {
        builder.setSortOrder(entities.sortOrder);
      }

      const result = builder.build();

      return {
        success: true,
        originalQuery: query,
        parsed: {
          intent: result.intent,
          entities: result.entities
        },
        sql: result.sql,
        params: result.sqlParams,
        rawDate: entities.rawDate,
        rawTimePeriod: entities.rawTimePeriod
      };
    } catch (error) {
      return this._createErrorResponse(`Parse error: ${error.message}`);
    }
  }

  /**
   * Detect the intent of the query
   */
  _detectIntent(query) {
    const queryLower = query.toLowerCase();
    
    // Check for ranking queries first (they have specific keywords)
    if (this._isRankingQuery(queryLower)) {
      return INTENTS.RANKING;
    }

    // Check each intent category
    for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
      for (const keyword of keywords) {
        if (queryLower.includes(keyword)) {
          return intent;
        }
      }
    }

    // Default to cost query if uncertain
    return INTENTS.COST_QUERY;
  }

  /**
   * Check if query is a ranking query
   */
  _isRankingQuery(queryLower) {
    const rankingPatterns = [
      /which\s+(model|agent|project).*(most|least)/i,
      /most\s+(expensive|used)/i,
      /top\s+\d+/i,
      /rank/i,
      /highest\s+cost/i,
      /lowest\s+cost/i
    ];

    return rankingPatterns.some(pattern => pattern.test(queryLower));
  }

  /**
   * Extract entities from the query
   */
  _extractEntities(query) {
    const entities = {
      date: null,
      dateRange: null,
      agent: null,
      project: null,
      model: null,
      timePeriod: null,
      limit: this.options.defaultLimit,
      sortOrder: 'DESC',
      rawDate: null,
      rawTimePeriod: null
    };

    // Extract time period first (higher priority for relative periods like "last 3 days")
    const timePeriodResult = this._extractTimePeriod(query);
    if (timePeriodResult) {
      entities.timePeriod = timePeriodResult.period;
      entities.rawTimePeriod = timePeriodResult.text;
      // Set dateRange from time period
      entities.dateRange = this._getTimePeriodRange(timePeriodResult.period);
    }

    // Extract date using chrono only if no time period was found (fallback for absolute dates)
    if (!entities.timePeriod) {
      const dateResult = this._extractDate(query);
      if (dateResult) {
        if (dateResult.start && dateResult.end) {
          entities.dateRange = dateResult;
          entities.rawDate = dateResult.text;
        } else if (dateResult.start) {
          entities.date = dateResult.start;
          entities.rawDate = dateResult.text;
        }
      }
    }

    // Extract agent name
    const agentResult = this._extractAgent(query);
    if (agentResult) {
      entities.agent = agentResult;
    }

    // Extract project name
    const projectResult = this._extractProject(query);
    if (projectResult) {
      entities.project = projectResult;
    }

    // Extract model name
    const modelResult = this._extractModel(query);
    if (modelResult) {
      entities.model = modelResult;
    }

    // Extract limit if present
    const limitResult = this._extractLimit(query);
    if (limitResult) {
      entities.limit = limitResult;
    }

    return entities;
  }

  /**
   * Extract date using chrono-node
   */
  _extractDate(query) {
    // Try parsing with chrono
    const results = chrono.parse(query, new Date(), { forwardDate: true });
    
    if (results && results.length > 0) {
      const result = results[0];
      const start = result.start.date();
      const end = result.end ? result.end.date() : start;
      
      return {
        text: result.text,
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0]
      };
    }

    return null;
  }

  /**
   * Extract time period (relative like "last 3 days", "this week")
   */
  _extractTimePeriod(query) {
    const queryLower = query.toLowerCase();
    
    const timePeriodPatterns = [
      { pattern: /last\s+(\d+)\s+days?/i, period: (match) => `last ${match[1]} days` },
      { pattern: /past\s+(\d+)\s+days?/i, period: (match) => `past ${match[1]} days` },
      { pattern: /last\s+(\d+)\s+weeks?/i, period: (match) => `last ${match[1]} weeks` },
      { pattern: /past\s+(\d+)\s+weeks?/i, period: (match) => `past ${match[1]} weeks` },
      { pattern: /last\s+(\d+)\s+months?/i, period: (match) => `last ${match[1]} months` },
      { pattern: /past\s+(\d+)\s+months?/i, period: (match) => `past ${match[1]} months` },
      { pattern: /\bthis\s+week\b/i, period: 'this week' },
      { pattern: /\blast\s+week\b/i, period: 'last week' },
      { pattern: /\bthis\s+month\b/i, period: 'this month' },
      { pattern: /\blast\s+month\b/i, period: 'last month' },
      { pattern: /\byesterday\b/i, period: 'yesterday' },
      { pattern: /\btoday\b/i, period: 'today' }
    ];

    for (const { pattern, period } of timePeriodPatterns) {
      const match = queryLower.match(pattern);
      if (match) {
        return {
          text: match[0],
          period: typeof period === 'function' ? period(match) : period
        };
      }
    }

    return null;
  }

  /**
   * Get date range from time period — delegates to shared timePeriodRange()
   */
  _getTimePeriodRange(period) {
    return timePeriodRange(period);
  }

  /**
   * Extract agent name from query
   */
  _extractAgent(query) {
    const queryLower = query.toLowerCase();
    
    // Words to exclude from agent names (including pronouns to prevent false positives)
    const agentStopWords = [
      'the', 'a', 'an', 'my', 'your', 'our', 'this', 'that', 'which', 'what', 
      'agent', 'project', 'for', 'model', 'do', 'did', 'cost', 'spend',
      // Pronouns - common false positives
      'we', 'i', 'me', 'they', 'us', 'he', 'she', 'him', 'her', 'them', 'my', 'your', 'our', 'their'
    ];

    // Common agent name patterns - order matters! More specific patterns first
    const agentPatterns = [
      // "agent X" - must check first
      /\bagent\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\b/i,
      // "what did X do" 
      /(?:what\s+did)\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\s+do/i,
      // "how much did X spend" - for cost queries with agent
      /(?:how\s+much\s+(?:did|do|does))\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\s+(?:spend|cost)/i,
      // "for agent X"
      /\bfor\s+agent\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\b/i,
      // "by/from X agent"
      /(?:by|from)\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\s+agent/i,
      // "activity of/from X"
      /(?:activity\s+(?:of|from))\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)/i,
      // Generic "for X" - but only if X looks like an agent name
      /\bfor\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\b/i
    ];

    for (const pattern of agentPatterns) {
      const match = queryLower.match(pattern);
      if (match && match[1]) {
        if (!agentStopWords.includes(match[1].toLowerCase())) {
          // Clean up: remove trailing words
          let cleaned = match[1].replace(/\s+(do|did|does|cost|spend|this|that|for|in|on|at|by|to|with|from|of|the|a|an)$/i, '');
          return cleaned || match[1];
        }
      }
    }

    // Try using compromise for entity extraction
    try {
      const doc = compromise(query);
      const people = doc.people().out('array');
      if (people.length > 0) {
        return people[0];
      }
    } catch (e) {
      // Fall back to regex
    }

    return null;
  }

  /**
   * Extract project name from query
   */
  _extractProject(query) {
    const queryLower = query.toLowerCase();
    
    // Words to exclude from project names  
    const projectStopWords = ['the', 'a', 'an', 'my', 'your', 'our', 'this', 'that', 'which', 'what', 'me', 'us', 'project', 'for', 'cost', 'spend', 'do', 'did'];

    // Common project name patterns - order matters!
    const projectPatterns = [
      // "project X" - must check first
      /\bproject\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\b/i,
      // "for project X"
      /\bfor\s+project\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\b/i,
      // "activity for/in X"
      /(?:activity\s+(?:for|in))\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)/i,
      // "cost of/for X"
      /(?:cost\s+(?:of|for))\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)/i,
      // "spend on X"
      /(?:spend\s+(?:on|for))\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)/i,
      // Generic "for X" - but only if X looks like a project name
      /\bfor\s+([a-z0-9_-]+(?:\s+[a-z0-9_-]+)?)\b/i
    ];

    for (const pattern of projectPatterns) {
      const match = queryLower.match(pattern);
      if (match && match[1]) {
        if (!projectStopWords.includes(match[1].toLowerCase())) {
          // Clean up: remove trailing words like "cost", "do", etc.
          let cleaned = match[1].replace(/\s+(do|did|does|cost|spend|this|that|for|in|on|at|by|to|with|from|of|the|a|an)$/i, '');
          return cleaned || match[1];
        }
      }
    }

    return null;
  }

  /**
   * Extract model name from query
   */
  _extractModel(query) {
    const queryLower = query.toLowerCase();
    
    // Common model patterns - specific LLM model names first
    const modelPatterns = [
      /(gpt-[0-9](?:\.[0-9])?)/i,
      /(claude-[0-9](?:\.[0-9])?)/i,
      /(gemini-[0-9](?:\.[0-9])?)/i,
      /(llama-[0-9](?:\.[0-9])?)/i,
      /(mistral-[0-9](?:\.[0-9])?)/i,
      // Only match explicit "model: X" or "model X" with actual model-like names
      // Exclude generic words like "model is", "model most", etc.
      /(?:model[:\s]+)([a-z][a-z0-9_-]{2,})/i
    ];

    for (const pattern of modelPatterns) {
      const match = queryLower.match(pattern);
      if (match) {
        const extracted = match[1] || match[0];
        // Validate: reject common non-model words that might match "model X" pattern
        const invalidModels = ['is', 'are', 'was', 'were', 'most', 'least', 'the', 'a', 'an', 'most expensive', 'least expensive', 'expensive', 'cheap'];
        if (!invalidModels.includes(extracted.toLowerCase())) {
          return extracted;
        }
      }
    }

    return null;
  }

  /**
   * Extract limit from query
   */
  _extractLimit(query) {
    const queryLower = query.toLowerCase();
    
    const limitPatterns = [
      /(?:show\s+(?:me\s+)?(?:the\s+)?(?:top|first|last)?\s*(\d+))/i,
      /(?:limit\s*(?:to)?\s*(\d+))/i,
      /(?:only\s+(\d+))/i,
      /(\d+)\s+(?:results?|items?|records?)/i
    ];

    for (const pattern of limitPatterns) {
      const match = queryLower.match(pattern);
      if (match && match[1]) {
        const limit = parseInt(match[1]);
        if (limit > 0 && limit <= this.options.maxLimit) {
          return limit;
        }
      }
    }

    return null;
  }

  /**
   * Create error response
   */
  _createErrorResponse(message) {
    return {
      success: false,
      error: message,
      originalQuery: '',
      parsed: {
        intent: INTENTS.UNKNOWN,
        entities: {}
      },
      sql: null,
      params: []
    };
  }
}

// ============================================================================
// Query Executor Class
// ============================================================================

class QueryExecutor {
  constructor(db) {
    this.db = db;
  }

  /**
   * Execute a parsed query
   */
  execute(parsedQuery) {
    if (!parsedQuery.success) {
      return { error: parsedQuery.error };
    }

    try {
      const { sql, params } = parsedQuery;
      
      if (!sql) {
        return { error: 'No SQL generated' };
      }

      // Handle different SQL structures
      let results;
      if (typeof sql === 'object' && sql.sql) {
        results = this.db.prepare(sql.sql).all(...sql.params);
      } else {
        results = this.db.prepare(sql).all(...params);
      }

      return {
        success: true,
        data: results,
        count: results.length,
        query: parsedQuery.originalQuery,
        parsed: parsedQuery.parsed
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        query: parsedQuery.originalQuery
      };
    }
  }
}

// ============================================================================
// Export
// ============================================================================

module.exports = {
  NLPParser,
  QueryBuilder,
  QueryExecutor,
  INTENTS,
  ENTITY_TYPES
};
