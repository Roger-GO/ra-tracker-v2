/**
 * Database Migration Runner
 * Manages SQL migrations for the ra-tracker database
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.RA_TRACKER_DB || path.join(__dirname, '..', 'src', 'data', 'ra-tracker.db');

// Ensure migrations table exists
function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// Get applied migrations
function getAppliedMigrations(db) {
  const stmt = db.prepare('SELECT name FROM migrations ORDER BY id');
  return new Set(stmt.all().map(row => row.name));
}

// Apply a migration file (idempotent: duplicate column/object errors mark as applied and continue)
function applyMigration(db, migrationFile) {
  const name = path.basename(migrationFile, '.sql');
  const sql = fs.readFileSync(migrationFile, 'utf-8');
  
  console.log(`Applying migration: ${name}`);
  
  try {
    const transaction = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
    });
    transaction();
    console.log(`✓ Applied: ${name}`);
  } catch (err) {
    const isDuplicate = /duplicate column name|already exists|UNIQUE constraint failed/i.test(err.message);
    if (isDuplicate) {
      try {
        db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)').run(name);
      } catch (_) {}
      console.log(`✓ Applied: ${name} (already partially applied, marked complete)`);
    } else {
      throw err;
    }
  }
}

// Run all pending migrations
function migrate(options = {}) {
  const { direction = 'up', migrationName = null } = options;
  
  console.log('🔄 Running migrations...');
  console.log(`Database: ${DB_PATH}\n`);
  
  // Ensure db directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  const db = new Database(DB_PATH);

  try {
    ensureMigrationsTable(db);

    // Apply base schema first so later migrations can safely reference core tables.
    const baseSchemaPath = path.join(__dirname, '001_initial_schema.sql');
    if (fs.existsSync(baseSchemaPath)) {
      const baseApplied = db.prepare('SELECT 1 FROM migrations WHERE name = ?').get('001_initial_schema');
      if (!baseApplied) {
        const baseSql = fs.readFileSync(baseSchemaPath, 'utf-8');
        db.exec(baseSql);
        db.prepare('INSERT INTO migrations (name) VALUES (?)').run('001_initial_schema');
        console.log('? Applied: 001_initial_schema');
      }
    }
    
    const migrationsDir = path.join(__dirname, 'migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found, creating...');
      fs.mkdirSync(migrationsDir, { recursive: true });
    }
    
    // Get all migration files
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    const applied = getAppliedMigrations(db);
    
    if (direction === 'up') {
      for (const file of files) {
        if (!applied.has(file.replace('.sql', ''))) {
          applyMigration(db, path.join(migrationsDir, file));
        }
      }
    } else if (direction === 'down') {
      // Rollback specific migration or last one
      if (migrationName) {
        const last = [...applied].find(m => m === migrationName);
        if (last) {
          console.log(`Rolling back: ${last}`);
          db.prepare('DELETE FROM migrations WHERE name = ?').run(last);
        }
      }
    }
    
    // Also run schema.sql if not already
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath) && !applied.has('schema')) {
      console.log('Applying base schema...');
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      db.exec(schema);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run('schema');
      console.log('✓ Applied: schema');
    }
    
    console.log('\n✅ Migrations complete!');
    
    // Log current state
    const stats = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM agents) as agents,
        (SELECT COUNT(*) FROM sessions) as sessions,
        (SELECT COUNT(*) FROM projects) as projects,
        (SELECT COUNT(*) FROM activity_events) as events
    `).get();
    
    console.log(`\nDatabase state:`);
    console.log(`  - Agents: ${stats.agents}`);
    console.log(`  - Sessions: ${stats.sessions}`);
    console.log(`  - Projects: ${stats.projects}`);
    console.log(`  - Events: ${stats.events}`);
    
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const direction = args[0] === 'rollback' ? 'down' : 'up';
  const migrationName = args[1];
  
  migrate({ direction, migrationName });
}

module.exports = { migrate, DB_PATH };