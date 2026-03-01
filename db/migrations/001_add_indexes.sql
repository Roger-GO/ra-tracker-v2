-- ============================================================================
-- Migration: 001_add_indexes
-- Description: Add performance indexes for common queries
-- Applied: 2026-02-22
-- ============================================================================

-- Add composite index for session events
CREATE INDEX IF NOT EXISTS idx_events_session_timestamp
ON activity_events(session_id, timestamp DESC);

-- Add index for agent activity
CREATE INDEX IF NOT EXISTS idx_events_agent_timestamp
ON activity_events(agent_id, timestamp DESC);

-- Add index for token queries
CREATE INDEX IF NOT EXISTS idx_token_usage_session_timestamp
ON token_usage(session_id, timestamp DESC);

-- Add index for daily model rollups
CREATE INDEX IF NOT EXISTS idx_daily_costs_date_model
ON daily_costs(date, model);

-- Add index for settings lookup
CREATE INDEX IF NOT EXISTS idx_settings_key
ON settings(key);