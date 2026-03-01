/**
 * Database Seed Script
 * Populates the database with sample data for development/testing
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.RA_TRACKER_DB || path.join(__dirname, '..', 'src', 'data', 'ra-tracker.db');

const sampleAgents = [
  { id: 'agent:main', name: 'Main Agent', model: 'openrouter/anthropic/claude-sonnet-4.6' },
  { id: 'agent:coder', name: 'Coder Agent', model: 'openrouter/openai/gpt-4.1' },
  { id: 'agent:researcher', name: 'Research Agent', model: 'openrouter/deepseek/deepseek-chat' },
];

const sampleProjects = [
  { name: 'ra-tracker', repo_url: 'https://example.com/ra-tracker', channel: 'slack-ra', thread_id: 'thread-ra' },
  { name: 'research', repo_url: 'https://example.com/research', channel: 'slack-research', thread_id: 'thread-research' },
];

const sampleSessions = [
  {
    id: 'sess:001',
    agent_id: 'agent:coder',
    session_key: 'agent:coder:run:tracker-setup',
    channel: 'slack-ra',
    group_id: 'thread-ra',
    task_label: 'tracker-setup',
    sprint_id: null,
  },
  {
    id: 'sess:002',
    agent_id: 'agent:researcher',
    session_key: 'agent:researcher:run:research-pass',
    channel: 'slack-research',
    group_id: 'thread-research',
    task_label: 'research-pass',
    sprint_id: null,
  },
];

const sampleUsage = [
  {
    session_id: 'sess:001',
    agent_id: 'agent:coder',
    session_key: 'agent:coder:run:tracker-setup',
    model: 'openrouter/openai/gpt-4.1',
    provider: 'openrouter',
    input_tokens: 1800,
    output_tokens: 900,
    total_tokens: 2700,
    cost_total: 0.0123,
    message_id: 'msg-seed-001',
  },
  {
    session_id: 'sess:002',
    agent_id: 'agent:researcher',
    session_key: 'agent:researcher:run:research-pass',
    model: 'openrouter/deepseek/deepseek-chat',
    provider: 'openrouter',
    input_tokens: 900,
    output_tokens: 400,
    total_tokens: 1300,
    cost_total: 0.0032,
    message_id: 'msg-seed-002',
  },
];

const sampleEvents = [
  {
    session_id: 'sess:001',
    agent_id: 'agent:coder',
    session_key: 'agent:coder:run:tracker-setup',
    event_type: 'tool_call',
    event_data: JSON.stringify({ name: 'write_file' }),
    tool_name: 'write_file',
    source_event_id: 'msg-seed-001:tool-1',
  },
  {
    session_id: 'sess:002',
    agent_id: 'agent:researcher',
    session_key: 'agent:researcher:run:research-pass',
    event_type: 'tool_call',
    event_data: JSON.stringify({ name: 'web_search' }),
    tool_name: 'web_search',
    source_event_id: 'msg-seed-002:tool-1',
  },
];

function seed() {
  console.log('[Seed] Seeding database...');
  const db = new Database(DB_PATH);

  try {
    const existing = db.prepare('SELECT COUNT(*) as count FROM agents').get();
    if (existing.count > 0 && !process.argv.includes('--force')) {
      console.log('[Seed] Database already has data. Use --force to reseed.');
      return;
    }

    if (process.argv.includes('--force')) {
      db.exec('DELETE FROM activity_events');
      db.exec('DELETE FROM token_usage');
      db.exec('DELETE FROM sessions');
      db.exec('DELETE FROM agents');
      db.exec('DELETE FROM projects');
      db.exec('DELETE FROM daily_costs');
      console.log('[Seed] Existing data cleared.');
    }

    const insertAgent = db.prepare(`
      INSERT INTO agents (id, name, model)
      VALUES (@id, @name, @model)
    `);

    const insertProject = db.prepare(`
      INSERT INTO projects (name, repo_url, channel, thread_id)
      VALUES (@name, @repo_url, @channel, @thread_id)
    `);

    const insertSession = db.prepare(`
      INSERT INTO sessions (id, agent_id, session_key, channel, group_id, task_label, sprint_id)
      VALUES (@id, @agent_id, @session_key, @channel, @group_id, @task_label, @sprint_id)
    `);

    const insertUsage = db.prepare(`
      INSERT INTO token_usage (
        session_id, agent_id, session_key, model, provider,
        input_tokens, output_tokens, total_tokens,
        cache_read_tokens, cache_write_tokens,
        cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total,
        message_id
      ) VALUES (
        @session_id, @agent_id, @session_key, @model, @provider,
        @input_tokens, @output_tokens, @total_tokens,
        0, 0,
        0, 0, 0, 0, @cost_total,
        @message_id
      )
    `);

    const insertEvent = db.prepare(`
      INSERT INTO activity_events (
        session_id, agent_id, session_key, event_type, event_data, tool_name, success, source_event_id
      ) VALUES (
        @session_id, @agent_id, @session_key, @event_type, @event_data, @tool_name, 1, @source_event_id
      )
    `);

    const upsertDaily = db.prepare(`
      INSERT INTO daily_costs (
        date, model, provider, total_input_tokens, total_output_tokens, total_tokens,
        cost_input, cost_output, cost_total, request_count
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 1)
      ON CONFLICT(date, model) DO UPDATE SET
        total_input_tokens = total_input_tokens + excluded.total_input_tokens,
        total_output_tokens = total_output_tokens + excluded.total_output_tokens,
        total_tokens = total_tokens + excluded.total_tokens,
        cost_total = cost_total + excluded.cost_total,
        request_count = request_count + 1
    `);

    const tx = db.transaction(() => {
      sampleAgents.forEach(a => insertAgent.run(a));
      sampleProjects.forEach(p => insertProject.run(p));
      sampleSessions.forEach(s => insertSession.run(s));
      sampleUsage.forEach(u => {
        insertUsage.run(u);
        const day = new Date().toISOString().slice(0, 10);
        upsertDaily.run(day, u.model, u.provider, u.input_tokens, u.output_tokens, u.total_tokens, u.cost_total);
      });
      sampleEvents.forEach(e => insertEvent.run(e));
    });

    tx();
    console.log('[Seed] Complete.');
  } catch (error) {
    console.error('[Seed] Failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed };