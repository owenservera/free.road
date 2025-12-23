// Agent Fleet Service
// Orchestrates the entire agent fleet - spawning, monitoring, task distribution

const crypto = require('crypto');
const BaseAgent = require('./agents/base-agent');

class AgentFleetService {
    constructor(db, keyPool, budgetManager) {
        this.db = db;
        this.keyPool = keyPool;
        this.budgetManager = budgetManager;
        this.agents = new Map();
        this.isRunning = false;
        this.sessionId = null;
        this.devModeDetector = null;
        this.scheduler = null;

        // Agent type configurations
        this.agentConfigs = {
            code_review: {
                model: 'claude-sonnet-4-20250514',
                provider: 'anthropic',
                autoStart: true
            },
            documentation: {
                model: 'claude-3-5-sonnet-20241022',
                provider: 'anthropic',
                autoStart: true
            },
            repo_manager: {
                model: 'claude-3-5-sonnet-20241022',
                provider: 'anthropic',
                autoStart: true
            },
            tooling: {
                model: 'claude-3-5-haiku-20241022',
                provider: 'anthropic',
                autoStart: true
            },
            cost_observability: {
                model: 'claude-3-5-haiku-20241022',
                provider: 'anthropic',
                autoStart: true
            },
            debugger: {
                model: 'claude-sonnet-4-20250514',
                provider: 'anthropic',
                autoStart: false // Only start when needed
            },
            governance: {
                model: 'claude-opus-4-20250514',
                provider: 'anthropic',
                autoStart: false
            },
            visualization: {
                model: 'claude-3-5-sonnet-20241022',
                provider: 'anthropic',
                autoStart: true
            }
            // Note: coordinator agent not implemented - removed from config
            // governance agent also needs implementation before use
        };
    }

    async initialize(projectPath) {
        // Initialize Dev Mode Detector
        const DevModeDetector = require('./dev-mode-detector');
        this.devModeDetector = new DevModeDetector(this.db, {
            activityThreshold: process.env.DEV_MODE_ACTIVITY_THRESHOLD || 3,
            timeWindowMinutes: process.env.DEV_MODE_WINDOW_MINUTES || 5,
            onDevModeStart: (sessionId) => this.onDevModeStart(sessionId),
            onDevModeStop: (sessionId) => this.onDevModeStop(sessionId)
        });

        await this.devModeDetector.startWatching(projectPath);

        console.log('Agent Fleet Service initialized');
    }

    async start(agentTypes = null) {
        if (this.isRunning) {
            console.log('Agent fleet already running');
            return;
        }

        this.isRunning = true;

        // Create session
        this.sessionId = 'session_' + crypto.randomBytes(16).toString('hex');
        await this.db.createAgentSession({
            id: this.sessionId,
            trigger_type: 'manual'
        });

        // Spawn agents
        const typesToStart = agentTypes || Object.keys(this.agentConfigs).filter(
            type => this.agentConfigs[type].autoStart
        );

        for (const agentType of typesToStart) {
            await this.spawnAgent(agentType);
        }

        // Start monitoring
        this.startMonitoring();

        await this.db.logObservabilityLog(null, 'info', 'Agent fleet started', {
            sessionId: this.sessionId,
            agentsSpawned: this.agents.size
        });

        console.log(`Agent Fleet started: ${this.agents.size} agents`);
        return this.getStatus();
    }

    async stop() {
        if (!this.isRunning) {
            console.log('Agent fleet not running');
            return;
        }

        // Terminate all agents
        for (const [id, agent] of this.agents) {
            await agent.terminate();
        }
        this.agents.clear();

        // Update session
        if (this.sessionId) {
            this.db.run(`
                UPDATE agent_sessions SET ended_at = ? WHERE id = ?
            `, [Math.floor(Date.now() / 1000), this.sessionId]);
            await this.db.save();
        }

        // Stop monitoring
        this.stopMonitoring();

        this.isRunning = false;

        await this.db.logObservabilityLog(null, 'info', 'Agent fleet stopped', {
            sessionId: this.sessionId
        });

        console.log('Agent Fleet stopped');
        return { success: true };
    }

    async spawnAgent(agentType, customConfig = {}) {
        const config = { ...this.agentConfigs[agentType], ...customConfig };

        const AgentClass = await this.getAgentClass(agentType);
        if (!AgentClass) {
            console.log(`Agent type ${agentType} not implemented yet, skipping`);
            return null;
        }

        const agent = new AgentClass({
            agentType,
            model: config.model,
            provider: config.provider,
            db: this.db,
            keyPool: this.keyPool,
            budgetManager: this.budgetManager,
            config
        });

        // Save to database
        await this.db.createAgent({
            id: agent.id,
            agent_type: agentType,
            model: agent.model,
            provider: agent.provider,
            config: agent.config
        });

        this.agents.set(agent.id, agent);

        await this.db.logObservabilityLog(agent.id, 'info', `Agent spawned: ${agentType}`);

        console.log(`Agent spawned: ${agentType} (${agent.id})`);
        return agent;
    }

    async getAgentClass(agentType) {
        // Dynamic import of agent classes
        try {
            switch (agentType) {
                case 'code_review':
                    const CodeReviewAgent = require('./agents/code-review-agent');
                    return CodeReviewAgent;
                case 'documentation':
                    const DocumentationAgent = require('./agents/documentation-agent');
                    return DocumentationAgent;
                case 'repo_manager':
                    const RepoManagerAgent = require('./agents/repo-manager-agent');
                    return RepoManagerAgent;
                case 'tooling':
                    const ToolingAgent = require('./agents/tooling-agent');
                    return ToolingAgent;
                case 'cost_observability':
                    const CostObservabilityAgent = require('./agents/cost-observability-agent');
                    return CostObservabilityAgent;
                case 'debugger':
                    const DebuggerAgent = require('./agents/debugger-agent');
                    return DebuggerAgent;
                case 'visualization':
                    const VisualizationAgent = require('./agents/visualization-agent');
                    return VisualizationAgent;
                default:
                    return null;
            }
        } catch (e) {
            console.log(`Agent class not found for ${agentType}: ${e.message}`);
            return null;
        }
    }

    async terminateAgent(agentId) {
        const agent = this.agents.get(agentId);
        if (!agent) {
            throw new Error('Agent not found');
        }

        await agent.terminate();
        this.agents.delete(agentId);

        console.log(`Agent terminated: ${agentId}`);
        return { success: true };
    }

    startMonitoring() {
        // Monitor agent health every 30 seconds
        this.monitorInterval = setInterval(async () => {
            await this.monitorAgents();
        }, 30000);
    }

    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }

    async monitorAgents() {
        for (const [id, agent] of this.agents) {
            const health = await agent.healthCheck();
            const status = agent.getStatus();

            if (!health.healthy) {
                await this.db.createObservabilityAlert(
                    'agent_stale',
                    'medium',
                    id,
                    `Agent ${agent.agentType} is stale (heartbeat age: ${Math.round(health.heartbeatAge / 1000)}s)`,
                    { heartbeatAge: health.heartbeatAge, uptime: health.uptime }
                );

                // Restart stale agent
                console.log(`Restarting stale agent: ${agent.agentType} (${id})`);
                await this.terminateAgent(id);
                await this.spawnAgent(agent.agentType);
            }

            // Log metrics
            await this.db.logObservabilityMetric(id, 'uptime', health.uptime / 1000, 'seconds');
        }
    }

    async onDevModeStart(sessionId) {
        console.log(`[Dev Mode Detected] Starting agent fleet - Session: ${sessionId}`);

        if (!this.isRunning) {
            await this.start();
        }
    }

    async onDevModeStop(sessionId) {
        console.log(`[Dev Mode Ended] Stopping agent fleet - Session: ${sessionId}`);

        if (this.isRunning) {
            await this.stop();
        }
    }

    async queueTask(agentType, taskType, taskData, priority = 5) {
        const taskId = 'task_' + crypto.randomBytes(16).toString('hex');

        await this.db.createAgentTask({
            id: taskId,
            agent_type: agentType,
            task_type: taskType,
            task_data: taskData,
            priority
        });

        // Try to assign to an available agent
        const agent = this.findAvailableAgent(agentType);
        if (agent) {
            this.assignTaskToAgent(agent, taskId);
        }

        return taskId;
    }

    findAvailableAgent(agentType) {
        for (const [id, agent] of this.agents) {
            if (agent.agentType === agentType && agent.status === 'idle') {
                return agent;
            }
        }
        return null;
    }

    async assignTaskToAgent(agent, taskId) {
        const task = this.db.getAgentTask(taskId);
        if (!task) {
            console.log(`Task not found: ${taskId}`);
            return;
        }

        // Update task status
        await this.db.updateAgentTask(taskId, {
            agent_id: agent.id,
            status: 'running',
            started_at: Math.floor(Date.now() / 1000)
        });

        // Execute task
        agent.execute(task).catch(error => {
            console.error(`Task execution failed for ${agent.id}:`, error.message);
        });
    }

    getStatus() {
        const agents = Array.from(this.agents.values()).map(a => a.getStatus());

        return {
            isRunning: this.isRunning,
            sessionId: this.sessionId,
            agentCount: this.agents.size,
            agents,
            uptime: this.sessionId ? Date.now() - this.agents.get(this.sessionId)?.spawnedAt : 0
        };
    }

    async getFleetMetrics() {
        const stats = {
            totalAgents: this.agents.size,
            agentsByType: {},
            agentsByStatus: {},
            totalCost: 0,
            totalTasks: 0,
            uptime: 0
        };

        for (const agent of this.agents.values()) {
            const status = agent.getStatus();

            // By type
            if (!stats.agentsByType[status.agentType]) {
                stats.agentsByType[status.agentType] = 0;
            }
            stats.agentsByType[status.agentType]++;

            // By status
            if (!stats.agentsByStatus[status.status]) {
                stats.agentsByStatus[status.status] = 0;
            }
            stats.agentsByStatus[status.status]++;

            stats.totalCost += status.metrics.totalCost;
            stats.totalTasks += status.metrics.tasksCompleted;
        }

        return stats;
    }
}

module.exports = AgentFleetService;
