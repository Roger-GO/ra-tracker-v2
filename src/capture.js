/**
 * Token Usage Capture Module
 *
 * Reads OpenClaw JSONL session files directly for accurate token/cost data.
 *
 * Data source: ~/.openclaw/agents/{agentId}/sessions/sessions.json
 *   → Each entry points to a .jsonl file via the `sessionFile` field.
 *
 * JSONL event types we care about:
 *   - type:"model_change"   → tracks current model
 *   - type:"message"        → assistant messages contain usage + tool calls
 *     message.role === "assistant" && message.usage present → token/cost record
 *     message.content[].type === "toolCall"                 → activity event
 *
 * Deduplication: each token_usage row is keyed on message_id (the JSONL event id).
 * Progress tracking: last processed event id per session stored in settings table.
 */

const fs   = require('fs');
const path = require('path');
const db   = require('./db/manager');

const OPENCLAW_DIR = process.env.OPENCLAW_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw');
const AGENTS_DIR = path.join(OPENCLAW_DIR, 'agents');

let ioInstance = null;
function setIo(io) { ioInstance = io; }

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize model id to include "openrouter/" prefix when the provider is openrouter.
 * JSONL stores model as e.g. "moonshotai/kimi-k2.5" without the provider prefix.
 */
function normalizeModelId(model, provider) {
  if (!model) return 'unknown';
  if (model.includes('/') && model.split('/').length >= 2) {
    // Already has at least one slash — check if it already has the openrouter prefix
    if (model.startsWith('openrouter/')) return model;
    if (provider === 'openrouter') return `openrouter/${model}`;
  }
  return model;
}

/**
 * Parse task label from session key.
 * Subagent sessions spawned with a label look like:
 *   agent:coder:subagent:tracker-w1-scaffold
 *   agent:coder:run:tracker-w1-scaffold
 */
function parseTaskLabel(sessionKey) {
  const match = sessionKey.match(/^agent:[^:]+:(?:subagent|run):([^:]+)/);
  return match ? match[1] : null;
}

/**
 * Resolve the JSONL file path from the sessionFile value stored in sessions.json.
 * sessions.json stores Windows-style paths; normalise for the current OS.
 */
function resolveSessionFile(sessionFilePath) {
  if (!sessionFilePath) return null;
  // Replace both slash types with the OS separator
  return sessionFilePath.replace(/[\\/]/g, path.sep);
}

// ─── State persistence ───────────────────────────────────────────────────────

function getLastEventId(agentId, sessionId) {
  try {
    return db.getSetting(`last_event:${agentId}:${sessionId}`) || null;
  } catch {
    return null;
  }
}

function setLastEventId(agentId, sessionId, eventId) {
  try {
    db.setSetting(`last_event:${agentId}:${sessionId}`, eventId);
  } catch (err) {
    console.error('[Capture] Error saving last event id:', err.message);
  }
}

// ─── Core processing ─────────────────────────────────────────────────────────

/**
 * Process a single session: read its JSONL file and insert new records.
 */
function processSession(agentId, sessionKey, sessionData) {
  const { sessionId, sessionFile, channel, groupId, spawnedBy, spawnDepth } = sessionData;

  if (!sessionId || !sessionFile) return { newRecords: 0, errors: 0 };

  const filePath = resolveSessionFile(sessionFile);
  if (!filePath || !fs.existsSync(filePath)) return { newRecords: 0, errors: 0 };

  const results = { newRecords: 0, errors: 0 };

  try {
    // Ensure agent and session exist in DB
    db.upsertAgent(agentId, agentId, null);
    db.upsertSession(
      sessionId, agentId, sessionKey,
      channel || null,
      groupId || null,
      spawnedBy || null,
      typeof spawnDepth === 'number' ? spawnDepth : 0,
      parseTaskLabel(sessionKey),
      null
    );

    const lastEventId = getLastEventId(agentId, sessionId);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines   = content.split('\n').filter(l => l.trim());

    let foundLastEvent = !lastEventId;
    let lastProcessedId = lastEventId;
    let currentModel    = null; // updated by model_change events

    for (const line of lines) {
      let event;
      try { event = JSON.parse(line); } catch { continue; }

      // Track model changes so we have a fallback if message.model is absent
      if (event.type === 'model_change' && event.modelId) {
        currentModel = event.modelId;
      }

      // Fast-forward to first unprocessed event
      if (!foundLastEvent) {
        if (event.id === lastEventId) foundLastEvent = true;
        continue;
      }

      if (event.type !== 'message') { lastProcessedId = event.id; continue; }

      const msg = event.message;
      if (!msg || msg.role !== 'assistant') { lastProcessedId = event.id; continue; }

      // ── Token usage ────────────────────────────────────────────────────────
      if (msg.usage && msg.usage.totalTokens) {
        const model    = normalizeModelId(msg.model || currentModel, msg.provider);
        const usage    = msg.usage;
        const cost     = usage.cost || {};
        const provider = msg.provider || 'openrouter';

        // Keep agent model up-to-date
        try { db.upsertAgent(agentId, agentId, model); } catch {}

        try {
          db.insertTokenUsage({
            sessionId,
            agentId,
            sessionKey,
            model,
            provider,
            inputTokens:      usage.input      || 0,
            outputTokens:     usage.output     || 0,
            totalTokens:      usage.totalTokens,
            cacheReadTokens:  usage.cacheRead  || 0,
            cacheWriteTokens: usage.cacheWrite || 0,
            costInput:       cost.input      || 0,
            costOutput:      cost.output     || 0,
            costCacheRead:   cost.cacheRead  || 0,
            costCacheWrite:  cost.cacheWrite || 0,
            costTotal:       cost.total      || 0,
            timestamp: event.timestamp || new Date().toISOString(),
            messageId: event.id,
            parentId:  event.parentId || null,
          });

          // Daily cost aggregation (use non-negative tokens for summation)
          const day = (event.timestamp || new Date().toISOString()).slice(0, 10);
          db.updateDailyCosts(day, model, provider,
            {
              input:  Math.max(0, usage.input  || 0),
              output: usage.output || 0,
              total:  usage.totalTokens,
            },
            {
              input:  cost.input  || 0,
              output: cost.output || 0,
              total:  cost.total  || 0,
            }
          );

          results.newRecords++;

          if (ioInstance) {
            ioInstance.emit('token:created', {
              sessionId, agentId, sessionKey, model, provider,
              inputTokens:  usage.input  || 0,
              outputTokens: usage.output || 0,
              totalTokens:  usage.totalTokens,
              cost_total:   cost.total   || 0,
              timestamp:    event.timestamp,
            });
          }
        } catch (err) {
          const isDup = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
                        (err.message && err.message.includes('UNIQUE constraint failed'));
          if (!isDup) {
            results.errors++;
            console.error(`[Capture] Token insert error ${sessionKey}:`, err.message);
          }
        }
      }

      // ── Tool calls (activity events) ───────────────────────────────────────
      if (Array.isArray(msg.content)) {
        for (const item of msg.content) {
          if (item.type !== 'toolCall' || !item.name) continue;

          // source_event_id = "{message_event_id}:{tool_call_id}" for uniqueness
          const sourceEventId = `${event.id}:${item.id || item.name}`;

          try {
            db.insertActivityEvent({
              sessionId,
              agentId,
              sessionKey,
              eventType:     'tool_call',
              eventData:     JSON.stringify({ name: item.name, id: item.id, args: item.arguments }),
              toolName:      item.name,
              durationMs:    null,
              success:       true,
              sourceEventId,
              timestamp:     event.timestamp || null,
            });

            if (ioInstance) {
              ioInstance.emit('activity:created', {
                sessionId, agentId, sessionKey,
                toolName:  item.name,
                eventType: 'tool_call',
                timestamp: event.timestamp,
              });
            }
          } catch (err) {
            const isDup = err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
                          (err.message && err.message.includes('UNIQUE constraint failed'));
            if (!isDup) {
              console.error(`[Capture] Activity insert error ${sessionKey}:`, err.message);
            }
          }
        }
      }

      lastProcessedId = event.id;
    }

    if (lastProcessedId && lastProcessedId !== lastEventId) {
      setLastEventId(agentId, sessionId, lastProcessedId);
    }

  } catch (err) {
    console.error(`[Capture] Error processing session ${sessionKey}:`, err.message);
    results.errors++;
  }

  return results;
}

/**
 * Load all sessions from sessions.json for one agent.
 */
function loadSessions(agentId) {
  const file = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[Capture] Error loading sessions.json for ${agentId}:`, err.message);
    return {};
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Capture all agents and sessions once. Returns summary stats.
 */
async function captureAll() {
  const results = { sessionsChecked: 0, newRecords: 0, errors: 0 };

  if (!fs.existsSync(AGENTS_DIR)) {
    console.error('[Capture] Agents directory not found:', AGENTS_DIR);
    return results;
  }

  let agentDirs;
  try {
    agentDirs = fs.readdirSync(AGENTS_DIR).filter(d => {
      try {
        return fs.statSync(path.join(AGENTS_DIR, d)).isDirectory();
      } catch { return false; }
    });
  } catch (err) {
    console.error('[Capture] Error reading agents directory:', err.message);
    return results;
  }

  for (const agentId of agentDirs) {
    const sessions = loadSessions(agentId);
    for (const [sessionKey, sessionData] of Object.entries(sessions)) {
      results.sessionsChecked++;
      const r = processSession(agentId, sessionKey, sessionData);
      results.newRecords += r.newRecords;
      results.errors     += r.errors;
    }
  }

  return results;
}

/**
 * Run capture once then exit.
 */
async function runOnce() {
  console.log('[Capture] Starting one-time capture...');
  try {
    db.init();
    const r = await captureAll();
    console.log(`[Capture] Done. Sessions: ${r.sessionsChecked}, New: ${r.newRecords}, Errors: ${r.errors}`);
  } catch (err) {
    console.error('[Capture] Failed:', err);
  } finally {
    db.close();
  }
}

/**
 * Run capture on a repeating interval. Called by the server.
 */
function runContinuous(intervalMs = 30000) {
  console.log(`[Capture] Starting continuous capture (interval: ${intervalMs}ms)`);
  db.init();

  captureAll().then(r => {
    console.log(`[Capture] Initial: ${r.newRecords} new records, ${r.errors} errors`);
  });

  setInterval(async () => {
    const r = await captureAll();
    if (r.newRecords > 0) {
      console.log(`[Capture] New: ${r.newRecords} records`);
    }
  }, intervalMs);
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === '--once' || args[0] === '-o') {
    runOnce();
  } else {
    const interval = parseInt(args[0]) || 30000;
    runContinuous(interval);
  }
}

module.exports = {
  captureAll,
  runOnce,
  runContinuous,
  setIo,
  parseTaskLabel,
  normalizeModelId,
};
