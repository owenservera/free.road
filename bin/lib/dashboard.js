/**
 * Local Observability Dashboard
 * Simple web-based dashboard for monitoring agent fleet
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = process.env.AGENT_FLEET_API || 'http://localhost:3000';
const API_HOST = new URL(API_BASE).hostname;
const API_PORT = new URL(API_BASE).port || 3000;

/**
 * Fetch data from backend API
 */
function fetchAPI(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_HOST,
      port: API_PORT,
      path: endpoint,
      method: 'GET'
    };

    http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject).end();
  });
}

/**
 * Serve the dashboard
 */
function serve(port) {
  const app = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.url === '/' || req.url === '/index.html') {
      // Serve dashboard HTML
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(DASHBOARD_HTML);

    } else if (req.url.startsWith('/api/')) {
      // Proxy API requests to backend
      const apiPath = req.url.substring(4); // Remove /api prefix

      try {
        const data = await fetchAPI(apiPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }

    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  app.listen(port, () => {
    console.log(`Dashboard running on http://localhost:${port}`);
    console.log('Press Ctrl+C to stop\n');
  });
}

/**
 * Dashboard HTML template
 */
const DASHBOARD_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Fleet Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #e6edf3;
      padding: 20px;
    }
    h1 { margin-bottom: 20px; font-size: 24px; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 16px;
    }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 16px;
    }
    .card h2 {
      font-size: 16px;
      margin-bottom: 12px;
      color: #7ee787;
    }
    .stat {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #30363d;
    }
    .stat:last-child { border-bottom: none; }
    .stat-label { color: #8b949e; }
    .stat-value { font-weight: 600; }
    .status-healthy { color: #7ee787; }
    .status-warning { color: #d29922; }
    .status-error { color: #f85149; }
    .agent-list { list-style: none; }
    .agent-item {
      padding: 8px;
      margin-bottom: 4px;
      background: #21262d;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .agent-status {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 8px;
      display: inline-block;
    }
    .agent-status.idle { background: #7ee787; }
    .agent-status.busy { background: #d29922; }
    .agent-status.error { background: #f85149; }
    .refresh-btn {
      background: #238636;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    .refresh-btn:hover { background: #2ea043; }
    canvas { max-height: 200px; }
  </style>
</head>
<body>
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
    <h1>Agent Fleet Dashboard</h1>
    <button class="refresh-btn" onclick="refreshDashboard()">Refresh</button>
  </div>

  <div class="grid">
    <!-- Fleet Status -->
    <div class="card">
      <h2>Fleet Status</h2>
      <div id="fleet-status">Loading...</div>
    </div>

    <!-- Cost Today -->
    <div class="card">
      <h2>Cost Today</h2>
      <canvas id="costChart"></canvas>
    </div>

    <!-- Agent Status -->
    <div class="card">
      <h2>Agents</h2>
      <ul class="agent-list" id="agent-list">Loading...</ul>
    </div>

    <!-- Budget Status -->
    <div class="card">
      <h2>Budget Status</h2>
      <canvas id="budgetChart"></canvas>
    </div>

    <!-- Queue Stats -->
    <div class="card">
      <h2>Task Queue</h2>
      <div id="queue-stats">Loading...</div>
    </div>

    <!-- Recent Alerts -->
    <div class="card">
      <h2>Recent Alerts</h2>
      <div id="alerts">Loading...</div>
    </div>
  </div>

  <script>
    let costChart, budgetChart;

    async function fetchData(endpoint) {
      try {
        const res = await fetch('/api' + endpoint);
        return await res.json();
      } catch (error) {
        console.error('Error fetching', endpoint, error);
        return null;
      }
    }

    async function refreshFleetStatus() {
      const data = await fetchData('/agent-fleet/status');
      const container = document.getElementById('fleet-status');

      if (!data) {
        container.innerHTML = '<div class="status-error">Error loading status</div>';
        return;
      }

      container.innerHTML = \`
        <div class="stat">
          <span class="stat-label">Status</span>
          <span class="stat-value \${data.isRunning ? 'status-healthy' : 'status-error'}">\${data.isRunning ? 'Running' : 'Stopped'}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Active Agents</span>
          <span class="stat-value">\${data.activeAgents || 0}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Total Agents</span>
          <span class="stat-value">\${data.totalAgents || 0}</span>
        </div>
      \`;
    }

    async function refreshAgentList() {
      const data = await fetchData('/agents');
      const container = document.getElementById('agent-list');

      if (!data || !Array.isArray(data)) {
        container.innerHTML = '<li>Error loading agents</li>';
        return;
      }

      if (data.length === 0) {
        container.innerHTML = '<li>No agents running</li>';
        return;
      }

      container.innerHTML = data.map(agent => \`
        <li class="agent-item">
          <span><span class="agent-status \${agent.status}"></span>\${agent.agent_type}</span>
          <span style="font-size: 12px; color: #8b949e;">\${agent.model}</span>
        </li>
      \`).join('');
    }

    async function refreshCostChart() {
      const data = await fetchData('/costs/timeline?days=1');

      if (!data || !Array.isArray(data)) return;

      const ctx = document.getElementById('costChart').getContext('2d');

      if (costChart) costChart.destroy();

      costChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: data.map(d => d.label || d.date || ''),
          datasets: [{
            label: 'Cost ($)',
            data: data.map(d => d.value || d.cost || 0),
            borderColor: '#7ee787',
            backgroundColor: 'rgba(126, 231, 135, 0.1)',
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            x: { display: false },
            y: {
              ticks: { color: '#8b949e' },
              grid: { color: '#30363d' }
            }
          }
        }
      });
    }

    async function refreshBudgetChart() {
      const data = await fetchData('/budgets/status');

      if (!data || !Array.isArray(data)) return;

      const ctx = document.getElementById('budgetChart').getContext('2d');

      if (budgetChart) budgetChart.destroy();

      budgetChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: data.map(d => d.agent_id || 'Fleet'),
          datasets: [{
            data: data.map(d => d.spent || 0),
            backgroundColor: ['#7ee787', '#d29922', '#a371f7', '#f85149', '#79c0ff']
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { color: '#8b949e', font: { size: 10 } }
            }
          }
        }
      });
    }

    async function refreshQueueStats() {
      const data = await fetchData('/tasks/stats');
      const container = document.getElementById('queue-stats');

      if (!data) {
        container.innerHTML = '<div class="status-error">Error loading stats</div>';
        return;
      }

      container.innerHTML = \`
        <div class="stat">
          <span class="stat-label">Queued</span>
          <span class="stat-value">\${data.queued || 0}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Processing</span>
          <span class="stat-value">\${data.processing || 0}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Completed</span>
          <span class="stat-value status-healthy">\${data.completed || 0}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Failed</span>
          <span class="stat-value status-error">\${data.failed || 0}</span>
        </div>
      \`;
    }

    async function refreshAlerts() {
      const data = await fetchData('/observability/alerts');
      const container = document.getElementById('alerts');

      if (!data || !Array.isArray(data)) {
        container.innerHTML = '<div>No alerts</div>';
        return;
      }

      if (data.length === 0) {
        container.innerHTML = '<div style="color: #8b949e;">No alerts</div>';
        return;
      }

      container.innerHTML = data.slice(0, 5).map(alert => \`
        <div class="stat" style="border: none; padding: 4px 0;">
          <span class="stat-label" style="font-size: 12px;">\${alert.message || alert.description}</span>
          <span class="stat-value status-\${alert.severity === 'critical' ? 'error' : 'warning'}" style="font-size: 11px;">\${alert.severity}</span>
        </div>
      \`).join('');
    }

    async function refreshDashboard() {
      await Promise.all([
        refreshFleetStatus(),
        refreshAgentList(),
        refreshCostChart(),
        refreshBudgetChart(),
        refreshQueueStats(),
        refreshAlerts()
      ]);
    }

    // Initial load
    refreshDashboard();

    // Auto-refresh every 10 seconds
    setInterval(refreshDashboard, 10000);
  </script>
</body>
</html>
`;

module.exports = { serve };
