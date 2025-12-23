// Service Initializer
// Sets up all services in correct order

const db = require('../database');
const GitSyncService = require('../services/git-sync');
const RepositoryService = require('../services/repository-service');

const PrivacyService = require('../services/privacy-service');
const AIProviderService = require('../services/ai-provider-service');
const StreamingService = require('../services/streaming-service');

const MCPPassport = require('../services/mcp-passport');
const MCPClient = require('../services/mcp-client');
const Context7Server = require('../services/context7-server');

const DocIndexer = require('../services/doc-indexer');
const RepoSuggesterService = require('../services/repo-suggester');

const APIKeyPool = require('../services/api-key-pool');
const BudgetManager = require('../services/budget-manager');
const AgentFleetService = require('../services/agent-fleet-service');
const AgentScheduler = require('../services/agent-scheduler');

const ShareService = require('../services/share-service');
const CommandRegistry = require('../services/command-registry');

const { monitoring } = require('../services/monitoring-service');
const { BackupService } = require('../services/backup-service');
const { logger, createLoggingMiddleware, createMetricsRoutes } = require('../services/monitoring-service');

// ============================================
// Services Container
// ============================================

const services = {
    // Database
    db,

    // Repository System
    gitSync: null,
    repositoryService: null,

    // AI Services
    privacyService: null,
    aiProviderService: null,
    streamingService: null,

    // MCP Services
    mcpPassport: null,
    mcpClient: null,
    context7Server: null,

    // Documentation
    docIndexer: null,
    repoSuggester: null,

    // Agent Fleet
    apiKeyPool: null,
    budgetManager: null,
    agentFleet: null,
    agentScheduler: null,

    // Share & Commands
    shareService: null,
    commandRegistry: null,

    // Monitoring & Backup
    monitoring,
    backupService: null
};

// ============================================
// Initialization Functions
// ============================================

async function initializeDatabase() {
    logger.info('Initializing database...');
    await services.db.initialize();
    await services.db.runMigrations();
    logger.info('Database initialized');
}

async function initializeRepositorySystem() {
    logger.info('Initializing repository system...');

    services.gitSync = new GitSyncService(services.db);
    services.repositoryService = new RepositoryService(services.db, services.gitSync);

    logger.info('Repository system initialized');
}

async function initializeAIServices() {
    logger.info('Initializing AI services...');

    services.privacyService = new PrivacyService({
        rpcUrl: config.privacy.rpcUrl,
        privacyRouterAddress: config.privacy.routerAddress,
        relayerUrl: config.privacy.relayerUrl
    });

    services.aiProviderService = AIProviderService;
    services.streamingService = StreamingService;

    logger.info('AI services initialized');
}

async function initializeMCPServices() {
    logger.info('Initializing MCP services...');

    services.mcpPassport = MCPPassport;
    services.mcpClient = MCPClient;
    services.context7Server = Context7Server;

    logger.info('MCP services initialized');
}

async function initializeDocumentationServices() {
    logger.info('Initializing documentation services...');

    services.docIndexer = DocIndexer;
    services.repoSuggester = RepoSuggesterService;

    logger.info('Documentation services initialized');
}

async function initializeAgentFleet() {
    if (!config.agentFleet.enabled) {
        logger.info('Agent Fleet disabled');
        return;
    }

    logger.info('Initializing agent fleet system...');

    // Initialize core services
    services.apiKeyPool = new APIKeyPool(services.db);
    await services.apiKeyPool.initialize();

    services.budgetManager = new BudgetManager(services.db, services.apiKeyPool);
    await services.budgetManager.initialize();

    // Initialize agent fleet
    services.agentFleet = new AgentFleetService(
        services.db,
        services.apiKeyPool,
        services.budgetManager
    );

    // Initialize scheduler
    services.agentScheduler = new AgentScheduler(
        services.db,
        services.apiKeyPool,
        services.budgetManager,
        services.agentFleet,
        {
            concurrency: config.agentFleet.concurrentLimit,
            maxRetries: config.agentFleet.maxRetries,
            pollingInterval: config.agentFleet.pollingInterval
        }
    );

    // Initialize fleet with project path
    const projectPath = process.cwd();
    await services.agentFleet.initialize(projectPath);

    // Auto-start if configured
    if (config.agentFleet.autoStart) {
        logger.info('Auto-starting agent fleet...');
        await services.agentFleet.start();
        await services.agentScheduler.start();
    }

    logger.info('Agent fleet system initialized');
}

async function initializeShareAndCommands() {
    logger.info('Initializing share and command system...');

    services.shareService = new ShareService(services.db);
    services.commandRegistry = new CommandRegistry(services.db);
    await services.commandRegistry.initialize();

    // Wire up to agent fleet if it exists
    if (services.agentFleet) {
        services.agentFleet.setShareServices(
            services.shareService,
            services.commandRegistry
        );
    }

    logger.info('Share and command system initialized');
}

async function initializeMonitoring() {
    logger.info('Initializing monitoring service...');

    await monitoring.start();

    logger.info('Monitoring service initialized');
}

async function initializeBackup() {
    logger.info('Initializing backup service...');

    services.backupService = new BackupService();
    await services.backupService.start();

    logger.info('Backup service initialized');
}

async function initializeAll() {
    logger.info('Initializing all services...');

    try {
        await initializeDatabase();
        await initializeRepositorySystem();
        await initializeAIServices();
        await initializeMCPServices();
        await initializeDocumentationServices();
        await initializeAgentFleet();
        await initializeShareAndCommands();
        await initializeMonitoring();
        await initializeBackup();

        logger.info('All services initialized successfully');
        return services;
    } catch (error) {
        logger.error('Failed to initialize services', { error: error.message });
        throw error;
    }
}

async function shutdownAll() {
    logger.info('Shutting down all services...');

    try {
        if (services.backupService) {
            await services.backupService.stop();
        }

        if (monitoring) {
            await monitoring.stop();
        }

        if (services.agentFleet) {
            await services.agentFleet.stop();
        }

        if (services.db) {
            services.db.close();
        }

        logger.info('All services shut down gracefully');
    } catch (error) {
        logger.error('Error during shutdown', { error: error.message });
    }
}

// ============================================
// Exports
// ============================================

module.exports = {
    services,
    initializeAll,
    shutdownAll
};
