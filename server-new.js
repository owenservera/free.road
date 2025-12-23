// Finallica Server - Engine-based Architecture
// Complete modular engine system

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');

// Import all engines
const PlatformEngine = require('./engines/PlatformEngine');
const ContentEngine = require('./engines/content/ContentEngine');
const AgentEngine = require('./engines/agents/AgentEngine');
const CollaborationEngine = require('./engines/collaboration/CollaborationEngine');
const GovernanceEngine = require('./engines/governance/GovernanceEngine');

const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Store engines globally for access across modules
global.engines = {};

// ============================================
// DATABASE INITIALIZATION
// ============================================

async function initializeDatabase() {
    const db = require('./backend/database');
    try {
        await db.initialize();
        console.log('✅ Database initialized');
        await db.runMigrations();
        console.log('✅ Database migrations completed');
        return db;
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        throw error;
    }
}

// ============================================
// ENGINES INITIALIZATION
// ============================================

async function initializeEngines(db) {
    console.log('🚀 Initializing Finallica Engines...');

    // 1. Platform Engine - Core infrastructure
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
    await platformEngine.initialize({ database: db, logger: console });
    await platformEngine.start();
    global.engines.platform = platformEngine;
    console.log('✅ Platform Engine initialized');

    // 2. Content Engine - Documentation and search
    const contentEngine = new ContentEngine({
        config: {
            documentation: {
                docPath: path.join(process.cwd(), '../docs/finallica'),
                context7Port: 31338
            },
            search: {
                enabled: true
            }
        }
    });
    await contentEngine.initialize({ database: db, logger: console });
    await contentEngine.start();
    global.engines.content = contentEngine;
    console.log('✅ Content Engine initialized');

    // 3. Agent Engine - AI agent fleet
    if (process.env.AGENT_FLEET_ENABLED === 'true') {
        const agentEngine = new AgentEngine({
            config: {
                fleet: {
                    autoStart: process.env.AGENT_FLEET_AUTO_START === 'true',
                    concurrency: parseInt(process.env.AGENT_CONCURRENT_LIMIT || '3'),
                    maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3'),
                    pollingInterval: parseInt(process.env.AGENT_SCHEDULER_POLLING_INTERVAL || '5000')
                }
            }
        });
        await agentEngine.initialize({ database: db, logger: console });
        await agentEngine.start();
        global.engines.agents = agentEngine;
        console.log('✅ Agent Engine initialized');
    } else {
        console.log('⏭️  Agent Engine disabled (AGENT_FLEET_ENABLED=false)');
    }

    // 4. Collaboration Engine - Sharing and commands
    const collaborationEngine = new CollaborationEngine({
        config: {
            sharing: {
                enabled: true
            }
        }
    });
    await collaborationEngine.initialize({ database: db, logger: console });
    await collaborationEngine.start();
    global.engines.collaboration = collaborationEngine;
    console.log('✅ Collaboration Engine initialized');

    // 5. Governance Engine - Privacy and governance
    if (process.env.PRIVACY_ENABLED === 'true') {
        const governanceEngine = new GovernanceEngine({
            config: {
                privacy: {
                    rpcUrl: process.env.RPC_URL,
                    privacyRouterAddress: process.env.PRIVACY_ROUTER_ADDRESS,
                    relayerUrl: process.env.PRIVACY_RELAYER_URL
                }
            }
        });
        await governanceEngine.initialize({ database: db, logger: console });
        await governanceEngine.start();
        global.engines.governance = governanceEngine;
        console.log('✅ Governance Engine initialized');
    } else {
        console.log('⏭️  Governance Engine disabled (PRIVACY_ENABLED=false)');
    }

    console.log('✅ All engines initialized successfully');

    return { platformEngine, contentEngine, agentEngine: global.engines.agents, collaborationEngine, governanceEngine: global.engines.governance };
}

// ============================================
// ROUTE REGISTRATION
// ============================================

function registerRoutes() {
    // Platform Engine routes
    const platformEngine = global.engines.platform;
    if (platformEngine) {
        const repositoryModule = platformEngine.getModule('repository');
        if (repositoryModule) {
            const repoRoutes = repositoryModule.getRoutes();
            if (repoRoutes) {
                app.use('/api/repositories', repoRoutes);
            }
            if (repositoryModule.getCollectionRoutes) {
                const collectionRoutes = repositoryModule.getCollectionRoutes();
                if (collectionRoutes) {
                    app.use('/api/collections', collectionRoutes);
                }
            }
        }

        // Infrastructure routes
        const infrastructureModule = platformEngine.getModule('infrastructure');
        if (infrastructureModule && infrastructureModule.getRoutes) {
            const infraRoutes = infrastructureModule.getRoutes();
            if (infraRoutes) {
                app.use('/api/infrastructure', infraRoutes);
            }
        }
    }

    // Content Engine routes
    const contentEngine = global.engines.content;
    if (contentEngine) {
        // Documentation module routes (Context7 + MCP)
        const docModule = contentEngine.getModule('documentation');
        if (docModule) {
            const docRoutes = docModule.getRoutes();
            if (docRoutes) {
                app.use('/api/context7', docRoutes);
            }
        }

        // Search module routes
        const searchModule = contentEngine.getModule('search');
        if (searchModule) {
            const searchRoutes = searchModule.getRoutes();
            if (searchRoutes) {
                app.use('/api/suggestions', searchRoutes);
            }
        }
    }

    // Agent Engine routes
    const agentEngine = global.engines.agents;
    if (agentEngine) {
        const fleetModule = agentEngine.getModule('fleet');
        if (fleetModule) {
            const agentRoutes = fleetModule.getRoutes();
            if (agentRoutes) {
                app.use('/api/ai', agentRoutes);
            }
        }
    }

    // Collaboration Engine routes
    const collaborationEngine = global.engines.collaboration;
    if (collaborationEngine) {
        const sharingModule = collaborationEngine.getModule('sharing');
        if (sharingModule) {
            const shareRoutes = sharingModule.getRoutes();
            if (shareRoutes) {
                // The sharing module returns a combined router with both share and command routes
                app.use('/api/share', shareRoutes);
                app.use('/api/commands', shareRoutes);
            }
        }
    }

    // Health check endpoint
    app.get('/health', async (req, res) => {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            engines: {}
        };

        for (const [name, engine] of Object.entries(global.engines)) {
            if (engine && engine.getHealth) {
                try {
                    const engineHealth = await engine.getHealth();
                    health.engines[name] = {
                        status: engineHealth.status || 'running',
                        state: engineHealth.state || 'unknown',
                        modules: engineHealth.modules ? Array.from(engineHealth.modules) : []
                    };
                } catch (error) {
                    health.engines[name] = { status: 'error', message: error.message };
                }
            }
        }

        res.json(health);
    });

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
    const agentEngine = global.engines.agents;
    if (agentEngine) {
        const fleetModule = agentEngine.getModule('fleet');
        if (fleetModule) {
            const streaming = fleetModule.getService('streaming');
            if (streaming && message.streamId) {
                ws.send(JSON.stringify({
                    type: 'chat_response',
                    streamId: message.streamId,
                    content: message.content
                }));
            }
        }
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
        // Initialize database first
        const db = await initializeDatabase();

        // Initialize all engines
        await initializeEngines(db);

        // Register routes from all engines
        registerRoutes();

        // Setup WebSocket
        setupWebSocket(wss);

        // Start server
        server.listen(PORT, () => {
            console.log('='.repeat(60));
            console.log('🚀 Finallica Server Started');
            console.log('='.repeat(60));
            console.log(`  Port: ${PORT}`);
            console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`  Engines: ${Object.keys(global.engines).join(', ')}`);
            console.log('='.repeat(60));
        });

        return { server, db };
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
        // Stop all engines
        for (const [name, engine] of Object.entries(global.engines)) {
            if (engine && engine.stop) {
                console.log(`Stopping ${name} engine...`);
                await engine.stop();
            }
        }

        // Close server
        server.close(() => {
            console.log('✅ Server closed');
            process.exit(0);
        });

        // Force shutdown after timeout
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
