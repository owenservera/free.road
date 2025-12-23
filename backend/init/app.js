// Main Application Entry Point
// Modular Express application

const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const config = require('../config');
const { services } = require('./services');

const middleware = require('../middleware');

const createRepositoryRoutes = require('../routes/repositories');
const createCollectionRoutes = require('../routes/collections');
const createAIRoutes = require('../routes/ai');
const createMCPRoutes = require('../routes/mcp');
const createContext7Routes = require('../routes/context7');
const createSuggestionRoutes = require('../routes/suggestions');
const createShareRoutes = require('../routes/share');
const createCommandRoutes = require('../routes/commands');
const { createMetricsRoutes } = require('../services/monitoring-service');
const { createBackupRoutes } = require('../services/backup-service');

// ============================================
// Create Express App
// ============================================

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================
// Apply Middleware
// ============================================

app.use(middleware.createCorsMiddleware(config));
app.use(middleware.createRequestIdMiddleware());

const bodyParser = middleware.createBodyParserMiddleware();
app.use(bodyParser.json);
app.use(bodyParser.urlencoded);

app.use(middleware.createLoggingMiddleware());

// ============================================
// Health Check
// ============================================

app.use(middleware.createHealthCheckMiddleware({
    database: { check: () => services.db ? 'ok' : 'error' },
    monitoring: monitoring
}));

// ============================================
// API Routes
// ============================================

// Repository Routes
app.use('/api/repositories', createRepositoryRoutes(
    services.db,
    services.repositoryService,
    services.gitSync
));

// Collection Routes
app.use('/api/collections', createCollectionRoutes(services.db));

// AI Routes
app.use('/api/ai', createAIRoutes(
    services.aiProviderService,
    services.streamingService
));

// MCP Routes
app.use('/api/mcp', createMCPRoutes(
    services.mcpPassport,
    services.mcpClient
));

// Context7 Routes
app.use('/api/context7', createContext7Routes(
    services.context7Server
));

// Suggestion Routes
app.use('/api/suggestions', createSuggestionRoutes(
    services.repoSuggester,
    services.db
));

// Share Routes
app.use('/api/share', createShareRoutes(services.shareService));

// Command Routes
app.use('/api/commands', createCommandRoutes(services.commandRegistry));

// Monitoring Routes
app.use('/api/monitoring', createMetricsRoutes(monitoring));

// Backup Routes
app.use('/api/backups', createBackupRoutes(services.backupService));

// ============================================
// Agent Fleet Routes
// ============================================

if (services.agentFleet) {
    app.get('/api/agent-fleet/status', (req, res) => {
        res.json(services.agentFleet.getStatus());
    });

    app.post('/api/agent-fleet/start', async (req, res) => {
        const { agents } = req.body;
        const result = await services.agentFleet.start(agents);
        res.json(result);
    });

    app.post('/api/agent-fleet/stop', async (req, res) => {
        const result = await services.agentFleet.stop();
        res.json(result);
    });

    app.get('/api/agents', (req, res) => {
        const agents = services.db.getAllAgents();
        res.json({ agents });
    });

    app.post('/api/agents/:id/terminate', async (req, res) => {
        try {
            await services.agentFleet.terminateAgent(req.params.id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/agents/:id/tasks', (req, res) => {
        const tasks = services.db.getAgentTasks(req.params.id);
        res.json({ tasks });
    });

    app.get('/api/costs/summary', (req, res) => {
        const { period = 'day' } = req.query;
        res.json(services.budgetManager.getCostSummary(period));
    });

    app.get('/api/costs/by-agent', (req, res) => {
        const { agentId, period = 'day' } = req.query;
        res.json(services.budgetManager.getCostBreakdown(agentId, period));
    });

    app.get('/api/costs/timeline', (req, res) => {
        const { agentId, days = 7 } = req.query;
        services.budgetManager.getCostTimeline(agentId, days).then(timeline => {
            res.json({ timeline });
        });
    });

    app.get('/api/costs/anomalies', async (req, res) => {
        const { agentId, threshold = 2.0 } = req.query;
        const anomalies = await services.budgetManager.detectAnomalies(agentId, threshold);
        res.json(anomalies);
    });

    app.get('/api/costs/optimization-suggestions', async (req, res) => {
        const suggestions = await services.budgetManager.getOptimizationSuggestions();
        res.json({ suggestions });
    });

    app.post('/api/budgets/set', async (req, res) => {
        const { agentId, poolId, limit, period, alertThreshold } = req.body;
        let budget;
        if (agentId) {
            budget = await services.budgetManager.setBudget(agentId, limit, period, alertThreshold);
        } else if (poolId) {
            budget = await services.budgetManager.setPoolBudget(poolId, limit, period, alertThreshold);
        } else {
            return res.status(400).json({ error: 'Either agentId or poolId required' });
        }
        res.json({ budget });
    });

    app.get('/api/budgets/status', (req, res) => {
        const budgets = services.db.getAllBudgets();
        res.json({ budgets });
    });

    app.get('/api/observability/metrics', (req, res) => {
        const { agentId } = req.query;
        const metrics = services.db.getObservabilityMetrics(agentId);
        res.json({ metrics });
    });

    app.get('/api/observability/logs', (req, res) => {
        const { agentId, level, limit = 100 } = req.query;
        const logs = services.db.getObservabilityLogs(agentId, level, limit);
        res.json({ logs });
    });

    app.get('/api/observability/alerts', (req, res) => {
        const alerts = services.db.getObservabilityAlerts(false);
        res.json({ alerts });
    });

    app.post('/api/observability/alerts/:id/acknowledge', async (req, res) => {
        await services.db.acknowledgeAlert(req.params.id);
        res.json({ success: true });
    });

    app.get('/api/observability/health', async (req, res) => {
        const fleetStatus = services.agentFleet.getStatus();
        const health = {
            healthy: fleetStatus.isRunning,
            agents: fleetStatus.agents.map(a => ({
                id: a.id,
                type: a.agentType,
                status: a.status,
                uptime: Date.now() - a.spawnedAt
            }))
        };
        res.json(health);
    });

    app.post('/api/tasks/queue', async (req, res) => {
        const { agentType, taskType, taskData, priority } = req.body;
        const taskId = await services.agentFleet.queueTask(agentType, taskType, taskData, priority);
        res.json({ taskId });
    });

    app.get('/api/tasks/pending', (req, res) => {
        const { limit = 50 } = req.query;
        const tasks = services.db.getPendingTasks(limit);
        res.json({ tasks });
    });

    app.post('/api/agent-fleet/share', async (req, res) => {
        try {
            const { title, isPublic, expirationHours } = req.body;
            const share = await services.agentFleet.shareSession({ title, isPublic, expirationHours });
            res.json({ success: true, share });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/agent-fleet/share', async (req, res) => {
        try {
            const currentShare = services.agentFleet.getCurrentShare();
            res.json({ share: currentShare });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.delete('/api/agent-fleet/share', async (req, res) => {
        try {
            const unshared = await services.agentFleet.unshareSession();
            res.json({ success: unshared });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/agent-fleet/messages', async (req, res) => {
        try {
            const messages = services.agentFleet.getSessionMessages();
            res.json({ messages });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.post('/api/agent-fleet/commands/:name/execute', async (req, res) => {
        try {
            const { args } = req.body;
            const result = await services.agentFleet.executeCommand(req.params.name, args || {});
            res.json({ success: true, result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    app.get('/api/agent-fleet/commands', async (req, res) => {
        try {
            const { agentType } = req.query;
            const commands = await services.agentFleet.listCommands(agentType);
            res.json({ commands });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}

// ============================================
// 404 Handler
// ============================================

app.use(middleware.createNotFoundHandler());

// ============================================
// Error Handler
// ============================================

app.use(middleware.createErrorHandlerMiddleware(logger));

// ============================================
// WebSocket Connection
// ============================================

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);

            // Handle different message types
            switch (data.type) {
                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                    break;

                case 'subscribe':
                    // Subscribe to updates
                    logger.info('WebSocket subscription', { channel: data.channel });
                    ws.send(JSON.stringify({ type: 'subscribed', channel: data.channel }));
                    break;

                case 'agent_update':
                    // Broadcast agent updates
                    if (services.agentFleet) {
                        ws.send(JSON.stringify({
                            type: 'agent_status',
                            data: services.agentFleet.getStatus()
                        }));
                    }
                    break;

                default:
                    logger.warn('Unknown WebSocket message type', { type: data.type });
            }
        } catch (error) {
            logger.error('WebSocket message error', { error: error.message });
        }
    });

    ws.on('close', () => {
        logger.debug('WebSocket connection closed');
    });

    ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message });
    });
});

// ============================================
// Start Server
// ============================================

async function startServer() {
    try {
        // Validate configuration
        const { validateConfig } = require('../config');
        validateConfig();

        // Initialize all services
        await services.initializeAll();

        // Start listening
        server.listen(config.port, config.host, () => {
            logger.info(`Finallica server started`, {
                port: config.port,
                host: config.host,
                env: config.env,
                agentFleet: config.agentFleet.enabled,
                monitoring: config.monitoring.enabled,
                backup: config.backup.enabled
            });

            console.log('\n' + '='.repeat(60));
            console.log(`  Finallica Documentation System`);
            console.log('='.repeat(60));
            console.log(`  Server: http://${config.host}:${config.port}`);
            console.log(`  Environment: ${config.env}`);
            console.log(`  Health Check: http://${config.host}:${config.port}/health`);
            console.log(`  API Docs: http://${config.host}:${config.port}/api/docs`);
            console.log(`  Metrics: http://${config.host}:${config.port}/api/monitoring/metrics`);
            console.log('='.repeat(60) + '\n');
        });

        // Graceful shutdown
        const shutdown = async (signal) => {
            logger.info(`Received ${signal}, shutting down gracefully...`);

            server.close(async () => {
                await services.shutdownAll();
                logger.info('Server shut down successfully');
                process.exit(0);
            });

            // Force shutdown after 30 seconds
            setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 30000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (error) {
        logger.error('Failed to start server', { error: error.message });
        process.exit(1);
    }
}

// ============================================
// Exports
// ============================================

module.exports = {
    app,
    server,
    wss,
    startServer
};

// Start if called directly
if (require.main === module) {
    startServer().catch(console.error);
}
