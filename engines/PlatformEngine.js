// Platform Engine
// Part of Finallica's open architecture

const Engine = require('./Engine');
const { createModuleLoader } = require('../shared/ModuleLoader');

/**
 * Platform Engine - Core infrastructure engine
 */
class PlatformEngine extends Engine {
    constructor(options = {}) {
        super({
            id: 'platform',
            name: 'Platform Engine',
            version: '1.0.0',
            description: 'Core platform infrastructure for Finallica',
            config: options.config || {},
            ...options
        });

        this.moduleLoader = null;
        this.database = null;
        this.logger = null;
        this.monitoring = null;
        this.backup = null;
    }

    /**
     * Get engine type
     * @returns {string}
     */
    getEngineType() {
        return 'platform';
    }

    /**
     * Initialize platform engine
     * @param {Object} context - Engine context
     * @returns {Promise<void>}
     */
    async initialize(context) {
        // Initialize engine first
        await super.initialize(context);

        // Initialize database connection
        await this._initializeDatabase(context.database);

        // Initialize logging
        await this._initializeLogger(context.logger);

        // Initialize monitoring
        await this._initializeMonitoring(context.monitoring);

        // Initialize backup system
        await this._initializeBackup(context.backup);

        // Initialize module loader
        await this._initializeModuleLoader(context);

        console.log('✅ Platform Engine initialized');
    }

    /**
     * Start platform services
     * @private
     */
    async _startServices() {
        // Start database
        if (this.database) {
            await this.database.connect();
        }

        // Start monitoring
        if (this.monitoring) {
            await this.monitoring.start();
        }

        // Start backup service
        if (this.backup) {
            await this.backup.start();
        }
    }

    /**
     * Stop platform services
     * @private
     */
    async _stopServices() {
        // Stop backup service
        if (this.backup) {
            await this.backup.stop();
        }

        // Stop monitoring
        if (this.monitoring) {
            await this.monitoring.stop();
        }

        // Stop database
        if (this.database) {
            await this.database.disconnect();
        }
    }

    /**
     * Initialize database connection
     * @private
     */
    async _initializeDatabase(databaseConfig) {
        if (!databaseConfig) {
            console.log('⚠️  No database configuration provided');
            return;
        }

        try {
            const DatabaseService = require('./platform/infrastructure/services/database');
            this.database = new DatabaseService(databaseConfig);
            this.context.database = this.database;
            console.log('🗄️  Database service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize database service:', error);
            throw error;
        }
    }

    /**
     * Initialize logging service
     * @private
     */
    async _initializeLogger(logger) {
        if (!logger) {
            console.log('⚠️  No logger provided');
            return;
        }

        this.logger = logger;
        this.context.logger = this.logger;
        console.log('📝 Logging service initialized');
    }

    /**
     * Initialize monitoring service
     * @private
     */
    async _initializeMonitoring(monitoringConfig) {
        if (!monitoringConfig) {
            console.log('⚠️  No monitoring configuration provided');
            return;
        }

        try {
            const MonitoringService = require('./platform/infrastructure/services/monitoring');
            this.monitoring = new MonitoringService(monitoringConfig, this.context);
            console.log('📊 Monitoring service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize monitoring service:', error);
            throw error;
        }
    }

    /**
     * Initialize backup service
     * @private
     */
    async _initializeBackup(backupConfig) {
        if (!backupConfig) {
            console.log('⚠️  No backup configuration provided');
            return;
        }

        try {
            const BackupService = require('./platform/infrastructure/services/backup');
            this.backup = new BackupService(backupConfig, this.context);
            console.log('💾 Backup service initialized');
        } catch (error) {
            console.error('❌ Failed to initialize backup service:', error);
            throw error;
        }
    }

    /**
     * Initialize module loader
     * @private
     */
    async _initializeModuleLoader(context) {
        try {
            this.moduleLoader = await createModuleLoader({
                config: this.config,
                eventBus: this.eventBus,
                logger: this.logger || console,
                modulePath: './engines'
            });

            // Register all modules with this engine
            for (const [moduleId, moduleInfo] of this.moduleLoader.getModules()) {
                await this.registerModule(moduleInfo.instance);
            }

            console.log('🔌 Module loader initialized');
        } catch (error) {
            console.error('❌ Failed to initialize module loader:', error);
            throw error;
        }
    }

    /**
     * Get platform statistics
     * @returns {Promise<Object>}
     */
    async getStats() {
        const engineStats = await super.getStats();
        const moduleLoaderStats = this.moduleLoader ? {
            loadedEngines: this.moduleLoader.getEngines().size,
            loadedModules: this.moduleLoader.getModules().size,
            registryStats: this.moduleLoader.getRegistry().getStats()
        } : {};

        return {
            ...engineStats,
            moduleLoader: moduleLoaderStats,
            services: {
                database: this.database ? 'connected' : 'disconnected',
                monitoring: this.monitoring ? 'running' : 'stopped',
                backup: this.backup ? 'running' : 'stopped'
            },
            timestamp: Date.now()
        };
    }

    /**
     * Get platform health
     * @returns {Promise<Object>}
     */
    async getHealth() {
        const engineHealth = await super.getHealth();
        const moduleLoaderHealth = this.moduleLoader ? await this.moduleLoader.getHealth() : null;

        return {
            engine: engineHealth,
            moduleLoader: moduleLoaderHealth,
            services: {
                database: this.database ? await this.database.healthCheck() : { status: 'unhealthy' },
                monitoring: this.monitoring ? await this.monitoring.healthCheck() : { status: 'unhealthy' },
                backup: this.backup ? await this.backup.healthCheck() : { status: 'unhealthy' }
            },
            timestamp: Date.now()
        };
    }

    /**
     * Handle platform-specific events
     * @param {Object} event - Event object
     * @returns {Promise<void>}
     */
    async onEvent(event) {
        switch (event.type) {
            case 'system:error:occurred':
                await this._handleSystemError(event);
                break;

            case 'module:error':
                await this._handleModuleError(event);
                break;

            case 'engine:initialized':
                if (event.data.engine !== this.id && this.moduleLoader) {
                    console.log(`📦 Engine ${event.data.engine} initialized`);
                }
                break;

            default:
                // Pass to parent handler
                await super.onEvent(event);
        }
    }

    /**
     * Handle system errors
     * @private
     */
    async _handleSystemError(event) {
        const error = event.data.error;

        if (this.monitoring) {
            await this.monitoring.recordError(error);
        }

        if (this.logger) {
            this.logger.error('System error occurred:', error);
        }

        // Check if we need to alert
        if (error.severity === 'critical') {
            await this.eventBus.emit('system:critical:error', {
                error,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Handle module errors
     * @private
     */
    async _handleModuleError(event) {
        const moduleError = event.data;

        if (this.monitoring) {
            await this.monitoring.recordModuleError(moduleError);
        }

        if (this.logger) {
            this.logger.error('Module error occurred:', moduleError);
        }

        // Potentially restart or disable the module
        if (moduleError.error?.severity === 'critical') {
            await this.eventBus.emit('system:module:error', {
                module: moduleError.module,
                error: moduleError.error,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Create backup
     * @param {Object} options - Backup options
     * @returns {Promise<Object>}
     */
    async createBackup(options = {}) {
        if (!this.backup) {
            throw new Error('Backup service not available');
        }

        return await this.backup.createBackup(options);
    }

    /**
     * Restore from backup
     * @param {string} backupId - Backup ID
     * @returns {Promise<Object>}
     */
    async restoreBackup(backupId) {
        if (!this.backup) {
            throw new Error('Backup service not available');
        }

        return await this.backup.restoreBackup(backupId);
    }

    /**
     * Get backup list
     * @returns {Promise<Array>}
     */
    async getBackupList() {
        if (!this.backup) {
            return [];
        }

        return await this.backup.listBackups();
    }

    /**
     * Get metrics
     * @param {Object} options - Metrics options
     * @returns {Promise<Object>}
     */
    async getMetrics(options = {}) {
        if (!this.monitoring) {
            return {};
        }

        return await this.monitoring.getMetrics(options);
    }
}

module.exports = PlatformEngine;