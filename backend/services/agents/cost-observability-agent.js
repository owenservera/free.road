// Cost & Observability Agent
// Monitors costs, detects anomalies, generates reports, provides insights

const BaseAgent = require('./base-agent');

class CostObservabilityAgent extends BaseAgent {
    constructor(config = {}) {
        super({
            ...config,
            agentType: 'cost_observability'
        });

        this.checkInterval = null;
        this.alertThresholds = {
            spendRateIncrease: 2.0, // Alert if spend rate increases by 2x
            lowEfficiency: 0.5,      // Alert if cost efficiency < 50%
            highFailureRate: 0.2     // Alert if failure rate > 20%
        };
    }

    async processTask(task) {
        switch (task.task_type) {
            case 'monitor_costs':
                return await this.monitorCosts(task.task_data);
            case 'detect_anomalies':
                return await this.detectAnomalies(task.task_data);
            case 'generate_report':
                return await this.generateReport(task.task_data);
            case 'suggest_optimizations':
                return await this.suggestOptimizations(task.task_data);
            case 'check_efficiency':
                return await this.checkEfficiency(task.task_data);
            default:
                throw new Error(`Unknown task type: ${task.task_type}`);
        }
    }

    async monitorCosts(data = {}) {
        const { agentId = null, period = 'hour' } = data;

        // Get cost breakdown
        const breakdown = this.budgetManager.getCostBreakdown(agentId, period);

        // Get current stats from key pool
        const poolStats = this.keyPool.getStats();

        // Calculate spend rate
        const now = Date.now();
        const periodMs = this.getPeriodMs(period);
        const spendRate = breakdown.totalCost / (periodMs / 3600000); // USD per hour

        // Log metrics
        await this.db.logObservabilityMetric(
            agentId || this.id,
            'spend_rate',
            spendRate,
            'usd_per_hour'
        );

        await this.db.logObservabilityMetric(
            agentId || this.id,
            'total_cost',
            breakdown.totalCost,
            'usd'
        );

        // Check for budget issues
        const budget = agentId ? this.db.getAgentBudget(agentId) : null;
        if (budget) {
            const utilization = budget.current_spent / budget.limit;
            await this.db.logObservabilityMetric(
                agentId,
                'budget_utilization',
                utilization,
                'percent'
            );

            if (utilization > 0.9) {
                await this.db.createObservabilityAlert(
                    'budget_high_utilization',
                    'high',
                    agentId,
                    `Budget utilization at ${Math.round(utilization * 100)}%`,
                    { utilization, spent: budget.current_spent, limit: budget.limit }
                );
            }
        }

        return {
            breakdown,
            poolStats,
            spendRate,
            inputTokens: breakdown.totalInputTokens,
            outputTokens: breakdown.totalOutputTokens,
            requestCount: breakdown.requestCount
        };
    }

    async detectAnomalies(data = {}) {
        const { agentId = null, threshold = 2.0 } = data;

        const anomalies = await this.budgetManager.detectAnomalies(agentId, threshold);

        // Create alerts for significant anomalies
        for (const anomaly of anomalies.anomalies) {
            if (anomaly.cost > anomalies.average * 1.5) {
                await this.db.createObservabilityAlert(
                    'cost_spike',
                    'high',
                    agentId,
                    `Unusual cost spike detected: $${anomaly.cost.toFixed(2)} for hour`,
                    {
                        hour: anomaly.hour,
                        cost: anomaly.cost,
                        average: anomalies.average,
                        threshold: anomalies.threshold
                    }
                );
            }
        }

        return anomalies;
    }

    async generateReport(data = {}) {
        const { period = 'day', format = 'summary' } = data;

        const summary = this.budgetManager.getCostSummary(period);
        const timeline = await this.budgetManager.getCostTimeline(null, 7);
        const anomalies = await this.detectAnomalies({ threshold: 2.0 });
        const optimizations = await this.suggestOptimizations();

        const report = {
            period,
            generatedAt: new Date().toISOString(),
            summary,
            timeline,
            anomalies,
            optimizations,
            insights: this.generateInsights(summary, anomalies, optimizations)
        };

        // Log report generation
        await this.db.logObservabilityLog(
            this.id,
            'info',
            `Generated ${period} cost report`,
            { format, cost: summary.reduce((sum, s) => sum + s.total_cost, 0) }
        );

        return report;
    }

    generateInsights(summary, anomalies, optimizations) {
        const insights = [];
        const totalCost = summary.reduce((sum, s) => sum + s.total_cost, 0);
        const totalRequests = summary.reduce((sum, s) => sum + s.request_count, 0);
        const avgCostPerRequest = totalRequests > 0 ? totalCost / totalRequests : 0;

        // Cost efficiency insight
        if (avgCostPerRequest > 1.0) {
            insights.push({
                type: 'high_cost_per_request',
                message: `Average cost per request is $${avgCostPerRequest.toFixed(2)}, consider optimizing model selection`,
                severity: 'medium'
            });
        }

        // Anomaly insights
        if (anomalies.anomalies.length > 0) {
            insights.push({
                type: 'anomalies_detected',
                message: `${anomalies.anomalies.length} cost anomalies detected in the last 24 hours`,
                severity: anomalies.anomalies.length > 3 ? 'high' : 'medium'
            });
        }

        // Optimization opportunities
        if (optimizations.length > 0) {
            const totalSavings = optimizations.reduce((sum, o) => sum + o.savings, 0);
            insights.push({
                type: 'optimization_opportunity',
                message: `${optimizations.length} optimization opportunities could save $${totalSavings.toFixed(2)}/week`,
                severity: totalSavings > 10 ? 'high' : 'low'
            });
        }

        // Model usage distribution
        const modelDistribution = {};
        for (const item of summary) {
            if (!modelDistribution[item.model]) {
                modelDistribution[item.model] = { cost: 0, requests: 0 };
            }
            modelDistribution[item.model].cost += item.total_cost;
            modelDistribution[item.model].requests += item.request_count;
        }

        // Check for expensive models
        for (const [model, stats] of Object.entries(modelDistribution)) {
            if (model.includes('opus') && stats.cost > totalCost * 0.5) {
                insights.push({
                    type: 'expensive_model_usage',
                    message: `${model} accounts for $${stats.cost.toFixed(2)} (${Math.round(stats.cost / totalCost * 100)}%) of total costs`,
                    severity: 'medium'
                });
            }
        }

        return insights;
    }

    async suggestOptimizations(data = {}) {
        const suggestions = await this.budgetManager.getOptimizationSuggestions();

        // Add additional optimization suggestions
        const poolStats = this.keyPool.getStats();

        // Check for budget optimization opportunities
        if (poolStats.totalBudgetLimit > 0) {
            const utilization = poolStats.totalSpent / poolStats.totalBudgetLimit;
            if (utilization < 0.3) {
                suggestions.push({
                    type: 'reduce_budget',
                    message: `Budget utilization is only ${Math.round(utilization * 100)}%, consider reducing budget limits`,
                    potentialSavings: poolStats.totalBudgetLimit - poolStats.totalSpent,
                    severity: 'low'
                });
            }
        }

        return suggestions;
    }

    async checkEfficiency(data = {}) {
        const { agentId = null } = data;

        const costs = agentId
            ? this.db.getAgentCosts(agentId, 'day')
            : [];

        if (costs.length === 0) {
            return { efficiency: 0, message: 'No cost data available' };
        }

        // Calculate cost efficiency (tokens per dollar)
        const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
        const totalTokens = costs.reduce((sum, c) => sum + c.input_tokens + c.output_tokens, 0);
        const efficiency = totalCost > 0 ? totalTokens / totalCost : 0; // tokens per dollar

        // Average efficiency benchmark: ~50,000 tokens per dollar for Sonnet
        const benchmark = 50000;
        const efficiencyRatio = efficiency / benchmark;

        let message = `Efficiency: ${Math.round(efficiency).toLocaleString()} tokens/$`;
        if (efficiencyRatio < 0.5) {
            message += ' (below average)';
        } else if (efficiencyRatio > 1.5) {
            message += ' (excellent)';
        } else {
            message += ' (normal)';
        }

        return {
            efficiency,
            efficiencyRatio,
            message,
            totalCost,
            totalTokens,
            requestCount: costs.length
        };
    }

    async startContinuousMonitoring() {
        if (this.checkInterval) return;

        // Run cost monitoring every 5 minutes
        this.checkInterval = setInterval(async () => {
            try {
                await this.monitorCosts({ period: 'hour' });
                await this.detectAnomalies({ threshold: 2.0 });
            } catch (error) {
                await this.db.logObservabilityLog(
                    this.id,
                    'error',
                    `Monitoring check failed: ${error.message}`
                );
            }
        }, 5 * 60 * 1000);

        await this.db.logObservabilityLog(this.id, 'info', 'Continuous monitoring started');
    }

    async stopContinuousMonitoring() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            await this.db.logObservabilityLog(this.id, 'info', 'Continuous monitoring stopped');
        }
    }

    async enforceBudget(agentId) {
        const budget = this.db.getAgentBudget(agentId);
        if (!budget) {
            return { enforced: false, reason: 'No budget configured' };
        }

        const canProceed = await this.budgetManager.canProceed(agentId, 0);

        if (!canProceed.allowed) {
            // Pause the agent
            const agent = this.agents?.get(agentId);
            if (agent) {
                await agent.terminate();
                await this.db.createObservabilityAlert(
                    'agent_paused',
                    'critical',
                    agentId,
                    `Agent paused due to budget constraint: ${canProceed.reason}`,
                    canProceed
                );
            }
        }

        return canProceed;
    }

    getPeriodMs(period) {
        const periods = {
            'minute': 60000,
            'hour': 3600000,
            'day': 86400000,
            'week': 604800000
        };
        return periods[period] || 3600000;
    }

    async terminate() {
        await this.stopContinuousMonitoring();
        await super.terminate();
    }
}

module.exports = CostObservabilityAgent;
