/**
 * Budget Management Commands
 */

const { command } = require('commander');
const apiClient = require('../lib/api-client');
const formatters = require('../lib/formatters');

module.exports = new command('budget')
  .description('Budget management commands')

  // Set budget
  .command('set')
  .description('Set budget limit')
  .requiredOption('-l, --limit <amount>', 'Budget limit (USD)')
  .requiredOption('-p, --period <period>', 'Period (hourly, daily, weekly, monthly)')
  .option('-a, --agent <id>', 'Agent ID (optional, for fleet-wide budget omit)')
  .action(async (opts) => {
    try {
      await apiClient.post('/api/budgets/set', {
        agentId: opts.agent,
        limit: parseFloat(opts.limit),
        period: opts.period
      });
      const target = opts.agent ? `Agent ${opts.agent}` : 'Fleet-wide';
      console.log(`Budget set for ${target}: $${opts.limit}/${opts.period}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Get budget
  .command('get')
  .description('Get budget status')
  .option('-a, --agent <id>', 'Agent ID')
  .action(async (opts) => {
    try {
      const budget = await apiClient.get(`/api/budgets/status?agent=${opts.agent || ''}`);
      formatters.budget(budget);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Status
  .command('status')
  .description('Show all budget statuses')
  .action(async () => {
    try {
      const budgets = await apiClient.get('/api/budgets/status');
      console.log('\n=== Budget Status ===');
      formatters.table(budgets);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Alert threshold
  .command('alert-threshold')
  .description('Set alert threshold percentage')
  .requiredOption('-p, --percent <percent>', 'Alert threshold (0-100)')
  .action(async (opts) => {
    try {
      await apiClient.post('/api/budgets/alert-threshold', {
        threshold: parseFloat(opts.percent) / 100
      });
      console.log(`Alert threshold set to ${opts.percent}%`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Budget history
  .command('history')
  .description('Show budget history')
  .option('-a, --agent <id>', 'Agent ID')
  .option('-d, --days <days>', 'Number of days', '30')
  .action(async (opts) => {
    try {
      const history = await apiClient.get(`/api/budgets/history?agent=${opts.agent || ''}&days=${opts.days}`);
      console.log('\n=== Budget History ===');
      formatters.table(history);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });
