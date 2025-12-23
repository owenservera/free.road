const { Module } = require('../../../Module');
const AgentFleetService = require('./services/agent-fleet');
const AgentScheduler = require('./services/scheduler');
const BudgetManager = require('./services/budget');
const APIKeyPool = require('./services/key-pool');
const AIProviderService = require('./services/ai-provider');
const StreamingService = require('./services/streaming');
const DevModeDetector = require('./services/dev-mode-detector');
const createAIRoutes = require('./routes/ai');

class AgentFleetModule extends Module {
    constructor(options = {}) {
        super({
            id: 'fleet',
            name: 'Agent Fleet Module',
            version: '1.0.0',
            description: 'AI agent fleet orchestration',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'agents';
    }

    async _onInitialize() {
        const db = this.context.database;

        // Initialize API Key Pool first
        const apiKeyPool = new APIKeyPool(db);
        await apiKeyPool.initialize();
        this.addService('api-key-pool', apiKeyPool);

        // Initialize Budget Manager
        const budgetManager = new BudgetManager(db, apiKeyPool);
        await budgetManager.initialize();
        this.addService('budget-manager', budgetManager);

        // Initialize AI Provider Service
        const aiProvider = new AIProviderService(db);
        this.addService('ai-provider', aiProvider);

        // Initialize Streaming Service
        const streamingService = new StreamingService(db);
        this.addService('streaming', streamingService);

        // Initialize Dev Mode Detector
        const devModeDetector = new DevModeDetector();
        this.addService('dev-mode-detector', devModeDetector);

        // Initialize Agent Fleet Service
        const agentFleet = new AgentFleetService(db, apiKeyPool, budgetManager);
        await agentFleet.initialize(process.cwd());
        this.addService('agent-fleet', agentFleet);

        // Initialize Agent Scheduler
        const scheduler = new AgentScheduler(db, apiKeyPool, budgetManager, agentFleet, {
            concurrency: parseInt(process.env.AGENT_CONCURRENT_LIMIT || '3'),
            maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3'),
            pollingInterval: parseInt(process.env.AGENT_SCHEDULER_POLLING_INTERVAL || '5000')
        });
        this.addService('scheduler', scheduler);
    }

    async _onStart() {
        // Start services in dependency order
        const streaming = this.getService('streaming');
        if (streaming) await streaming.start();

        const agentFleet = this.getService('agent-fleet');
        await agentFleet.start();

        const scheduler = this.getService('scheduler');
        await scheduler.start();

        // Create routes
        const aiProvider = this.getService('ai-provider');
        const devModeDetector = this.getService('dev-mode-detector');
        this.agentRoutes = createAIRoutes(aiProvider, streaming, devModeDetector, this.context.database);
    }

    async _onStop() {
        const scheduler = this.getService('scheduler');
        if (scheduler) {
            await scheduler.stop();
        }

        const agentFleet = this.getService('agent-fleet');
        if (agentFleet) {
            await agentFleet.stop();
        }
    }

    async _onHealthCheck(checks) {
        // Check all services
        const services = ['api-key-pool', 'budget-manager', 'ai-provider', 'streaming', 'agent-fleet', 'scheduler'];

        for (const serviceName of services) {
            const service = this.getService(serviceName);
            if (service) {
                let status = 'healthy';
                let message = `${serviceName} is running`;

                if (serviceName === 'api-key-pool' && service.health) {
                    const health = await service.health();
                    status = health.status;
                    message = health.message;
                } else if (serviceName === 'scheduler' && service.healthCheck) {
                    const health = await service.healthCheck();
                    status = health.status;
                    message = health.message;
                }

                checks.push({
                    service: serviceName,
                    status: status,
                    message: message
                });
            }
        }
    }

    getRoutes() {
        return this.agentRoutes || {};
    }
}

module.exports = AgentFleetModule;
