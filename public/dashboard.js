/**
 * Dashboard JavaScript - Navigation, Data Loading, Theme, Real-time Updates
 */

const API_BASE = '';
let currentView = 'overview';
let refreshInterval = null;
let socket = null;

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initTheme();
  initSocket();
  loadView('overview');
  
  // Auto-refresh every 30 seconds
  refreshInterval = setInterval(() => {
    refreshCurrentView();
  }, 30000);
});

// ============================================================================
// Navigation
// ============================================================================

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const view = item.dataset.view;
      navigateTo(view);
    });
  });
  
  // Handle browser back/forward
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1) || 'overview';
    if (hash && hash !== currentView) {
      navigateTo(hash, false);
    }
  });
  
  // Check initial hash
  if (window.location.hash) {
    const hash = window.location.hash.slice(1);
    if (hash) {
      navigateTo(hash, false);
      return;
    }
  }
}

function navigateTo(view, updateHash = true) {
  // Update nav items
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });
  
  // Update views
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === `view-${view}`);
  });
  
  // Update title
  const titles = {
    overview: 'Overview',
    costs: 'Costs',
    agents: 'Agents',
    activity: 'Activity',
    query: 'Query'
  };
  document.getElementById('pageTitle').textContent = titles[view] || 'Dashboard';
  
  currentView = view;
  
  if (updateHash) {
    window.location.hash = view;
  }
  
  // Load data for the view
  loadView(view);
  
  // Close sidebar on mobile
  if (window.innerWidth < 769) {
    closeSidebar();
  }
}

function loadView(view) {
  switch (view) {
    case 'overview':
      loadOverview();
      break;
    case 'costs':
      loadCosts();
      break;
    case 'agents':
      loadAgents();
      break;
    case 'activity':
      loadActivity();
      break;
    case 'query':
      // Query loads on demand
      break;
  }
}

function refreshCurrentView() {
  const refreshBtn = document.querySelector('.refresh-btn');
  refreshBtn.classList.add('loading');
  
  loadView(currentView);
  
  setTimeout(() => {
    refreshBtn.classList.remove('loading');
  }, 500);
}

// ============================================================================
// Theme
// ============================================================================

function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setTheme(savedTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
}

// ============================================================================
// Sidebar (Mobile)
// ============================================================================

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('open');
  
  // Create overlay if needed
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
  }
  
  overlay.classList.toggle('open', sidebar.classList.contains('open'));
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.remove('open');
  
  const overlay = document.querySelector('.sidebar-overlay');
  if (overlay) {
    overlay.classList.remove('open');
  }
}

// ============================================================================
// Socket.IO Connection
// ============================================================================

function initSocket() {
  if (typeof io === 'undefined') {
    updateConnectionStatus('disconnected', 'Socket.IO not loaded');
    return;
  }
  
  socket = io();
  
  socket.on('connect', () => {
    updateConnectionStatus('connected', 'Connected');
  });
  
  socket.on('disconnect', () => {
    updateConnectionStatus('disconnected', 'Disconnected');
  });
  
  socket.on('connect_error', () => {
    updateConnectionStatus('error', 'Connection error');
  });
  
  // Listen for real-time events
  socket.on('event:created', () => {
    if (currentView === 'overview' || currentView === 'activity') {
      refreshCurrentView();
    }
  });
  
  socket.on('session:created', () => {
    if (currentView === 'overview') {
      refreshCurrentView();
    }
  });
  
  socket.on('cost:updated', () => {
    if (currentView === 'overview' || currentView === 'costs') {
      refreshCurrentView();
    }
  });
}

function updateConnectionStatus(status, text) {
  const dot = document.getElementById('connectionDot');
  const textEl = document.getElementById('connectionText');
  
  dot.className = 'status-dot ' + status;
  textEl.textContent = text;
}

// ============================================================================
// API Helpers
// ============================================================================

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

async function postJSON(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || `HTTP ${response.status}`);
  }
  return response.json();
}

// ============================================================================
// Overview View
// ============================================================================

async function loadOverview() {
  try {
    const [stats, summary] = await Promise.all([
      fetchJSON(`${API_BASE}/api/dashboard`),
      fetchJSON(`${API_BASE}/api/costs/summary`)
    ]);
    
    // Update stats cards
    document.getElementById('activeSessions').textContent = stats.activeSessions;
    document.getElementById('recentEvents').textContent = stats.recentEvents;
    document.getElementById('tokensToday').textContent = formatNumber(stats.tokensToday);
    document.getElementById('costToday').textContent = formatCurrency(stats.costToday);
    
    // Update cost by agent chart
    const costContainer = document.getElementById('costByAgent');
    if (summary.byAgent && summary.byAgent.length > 0) {
      const maxCost = Math.max(...summary.byAgent.map(a => a.cost), 1);
      costContainer.innerHTML = summary.byAgent.map(agent => `
        <div class="chart-row">
          <div class="chart-label">${escapeHtml(agent.name || agent.agent_key)}</div>
          <div class="chart-bar-container">
            <div class="chart-bar" style="width: ${(agent.cost / maxCost * 100)}%"></div>
          </div>
          <div class="chart-value">${formatCurrency(agent.cost)}</div>
        </div>
      `).join('');
    } else {
      costContainer.innerHTML = '<div class="empty-state">No cost data</div>';
    }
    
    // Update activity timeline
    const timelineContainer = document.getElementById('activityTimeline');
    if (stats.recentActivity && stats.recentActivity.length > 0) {
      timelineContainer.innerHTML = `
        <div class="timeline">
          ${stats.recentActivity.slice(0, 8).map(event => {
            let details = '';
            try {
              if (event.event_data) {
                const data = typeof event.event_data === 'string' ? JSON.parse(event.event_data) : event.event_data;
                details = data.action || data.tool_name || '-';
              } else {
                details = event.tool_name || event.event_type || '-';
              }
            } catch (e) {
              details = event.event_type || '-';
            }
            return `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-title">${escapeHtml(event.agent_name || event.agent_key || 'System')}</span>
                  <span class="timeline-time">${formatTime(event.timestamp)}</span>
                </div>
                <div class="timeline-details">
                  ${escapeHtml(details)} • ${event.duration_ms ? formatDuration(event.duration_ms) : '-'} • ${event.event_type || ''}
                </div>
              </div>
            </div>
          `}).join('')}
        </div>
      `;
    } else {
      timelineContainer.innerHTML = '<div class="empty-state">No recent activity</div>';
    }
    
    document.getElementById('lastUpdated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
    
  } catch (error) {
    console.error('Failed to load overview:', error);
    showError('overview', error.message);
  }
}

// ============================================================================
// Costs View
// ============================================================================

async function loadCosts() {
  try {
    const period = document.getElementById('costPeriod').value;
    const groupBy = document.getElementById('costGroupBy').value;
    
    const [summary, breakdown] = await Promise.all([
      fetchJSON(`${API_BASE}/api/costs/summary?period=${period}`),
      fetchJSON(`${API_BASE}/api/v2/costs?period=${period}&group_by=${groupBy}&limit=20`)
    ]);
    
    // Update summary cards
    document.getElementById('totalCost').textContent = formatCurrency(summary.totalCost || 0);
    document.getElementById('avgCost').textContent = formatCurrency(summary.avgDailyCost || 0);
    document.getElementById('totalTokens').textContent = formatNumber(summary.totalTokens || 0);
    
    // Update table
    const tbody = document.getElementById('costTableBody');
    const totalCost = breakdown.data?.reduce((sum, item) => sum + item.cost, 0) || 0;
    
    if (breakdown.data && breakdown.data.length > 0) {
      tbody.innerHTML = breakdown.data.map(item => `
        <tr>
          <td>${escapeHtml(item.name || item.key)}</td>
          <td>${formatNumber(item.tokens)}</td>
          <td>${formatCurrency(item.cost)}</td>
          <td>${totalCost > 0 ? (item.cost / totalCost * 100).toFixed(1) : 0}%</td>
        </tr>
      `).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No cost data</td></tr>';
    }
    
    // Update table header
    const headers = { agent: 'Agent', day: 'Date', project: 'Project' };
    document.getElementById('costTableKey').textContent = headers[groupBy] || 'Name';
    
  } catch (error) {
    console.error('Failed to load costs:', error);
    showError('costs', error.message);
  }
}

// ============================================================================
// Agents View
// ============================================================================

let allAgents = [];

async function loadAgents() {
  try {
    const response = await fetchJSON(`${API_BASE}/api/v2/agents?limit=100`);
    allAgents = response.data || [];
    renderAgents(allAgents);
  } catch (error) {
    console.error('Failed to load agents:', error);
    showError('agents', error.message);
  }
}

function renderAgents(agents) {
  const container = document.getElementById('agentsGrid');
  
  if (agents.length === 0) {
    container.innerHTML = '<div class="empty-state">No agents found</div>';
    return;
  }
  
  container.innerHTML = agents.map(agent => `
    <div class="agent-card" data-name="${escapeHtml(agent.name || agent.agent_key)}">
      <div class="agent-header">
        <div class="agent-avatar">🤖</div>
        <div>
          <div class="agent-name">${escapeHtml(agent.name || agent.agent_key)}</div>
          <div class="agent-key">${escapeHtml(agent.agent_key || '')}</div>
        </div>
      </div>
      <div class="agent-stats">
        <div class="agent-stat">
          <div class="agent-stat-value">${formatNumber(agent.total_events || 0)}</div>
          <div class="agent-stat-label">Events</div>
        </div>
        <div class="agent-stat">
          <div class="agent-stat-value">${formatCurrency(agent.total_cost || 0)}</div>
          <div class="agent-stat-label">Total Cost</div>
        </div>
        <div class="agent-stat">
          <div class="agent-stat-value">${formatNumber(agent.total_tokens || 0)}</div>
          <div class="agent-stat-label">Tokens</div>
        </div>
        <div class="agent-stat">
          <div class="agent-stat-value">${formatDuration(agent.avg_duration_ms)}</div>
          <div class="agent-stat-label">Avg Duration</div>
        </div>
      </div>
    </div>
  `).join('');
}

function filterAgents() {
  const search = document.getElementById('agentSearch').value.toLowerCase();
  const filtered = allAgents.filter(agent => {
    const name = (agent.name || agent.agent_key || '').toLowerCase();
    return name.includes(search);
  });
  renderAgents(filtered);
}

// ============================================================================
// Activity View
// ============================================================================

let activityCursor = null;
let activityHasMore = false;

async function loadActivity() {
  try {
    const typeFilter = document.getElementById('activityTypeFilter').value;
    const timeFilter = document.getElementById('activityTimeFilter').value;
    
    const params = new URLSearchParams({
      limit: '50',
      time_range: timeFilter
    });
    
    if (typeFilter) {
      params.append('event_type', typeFilter);
    }
    
    if (activityCursor) {
      params.append('cursor', activityCursor);
    }
    
    const response = await fetchJSON(`${API_BASE}/api/v2/activity?${params}`);
    
    activityCursor = response.pagination?.next_cursor;
    activityHasMore = !!activityCursor;
    
    const tbody = document.getElementById('activityTableBody');
    
    if (response.data && response.data.length > 0) {
      const html = response.data.map(event => {
        let action = '-';
        try {
          if (event.event_data) {
            const data = typeof event.event_data === 'string' ? JSON.parse(event.event_data) : event.event_data;
            action = data.action || data.tool_name || event.event_type || '-';
          } else {
            action = event.tool_name || event.event_type || '-';
          }
        } catch (e) {
          action = event.tool_name || event.event_type || '-';
        }
        
        return `
        <tr>
          <td class="timestamp">${formatTime(event.timestamp)}</td>
          <td>${escapeHtml(event.agent_name || '-')}</td>
          <td><span class="event-type ${event.event_type}">${event.event_type}</span></td>
          <td>${escapeHtml(action)}</td>
          <td class="duration">${formatDuration(event.duration_ms)}</td>
          <td>${formatNumber(event.tokens_used || 0)}</td>
          <td>${formatCurrency(event.cost_usd || 0)}</td>
        </tr>
      `}).join('');
      
      if (activityCursor === null) {
        tbody.innerHTML = html;
      } else {
        tbody.innerHTML += html;
      }
    } else if (activityCursor === null) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No activity found</td></tr>';
    }
    
    updateActivityPagination();
    
  } catch (error) {
    console.error('Failed to load activity:', error);
    showError('activity', error.message);
  }
}

function loadMoreActivity() {
  if (activityHasMore) {
    loadActivity();
  }
}

function updateActivityPagination() {
  const pagination = document.getElementById('activityPagination');
  
  if (!activityHasMore) {
    pagination.innerHTML = '';
    return;
  }
  
  pagination.innerHTML = `
    <button onclick="loadMoreActivity()">Load More</button>
    <span class="page-info">Showing more available</span>
  `;
}

// ============================================================================
// Query View
// ============================================================================

function setQuery(text) {
  document.getElementById('queryInput').value = text;
}

async function runQuery() {
  const input = document.getElementById('queryInput').value.trim();
  const resultsContainer = document.getElementById('queryResults');
  
  if (!input) {
    return;
  }
  
  resultsContainer.innerHTML = '<div class="loading">Processing query...</div>';
  
  try {
    const response = await postJSON(`${API_BASE}/api/v2/query`, { query: input });
    
    if (response.results && response.results.length > 0) {
      resultsContainer.innerHTML = `
        <div class="query-results-list">
          ${response.results.map(result => `
            <div class="query-result-item">
              <span class="query-result-label">${escapeHtml(result.label || result.name || 'Result')}</span>
              <span class="query-result-value">${escapeHtml(formatQueryValue(result.value))}</span>
            </div>
          `).join('')}
        </div>
        ${response.sql ? `<div class="query-sql"><pre>${escapeHtml(response.sql)}</pre></div>` : ''}
      `;
    } else if (response.data && response.data.length > 0) {
      resultsContainer.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              ${Object.keys(response.data[0]).map(k => `<th>${escapeHtml(k)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${response.data.slice(0, 20).map(row => `
              <tr>
                ${Object.values(row).map(v => `<td>${escapeHtml(String(v))}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      resultsContainer.innerHTML = '<div class="empty-state">No results found</div>';
    }
    
  } catch (error) {
    console.error('Query failed:', error);
    resultsContainer.innerHTML = `<div class="empty-state" style="color: var(--error)">Error: ${escapeHtml(error.message)}</div>`;
  }
}

function formatQueryValue(value) {
  if (typeof value === 'number') {
    if (value > 1000) {
      return formatNumber(value);
    }
    if (value < 1) {
      return value.toFixed(4);
    }
    return value.toLocaleString();
  }
  return value;
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

function formatCurrency(num) {
  if (num === null || num === undefined) return '$0.00';
  return '$' + num.toFixed(4);
}

function formatDuration(ms) {
  if (!ms) return '-';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showError(view, message) {
  const viewEl = document.getElementById(`view-${view}`);
  if (viewEl) {
    const errorHtml = `<div class="empty-state" style="color: var(--error)">Error: ${escapeHtml(message)}</div>`;
    
    // Find the main container in this view
    const container = viewEl.querySelector('.stats-grid, .card-body, .agents-grid');
    if (container) {
      container.innerHTML = errorHtml;
    }
  }
}

// Allow pressing Enter in query input
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey && currentView === 'query') {
    runQuery();
  }
});
