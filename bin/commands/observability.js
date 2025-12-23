/**
 * Observability Commands
 */

const { command } = require('commander');
const apiClient = require('../lib/api-client');
const formatters = require('../lib/formatters');

module.exports = new command('observability')
  .alias('obs')
  .description('Observability commands')

  // Metrics
  .command('metrics')
  .description('Show all metrics')
  .option('-a, --agent <id>', 'Filter by agent')
  .action(async (opts) => {
    try {
      const url = opts.agent ? `/api/observability/metrics/${opts.agent}` : '/api/observability/metrics';
      const metrics = await apiClient.get(url);
      console.log('\n=== Observability Metrics ===');
      formatters.table(metrics);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Logs
  .command('logs')
  .description('Show agent logs')
  .option('-t, --tail', 'Tail logs in real-time')
  .option('-a, --agent <id>', 'Filter by agent')
  .option('-l, --level <level>', 'Log level (debug, info, warn, error)', 'info')
  .option('-n, --lines <lines>', 'Number of lines', '50')
  .action(async (opts) => {
    try {
      const logs = await apiClient.get(`/api/observability/logs?agent=${opts.agent || ''}&level=${opts.level}&limit=${opts.lines}`);

      if (opts.tail) {
        console.log('\n=== Tailing logs (Ctrl+C to exit) ===\n');
        await formatters.tailLogs(logs, opts);
      } else {
        console.log('\n=== Agent Logs ===');
        formatters.table(logs);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Traces
  .command('traces')
  .description('Show agent traces')
  .option('-a, --agent <id>', 'Filter by agent')
  .option('-t, --task <id>', 'Filter by task ID')
  .action(async (opts) => {
    try {
      const traces = await apiClient.get(`/api/observability/traces?agent=${opts.agent || ''}&task=${opts.task || ''}`);
      console.log('\n=== Agent Traces ===');
      formatters.traces(traces);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Health
  .command('health')
  .description('Fleet health check')
  .action(async () => {
    try {
      const health = await apiClient.get('/api/observability/health');
      formatters.health(health);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Alerts
  .command('alerts')
  .description('Show alerts')
  .option('-u, --unacknowledged', 'Show only unacknowledged alerts')
  .action(async (opts) => {
    try {
      const alerts = await apiClient.get(`/api/observability/alerts?unacknowledged=${opts.unacknowledged || false}`);
      console.log('\n=== Alerts ===');
      if (alerts.length === 0) {
        console.log('No alerts.');
      } else {
        formatters.alerts(alerts);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Acknowledge alert
  .command('acknowledge <alertId>')
  .description('Acknowledge an alert')
  .action(async (alertId) => {
    try {
      await apiClient.post(`/api/observability/alerts/${alertId}/acknowledge`, {});
      console.log(`Alert ${alertId} acknowledged.`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Dashboard
  .command('dashboard')
  .description('Launch observability dashboard')
  .option('-p, --port <port>', 'Dashboard port', '3030')
  .action(async (opts) => {
    try {
      console.log(`\nLaunching dashboard on http://localhost:${opts.port}`);
      console.log('Press Ctrl+C to stop\n');
      require('../lib/dashboard').serve(opts.port);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });
