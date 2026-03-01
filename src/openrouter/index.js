/**
 * OpenRouter Integration Module
 * Provides API client and sync services for OpenRouter management
 */

const { OpenRouterClient } = require('./client');
const sync = require('./sync');

module.exports = {
  OpenRouterClient,
  sync,
  validateUsage: sync.validateUsage,
  runSync: sync.runSync,
  startSync: sync.startSync,
  stopSync: sync.stopSync,
  getLastValidation: sync.getLastValidation,
  getLocalTotals: sync.getLocalTotals,
};