/**
 * Optimization Commands
 */

const { command } = require('commander');
const apiClient = require('../lib/api-client');
const formatters = require('../lib/formatters');

module.exports = new command('optimize')
  .description('Cost optimization commands')

  // Suggest optimizations
  .command('suggest')
  .description('Suggest cost optimizations')
  .action(async () => {
    try {
      const suggestions = await apiClient.get('/api/costs/optimization-suggestions');
      console.log('\n=== Optimization Suggestions ===');
      formatters.suggestions(suggestions);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Apply optimizations
  .command('apply')
  .description('Apply optimization suggestions')
  .option('-i, --interactive', 'Interactive mode (confirm each)')
  .option('-a, --all', 'Apply all suggestions without confirmation')
  .option('-s, --suggestion <id>', 'Apply specific suggestion by ID')
  .action(async (opts) => {
    try {
      const suggestions = await apiClient.get('/api/costs/optimization-suggestions');

      let toApply = suggestions;

      if (opts.suggestion) {
        toApply = suggestions.filter(s => s.id === opts.suggestion);
        if (toApply.length === 0) {
          console.error(`Suggestion not found: ${opts.suggestion}`);
          process.exit(1);
        }
      }

      for (const suggestion of toApply) {
        if (opts.interactive && !opts.all) {
          const confirmed = await formatters.confirm(suggestion);
          if (!confirmed) {
            console.log(`Skipped: ${suggestion.description}`);
            continue;
          }
        }

        await apiClient.post('/api/costs/optimization-apply', { suggestion });
        console.log(`Applied: ${suggestion.description}`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Downscale agent
  .command('downscale')
  .description('Downgrade agent model to save costs')
  .requiredOption('-a, --agent <agent>', 'Agent type or ID')
  .option('-m, --model <model>', 'Target model (auto-suggest if omitted)')
  .action(async (opts) => {
    try {
      const result = await apiClient.post('/api/agents/downscale', {
        agent: opts.agent,
        model: opts.model
      });

      if (opts.model) {
        console.log(`Agent ${opts.agent} downscaled to ${opts.model}`);
      } else {
        console.log(`Agent ${opts.agent} downscaled to ${result.suggestedModel}`);
        console.log(`Estimated savings: ${result.estimatedSavings}`);
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Analyze efficiency
  .command('analyze')
  .description('Analyze agent efficiency')
  .option('-a, --agent <id>', 'Analyze specific agent')
  .option('-p, --period <period>', 'Analysis period', 'week')
  .action(async (opts) => {
    try {
      const analysis = await apiClient.post('/api/costs/efficiency-analysis', {
        agent: opts.agent,
        period: opts.period
      });

      console.log('\n=== Efficiency Analysis ===');
      formatters.efficiencyReport(analysis);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });
