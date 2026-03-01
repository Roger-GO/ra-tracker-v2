# Database Schema Documentation

## Overview

The ra-tracker database uses SQLite to store agent activity, token usage, and cost data. The schema is designed for efficiency and supports real-time querying for the dashboard.

## Tables

### agents

Stores information about all known agents in the OpenClaw system.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| agent_key | TEXT | Unique identifier (e.g., 'agent:main', 'agent:coder') |
| name | TEXT | Human-readable name |
| type | TEXT | Agent type (coordinator, specialist, etc.) |
| description | TEXT | Agent description |
| created_at | DATETIME | When agent was first registered |
| last_seen_at | DATETIME | Last activity timestamp |
| metadata | TEXT | JSON blob for additional info |
| active | INTEGER | 1 = active, 0 = inactive |

**Indexes:**
- `idx_agents_key` on `agent_key`
- `idx_agents_name` on `name`

---

### sessions

Tracks active and historical sessions.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| session_key | TEXT | Unique session identifier |
| label | TEXT | Session label/name |
| channel | TEXT | Communication channel (slack, discord, etc.) |
| agent_id | INTEGER | FK to agents |
| project_id | INTEGER | FK to projects |
| started_at | DATETIME | Session start time |
| ended_at | DATETIME | Session end time |
| status | TEXT | active, completed, terminated |
| metadata | TEXT | JSON blob for context |

**Indexes:**
- `idx_sessions_key` on `session_key`
- `idx_sessions_agent` on `agent_id`
- `idx_sessions_project` on `project_id`
- `idx_sessions_status` on `status`
- `idx_sessions_started` on `started_at`

---

### token_usage

Tracks token consumption per session/agent.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| session_id | INTEGER | FK to sessions (required) |
| agent_id | INTEGER | FK to agents |
| token_type | TEXT | input, output, reasoning, total |
| model | TEXT | Model used (e.g., gpt-4, claude-3) |
| count | INTEGER | Number of tokens |
| recorded_at | DATETIME | When tokens were recorded |
| metadata | TEXT | JSON blob |

**Indexes:**
- `idx_token_session` on `session_id`
- `idx_token_agent` on `agent_id`
- `idx_token_recorded` on `recorded_at`
- `idx_token_type` on `token_type`

---

### activity_events

Captures all agent activities for audit and analysis.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| session_id | INTEGER | FK to sessions (required) |
| agent_id | INTEGER | FK to agents |
| event_type | TEXT | tool_call, agent_spawn, agent_complete, message, error |
| event_action | TEXT | Specific action (e.g., 'read_file', 'exec') |
| timestamp | DATETIME | When event occurred |
| duration_ms | INTEGER | Execution duration in milliseconds |
| success | INTEGER | 1 = success, 0 = failure |
| error_message | TEXT | Error details if failed |
| metadata | TEXT | JSON blob with event details |
| tokens_used | INTEGER | Tokens consumed by this event |
| cost_usd | REAL | Cost in USD for this event |

**Indexes:**
- `idx_events_session` on `session_id`
- `idx_events_agent` on `agent_id`
- `idx_events_type` on `event_type`
- `idx_events_action` on `event_action`
- `idx_events_timestamp` on `timestamp`

---

### projects

Associates sessions/agents with projects.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| name | TEXT | Unique project name |
| description | TEXT | Project description |
| created_at | DATETIME | Creation timestamp |
| updated_at | DATETIME | Last update timestamp |
| active | INTEGER | 1 = active, 0 = inactive |

**Indexes:**
- `idx_projects_name` on `name`

---

### costs

Tracks cost calculations per session/agent/period.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| session_id | INTEGER | FK to sessions |
| agent_id | INTEGER | FK to agents |
| project_id | INTEGER | FK to projects |
| cost_type | TEXT | token, compute, api, total |
| amount_usd | REAL | Cost amount in USD |
| period_start | DATETIME | Period start |
| period_end | DATETIME | Period end |
| calculated_at | DATETIME | When calculation was made |
| calculation_method | TEXT | How cost was calculated |
| metadata | TEXT | JSON blob |

**Indexes:**
- `idx_costs_session` on `session_id`
- `idx_costs_agent` on `agent_id`
- `idx_costs_project` on `project_id`
- `idx_costs_period` on `period_start, period_end`
- `idx_costs_type` on `cost_type`

---

### settings

Application configuration key-value store.

| Column | Type | Description |
|--------|------|-------------|
| key | TEXT | Primary key |
| value | TEXT | Setting value |
| updated_at | DATETIME | Last update |
| description | TEXT | Setting description |

**Default Settings:**
- `token_cost_input`: 0.0000015 USD per input token
- `token_cost_output`: 0.000006 USD per output token
- `retention_days`: -1 (infinite)
- `dashboard_refresh_ms`: 5000

## Event Types

| Type | Description |
|------|-------------|
| tool_call | Agent called a tool (read, write, exec, etc.) |
| agent_spawn | Sub-agent was spawned |
| agent_complete | Sub-agent completed |
| message | User/agent message |
| error | Error occurred |

## Usage Notes

1. **Timestamps**: All timestamps use UTC and are set via `CURRENT_TIMESTAMP`
2. **JSON**: Metadata columns store JSON strings - use `JSON()` functions in queries
3. **Foreign Keys**: Must be explicitly enabled with `PRAGMA foreign_keys = ON`
4. **Migrations**: Use `npm run db:migrate` to apply schema changes
5. **Seeding**: Use `npm run db:seed` to populate sample data