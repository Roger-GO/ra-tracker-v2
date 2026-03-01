-- Token Usage Interceptor Database Schema
-- SQLite migrations for ra-tracker

-- ============================================
-- MIGRATION: 001_initial_schema
-- ============================================

-- Agents table: stores unique agent identifiers
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table: tracks active sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_key TEXT NOT NULL,
    channel TEXT,
    group_id TEXT,
    spawned_by TEXT,
    spawn_depth INTEGER DEFAULT 0,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Token usage table: stores per-call token data
CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    session_key TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    cost_input REAL DEFAULT 0,
    cost_output REAL DEFAULT 0,
    cost_cache_read REAL DEFAULT 0,
    cost_cache_write REAL DEFAULT 0,
    cost_total REAL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    message_id TEXT,
    parent_id TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Activity events table: tool calls, spawns, completions
CREATE TABLE IF NOT EXISTS activity_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    agent_id TEXT,
    session_key TEXT,
    event_type TEXT NOT NULL,
    event_data TEXT, -- JSON blob
    tool_name TEXT,
    duration_ms INTEGER,
    success INTEGER DEFAULT 1,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Projects table: project mappings
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    repo_url TEXT,
    channel TEXT,
    thread_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Settings table: application key/value storage
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Costs aggregated by day/model
CREATE TABLE IF NOT EXISTS daily_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    model TEXT NOT NULL,
    provider TEXT,
    total_input_tokens INTEGER DEFAULT 0,
    total_output_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    cost_input REAL DEFAULT 0,
    cost_output REAL DEFAULT 0,
    cost_total REAL DEFAULT 0,
    request_count INTEGER DEFAULT 0,
    UNIQUE(date, model)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
CREATE INDEX IF NOT EXISTS idx_activity_events_session ON activity_events(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp ON activity_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_daily_costs_date ON daily_costs(date);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

-- ============================================
-- PRICING DATA STRUCTURE
-- ============================================
-- This will be loaded by the capture mechanism
-- Prices are in USD per 1M tokens
