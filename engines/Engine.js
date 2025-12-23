// Engine Base Class
// Part of Finallica's open architecture

const { EventBus } = require('../shared/event-bus/EventBus');

/**
 * Base engine class for all Finallica engines
 */
class Engine {
    constructor(options = {}) {
        this.id = options.id || this.constructor.name.toLowerCase();
        this.name = options.name || this.id;
        this.version = options.version || '1.0.0';
        this.description = options.description || '';
        this.eventBus = options.eventBus || new EventBus();
        this.modules = new Map();
        this.state = 'initialized'; // 'initialized', 'starting', 'running', 'stopping', 'stopped'
        this.context = options.context || {};
        this.config = options.config || {};
        this.dependencies = options.dependencies || [];
        this.startTime = null;
        this.stopTime = null;
        this.healthChecks = new Map();

        // Register engine events
        this._setupEventListeners();
    }

    /**
     * Initialize the engine
     * @param {Object} context - Engine context
     * @returns {Promise<void>}
     */
    async initialize(context = {}) {
        if (this.state !== 'initialized') {
            throw new Error(`Engine is already ${this.state}`);
        }

        try {
            console.log(`🚀 Initializing ${this.name} engine...`);

            // Update context
            this.context = { ...this.context, ...context };

            // Initialize dependencies
            await this._initializeDependencies();

            // Setup engine-specific configuration
            await this._setupConfiguration();

            // Setup event listeners
            await this._setupEventListeners();

            // Initialize modules
            await this._initializeModules();

            this.state = 'initialized';

            console.log(`✅ ${this.name} engine initialized successfully`);

            // Emit engine initialized event
            await this.eventBus.emit('engine:initialized', {
                engine: this.id,
                name: this.name,
                modules: Array.from(this.modules.keys())
            });
        } catch (error) {
            console.error(`❌ Failed to initialize ${this.name} engine:`, error);
            this.state = 'error';
            throw error;
        }
    }

    /**
     * Start the engine
     * @returns {Promise<void>}
     */
    async start() {
        if (this.state !== 'initialized' && this.state !== 'stopped') {
            throw new Error(`Cannot start engine in ${this.state} state`);
        }

        try {
            console.log(`▶️ Starting ${this.name} engine...`);
            this.state = 'starting';

            // Start modules
            await this._startModules();

            // Start engine-specific services
            await this._startServices();

            // Start health monitoring
            this._startHealthMonitoring();

            this.state = 'running';
            this.startTime = Date.now();

            console.log(`✅ ${this.name} engine started successfully`);

            // Emit engine started event
            await this.eventBus.emit('engine:started', {
                engine: this.id,
                name: this.name,
                startTime: this.startTime
            });
        } catch (error) {
            console.error(`❌ Failed to start ${this.name} engine:`, error);
            this.state = 'error';
            throw error;
        }
    }

    /**
     * Stop the engine
     * @returns {Promise<void>}
     */
    async stop() {
        if (this.state !== 'running') {
            console.log(`⏹️ ${this.name} engine is not running (state: ${this.state})`);
            return;
        }

        try {
            console.log(`🛑 Stopping ${this.name} engine...`);
            this.state = 'stopping';

            // Stop services
            await this._stopServices();

            // Stop modules
            await this._stopModules();

            // Stop health monitoring
            this._stopHealthMonitoring();

            this.state = 'stopped';
            this.stopTime = Date.now();

            console.log(`✅ ${this.name} engine stopped successfully`);

            // Emit engine stopped event
            await this.eventBus.emit('engine:stopped', {
                engine: this.id,
                name: this.name,
                stopTime: this.stopTime,
                uptime: this.stopTime - this.startTime
            });
        } catch (error) {
            console.error(`❌ Failed to stop ${this.name} engine:`, error);
            this.state = 'error';
            throw error;
        }
    }

    /**
     * Get engine health status
     * @returns {Promise<Object>}
     */
    async getHealth() {
        const modulesHealth = new Map();

        for (const [id, module] of this.modules) {
            try {
                const health = await module.healthCheck();
                modulesHealth.set(id, health);
            } catch (error) {
                modulesHealth.set(id, {
                    status: 'unhealthy',
                    message: error.message,
                    timestamp: Date.now()
                });
            }
        }

        const engineHealth = {
            engine: this.id,
            name: this.name,
            state: this.state,
            uptime: this.state === 'running' ? Date.now() - this.startTime : 0,
            modulesHealth: Object.fromEntries(modulesHealth),
            overall: this._calculateOverallHealth(modulesHealth),
            lastHealthCheck: Date.now()
        };

        return engineHealth;
    }

    /**
     * Register a module
     * @param {Object} module - Module instance
     * @returns {Promise<void>}
     */
    async registerModule(module) {
        if (this.state === 'running' || this.state === 'starting') {
            throw new Error(`Cannot register module while engine is ${this.state}`);
        }

        if (!module.id || !module.initialize || !module.start || !module.stop) {
            throw new Error('Invalid module: must have id, initialize, start, and stop methods');
        }

        // Check if module already exists
        if (this.modules.has(module.id)) {
            throw new Error(`Module ${module.id} is already registered`);
        }

        // Check dependencies
        if (!this._checkDependencies(module.getDependencies())) {
            throw new Error(`Module ${module.id} has unresolved dependencies`);
        }

        // Store module
        this.modules.set(module.id, module);

        console.log(`📦 Module ${module.id} registered to ${this.name} engine`);

        // Emit module registered event
        await this.eventBus.emit('module:registered', {
            engine: this.id,
            module: {
                id: module.id,
                name: module.name || module.id,
                version: module.version || '1.0.0'
            }
        });
    }

    /**
     * Unregister a module
     * @param {string} moduleId - Module ID
     * @returns {Promise<void>}
     */
    async unregisterModule(moduleId) {
        if (!this.modules.has(moduleId)) {
            throw new Error(`Module ${moduleId} not found`);
        }

        const module = this.modules.get(moduleId);

        if (this.state === 'running') {
            await module.stop();
        }

        this.modules.delete(moduleId);

        console.log(`📦 Module ${moduleId} unregistered from ${this.name} engine`);
    }

    /**
     * Get module by ID
     * @param {string} moduleId - Module ID
     * @returns {Object} Module instance
     */
    getModule(moduleId) {
        return this.modules.get(moduleId);
    }

    /**
     * Get all registered modules
     * @returns {Array} Module instances
     */
    getModules() {
        return Array.from(this.modules.values());
    }

    /**
     * Get engine statistics
     * @returns {Object}
     */
    getStats() {
        const modulesStats = Array.from(this.modules.values()).map(module => ({
            id: module.id,
            name: module.name || module.id,
            version: module.version || '1.0.0',
            health: module.healthCheck ? 'available' : 'not-implemented'
        }));

        return {
            engine: this.id,
            name: this.name,
            version: this.version,
            state: this.state,
            uptime: this.state === 'running' ? Date.now() - this.startTime : 0,
            modulesCount: this.modules.size,
            modules: modulesStats,
            dependencies: this.dependencies,
            config: this.config
        };
    }

    /**
     * Handle engine events (to be overridden by subclasses)
     * @param {Object} event - Event object
     * @returns {Promise<void>}
     */
    async onEvent(event) {
        // Default implementation - can be overridden by engine subclasses
    }

    /**
     * Initialize engine dependencies
     * @private
     */
    async _initializeDependencies() {
        // Default implementation - can be overridden by subclasses
    }

    /**
     * Setup engine configuration
     * @private
     */
    async _setupConfiguration() {
        // Default implementation - can be overridden by subclasses
    }

    /**
     * Setup event listeners
     * @private
     */
    async _setupEventListeners() {
        // Listen for engine-level events
        this.eventBus.subscribe('engine:initialized', async (event) => {
            if (event.data.engine !== this.id) {
                await this.onEvent(event);
            }
        });

        this.eventBus.subscribe('engine:started', async (event) => {
            if (event.data.engine !== this.id) {
                await this.onEvent(event);
            }
        });

        this.eventBus.subscribe('engine:stopped', async (event) => {
            if (event.data.engine !== this.id) {
                await this.onEvent(event);
            }
        });
    }

    /**
     * Initialize modules
     * @private
     */
    async _initializeModules() {
        for (const module of this.modules.values()) {
            try {
                await module.initialize(this._createModuleContext(module));
            } catch (error) {
                console.error(`Failed to initialize module ${module.id}:`, error);
                throw error;
            }
        }
    }

    /**
     * Start modules
     * @private
     */
    async _startModules() {
        for (const module of this.modules.values()) {
            try {
                await module.start();
                console.log(`📦 Module ${module.id} started`);
            } catch (error) {
                console.error(`Failed to start module ${module.id}:`, error);
                throw error;
            }
        }
    }

    /**
     * Stop modules
     * @private
     */
    async _stopModules() {
        const stopPromises = Array.from(this.modules.values()).map(async (module) => {
            try {
                await module.stop();
                console.log(`📦 Module ${module.id} stopped`);
            } catch (error) {
                console.error(`Failed to stop module ${module.id}:`, error);
            }
        });

        await Promise.all(stopPromises);
    }

    /**
     * Start engine services
     * @private
     */
    async _startServices() {
        // Default implementation - can be overridden by subclasses
    }

    /**
     * Stop engine services
     * @private
     */
    async _stopServices() {
        // Default implementation - can be overridden by subclasses
    }

    /**
     * Start health monitoring
     * @private
     */
    _startHealthMonitoring() {
        // Start health check interval
        this.healthInterval = setInterval(async () => {
            try {
                const health = await this.getHealth();
                this.healthChecks.set(Date.now(), health);

                // Keep only last 100 health checks
                if (this.healthChecks.size > 100) {
                    const oldest = this.healthChecks.keys().next().value;
                    this.healthChecks.delete(oldest);
                }
            } catch (error) {
                console.error('Health check failed:', error);
            }
        }, 30000); // Check every 30 seconds
    }

    /**
     * Stop health monitoring
     * @private
     */
    _stopHealthMonitoring() {
        if (this.healthInterval) {
            clearInterval(this.healthInterval);
            this.healthInterval = null;
        }
    }

    /**
     * Create module context
     * @private
     */
    _createModuleContext(module) {
        // Debug: Log context database status
        console.log(`[Engine:${this.id}] Creating module context for ${module.id}, database:`, this.context.database ? 'PRESENT' : 'UNDEFINED');

        return {
            engine: this,
            dependencies: this.dependencies,
            eventBus: this.eventBus,
            config: this.config,
            logger: console,
            database: this.context.database,
            storage: this.context.storage,
            getDependency: (depId) => {
                // Check if dependency is a module in this engine
                if (this.modules.has(depId)) {
                    return this.modules.get(depId);
                }
                // Check if dependency is a module in another engine (via moduleLoader)
                if (this.context.moduleLoader) {
                    const allModules = this.context.moduleLoader.getModules();
                    if (allModules.has(depId)) {
                        return allModules.get(depId);
                    }
                }
                // Check if dependency is provided by the engine context
                return this.dependencies.find(dep => dep.id === depId || dep === depId);
            }
        };
    }

    /**
     * Check if dependencies are met
     * @private
     */
    _checkDependencies(dependencies) {
        return dependencies.every(dep => this.modules.has(dep) || this.dependencies.includes(dep));
    }

    /**
     * Calculate overall health status
     * @private
     */
    _calculateOverallHealth(modulesHealth) {
        if (modulesHealth.size === 0) {
            return 'healthy';
        }

        const healthStatuses = Array.from(modulesHealth.values());

        if (healthStatuses.every(h => h.status === 'healthy')) {
            return 'healthy';
        }

        if (healthStatuses.some(h => h.status === 'unhealthy')) {
            return 'unhealthy';
        }

        return 'degraded';
    }

    /**
     * Get health history
     * @param {number} limit - Number of health records to return
     * @returns {Array}
     */
    getHealthHistory(limit = 10) {
        const history = Array.from(this.healthChecks.entries())
            .sort((a, b) => b[0] - a[0]);

        return history.slice(0, limit).map(([timestamp, health]) => ({
            timestamp,
            health: health.overall
        }));
    }
}

module.exports = Engine;