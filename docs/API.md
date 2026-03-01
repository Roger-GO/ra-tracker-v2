# RA-Tracker REST API Documentation

## Overview

The RA-Tracker REST API provides endpoints for querying token usage, activity events, agents, projects, and cost summaries. This API is designed to work with the SQLite database schema defined in `db/migrations/000_initial_schema.sql`.

**Base URL:** `http://localhost:3000/api/v2`

## Authentication

Currently, no authentication is required. This should be added for production use.

## Common Query Parameters

All list endpoints support the following query parameters:

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `limit` | integer | Results per page (max 100) | 50 |
| `offset` | integer | Pagination offset | 0 |
| `sort` | string | Sort field and direction (e.g., `timestamp DESC`) | Varies by endpoint |
| `start_date` | string | Filter by start date (ISO format) | - |
| `end_date` | string | Filter by end date (ISO format) | - |

## Response Format

All responses follow this structure:

```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "limit": 50,
    "offset": 0,
    "has_more": true
  }
}
```

Single resource responses return the object directly:

```json
{
  "id": "...",
  "name": "...",
  ...
}
```

## Endpoints

### Token Usage

#### GET /api/v2/tokens

List token usage records with filters.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | string | Filter by agent ID |
| `session_id` | string | Filter by session ID |
| `model` | string | Filter by model name (partial match) |
| `project` | string | Filter by project name |
| `start_date` | string | Filter by start date (ISO format) |
| `end_date` | string | Filter by end date (ISO format) |
| `limit` | integer | Results per page |
| `offset` | integer | Pagination offset |
| `sort` | string | Sort field (timestamp, total_tokens, cost_total, model) |

**Example Request:**

```bash
GET /api/v2/tokens?agent_id=coder&start_date=2024-01-01&limit=20
```

**Example Response:**

```json
{
  "data": [
    {
      "id": 1,
      "session_id": "sess-001",
      "agent_id": "coder",
      "session_key": "agent:main:slack:channel:C0AGD4J7HLJ",
      "model": "openrouter/minimax/minimax-m2.5",
      "provider": "openrouter",
      "input_tokens": 1500,
      "output_tokens": 500,
      "total_tokens": 2000,
      "cost_input": 0.0015,
      "cost_output": 0.0025,
      "cost_total": 0.004,
      "timestamp": "2024-01-15T10:30:00.000Z",
      "agent_name": "Coder Agent"
    }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "has_more": true
  }
}
```

---

#### GET /api/v2/tokens/:id

Get a single token record by ID.

**Example Request:**

```bash
GET /api/v2/tokens/1
```

**Example Response:**

```json
{
  "id": 1,
  "session_id": "sess-001",
  "agent_id": "coder",
  "session_key": "agent:main:slack:channel:C0AGD4J7HLJ",
  "model": "openrouter/minimax/minimax-m2.5",
  "provider": "openrouter",
  "input_tokens": 1500,
  "output_tokens": 500,
  "total_tokens": 2000,
  "cache_read_tokens": 0,
  "cache_write_tokens": 0,
  "cost_input": 0.0015,
  "cost_output": 0.0025,
  "cost_cache_read": 0,
  "cost_cache_write": 0,
  "cost_total": 0.004,
  "timestamp": "2024-01-15T10:30:00.000Z",
  "message_id": "msg-123",
  "parent_id": null,
  "agent_name": "Coder Agent",
  "channel": "slack"
}
```

---

### Activity Events

#### GET /api/v2/activity

List activity events (tool calls, spawns, completions).

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `agent_id` | string | Filter by agent ID |
| `session_id` | string | Filter by session ID |
| `event_type` | string | Filter by event type (tool_call, spawn, completion) |
| `tool_name` | string | Filter by tool name |
| `success` | boolean | Filter by success status |
| `start_date` | string | Filter by start date |
| `end_date` | string | Filter by end date |
| `limit` | integer | Results per page |
| `offset` | integer | Pagination offset |
| `sort` | string | Sort field (timestamp, duration_ms, event_type) |

**Example Request:**

```bash
GET /api/v2/activity?event_type=tool_call&limit=10
```

**Example Response:**

```json
{
  "data": [
    {
      "id": 1,
      "session_id": "sess-001",
      "agent_id": "coder",
      "session_key": "agent:main:slack:channel:C0AGD4J7HLJ",
      "event_type": "tool_call",
      "event_data": "{\"tool\":\"write\"}",
      "tool_name": "write",
      "duration_ms": 150,
      "success": 1,
      "timestamp": "2024-01-15T10:30:00.000Z",
      "agent_name": "Coder Agent",
      "channel": "slack"
    }
  ],
  "pagination": {
    "total": 50,
    "limit": 10,
    "offset": 0,
    "has_more": true
  }
}
```

---

### Agents

#### GET /api/v2/agents

List all agents with aggregated usage statistics.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Results per page |
| `offset` | integer | Pagination offset |
| `sort` | string | Sort field (name, created_at, total_cost, total_tokens, session_count) |

**Example Request:**

```bash
GET /api/v2/agents?sort=total_cost DESC
```

**Example Response:**

```json
{
  "data": [
    {
      "id": "coder",
      "name": "Coder Agent",
      "model": "openrouter/minimax/minimax-m2.5",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z",
      "session_count": 25,
      "total_tokens": 1500000,
      "total_cost": 15.50,
      "event_count": 500,
      "last_activity": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 4,
    "limit": 50,
    "offset": 0,
    "has_more": false
  }
}
```

---

#### GET /api/v2/agents/:id

Get detailed agent information including history.

**Example Request:**

```bash
GET /api/v2/agents/coder
```

**Example Response:**

```json
{
  "id": "coder",
  "name": "Coder Agent",
  "model": "openrouter/minimax/minimax-m2.5",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z",
  "stats": {
    "session_count": 25,
    "total_tokens": 1500000,
    "total_input_tokens": 800000,
    "total_output_tokens": 700000,
    "total_cost": 15.50,
    "model_count": 3,
    "last_activity": "2024-01-15T10:30:00.000Z",
    "first_activity": "2024-01-01T00:00:00.000Z"
  },
  "sessions": [...],
  "recent_activity": [...],
  "cost_by_model": [
    {
      "model": "openrouter/minimax/minimax-m2.5",
      "total_tokens": 1000000,
      "input_tokens": 500000,
      "output_tokens": 500000,
      "cost_total": 10.00,
      "request_count": 500
    }
  ],
  "daily_trend": [
    {
      "date": "2024-01-15",
      "tokens": 50000,
      "cost": 0.50
    }
  ]
}
```

---

### Projects

#### GET /api/v2/projects

List projects with aggregated costs.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Results per page |
| `offset` | integer | Pagination offset |
| `sort` | string | Sort field (name, created_at, total_cost, total_tokens, session_count) |

**Example Request:**

```bash
GET /api/v2/projects
```

**Example Response:**

```json
{
  "data": [
    {
      "id": 1,
      "name": "ra-tracker",
      "repo_url": null,
      "channel": "slack",
      "thread_id": null,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z",
      "session_count": 10,
      "agent_count": 3,
      "total_cost": 5.25,
      "total_tokens": 500000,
      "last_activity": "2024-01-15T10:30:00.000Z"
    }
  ],
  "pagination": {
    "total": 3,
    "limit": 50,
    "offset": 0,
    "has_more": false
  }
}
```

---

#### GET /api/v2/projects/:id

Get detailed project information with activity timeline.

**Example Request:**

```bash
GET /api/v2/projects/1
```

**Example Response:**

```json
{
  "id": 1,
  "name": "ra-tracker",
  "repo_url": null,
  "channel": "slack",
  "thread_id": null,
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-15T10:30:00.000Z",
  "stats": {
    "session_count": 10,
    "agent_count": 3,
    "total_tokens": 500000,
    "total_input_tokens": 250000,
    "total_output_tokens": 250000,
    "total_cost": 5.25,
    "model_count": 2
  },
  "sessions": [...],
  "activity_timeline": [...],
  "cost_by_agent": [
    {
      "id": "coder",
      "name": "Coder Agent",
      "total_tokens": 300000,
      "total_cost": 3.00
    }
  ],
  "daily_trend": [
    {
      "date": "2024-01-15",
      "tokens": 20000,
      "cost": 0.20
    }
  ]
}
```

---

### Costs

#### GET /api/v2/costs

Get cost summaries by model, agent, and date range.

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `start_date` | string | Filter by start date |
| `end_date` | string | Filter by end date |
| `group_by` | string | Group results by (model, agent, date) |

**Example Request:**

```bash
GET /api/v2/costs?start_date=2024-01-01&end_date=2024-01-31
```

**Example Response:**

```json
{
  "summary": {
    "total_cost": 25.75,
    "total_tokens": 2500000,
    "total_input_tokens": 1300000,
    "total_output_tokens": 1200000,
    "request_count": 1250,
    "model_count": 4,
    "agent_count": 3
  },
  "by_model": [
    {
      "model": "openrouter/minimax/minimax-m2.5",
      "provider": "openrouter",
      "total_tokens": 1500000,
      "input_tokens": 800000,
      "output_tokens": 700000,
      "cost_total": 15.00,
      "request_count": 750
    }
  ],
  "by_agent": [
    {
      "id": "coder",
      "name": "Coder Agent",
      "agent_model": "openrouter/minimax/minimax-m2.5",
      "total_tokens": 1000000,
      "input_tokens": 500000,
      "output_tokens": 500000,
      "cost_total": 10.00,
      "request_count": 500
    }
  ],
  "by_date": [
    {
      "date": "2024-01-15",
      "total_tokens": 80000,
      "input_tokens": 40000,
      "output_tokens": 40000,
      "cost_total": 0.80,
      "request_count": 40
    }
  ]
}
```

**With group_by parameter:**

```bash
GET /api/v2/costs?group_by=model
```

Returns only `summary` and `by_model`.

---

### Natural Language Query

#### POST /api/v2/query

Natural language query endpoint. This is a pass-through endpoint designed to work with the W5 NLP parser module.

**Request Body:**

| Field | Type | Description |
|-------|------|-------------|
| `query` | string | Natural language query |

**Example Request:**

```bash
POST /api/v2/query
Content-Type: application/json

{
  "query": "Show me the top spending agents this month"
}
```

**Example Response:**

```json
{
  "query": "Show me the top spending agents this month",
  "status": "pending",
  "message": "NLP parser integration pending (W5)",
  "parsed": null,
  "results": null
}
```

---

### Health Check

#### GET /api/v2/health

Check API health status.

**Example Request:**

```bash
GET /api/v2/health
```

**Example Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Error Responses

All errors return a consistent JSON format:

```json
{
  "error": "Error message description"
}
```

Common HTTP status codes:

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Example Usage with cURL

```bash
# Get all tokens for the coder agent
curl "http://localhost:3000/api/v2/tokens?agent_id=coder"

# Get activity events for tool calls
curl "http://localhost:3000/api/v2/activity?event_type=tool_call&limit=10"

# Get agents sorted by cost
curl "http://localhost:3000/api/v2/agents?sort=total_cost%20DESC"

# Get cost summary for January 2024
curl "http://localhost:3000/api/v2/costs?start_date=2024-01-01&end_date=2024-01-31"

# Query with pagination
curl "http://localhost:3000/api/v2/tokens?limit=20&offset=40"
```

---

## Database Schema

The API works with the following tables:

- **agents** - Agent information (id, name, model)
- **sessions** - Session tracking (id, agent_id, session_key, channel, group_id)
- **token_usage** - Token usage records (id, session_id, agent_id, model, tokens, costs)
- **activity_events** - Activity events (id, session_id, agent_id, event_type, tool_name)
- **projects** - Project mappings (id, name, repo_url, channel, thread_id)
- **daily_costs** - Pre-aggregated daily costs
- **settings** - Configuration key-value store
