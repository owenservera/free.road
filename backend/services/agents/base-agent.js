// Base Agent Class
// All agent types extend this class

const crypto = require('crypto');

// AI Providers configuration (compatible with server.js)
const AI_PROVIDERS = {
    anthropic: {
        name: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        models: {
            'claude-opus-4-20250514': { name: 'Claude Opus 4', maxTokens: 200000 },
            'claude-sonnet-4-20250514': { name: 'Claude Sonnet 4', maxTokens: 200000 },
            'claude-3-5-sonnet-20241022': { name: 'Claude 3.5 Sonnet', maxTokens: 200000 },
            'claude-3-5-haiku-20241022': { name: 'Claude 3.5 Haiku', maxTokens: 200000 }
        }
    },
    openai: {
        name: 'OpenAI GPT',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        models: {
            'gpt-4o': { name: 'GPT-4o', maxTokens: 128000 },
            'gpt-4o-mini': { name: 'GPT-4o Mini', maxTokens: 128000 }
        }
    },
    openrouter: {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        models: {
            'anthropic/claude-sonnet-4': { name: 'Claude Sonnet 4', maxTokens: 200000 }
        }
    }
};

class BaseAgent {
    constructor(config = {}) {
        this.id = config.id || 'agent_' + crypto.randomBytes(16).toString('hex');
        this.agentType = config.agentType || 'base';
        this.model = config.model || 'claude-3-5-sonnet-20241022';
        this.provider = config.provider || 'anthropic';
        this.db = config.db;
        this.keyPool = config.keyPool;
        this.budgetManager = config.budgetManager;
        this.status = 'idle';
        this.currentTask = null;
        this.spawnedAt = Date.now();
        this.lastHeartbeat = Date.now();
        this.config = config.config || {};

        // Performance metrics
        this.metrics = {
            tasksCompleted: 0,
            tasksFailed: 0,
            totalTokensUsed: 0,
            totalCost: 0
        };

        // Heartbeat interval
        this.heartbeatInterval = null;
        this.startHeartbeat();
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.lastHeartbeat = Date.now();
            this.db.updateAgent(this.id, { last_heartbeat_at: Math.floor(this.lastHeartbeat / 1000) });
        }, 30000); // Every 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    async execute(task) {
        this.status = 'busy';
        this.currentTask = task.id;
        this.db.updateAgent(this.id, {
            status: 'busy',
            current_task_id: task.id
        });

        const startTime = Date.now();

        try {
            // Check budget before proceeding
            const estimatedCost = this.estimateTaskCost(task);
            const canProceed = await this.budgetManager.canProceed(this.id, estimatedCost);

            if (!canProceed.allowed) {
                throw new Error(`Budget constraint: ${canProceed.reason}`);
            }

            // Log start
            await this.db.logObservabilityLog(this.id, 'info', `Starting task: ${task.task_type}`, {
                taskId: task.id,
                estimatedCost
            });

            // Execute task (to be implemented by subclasses)
            const result = await this.processTask(task);

            // Calculate actual cost
            const actualCost = result.cost || estimatedCost;

            // Record cost
            await this.recordCost(task.id, this.provider, this.model, result.inputTokens || 0, result.outputTokens || 0, actualCost);

            // Update metrics
            this.metrics.tasksCompleted++;
            this.metrics.totalTokensUsed += (result.inputTokens || 0) + (result.outputTokens || 0);
            this.metrics.totalCost += actualCost;

            // Log completion
            await this.db.logObservabilityMetric(this.id, 'task_duration', (Date.now() - startTime) / 1000, 'seconds');
            await this.db.logObservabilityLog(this.id, 'info', `Task completed: ${task.task_type}`, {
                taskId: task.id,
                duration: Date.now() - startTime,
                cost: actualCost
            });

            // Update task
            await this.db.updateAgentTask(task.id, {
                status: 'completed',
                result_json: result,
                completed_at: Math.floor(Date.now() / 1000)
            });

            this.status = 'idle';
            this.currentTask = null;
            this.db.updateAgent(this.id, { status: 'idle', current_task_id: null });

            return result;

        } catch (error) {
            this.metrics.tasksFailed++;

            await this.db.logObservabilityLog(this.id, 'error', `Task failed: ${error.message}`, {
                taskId: task.id,
                error: error.message,
                stack: error.stack
            });

            await this.db.updateAgentTask(task.id, {
                status: 'failed',
                error_message: error.message,
                completed_at: Math.floor(Date.now() / 1000)
            });

            this.status = 'idle';
            this.currentTask = null;
            this.db.updateAgent(this.id, { status: 'idle', current_task_id: null });

            throw error;
        }
    }

    async processTask(task) {
        // To be implemented by subclasses
        throw new Error('processTask must be implemented by subclass');
    }

    async callAI(messages, options = {}) {
        const apiKey = this.keyPool.getKeyForAgent(this.agentType, this.provider);

        if (!apiKey) {
            throw new Error(`No API key available for provider: ${this.provider}`);
        }

        const providerConfig = AI_PROVIDERS[this.provider];
        let requestBody, headers, url;

        if (this.provider === 'anthropic') {
            url = providerConfig.baseUrl;
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            };

            requestBody = {
                model: this.model,
                max_tokens: options.maxTokens || 4096,
                messages: messages
            };

        } else {
            // OpenAI-compatible format (OpenAI, OpenRouter, etc.)
            url = providerConfig.baseUrl;
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };

            if (this.provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://finallica.io';
                headers['X-Title'] = 'Finallica Agent Fleet';
            }

            requestBody = {
                model: this.model,
                messages: messages,
                max_tokens: options.maxTokens || 4096,
                temperature: options.temperature || 0.7
            };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.text();
            if (response.status === 401 || response.status === 403) {
                this.keyPool.markKeyFailed(apiKey);
            }
            throw new Error(`AI API error: ${response.status} - ${error}`);
        }

        const data = await response.json();

        let content, inputTokens, outputTokens;

        if (this.provider === 'anthropic') {
            content = data.content[0].text;
            inputTokens = data.usage?.input_tokens || 0;
            outputTokens = data.usage?.output_tokens || 0;
        } else {
            content = data.choices[0].message.content;
            inputTokens = data.usage?.prompt_tokens || 0;
            outputTokens = data.usage?.completion_tokens || 0;
        }

        return {
            content,
            inputTokens,
            outputTokens,
            model: this.model
        };
    }

    async recordCost(taskId, provider, model, inputTokens, outputTokens, cost) {
        const costId = 'cost_' + crypto.randomBytes(16).toString('hex');

        await this.db.createAgentCost({
            id: costId,
            agent_id: this.id,
            task_id: taskId,
            provider,
            model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cost
        });

        // Update budget
        await this.budgetManager.recordCost(this.id, cost);
    }

    estimateTaskCost(task) {
        return this.keyPool.predictCost(this.agentType, task.task_data);
    }

    async terminate() {
        this.stopHeartbeat();

        this.status = 'terminated';
        this.db.updateAgent(this.id, {
            status: 'terminated',
            terminated_at: Math.floor(Date.now() / 1000)
        });

        await this.db.logObservabilityLog(this.id, 'info', 'Agent terminated', {
            metrics: this.metrics
        });
    }

    getStatus() {
        return {
            id: this.id,
            agentType: this.agentType,
            model: this.model,
            provider: this.provider,
            status: this.status,
            currentTask: this.currentTask,
            spawnedAt: this.spawnedAt,
            lastHeartbeat: this.lastHeartbeat,
            metrics: this.metrics,
            config: this.config
        };
    }

    async healthCheck() {
        const now = Date.now();
        const heartbeatAge = now - this.lastHeartbeat;

        return {
            healthy: heartbeatAge < 60000, // Healthy if heartbeat within 60 seconds
            heartbeatAge,
            status: this.status,
            uptime: now - this.spawnedAt
        };
    }

    isStale() {
        const health = this.healthCheck();
        return !health.healthy;
    }
}

module.exports = BaseAgent;
