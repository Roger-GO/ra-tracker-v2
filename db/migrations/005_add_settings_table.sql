-- ============================================================================
-- Migration: 005_add_settings_table
-- Ensures settings table exists for capture progress and app configuration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_settings_key
ON settings(key);