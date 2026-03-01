/**
 * OpenClaw Tracker - Unit Tests
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Test database path
const TEST_DB = path.join(__dirname, 'test-tracker.db');

describe('Database Schema', () => {
  let db;
  
  before(() => {
    // Remove test db if exists
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    db = new Database(TEST_DB);
  });
  
  after(() => {
    if (db) db.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });
  
  test('should create agents table', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        model TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='agents'").get();
    assert.ok(result, 'agents table should exist');
  });
  
  test('should create sessions table', () => {
    db.exec(`
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
      )
    `);
    
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
    assert.ok(result, 'sessions table should exist');
  });
  
  test('should create token_usage table', () => {
    db.exec(`
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
      )
    `);
    
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='token_usage'").get();
    assert.ok(result, 'token_usage table should exist');
  });
  
  test('should create activity_events table', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        agent_id TEXT,
        session_key TEXT,
        event_type TEXT NOT NULL,
        event_data TEXT,
        tool_name TEXT,
        duration_ms INTEGER,
        success INTEGER DEFAULT 1,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id),
        FOREIGN KEY (agent_id) REFERENCES agents(id)
      )
    `);
    
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='activity_events'").get();
    assert.ok(result, 'activity_events table should exist');
  });
  
  test('should create projects table', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        repo_url TEXT,
        channel TEXT,
        thread_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
    assert.ok(result, 'projects table should exist');
  });
  
  test('should create costs table', () => {
    db.exec(`
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
        UNIQUE(date, model, provider)
      )
    `);
    
    const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='daily_costs'").get();
    assert.ok(result, 'costs table should exist');
  });
});

describe('CRUD Operations', () => {
  let db;
  
  before(() => {
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
    db = new Database(TEST_DB);
    
    // Load schema from migration file
    const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', '001_initial_schema.sql'), 'utf-8');
    db.exec(schema);
  });
  
  after(() => {
    if (db) db.close();
    if (fs.existsSync(TEST_DB)) {
      fs.unlinkSync(TEST_DB);
    }
  });
  
  test('should insert and retrieve agent', () => {
    const result = db.prepare(`
      INSERT INTO agents (id, name, model)
      VALUES (?, ?, ?)
    `).run('agent-001', 'Test Agent', 'gpt-4');
    
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get('agent-001');
    
    assert.strictEqual(agent.name, 'Test Agent');
    assert.strictEqual(agent.model, 'gpt-4');
  });
  
  test('should insert and retrieve session', () => {
    // First insert an agent
    db.prepare('INSERT INTO agents (id, name) VALUES (?, ?)').run('agent-002', 'Test Agent 2');
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get('agent-002');
    
    const result = db.prepare(`
      INSERT INTO sessions (id, agent_id, session_key, channel)
      VALUES (?, ?, ?, ?)
    `).run('sess-001', agent.id, 'sess:test', 'test-channel');
    
    const session = db.prepare('SELECT * FROM sessions WHERE session_key = ?').get('sess:test');
    
    assert.strictEqual(session.channel, 'test-channel');
  });
  
  test('should insert and retrieve activity event', () => {
    const session = db.prepare('SELECT id FROM sessions WHERE session_key = ?').get('sess:test');
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get('agent-002');
    
    const result = db.prepare(`
      INSERT INTO activity_events (session_id, agent_id, event_type, tool_name, duration_ms)
      VALUES (?, ?, ?, ?, ?)
    `).run(session.id, agent.id, 'tool_call', 'exec', 1500);
    
    const event = db.prepare('SELECT * FROM activity_events WHERE event_type = ?').get('tool_call');
    
    assert.strictEqual(event.tool_name, 'exec');
    assert.strictEqual(event.duration_ms, 1500);
  });
  
  test('should calculate token totals', () => {
    const session = db.prepare('SELECT id FROM sessions WHERE session_key = ?').get('sess:test');
    const agent = db.prepare('SELECT id FROM agents WHERE id = ?').get('agent-002');
    
    db.prepare('INSERT INTO token_usage (session_id, agent_id, session_key, model, input_tokens, output_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)').run(session.id, agent.id, 'sess:test', 'gpt-4', 100, 200, 300);
    db.prepare('INSERT INTO token_usage (session_id, agent_id, session_key, model, input_tokens, output_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?, ?)').run(session.id, agent.id, 'sess:test', 'gpt-4', 50, 100, 150);
    
    const total = db.prepare('SELECT SUM(total_tokens) as total FROM token_usage WHERE session_id = ?').get(session.id);
    
    assert.strictEqual(total.total, 450);
  });
});

console.log('Running unit tests...');