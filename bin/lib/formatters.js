/**
 * Output Formatters for CLI
 * Various output formats: table, JSON, CSV, charts
 */

const readline = require('readline');

/**
 * Simple table formatter
 */
function table(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log('No data available.');
    return;
  }

  // Get all keys from first object
  const keys = Object.keys(data[0]);

  // Calculate column widths
  const widths = {};
  keys.forEach(key => {
    widths[key] = Math.max(
      key.length,
      ...data.map(row => String(row[key] || '').length)
    );
  });

  // Print header
  let header = '| ';
  keys.forEach(key => {
    header += key.padEnd(widths[key] + 2);
  });
  header += '|';
  console.log(header);

  // Print separator
  let separator = '+-';
  keys.forEach(key => {
    separator += '-'.repeat(widths[key] + 2) + '+';
  });
  console.log(separator);

  // Print rows
  data.forEach(row => {
    let line = '| ';
    keys.forEach(key => {
      line += String(row[key] || '').padEnd(widths[key] + 2);
    });
    line += '|';
    console.log(line);
  });

  console.log();
}

/**
 * JSON formatter
 */
function json(data) {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * CSV formatter
 */
function csv(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    return '';
  }

  const keys = Object.keys(data[0]);
  let output = keys.join(',') + '\n';

  data.forEach(row => {
    output += keys.map(key => {
      const val = row[key];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val !== undefined && val !== null ? String(val) : '';
    }).join(',') + '\n';
  });

  return output;
}

/**
 * Simple ASCII chart
 */
function chart(data) {
  if (!data || !Array.isArray(data) || data.length === 0) {
    console.log('No data to display.');
    return;
  }

  // Find max value
  const values = data.map(d => d.value || d.cost || d.count || 0);
  const max = Math.max(...values);
  const min = Math.min(...values);

  console.log();
  data.forEach((d, i) => {
    const label = d.label || d.date || d.name || String(i);
    const value = d.value || d.cost || d.count || 0;
    const normalized = max > 0 ? (value / max) : 0;
    const barLength = Math.floor(normalized * 40);

    // Color bar based on value
    const bar = '█'.repeat(barLength);

    console.log(`${label.padEnd(15)} ${bar} ${value.toFixed(2)}`);
  });
  console.log();
}

/**
 * Budget visualization
 */
function budget(budget) {
  const spent = budget.spent || 0;
  const limit = budget.limit || 1;
  const used = spent / limit;
  const barLength = 20;

  // Color codes (using simple characters for cross-platform)
  let colorChar = '█';
  let emptyChar = '░';

  const filledLength = Math.min(Math.floor(used * barLength), barLength);
  const emptyLength = barLength - filledLength;

  const bar = colorChar.repeat(filledLength) + emptyChar.repeat(emptyLength);

  console.log();
  console.log(`Budget: $${spent.toFixed(2)} / $${limit.toFixed(2)} (${(used * 100).toFixed(0)}%)`);
  console.log(`[${bar}]`);

  if (used > 0.9) {
    console.log('⚠️  Warning: Budget nearly exhausted!');
  } else if (used > 0.7) {
    console.log('⚠️  Note: Over 70% of budget used.');
  }

  console.log();
}

/**
 * Alerts display
 */
function alerts(alerts) {
  if (!alerts || alerts.length === 0) {
    console.log('No alerts.');
    return;
  }

  console.log();
  alerts.forEach((alert, i) => {
    const severity = alert.severity || 'info';
    let prefix = 'ℹ️ ';

    if (severity === 'critical') {
      prefix = '🚨 ';
    } else if (severity === 'warning') {
      prefix = '⚠️  ';
    }

    console.log(`${i + 1}. ${prefix}${severity.toUpperCase()}: ${alert.message || alert.description}`);

    if (alert.agent_id) {
      console.log(`   Agent: ${alert.agent_id}`);
    }

    if (alert.created_at) {
      const date = new Date(alert.created_at * 1000);
      console.log(`   Time: ${date.toLocaleString()}`);
    }

    console.log();
  });
}

/**
 * Health status
 */
function health(health) {
  console.log();
  console.log(`=== Fleet Health ===`);
  console.log();

  const overall = health.healthy !== false;
  console.log(`Overall: ${overall ? '✓ Healthy' : '✗ Unhealthy'}`);
  console.log();

  if (health.agents && health.agents.length > 0) {
    console.log('Agents:');
    health.agents.forEach(agent => {
      const status = agent.status || 'unknown';
      let symbol = '○';

      if (status === 'idle') {
        symbol = '✓';
      } else if (status === 'busy') {
        symbol = '◐';
      } else if (status === 'error') {
        symbol = '✗';
      }

      console.log(`  ${symbol} ${agent.type || agent.agent_type}: ${status}`);

      if (agent.current_task_id) {
        console.log(`     Task: ${agent.current_task_id}`);
      }
    });
  }

  if (health.queue !== undefined) {
    console.log();
    console.log(`Queue: ${health.queue.queued || 0} queued, ${health.queue.processing || 0} processing`);
  }

  console.log();
}

/**
 * Agent list table
 */
function agentsTable(agents) {
  if (!agents || agents.length === 0) {
    console.log('No agents found.');
    return;
  }

  console.log();
  console.log('ID'.padEnd(30) + 'Type'.padEnd(20) + 'Model'.padEnd(20) + 'Status');
  console.log('-'.repeat(85));

  agents.forEach(agent => {
    const id = agent.id || 'N/A';
    const type = agent.agent_type || 'N/A';
    const model = agent.model || 'N/A';
    const status = agent.status || 'unknown';

    console.log(
      id.substring(0, 28).padEnd(30) +
      type.padEnd(20) +
      model.substring(0, 18).padEnd(20) +
      status
    );
  });

  console.log();
}

/**
 * Fleet status
 */
function fleetStatus(status) {
  console.log();
  console.log('=== Agent Fleet Status ===');
  console.log();

  console.log(`Status: ${status.isRunning ? 'Running' : 'Stopped'}`);
  console.log(`Agents: ${status.activeAgents || 0} active, ${status.totalAgents || 0} total`);

  if (status.agents && status.agents.length > 0) {
    console.log();
    console.log('Agents:');
    status.agents.forEach(agent => {
      const symbol = agent.status === 'idle' ? '✓' : agent.status === 'busy' ? '◐' : '○';
      console.log(`  ${symbol} ${agent.agent_type} (${agent.model}): ${agent.status}`);
    });
  }

  console.log();

  if (status.queue) {
    console.log(`Queue: ${status.queue.queued || 0} tasks queued`);
  }

  if (status.costs) {
    console.log(`Costs today: $${status.costs.today?.toFixed(2) || '0.00'}`);
  }

  console.log();
}

/**
 * Queue statistics
 */
function queueStats(stats) {
  console.log();
  console.log('=== Task Queue Statistics ===');
  console.log();

  console.log(`Queued:     ${stats.queued || 0}`);
  console.log(`Processing: ${stats.processing || 0}`);
  console.log(`Completed:  ${stats.completed || 0}`);
  console.log(`Failed:     ${stats.failed || 0}`);

  if (stats.byAgentType) {
    console.log();
    console.log('By Agent Type:');
    Object.entries(stats.byAgentType).forEach(([type, counts]) => {
      console.log(`  ${type}: ${counts.queued || 0} queued, ${counts.processing || 0} processing`);
    });
  }

  console.log();
}

/**
 * Optimization suggestions
 */
function suggestions(suggestions) {
  if (!suggestions || suggestions.length === 0) {
    console.log('No optimization suggestions at this time.');
    return;
  }

  console.log();
  suggestions.forEach((s, i) => {
    console.log(`${i + 1}. ${s.description || s.title}`);

    if (s.savings) {
      console.log(`   Estimated savings: ${s.savings}`);
    }

    if (s.action) {
      console.log(`   Action: ${s.action}`);
    }

    if (s.priority) {
      console.log(`   Priority: ${s.priority}`);
    }

    console.log();
  });
}

/**
 * Efficiency report
 */
function efficiencyReport(analysis) {
  console.log();
  console.log('=== Efficiency Analysis ===');
  console.log();

  if (analysis.overall) {
    console.log(`Overall Efficiency: ${(analysis.overall * 100).toFixed(0)}%`);
    console.log();
  }

  if (analysis.byAgent) {
    console.log('By Agent:');
    Object.entries(analysis.byAgent).forEach(([agent, metrics]) => {
      console.log(`  ${agent}:`);
      console.log(`    Efficiency: ${(metrics.efficiency * 100).toFixed(0)}%`);
      console.log(`    Avg cost per task: $${metrics.avgCost?.toFixed(2) || 'N/A'}`);
      console.log(`    Tasks completed: ${metrics.tasksCompleted || 0}`);
    });
    console.log();
  }

  if (analysis.recommendations && analysis.recommendations.length > 0) {
    console.log('Recommendations:');
    analysis.recommendations.forEach((rec, i) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
    console.log();
  }
}

/**
 * Traces display
 */
function traces(traces) {
  if (!traces || traces.length === 0) {
    console.log('No traces found.');
    return;
  }

  console.log();
  traces.forEach((trace, i) => {
    console.log(`Trace ${i + 1}:`);
    console.log(`  ID: ${trace.id}`);
    console.log(`  Agent: ${trace.agent_id || 'N/A'}`);
    console.log(`  Task: ${trace.task_id || 'N/A'}`);

    if (trace.started_at) {
      const start = new Date(trace.started_at * 1000);
      console.log(`  Started: ${start.toLocaleString()}`);
    }

    if (trace.duration_ms) {
      console.log(`  Duration: ${trace.duration_ms}ms`);
    }

    if (trace.status) {
      console.log(`  Status: ${trace.status}`);
    }

    console.log();
  });
}

/**
 * Tail logs in real-time
 */
async function tailLogs(initialLogs, opts) {
  const apiClient = require('./api-client');

  // Display initial logs
  initialLogs.forEach(log => {
    console.log(`[${log.level?.toUpperCase() || 'INFO'}] ${log.message}`);
  });

  console.log('...');
  console.log('(Real-time tailing not implemented in this version)');
  console.log('Use the dashboard for real-time updates: agent-fleet obs dashboard');
}

/**
 * Interactive confirmation
 */
function confirm(suggestion) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(`Apply: ${suggestion.description}? (y/n) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

module.exports = {
  table,
  json,
  csv,
  chart,
  budget,
  alerts,
  health,
  agentsTable,
  fleetStatus,
  queueStats,
  suggestions,
  efficiencyReport,
  traces,
  tailLogs,
  confirm
};
