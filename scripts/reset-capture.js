/**
 * Reset Capture Script
 *
 * Advances each session's JSONL pointer to the current end of file WITHOUT
 * deleting any existing data. Past logged activity is preserved.
 *
 * Use this when you want to skip re-processing old JSONL history and only
 * capture new activity going forward. Existing DB records are untouched.
 *
 * Usage: node scripts/reset-capture.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs   = require('fs');
const path = require('path');
const db   = require('../src/db/manager');

const OPENCLAW_DIR = process.env.OPENCLAW_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME, '.openclaw');
const AGENTS_DIR = path.join(OPENCLAW_DIR, 'agents');

function getLastEventIdFromJSONL(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines   = content.split('\n').filter(l => l.trim());
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const event = JSON.parse(lines[i]);
        if (event.id) return event.id;
      } catch {}
    }
    return null;
  } catch (err) {
    console.error(`  Error reading ${filePath}:`, err.message);
    return null;
  }
}

function main() {
  console.log('=== Reset Capture Pointers ===');
  console.log('Advances JSONL pointers to current end-of-file. Past DB records are kept.\n');

  db.init();

  // Step 1: Scan all agents and sessions to get current JSONL end positions
  console.log('Scanning JSONL files...');
  const pointers = [];

  if (!fs.existsSync(AGENTS_DIR)) {
    console.error('Agents directory not found:', AGENTS_DIR);
    process.exit(1);
  }

  const agentDirs = fs.readdirSync(AGENTS_DIR).filter(d => {
    try { return fs.statSync(path.join(AGENTS_DIR, d)).isDirectory(); } catch { return false; }
  });

  for (const agentId of agentDirs) {
    const sessionsFile = path.join(AGENTS_DIR, agentId, 'sessions', 'sessions.json');
    if (!fs.existsSync(sessionsFile)) continue;

    let sessions;
    try {
      sessions = JSON.parse(fs.readFileSync(sessionsFile, 'utf8'));
    } catch (err) {
      console.error(`  Error reading sessions.json for ${agentId}:`, err.message);
      continue;
    }

    for (const [sessionKey, sessionData] of Object.entries(sessions)) {
      const { sessionId, sessionFile } = sessionData;
      if (!sessionId || !sessionFile) continue;

      const filePath = sessionFile.replace(/[\\/]/g, path.sep);
      const lastEventId = getLastEventIdFromJSONL(filePath);

      if (lastEventId) {
        pointers.push({ agentId, sessionId, lastEventId, sessionKey });
        const shortKey = sessionKey.length > 40 ? '...' + sessionKey.slice(-37) : sessionKey;
        console.log(`  ${agentId} / ${shortKey}`);
        console.log(`    → pointer set to: ${lastEventId}`);
      }
    }
  }

  console.log(`\nFound ${pointers.length} sessions with JSONL data.\n`);

  // Write new JSONL pointers (existing DB records are untouched)
  console.log('Writing JSONL end-of-file pointers...');
  for (const { agentId, sessionId, lastEventId } of pointers) {
    db.setSetting(`last_event:${agentId}:${sessionId}`, lastEventId);
  }
  console.log(`  Set ${pointers.length} pointers.`);

  console.log('\nDone. Restart the tracker — new activity will be appended to existing data.');
  db.close();
}

main();
