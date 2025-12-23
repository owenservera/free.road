// Finallica Server - Engine-based Architecture
// New server using modular engine system

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { PlatformEngine } = require('./engines/PlatformEngine');
const { InfrastructureModule } = require('./engines/platform/infrastructure/index');
const { RepositoryModule } = require('./engines/platform/repository/index');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Legacy backend imports (to be migrated to modules)
const db = require('./backend/database');
const AIProviderService = require('./backend/services/ai-provider-service');
const StreamingService = require('./backend/services/streaming-service');
const createAIRoutes = require('./backend/routes/ai');
const Context7Server = require('./backend/services/context7-server');
const createContext7Routes = require('./backend/routes/context7');
const DocIndexer = require('./backend/services/doc-indexer');
const RepoSuggesterService = require('./backend/services/repo-suggester');
const createSuggestionRoutes = require('./backend/routes/suggestions');
const ShareService = require('./backend/services/share-service');
const CommandRegistry = require('./backend/services/command-registry');
const createShareRoutes = require('./backend/routes/share');
const createCommandRoutes = require('./backend/routes/commands');
const PrivacyService = require('./backend/services/privacy-service');
const MCPClient = require('./backend/services/mcp-client');
const MCPPassport = require('./backend/services/mcp-passport');
const createMCPRoutes = require('./backend/routes/mcp');
const APIKeyPool = require('./backend/services/api-key-pool');
const BudgetManager = require('./backend/services/budget-manager');
const AgentFleetService = require('./backend/services/agent-fleet-service');
const AgentScheduler = require('./backend/services/agent-scheduler');

// ============================================
// PLATFORM ENGINE INITIALIZATION
// ============================================

async function initializePlatform() {
    console.log('🚀 Initializing Platform Engine...');

    const platformEngine = new PlatformEngine({
        config: {
            infrastructure: {
                database: {
                    dbPath: './backend/data/repositories.db'
                },
                monitoring: {
                    enabled: true,
                    level: process.env.LOG_LEVEL || 'info',
                    interval: 60000
                },
                backup: {
                    enabled: process.env.BACKUP_ENABLED !== 'false',
                    interval: 3600000,
                    retentionDays: 30
                }
            }
        }
    });

    await platformEngine.initialize({
        database: db,
        logger: console
    });

    await platformEngine.start();

    console.log('✅ Platform Engine running');

    // Register modules
    const infrastructureModule = new InfrastructureModule(platformEngine.config.infrastructure);
    await infrastructureModule.initialize(platformEngine._createModuleContext(infrastructureModule));
    await platformEngine.registerModule(infrastructureModule);

    const repositoryModule = new RepositoryModule({});
    await repositoryModule.initialize(platformEngine._createModuleContext(repositoryModule));
    await platformEngine.registerModule(repositoryModule);

    // Start modules
    await infrastructureModule.start();
    await repositoryModule.start();

    console.log('✅ All modules started');

    return { platformEngine, infrastructureModule, repositoryModule };
}

// ============================================
// LEGACY SYSTEMS INITIALIZATION
// ============================================

async function initializeLegacySystems() {
    try {
        await db.initialize();
        console.log('✅ Database initialized');

        await db.runMigrations();
        console.log('✅ Database migrations completed');
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
    }

    if (process.env.AGENT_FLEET_ENABLED === 'true') {
        try {
            const apiKeyPool = new APIKeyPool(db);
            await apiKeyPool.initialize();

            const budgetManager = new BudgetManager(db, apiKeyPool);
            await budgetManager.initialize();

            const agentFleet = new AgentFleetService(db, apiKeyPool, budgetManager);
            const projectPath = process.cwd();
            await agentFleet.initialize(projectPath);

            const scheduler = new AgentScheduler(db, apiKeyPool, budgetManager, agentFleet, {
                concurrency: parseInt(process.env.AGENT_CONCURRENT_LIMIT || '3'),
                maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3'),
                pollingInterval: parseInt(process.env.AGENT_SCHEDULER_POLLING_INTERVAL || '5000')
            });

            if (process.env.AGENT_FLEET_AUTO_START === 'true') {
                await agentFleet.start();
                await scheduler.start();
            }

            console.log('✅ Agent Fleet System initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Agent Fleet:', error);
        }
    }

    if (process.env.PRIVACY_ENABLED === 'true') {
        try {
            const privacyService = new PrivacyService(db);
            await privacyService.initialize();
            console.log('✅ Privacy Service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Privacy Service:', error);
        }
    }
}

// ============================================
// ROUTE REGISTRATION
// ============================================

function registerRoutes(infrastructureModule, repositoryModule) {
    // Mount repository module routes
    const repositoryRoutes = repositoryModule.getRoutes();
    app.use('/api/repositories', repositoryRoutes);

    const collectionRoutes = repositoryModule.getCollectionRoutes();
    app.use('/api/collections', collectionRoutes);

    // Health check
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            engines: {
                platform: 'running'
            }
        });
    });

    // Agent Fleet routes (legacy)
    app.get('/api/agent-fleet/status', (req, res) => {
        const agentFleet = global.agentFleetService;
        if (agentFleet) {
            res.json(agentFleet.getStatus());
        } else {
            res.json({ status: 'not initialized' });
        }
    });

    app.post('/api/agent-fleet/start', async (req, res) => {
        const agentFleet = global.agentFleetService;
        if (!agentFleet) {
            return res.status(503).json({ error: 'Agent Fleet not initialized' });
        }

        try {
            const { agents } = req.body;
            const result = await agentFleet.start(agents);
            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // AI Chat routes (legacy)
    app.use('/api/ai', createAIRoutes(AIProviderService, StreamingService, db));

    // Context7 routes (legacy)
    app.use('/api/context7', createContext7Routes(Context7Server, DocIndexer, db));

    // Suggestions routes (legacy)
    app.use('/api/suggestions', createSuggestionRoutes(RepoSuggesterService, db));

    // Share routes (legacy)
    app.use('/api/share', createShareRoutes(ShareService, db));

    // Command routes (legacy)
    app.use('/api/commands', createCommandRoutes(CommandRegistry, db));

    // MCP routes (legacy)
    app.use('/api/mcp', createMCPRoutes(MCPClient, MCPPassport, db));

    console.log('✅ All routes registered');
}

// ============================================
// WEBSOCKET HANDLING
// ============================================

function setupWebSocket(wss) {
    wss.on('connection', (ws, req) => {
        console.log(`WebSocket connected: ${req.url}`);

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);

                switch (message.type) {
                    case 'chat':
                        handleChatMessage(ws, message);
                        break;
                    case 'sync':
                        handleSyncMessage(ws, message);
                        break;
                    case 'agent':
                        handleAgentMessage(ws, message);
                        break;
                    default:
                        console.log('Unknown message type:', message.type);
                }
            } catch (error) {
                console.error('Error processing message:', error);
            }
        });

        ws.on('close', () => {
            console.log('WebSocket disconnected');
        });

        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });
}

function handleChatMessage(ws, message) {
    const agentFleet = global.agentFleetService;
    if (agentFleet && message.streamId) {
        ws.send(JSON.stringify({
            type: 'chat_response',
            streamId: message.streamId,
            content: message.content
        }));
    }
}

function handleSyncMessage(ws, message) {
    ws.send(JSON.stringify({
        type: 'sync_update',
        repositoryId: message.repositoryId,
        status: 'processing'
    }));
}

function handleAgentMessage(ws, message) {
    ws.send(JSON.stringify({
        type: 'agent_status',
        agentId: message.agentId,
        status: message.status
    }));
}

// ============================================
// SERVER STARTUP
// ============================================

async function startServer() {
    try {
        const { platformEngine, infrastructureModule, repositoryModule } = await initializePlatform();

        await initializeLegacySystems();

        registerRoutes(infrastructureModule, repositoryModule);

        setupWebSocket(wss);

        server.listen(PORT, () => {
            console.log('='.repeat(60));
            console.log('🚀 Finallica Server Started');
            console.log('='.repeat(60));
            console.log(`  Port: ${PORT}`);
            console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`  Engine: Platform`);
            console.log('='.repeat(60));
        });

        return { server, platformEngine };
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    try {
        const platformEngine = global.platformEngine;
        if (platformEngine) {
            await platformEngine.stop();
        }

        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });

        setTimeout(() => {
            console.error('❌ Forced shutdown');
            process.exit(1);
        }, 10000);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ============================================
// START SERVER
// ============================================

if (require.main === module) {
    startServer();
}

module.exports = { app, server, startServer };
