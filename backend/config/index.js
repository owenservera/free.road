// Central Configuration Management
// Loads and validates all environment variables

const dotenv = require('dotenv');

dotenv.config();

// ============================================
// Server Configuration
// ============================================

const config = {
    // Server
    port: parseInt(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
    env: process.env.NODE_ENV || 'development',

    // Paths
    docsPath: require('path').join(__dirname, '../../docs/finallica'),

    // CORS
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || [
        'http://localhost:8080',
        'http://localhost:3000'
    ],

    // Consensus & Governance
    votingPeriod: (parseInt(process.env.VOTING_PERIOD) || 604800000),
    quorumPct: parseFloat(process.env.QUORUM_PCT) || 0.67,
    minStakeProposal: parseInt(process.env.MIN_STAKE_PROPOSAL) || 1000,
    minStakeVR: parseInt(process.env.MIN_STAKE_VR) || 500000,
    minStakeSE: parseInt(process.env.MIN_STAKE_SE) || 2000000,

    // AI Provider Configuration
    ai: {
        defaultProvider: process.env.AI_PROVIDER || 'anthropic',
        anthropicKey: process.env.ANTHROPIC_API_KEY || '',
        openaiKey: process.env.OPENAI_API_KEY || '',
        openrouterKey: process.env.OPENROUTER_API_KEY || '',
        groqKey: process.env.GROQ_API_KEY || ''
    },

    // Privacy Configuration
    privacy: {
        enabled: process.env.PRIVACY_ENABLED === 'true',
        routerAddress: process.env.PRIVACY_ROUTER_ADDRESS || '',
        rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
        relayerUrl: process.env.RELAYER_URL || ''
    },

    // Agent Fleet Configuration
    agentFleet: {
        enabled: process.env.AGENT_FLEET_ENABLED === 'true',
        autoStart: process.env.AGENT_FLEET_AUTO_START === 'true',
        concurrentLimit: parseInt(process.env.AGENT_CONCURRENT_LIMIT) || 3,
        maxRetries: parseInt(process.env.AGENT_MAX_RETRIES) || 3,
        pollingInterval: parseInt(process.env.AGENT_SCHEDULER_POLLING_INTERVAL) || 5000
    },

    // Backup Configuration
    backup: {
        intervalMs: parseInt(process.env.BACKUP_INTERVAL_MS) || 3600000,
        retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30,
        maxBackups: parseInt(process.env.BACKUP_MAX_COUNT) || 50,
        encryptionEnabled: process.env.BACKUP_ENCRYPTION === 'true',
        compressionEnabled: process.env.BACKUP_COMPRESSION !== 'false',
        cloudEnabled: process.env.BACKUP_CLOUD_ENABLED === 'true',
        cloudProvider: process.env.BACKUP_CLOUD_PROVIDER || 'aws'
    },

    // Monitoring Configuration
    monitoring: {
        enabled: process.env.METRICS_ENABLED !== 'false',
        retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS) || 30,
        collectionInterval: parseInt(process.env.METRICS_COLLECTION_INTERVAL) || 60000,
        logLevel: process.env.LOG_LEVEL || 'info',
        queryLogging: process.env.DB_QUERY_LOGGING === 'true',
        performanceTracking: process.env.DB_PERFORMANCE_TRACKING === 'true'
    },

    // Database Configuration
    database: {
        path: require('path').join(__dirname, '../data/repositories.db'),
        reposPath: require('path').join(__dirname, '../data/repos'),
        saveDebounceMs: parseInt(process.env.DB_SAVE_DEBOUNCE_MS) || 1000,
        maxPendingSaves: parseInt(process.env.DB_SAVE_MAX_PENDING) || 100
    }
};

// ============================================
// Validation
// ============================================

function validateConfig() {
    const errors = [];

    // Required for production
    if (config.env === 'production') {
        if (!config.ai.anthropicKey && !config.ai.openaiKey) {
            errors.push('AI provider API key required in production');
        }
    }

    // Port validation
    if (config.port < 1 || config.port > 65535) {
        errors.push(`Invalid port: ${config.port}`);
    }

    // Quorum validation
    if (config.quorumPct < 0.1 || config.quorumPct > 0.99) {
        errors.push(`Quorum percentage must be between 0.1 and 0.99`);
    }

    if (errors.length > 0) {
        console.error('Configuration validation failed:');
        errors.forEach(err => console.error(`  - ${err}`));
        process.exit(1);
    }

    return true;
}

// ============================================
// Exports
// ============================================

module.exports = {
    config,
    validateConfig
};
