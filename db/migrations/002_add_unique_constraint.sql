-- ============================================================================
-- Migration: 002_add_unique_constraint
-- Add unique constraint to prevent duplicate token_usage records
-- ============================================================================

-- First, clean up any duplicate records (keep the first occurrence by timestamp)
-- This preserves the earliest record for each session_id/total_tokens combination
DELETE FROM token_usage
WHERE id NOT IN (
  SELECT MIN(id)
  FROM token_usage
  GROUP BY session_id, total_tokens, timestamp
);

-- Add unique constraint on (session_id, total_tokens, timestamp) to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_unique 
ON token_usage(session_id, total_tokens, timestamp);

-- Also add index to help with session state lookups
CREATE INDEX IF NOT EXISTS idx_sessions_session_key ON sessions(session_key);