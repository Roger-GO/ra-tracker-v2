/**
 * Settings API Routes
 */

const express = require('express');
const router = express.Router();

// Get all settings
router.get('/', (req, res) => {
  try {
    const db = req.app.locals.db;
    const settings = db.prepare('SELECT * FROM settings').all();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single setting
router.get('/:key', (req, res) => {
  try {
    const db = req.app.locals.db;
    const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key);
    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json(setting);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update setting
router.put('/:key', (req, res) => {
  try {
    const db = req.app.locals.db;
    const { value, description } = req.body;
    
    const existing = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key);
    
    if (existing) {
      db.prepare(`
        UPDATE settings SET value = ?, updated_at = datetime('now')
        WHERE key = ?
      `).run(value, req.params.key);
    } else {
      db.prepare(`
        INSERT INTO settings (key, value)
        VALUES (?, ?)
      `).run(req.params.key, value);
    }
    
    const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key);
    res.json(setting);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete setting
router.delete('/:key', (req, res) => {
  try {
    const db = req.app.locals.db;
    db.prepare('DELETE FROM settings WHERE key = ?').run(req.params.key);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;