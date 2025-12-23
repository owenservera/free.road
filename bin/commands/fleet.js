/**
 * Fleet Management Commands
 */

const { command } = require('commander');
const apiClient = require('../lib/api-client');
const formatters = require('../lib/formatters');

module.exports = new command('fleet')
  .description('Fleet management commands')

  // Start fleet
  .command('start')
  .description('Start agent fleet')
  .option('-a, --agents <agents>', 'Comma-separated list of agent types', 'code_review,documentation,repo_manager')
  .action(async (opts) => {
    try {
      const agentTypes = opts.agents.split(',').map(a => a.trim());
      await apiClient.post('/api/agent-fleet/start', { agentTypes });
      console.log(`Agent fleet started with agents: ${agentTypes.join(', ')}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Stop fleet
  .command('stop')
  .description('Stop agent fleet')
  .action(async () => {
    try {
      await apiClient.post('/api/agent-fleet/stop', {});
      console.log('Agent fleet stopped.');
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Status
  .command('status')
  .description('Fleet status')
  .action(async () => {
    try {
      const status = await apiClient.get('/api/agent-fleet/status');
      formatters.fleetStatus(status);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Restart
  .command('restart')
  .description('Restart fleet or specific agent')
  .option('-a, --agent <id>', 'Restart specific agent')
  .action(async (opts) => {
    try {
      if (opts.agent) {
        await apiClient.post(`/api/agents/${opts.agent}/restart`, {});
        console.log(`Agent ${opts.agent} restarted.`);
      } else {
        await apiClient.post('/api/agent-fleet/restart', {});
        console.log('Agent fleet restarted.');
      }
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // List agents
  .command('list')
  .description('List all agents')
  .option('-s, --status <status>', 'Filter by status')
  .option('-t, --type <type>', 'Filter by agent type')
  .action(async (opts) => {
    try {
      let url = '/api/agents';
      const params = [];
      if (opts.status) params.push(`status=${opts.status}`);
      if (opts.type) params.push(`type=${opts.type}`);
      if (params.length) url += '?' + params.join('&');

      const agents = await apiClient.get(url);
      console.log('\n=== Agents ===');
      formatters.agentsTable(agents);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Terminate agent
  .command('terminate <agentId>')
  .description('Terminate an agent')
  .option('-f, --force', 'Force terminate without waiting for tasks')
  .action(async (agentId, opts) => {
    try {
      await apiClient.post(`/api/agents/${agentId}/terminate`, { force: opts.force });
      console.log(`Agent ${agentId} terminated.`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Agent tasks
  .command('tasks <agentId>')
  .description('Show agent tasks')
  .option('-s, --status <status>', 'Filter by status')
  .action(async (agentId, opts) => {
    try {
      const tasks = await apiClient.get(`/api/agents/${agentId}/tasks?status=${opts.status || ''}`);
      console.log(`\n=== Tasks for Agent ${agentId} ===`);
      formatters.table(tasks);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  })

  // Queue tasks
  .command('queue')
  .description('Queue a task')
  .requiredOption('-t, --type <agentType>', 'Agent type')
  .requiredOption('-k, --task <taskType>', 'Task type')
  .requiredOption('-d, --data <data>', 'Task data (JSON string)')
  .option('-p, --priority <priority>', 'Priority (1-10)', '5')
  .action(async (opts) => {
    try {
      const taskData = JSON.parse(opts.data);
      const result = await apiClient.post('/api/tasks/queue', {
        agentType: opts.type,
        taskType: opts.task,
        taskData,
        priority: parseInt(opts.priority)
      });
      console.log(`Task queued: ${result.taskId}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      if (error.message.includes('JSON')) {
        console.error('Invalid JSON in --data parameter');
      }
      process.exit(1);
    }
  })

  // Queue status
  .command('queue-status')
  .description('Show task queue status')
  .action(async () => {
    try {
      const stats = await apiClient.get('/api/tasks/stats');
      formatters.queueStats(stats);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exit(1);
    }
  });
