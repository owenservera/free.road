// Budget Manager Service
// Manages budgets for agents and API key pools with enforcement and alerts

class BudgetManager {
    constructor(db, keyPool) {
        this.db = db;
        this.keyPool = keyPool;
        this.checkInterval = 60000; // Check every minute
        this.intervalId = null;
    }

    async initialize() {
        // Set up periodic budget checks
        this.startPeriodicChecks();
    }

    startPeriodicChecks() {
        if (this.intervalId) return;

        this.intervalId = setInterval(async () => {
            await this.checkAllBudgets();
        }, this.checkInterval);
    }

    stopPeriodicChecks() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async checkAllBudgets() {
        const budgets = this.db.getAllBudgets();

        for (const budget of budgets) {
            await this.checkBudget(budget);
        }
    }

    async checkBudget(budget) {
        const now = Math.floor(Date.now() / 1000);

        // Check if period has expired
        const periodSeconds = this.getPeriodSeconds(budget.period);
        if (now - budget.period_start >= periodSeconds) {
            // Reset budget for new period
            await this.resetBudgetPeriod(budget.id);
            return;
        }

        // Check if budget exceeded
        if (budget.current_spent >= budget.limit) {
            await this.handleBudgetExceeded(budget);
        }
        // Check if alert threshold reached
        else if (budget.current_spent >= budget.limit * budget.alert_threshold && !budget.alert_sent) {
            await this.sendBudgetAlert(budget);
        }
    }

    async handleBudgetExceeded(budget) {
        // Create observability alert
        await this.db.createObservabilityAlert(
            'budget_exceeded',
            'critical',
            budget.agent_id,
            `Budget exceeded for ${budget.agent_id || 'pool'}: $${budget.current_spent.toFixed(2)} / $${budget.limit.toFixed(2)}`,
            {
                budgetId: budget.id,
                agentId: budget.agent_id,
                poolId: budget.pool_id,
                spent: budget.current_spent,
                limit: budget.limit
            }
        );

        // Log warning
        await this.db.logObservabilityLog(
            budget.agent_id,
            'error',
            `Budget exceeded: $${budget.current_spent.toFixed(2)} spent of $${budget.limit.toFixed(2)} limit`
        );
    }

    async sendBudgetAlert(budget) {
        // Create observability alert
        await this.db.createObservabilityAlert(
            'budget_warning',
            'high',
            budget.agent_id,
            `Budget threshold reached for ${budget.agent_id || 'pool'}: $${budget.current_spent.toFixed(2)} / $${budget.limit.toFixed(2)} (${Math.round(budget.current_spent / budget.limit * 100)}%)`,
            {
                budgetId: budget.id,
                agentId: budget.agent_id,
                poolId: budget.pool_id,
                spent: budget.current_spent,
                limit: budget.limit,
                threshold: budget.alert_threshold
            }
        );

        // Mark alert as sent
        const now = Math.floor(Date.now() / 1000);
        this.db.run(`
            UPDATE agent_budgets SET alert_sent = 1 WHERE id = ?
        `, [budget.id]);
        await this.db.save();

        // Log warning
        await this.db.logObservabilityLog(
            budget.agent_id,
            'warn',
            `Budget threshold reached: $${budget.current_spent.toFixed(2)} spent of $${budget.limit.toFixed(2)} limit`
        );
    }

    async resetBudgetPeriod(budgetId) {
        const now = Math.floor(Date.now() / 1000);
        this.db.run(`
            UPDATE agent_budgets
            SET current_spent = 0, alert_sent = 0, period_start = ?
            WHERE id = ?
        `, [now, budgetId]);
        await this.db.save();
    }

    getPeriodSeconds(period) {
        const periods = {
            'hourly': 3600,
            'daily': 86400,
            'weekly': 604800,
            'monthly': 2592000
        };
        return periods[period] || 86400; // Default to daily
    }

    async canProceed(agentId, estimatedCost) {
        const budget = this.db.getAgentBudget(agentId);

        if (!budget) {
            // No budget set, allow
            return { allowed: true, reason: 'No budget configured' };
        }

        const now = Math.floor(Date.now() / 1000);
        const periodSeconds = this.getPeriodSeconds(budget.period);

        // Check if period needs reset
        if (now - budget.period_start >= periodSeconds) {
            await this.resetBudgetPeriod(budget.id);
            budget.current_spent = 0;
            budget.period_start = now;
        }

        const newTotal = budget.current_spent + estimatedCost;

        if (newTotal > budget.limit) {
            await this.db.logObservabilityLog(
                agentId,
                'warn',
                `Request blocked: Would exceed budget ($${newTotal.toFixed(2)} > $${budget.limit.toFixed(2)})`
            );

            return {
                allowed: false,
                reason: 'Budget exceeded',
                current: budget.current_spent,
                estimated: estimatedCost,
                total: newTotal,
                limit: budget.limit
            };
        }

        return {
            allowed: true,
            reason: 'Within budget',
            current: budget.current_spent,
            remaining: budget.limit - budget.current_spent
        };
    }

    async setBudget(agentId, limit, period, alertThreshold = 0.8) {
        const budget = this.db.getAgentBudget(agentId);

        if (budget) {
            // Update existing budget
            this.db.run(`
                UPDATE agent_budgets
                SET limit = ?, period = ?, alert_threshold = ?, current_spent = 0, period_start = ?
                WHERE agent_id = ?
            `, [limit, period, alertThreshold, Math.floor(Date.now() / 1000), agentId]);
            await this.db.save();
        } else {
            // Create new budget
            const crypto = require('crypto');
            const budgetId = 'budget_' + crypto.randomBytes(16).toString('hex');
            await this.db.createAgentBudget({
                id: budgetId,
                agent_id: agentId,
                limit,
                period,
                alert_threshold: alertThreshold
            });
        }

        return this.db.getAgentBudget(agentId);
    }

    async setPoolBudget(poolId, limit, period, alertThreshold = 0.8) {
        const budgets = this.db.getAllBudgets();
        let budget = budgets.find(b => b.pool_id === poolId);

        if (budget) {
            this.db.run(`
                UPDATE agent_budgets
                SET limit = ?, period = ?, alert_threshold = ?, current_spent = 0, period_start = ?
                WHERE pool_id = ?
            `, [limit, period, alertThreshold, Math.floor(Date.now() / 1000), poolId]);
            await this.db.save();
        } else {
            const crypto = require('crypto');
            const budgetId = 'budget_' + crypto.randomBytes(16).toString('hex');
            await this.db.createAgentBudget({
                id: budgetId,
                pool_id: poolId,
                limit,
                period,
                alert_threshold: alertThreshold
            });
        }

        return budgets.find(b => b.pool_id === poolId);
    }

    async recordCost(agentId, cost) {
        const budget = this.db.getAgentBudget(agentId);

        if (budget) {
            await this.db.updateBudgetSpent(agentId, cost);
            await this.checkBudget({ ...budget, current_spent: budget.current_spent + cost });
        }
    }

    getCostBreakdown(agentId, period = 'day') {
        const costs = this.db.getAgentCosts(agentId, period);
        const budget = this.db.getAgentBudget(agentId);

        const breakdown = {
            byProvider: {},
            byModel: {},
            byTask: {},
            totalCost: 0,
            totalInputTokens: 0,
            totalOutputTokens: 0,
            requestCount: costs.length
        };

        for (const cost of costs) {
            // By provider
            if (!breakdown.byProvider[cost.provider]) {
                breakdown.byProvider[cost.provider] = {
                    cost: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    requests: 0
                };
            }
            breakdown.byProvider[cost.provider].cost += cost.cost;
            breakdown.byProvider[cost.provider].inputTokens += cost.input_tokens;
            breakdown.byProvider[cost.provider].outputTokens += cost.output_tokens;
            breakdown.byProvider[cost.provider].requests++;

            // By model
            if (!breakdown.byModel[cost.model]) {
                breakdown.byModel[cost.model] = {
                    cost: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    requests: 0
                };
            }
            breakdown.byModel[cost.model].cost += cost.cost;
            breakdown.byModel[cost.model].inputTokens += cost.input_tokens;
            breakdown.byModel[cost.model].outputTokens += cost.output_tokens;
            breakdown.byModel[cost.model].requests++;

            // Totals
            breakdown.totalCost += cost.cost;
            breakdown.totalInputTokens += cost.input_tokens;
            breakdown.totalOutputTokens += cost.output_tokens;
        }

        // Add budget info
        if (budget) {
            breakdown.budget = {
                limit: budget.limit,
                spent: budget.current_spent,
                remaining: budget.limit - budget.current_spent,
                period: budget.period
            };
        }

        return breakdown;
    }

    getCostSummary(period = 'day') {
        const summary = this.db.getCostSummary(period);

        // Add budget information
        const budgets = this.db.getAllBudgets();
        const budgetMap = new Map();

        for (const budget of budgets) {
            if (budget.agent_id) {
                budgetMap.set(budget.agent_id, budget);
            }
        }

        for (const item of summary) {
            const budget = budgetMap.get(item.agent_id);
            if (budget) {
                item.budgetLimit = budget.limit;
                item.budgetSpent = budget.current_spent;
                item.budgetRemaining = budget.limit - budget.current_spent;
                item.budgetPeriod = budget.period;
            }
        }

        return summary;
    }

    async getCostTimeline(agentId = null, days = 7) {
        const now = Math.floor(Date.now() / 1000);
        const daySeconds = 86400;
        const points = [];

        for (let i = days - 1; i >= 0; i--) {
            const dayStart = now - (i * daySeconds);
            const dayEnd = dayStart + daySeconds;

            // Query costs for this day
            let query = `
                SELECT
                    DATE(timestamp, 'unixepoch') as date,
                    SUM(cost) as cost,
                    SUM(input_tokens) as input_tokens,
                    SUM(output_tokens) as output_tokens,
                    COUNT(*) as requests
                FROM agent_costs
                WHERE timestamp >= ? AND timestamp < ?
            `;

            const params = [dayStart, dayEnd];

            if (agentId) {
                query += ' AND agent_id = ?';
                params.push(agentId);
            }

            query += ' GROUP BY DATE(timestamp, \'unixepoch\')';

            const stmt = this.db.db.prepare(query);
            stmt.bind(...params.map((p, i) => ({ [':p' + i]: p })));

            while (stmt.step()) {
                points.push(stmt.getAsObject());
            }
            stmt.free();
        }

        return points;
    }

    async detectAnomalies(agentId = null, threshold = 2.0) {
        // Detect spending anomalies (spending > threshold * average)
        const now = Math.floor(Date.now() / 1000);
        const hourSeconds = 3600;
        const hours = 24; // Look at last 24 hours

        const hourlyCosts = [];

        for (let i = 0; i < hours; i++) {
            const hourStart = now - (i * hourSeconds);
            const hourEnd = hourStart + hourSeconds;

            let query = `
                SELECT SUM(cost) as cost
                FROM agent_costs
                WHERE timestamp >= ? AND timestamp < ?
            `;

            const params = [hourStart, hourEnd];

            if (agentId) {
                query += ' AND agent_id = ?';
                params.push(agentId);
            }

            const stmt = this.db.db.prepare(query);
            stmt.bind(...params.map((p, i) => ({ [':p' + i]: p })));

            const result = stmt.getAsObject();
            stmt.free();

            hourlyCosts.push({
                hour: i,
                timestamp: hourStart,
                cost: result.cost || 0
            });
        }

        // Calculate average and standard deviation
        const costs = hourlyCosts.map(h => h.cost);
        const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
        const stdDev = Math.sqrt(costs.map(c => Math.pow(c - avg, 2)).reduce((a, b) => a + b, 0) / costs.length);

        // Find anomalies
        const anomalies = hourlyCosts.filter(h => h.cost > avg + (threshold * stdDev));

        return {
            average: avg,
            standardDeviation: stdDev,
            threshold: avg + (threshold * stdDev),
            anomalies: anomalies
        };
    }

    async getOptimizationSuggestions() {
        const suggestions = [];
        const costSummary = this.getCostSummary('week');

        for (const item of costSummary) {
            // Check if agent could use cheaper model
            if (item.model && item.model.includes('opus')) {
                const potentialSavings = this.calculatePotentialSavings(item, 'claude-3-5-sonnet-20241022');
                if (potentialSavings.savings > 0) {
                    suggestions.push({
                        type: 'downgrade_model',
                        agentId: item.agent_id,
                        currentModel: item.model,
                        suggestedModel: 'claude-3-5-sonnet-20241022',
                        reason: 'Consider using Sonnet instead of Opus for non-critical tasks',
                        currentCost: item.total_cost,
                        potentialCost: potentialSavings.cost,
                        savings: potentialSavings.savings,
                        savingsPercent: potentialSavings.percent
                    });
                }
            }

            // Check for high-usage agents that could benefit from Haiku
            if (item.request_count > 100 && item.model && item.model.includes('sonnet')) {
                const potentialSavings = this.calculatePotentialSavings(item, 'claude-3-5-haiku-20241022');
                if (potentialSavings.savings > 0) {
                    suggestions.push({
                        type: 'downgrade_model',
                        agentId: item.agent_id,
                        currentModel: item.model,
                        suggestedModel: 'claude-3-5-haiku-20241022',
                        reason: 'High-usage agent could use Haiku for routine tasks',
                        currentCost: item.total_cost,
                        potentialCost: potentialSavings.cost,
                        savings: potentialSavings.savings,
                        savingsPercent: potentialSavings.percent
                    });
                }
            }
        }

        return suggestions;
    }

    calculatePotentialSavings(item, newModel) {
        const currentProvider = item.provider;
        const newProvider = newModel.includes('claude') ? 'anthropic' : currentProvider;

        const currentCostPerMillion = this.keyPool.calculateCost(
            currentProvider,
            item.model,
            1_000_000,
            1_000_000
        );

        const newCostPerMillion = this.keyPool.calculateCost(
            newProvider,
            newModel,
            1_000_000,
            1_000_000
        );

        const totalTokens = item.total_input_tokens + item.total_output_tokens;
        const currentTotalCost = item.total_cost;
        const newTotalCost = (totalTokens / 1_000_000) * newCostPerMillion;
        const savings = currentTotalCost - newTotalCost;
        const percent = (savings / currentTotalCost) * 100;

        return {
            cost: newTotalCost,
            savings,
            percent
        };
    }

    async predictCost(agentId, taskType, taskData = {}) {
        const agent = this.db.getAgent(agentId);

        if (!agent) {
            // Estimate based on task type
            return this.keyPool.predictCost(taskType, taskData);
        }

        // Use historical data to predict
        const costs = this.db.getAgentCosts(agentId, 'week');

        if (costs.length === 0) {
            return this.keyPool.predictCost(agent.agent_type, taskData);
        }

        // Calculate average cost per task type
        const avgCost = costs.reduce((sum, c) => sum + c.cost, 0) / costs.length;
        const avgInput = costs.reduce((sum, c) => sum + c.input_tokens, 0) / costs.length;
        const avgOutput = costs.reduce((sum, c) => sum + c.output_tokens, 0) / costs.length;

        // Adjust based on task complexity
        const complexityMultiplier = this.estimateComplexity(taskData);
        const estimatedCost = avgCost * complexityMultiplier;

        return {
            estimatedCost,
            averageCost: avgCost,
            averageTokens: { input: avgInput, output: avgOutput },
            complexity: complexityMultiplier,
            confidence: costs.length > 10 ? 'high' : costs.length > 5 ? 'medium' : 'low'
        };
    }

    estimateComplexity(taskData) {
        // Simple heuristic based on task data
        if (!taskData || Object.keys(taskData).length === 0) {
            return 1.0;
        }

        const dataSize = JSON.stringify(taskData).length;

        if (dataSize < 1000) return 0.5;      // Small task
        if (dataSize < 5000) return 1.0;      // Medium task
        if (dataSize < 20000) return 1.5;     // Large task
        return 2.0;                           // Very large task
    }
}

module.exports = BudgetManager;
