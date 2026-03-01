/**
 * OpenClaw Tracker - Main Server
 * Real-time activity tracking and analytics dashboard
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const { migrate } = require('../db/migrate');
const apiV2Routes = require('./routes/api-v2');
const settingsRoutes = require('./routes/settings');
const openrouterSync = require('./openrouter/sync');
const dbManager = require('./db/manager');
const capture = require('./capture');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, '..', 'public');
function getAllowedOrigins() {
  const configured = process.env.CORS_ORIGIN;
  if (!configured || configured.trim() === '') {
    return [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];
  }
  return configured.split(',').map(s => s.trim()).filter(Boolean);
}

const allowedOrigins = getAllowedOrigins();
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS origin denied'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};


const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });

capture.setIo(io);

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(publicDir));

app.locals.db = null; // set in start() after dbManager.init()
app.locals.io = io;
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api/v2', apiV2Routes);

function requireApiKeyForSettings(req, res, next) {
  const key = process.env.RA_TRACKER_API_KEY;
  if (!key) return next();
  const supplied = req.get('x-api-key') || req.query.api_key;
  if (supplied !== key) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}
app.use('/api/settings', requireApiKeyForSettings, settingsRoutes);

// Legacy dashboard endpoints (used by index.html and dashboard.js)
app.get('/api/dashboard', (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    const todayUTC = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const sessionsToday = db.prepare(
      "SELECT COUNT(DISTINCT session_id) as count FROM token_usage WHERE date(timestamp) = ?"
    ).get(todayUTC)?.count ?? 0;
    const recentEvents = db.prepare(
      "SELECT COUNT(*) as count FROM activity_events WHERE date(timestamp) = ?"
    ).get(todayUTC)?.count ?? 0;
    const tokensResult = db.prepare(
      "SELECT COALESCE(SUM(total_tokens), 0) as total FROM token_usage WHERE date(timestamp) = ?"
    ).get(todayUTC);
    const costResult = db.prepare(
      "SELECT COALESCE(SUM(cost_total), 0) as total FROM token_usage WHERE date(timestamp) = ?"
    ).get(todayUTC);
    const recentActivityRows = db.prepare(`
      SELECT e.id, e.session_id, e.agent_id, e.event_type, e.event_data, e.tool_name, e.duration_ms, e.success, e.timestamp,
             a.name as agent_name, a.model as agent_model, s.session_key, s.task_label
      FROM activity_events e
      LEFT JOIN agents a ON e.agent_id = a.id
      LEFT JOIN sessions s ON e.session_id = s.id
      ORDER BY e.timestamp DESC LIMIT 50
    `).all();
    const recentActivity = recentActivityRows.map(e => {
      let event_action = e.tool_name || '-';
      try {
        if (e.event_data) {
          const data = typeof e.event_data === 'string' ? JSON.parse(e.event_data) : e.event_data;
          event_action = data.name || data.action || data.tool_name || e.tool_name || '-';
        }
      } catch (_) {}
      return { ...e, event_action };
    });
    res.json({
      activeSessions: sessionsToday,
      recentEvents,
      tokensToday: tokensResult?.total ?? 0,
      costToday: costResult?.total ?? 0,
      recentActivity,
    });
  } catch (err) {
    console.error('Dashboard API error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/costs/summary', (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!db) return res.status(503).json({ error: 'Database not ready' });
    const period = req.query.period || 'week';
    let startDate = new Date();
    switch (period) {
      case 'today': startDate.setHours(0, 0, 0, 0); break;
      case 'week': startDate.setDate(startDate.getDate() - 7); break;
      case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
      default: startDate = new Date(0);
    }
    const startStr = startDate.toISOString();
    const byAgent = db.prepare(`
      SELECT COALESCE(a.name, t.agent_id) as name, t.agent_id, SUM(t.cost_total) as cost, SUM(t.total_tokens) as tokens, COUNT(*) as events
      FROM token_usage t
      LEFT JOIN agents a ON t.agent_id = a.id
      WHERE t.timestamp >= ? AND t.cost_total > 0
      GROUP BY t.agent_id ORDER BY cost DESC LIMIT 20
    `).all(startStr);
    const summary = db.prepare(`
      SELECT COALESCE(SUM(cost_total), 0) as totalCost, COALESCE(SUM(total_tokens), 0) as totalTokens
      FROM token_usage WHERE timestamp >= ?
    `).get(startStr);
    res.json({
      byAgent,
      totalCost: summary?.totalCost ?? 0,
      totalTokens: summary?.totalTokens ?? 0,
      period,
    });
  } catch (err) {
    console.error('Costs summary API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// OpenRouter validation (for Cost Analytics / dashboard)
app.get('/api/openrouter/validation', async (req, res) => {
  try {
    if (req.query.refresh === '1') {
      const result = await openrouterSync.runSync();
      return res.json({
        timestamp: new Date().toISOString(),
        valid: result.valid,
        localCost: result.local.totalCost,
        openrouterUsage: result.openrouter.totalUsage,
        openrouterCredits: result.openrouter.totalCredits,
        openrouterRemaining: (result.openrouter.totalCredits || 0) - (result.openrouter.totalUsage || 0),
        baseline: result.difference.baseline,
        difference: result.difference.cost,
        differencePercent: result.difference.costPercent,
      });
    }
    const last = openrouterSync.getLastValidation();
    if (!last) return res.json({ ok: false, message: 'No OpenRouter validation yet. Set OPENROUTER_MANAGEMENT_KEY and run sync or use ?refresh=1' });
    res.json({ ok: true, ...last });
  } catch (err) {
    console.error('OpenRouter validation API error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Socket.IO for real-time updates
io.on('connection', (socket) => {
  console.log(`📡 Client connected: ${socket.id}`);
  
  socket.on('disconnect', () => {
    console.log(`📴 Client disconnected: ${socket.id}`);
  });
  
  // Handle subscription to specific event types
  socket.on('subscribe', (channel) => {
    socket.join(channel);
    console.log(`📥 Client ${socket.id} subscribed to: ${channel}`);
  });
});

// Dashboard route
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

function start() {
  console.log('🔧 Initializing database...');
  migrate();
  dbManager.init();
  app.locals.db = dbManager.getDb();

  server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   OpenClaw Tracker v1.0.0                            ║
║   Dashboard: http://localhost:${PORT}                  ║
║   API:        http://localhost:${PORT}/api/v2          ║
╚══════════════════════════════════════════════════════╝
    `);
    // Token + activity capture so dashboard updates in real time
    capture.runContinuous(30000);
    if (process.env.OPENROUTER_SYNC_ENABLED === 'true' && process.env.OPENROUTER_MANAGEMENT_KEY) {
      const interval = parseInt(process.env.OPENROUTER_SYNC_INTERVAL_MS, 10) || 3600000;
      openrouterSync.startSync({
        managementKey: process.env.OPENROUTER_MANAGEMENT_KEY,
        checkIntervalMs: interval,
      });
    }
  });
}

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  try { openrouterSync.stopSync(); } catch (_) {}
  try { dbManager.close(); } catch (_) {}
  server.close(() => process.exit(0));
});

if (require.main === module) {
  start();
}

module.exports = { app, server, io };