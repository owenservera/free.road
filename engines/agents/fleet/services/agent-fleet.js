const crypto = require('crypto');

class AgentFleetService {
    constructor(db, keyPool, budgetManager) {
        this.db = db;
        this.keyPool = keyPool;
        this.budgetManager = budgetManager;
        this.agents = new Map();
        this.isRunning = false;
        this.sessionId = null;
    }

    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async initialize(projectPath) {
        console.log('Agent Fleet Service initialized');
    }

    async start() {
        if (this.isRunning) {
            console.log('Agent fleet already running');
            return;
        }

        this.isRunning = true;
        this.sessionId = 'session_' + this.generateId();

        console.log('Agent Fleet started');
    }

    async stop() {
        this.isRunning = false;

        for (const [agentId, agent] of this.agents) {
            if (agent.process) {
                try {
                    await agent.stop();
                } catch (error) {
                    console.error(`Error stopping agent ${agentId}:`, error);
                }
            }
        }

        console.log('Agent Fleet stopped');
    }

    async createAgent(agentType, config = {}) {
        const agentId = this.generateId();

        const agent = {
            id: agentId,
            type: agentType,
            config,
            status: 'idle',
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        this.agents.set(agentId, agent);
        this.db.db.prepare(`
            INSERT INTO agents (
                id, type, config, status, created_at, last_activity
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            agentId,
            agentType,
            JSON.stringify(config),
            'idle',
            Math.floor(Date.now() / 1000),
            Math.floor(Date.now() / 1000)
        );

        return agent;
    }

    getAgent(agentId) {
        return this.agents.get(agentId);
    }

    getAllAgents() {
        return Array.from(this.agents.values());
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            sessionId: this.sessionId,
            agentsCount: this.agents.size,
            activeAgents: Array.from(this.agents.values()).filter(a => a.status === 'running').length
        };
    }

    async healthCheck() {
        return {
            status: this.isRunning ? 'healthy' : 'unhealthy',
            message: this.isRunning ? 'Agent Fleet is running' : 'Agent Fleet is stopped',
            sessionId: this.sessionId,
            agentsCount: this.agents.size
        };
    }
}

module.exports = AgentFleetService;
