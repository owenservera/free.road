/**
 * Cost Management Commands
 */

const { command } = require('commander');
const apiClient = require('../lib/api-client');
const formatters = require('../lib/formatters');

module.exports = new command('cost')
  .description('Cost management commands')

  // Cost summary
  .command('summary')
  .description('Show cost summary')
  .option('-p, --period <period>', 'Time period (today, week, month)', 'today')
  .action(async (opts) => {
    try {
      const costs = await apiClient.get(`/api/costs/summary?period=${opts.period}`);
      console.log('\n=== Cost Summary ===');
      formatters.table(costs);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Cost by agent
  .command('by-agent')
  .description('Cost breakdown by agent')
  .option('-p, --period <period>', 'Time period', 'today')
  .action(async (opts) => {
    try {
      const costs = await apiClient.get(`/api/costs/by-agent?period=${opts.period}`);
      console.log('\n=== Cost by Agent ===');
      formatters.table(costs);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Cost by model
  .command('by-model')
  .description('Cost breakdown by model')
  .option('-p, --period <period>', 'Time period', 'today')
  .action(async (opts) => {
    try {
      const costs = await apiClient.get(`/api/costs/by-model?period=${opts.period}`);
      console.log('\n=== Cost by Model ===');
      formatters.table(costs);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Cost timeline
  .command('timeline')
  .description('Cost timeline chart')
  .option('-d, --days <days>', 'Number of days', '7')
  .action(async (opts) => {
    try {
      const timeline = await apiClient.get(`/api/costs/timeline?days=${opts.days}`);
      console.log('\n=== Cost Timeline ===');
      formatters.chart(timeline);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Predict cost
  .command('predict')
  .description('Predict cost for task')
  .requiredOption('-t, --task <task>', 'Task type')
  .option('-a, --agent <agent>', 'Agent type')
  .action(async (opts) => {
    try {
      const prediction = await apiClient.post('/api/costs/predict', {
        task: opts.task,
        agent: opts.agent
      });
      console.log('\n=== Cost Prediction ===');
      formatters.json(prediction);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Anomalies
  .command('anomalies')
  .description('Detect cost anomalies')
  .option('-t, --threshold <threshold>', 'Anomaly threshold (0-1)', '0.5')
  .action(async (opts) => {
    try {
      const anomalies = await apiClient.get(`/api/costs/anomalies?threshold=${opts.threshold}`);
      console.log('\n=== Cost Anomalies ===');
      if (anomalies.length === 0) {
        console.log('No anomalies detected.');
      } else {
        formatters.table(anomalies);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Report
  .command('report <period>')
  .description('Generate cost report (daily, weekly, monthly)')
  .option('-f, --format <format>', 'Output format (json, csv)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .action(async (period, opts) => {
    try {
      const report = await apiClient.get(`/api/costs/report/${period}`);

      if (opts.format === 'csv') {
        const csv = formatters.csv(report);
        if (opts.output) {
          require('fs').writeFileSync(opts.output, csv);
          console.log(`Report saved to ${opts.output}`);
        } else {
          console.log(csv);
        }
      } else {
        if (opts.output) {
          require('fs').writeFileSync(opts.output, JSON.stringify(report, null, 2));
          console.log(`Report saved to ${opts.output}`);
        } else {
          console.log(JSON.stringify(report, null, 2));
        }
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Optimization suggestions
  .command('optimizations')
  .description('Get cost optimization suggestions')
  .action(async () => {
    try {
      const suggestions = await apiClient.get('/api/costs/optimization-suggestions');
      console.log('\n=== Cost Optimization Suggestions ===');
      formatters.suggestions(suggestions);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });
