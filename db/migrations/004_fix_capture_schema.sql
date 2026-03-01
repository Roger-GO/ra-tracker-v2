-- ============================================================================
-- Migration: 004_fix_capture_schema
-- Fixes capture schema deduplication behavior without destructive data resets.
-- ============================================================================

-- Drop the incorrect unique constraint if it exists
DROP INDEX IF EXISTS idx_token_usage_unique;

-- Add proper unique constraint on message_id (JSONL event id) for token_usage
-- Allows NULL message_id (backwards compat) but prevents duplicate non-null ids
CREATE UNIQUE INDEX IF NOT EXISTS idx_token_usage_message_id
ON token_usage(message_id)
WHERE message_id IS NOT NULL;

-- Add source_event_id to activity_events for deduplication
-- This stores "{message_event_id}:{tool_call_id}" so we don't double-insert tool calls
ALTER TABLE activity_events ADD COLUMN source_event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_events_source_event_id
ON activity_events(source_event_id)
WHERE source_event_id IS NOT NULL;