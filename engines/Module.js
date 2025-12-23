// Module Base Class
// Part of Finallica's open architecture

const {
    ModuleInterface,
    ModuleMetadata,
    ConfigSchema,
    HealthStatus,
    ValidationError,
    ModuleContext
} = require('../shared/types/ModuleInterface');

/**
 * Base module implementation
 */
class Module extends ModuleInterface {
    constructor(options = {}) {
        super();
        this.id = options.id || '';
        this.name = options.name || this.id;
        this.version = options.version || '1.0.0';
        this.description = options.description || '';
        this.author = options.author || '';
        this.license = options.license || 'MIT';
        this.keywords = options.keywords || [];

        // Runtime state
        this.context = null;
        this.state = 'uninitialized'; // 'uninitialized', 'initialized', 'starting', 'running', 'stopping', 'stopped'
        this.startTime = null;
        this.stopTime = null;
        this.config = options.config || {};
        this.configSchema = new ConfigSchema(this.getConfigSchema());

        // Dependencies
        this.dependencies = options.dependencies || this.getDependencies();

        // Services and resources
        this.services = new Map();
        this.resources = new Map();
        this.eventSubscriptions = [];

        // Health tracking
        this.healthHistory = [];
        this.maxHealthHistory = 100;
    }

    /**
     * Get module metadata
     * @returns {ModuleMetadata}
     */
    getMetadata() {
        return new ModuleMetadata({
            id: this.id,
            name: this.name,
            version: this.version,
            description: this.description,
            author: this.author,
            license: this.license,
            keywords: this.keywords,
            engine: this.getEngine(),
            dependencies: this.dependencies,
            config: this.configSchema.getFields()
        });
    }

    /**
     * Get engine type (to be implemented by subclasses)
     * @returns {string}
     */
    getEngine() {
        return '';
    }

    /**
     * Initialize the module
     * @param {ModuleContext} context - Module context
     * @returns {Promise<void>}
     */
    async initialize(context) {
        if (this.state !== 'uninitialized') {
            throw new Error(`Module is already ${this.state}`);
        }

        try {
            console.log(`🔧 Initializing ${this.name} module (${this.id})...`);

            // Store context
            this.context = context;

            // Validate configuration
            this._validateConfiguration();

            // Check dependencies
            await this._checkDependencies();

            // Initialize services
            await this._initializeServices();

            // Initialize module-specific logic
            await this._onInitialize();

            this.state = 'initialized';

            console.log(`✅ ${this.name} module initialized successfully`);

            // Emit module initialized event
            await context.emit('module:initialized', {
                module: this.id,
                name: this.name,
                engine: this.getEngine()
            });
        } catch (error) {
            console.error(`❌ Failed to initialize ${this.name} module:`, error);
            this.state = 'error';
            throw error;
        }
    }

    /**
     * Start the module
     * @returns {Promise<void>}
     */
    async start() {
        if (this.state !== 'initialized' && this.state !== 'stopped') {
            throw new Error(`Cannot start module in ${this.state} state`);
        }

        try {
            console.log(`▶️ Starting ${this.name} module (${this.id})...`);
            this.state = 'starting';

            // Start services
            await this._startServices();

            // Start module-specific logic
            await this._onStart();

            // Setup event subscriptions
            await this._setupEventSubscriptions();

            this.state = 'running';
            this.startTime = Date.now();

            console.log(`✅ ${this.name} module started successfully`);

            // Emit module started event
            await this.context.emit('module:started', {
                module: this.id,
                name: this.name,
                engine: this.getEngine(),
                startTime: this.startTime
            });
        } catch (error) {
            console.error(`❌ Failed to start ${this.name} module:`, error);
            this.state = 'error';
            throw error;
        }
    }

    /**
     * Stop the module
     * @returns {Promise<void>}
     */
    async stop() {
        if (this.state !== 'running') {
            console.log(`⏹️ ${this.name} module is not running (state: ${this.state})`);
            return;
        }

        try {
            console.log(`🛑 Stopping ${this.name} module (${this.id})...`);
            this.state = 'stopping';

            // Stop services
            await this._stopServices();

            // Stop module-specific logic
            await this._onStop();

            // Cleanup event subscriptions
            await this._cleanupEventSubscriptions();

            this.state = 'stopped';
            this.stopTime = Date.now();

            console.log(`✅ ${this.name} module stopped successfully`);

            // Emit module stopped event
            await this.context.emit('module:stopped', {
                module: this.id,
                name: this.name,
                engine: this.getEngine(),
                stopTime: this.stopTime,
                uptime: this.stopTime - this.startTime
            });
        } catch (error) {
            console.error(`❌ Failed to stop ${this.name} module:`, error);
            this.state = 'error';
            throw error;
        }
    }

    /**
     * Get module health status
     * @returns {Promise<HealthStatus>}
     */
    async healthCheck() {
        try {
            const healthDetails = {
                module: this.id,
                name: this.name,
                version: this.version,
                state: this.state,
                uptime: this.state === 'running' ? Date.now() - this.startTime : 0,
                checks: []
            };

            // Check services
            await this._checkServicesHealth(healthDetails.checks);

            // Check module-specific health
            await this._onHealthCheck(healthDetails.checks);

            // Calculate overall status
            const status = this._calculateHealthStatus(healthDetails.checks);

            // Record health history
            this._recordHealthStatus(status, healthDetails);

            return new HealthStatus(status, healthDetails);
        } catch (error) {
            const errorStatus = new HealthStatus('unhealthy', {
                module: this.id,
                error: error.message,
                timestamp: Date.now()
            });
            this._recordHealthStatus('unhealthy', errorStatus.details);
            return errorStatus;
        }
    }

    /**
     * Handle events (to be implemented by subclasses)
     * @param {Object} event - Event object
     * @returns {Promise<void>}
     */
    async onEvent(event) {
        // Default implementation - can be overridden by subclasses
    }

    /**
     * Setup module-specific logic (to be implemented by subclasses)
     * @private
     */
    async _onInitialize() {
        // Override in subclasses
    }

    /**
     * Start module-specific logic (to be implemented by subclasses)
     * @private
     */
    async _onStart() {
        // Override in subclasses
    }

    /**
     * Stop module-specific logic (to be implemented by subclasses)
     * @private
     */
    async _onStop() {
        // Override in subclasses
    }

    /**
     * Module-specific health checks (to be implemented by subclasses)
     * @private
     */
    async _onHealthCheck(checks) {
        // Override in subclasses
    }

    /**
     * Validate configuration
     * @private
     */
    _validateConfiguration() {
        const errors = this.configSchema.validate(this.config);
        if (errors.length > 0) {
            throw new ValidationError(
                'Configuration',
                errors.map(e => `${e.field}: ${e.message}`).join(', '),
                'CONFIG_VALIDATION'
            );
        }
    }

    /**
     * Check dependencies
     * @private
     */
    async _checkDependencies() {
        for (const dep of this.dependencies) {
            if (!this.context.getDependency(dep)) {
                throw new Error(`Dependency ${dep} not found`);
            }
        }
    }

    /**
     * Initialize services
     * @private
     */
    async _initializeServices() {
        // Override in subclasses
    }

    /**
     * Start services
     * @private
     */
    async _startServices() {
        // Override in subclasses
    }

    /**
     * Stop services
     * @private
     */
    async _stopServices() {
        // Override in subclasses
    }

    /**
     * Check services health
     * @private
     */
    async _checkServicesHealth(checks) {
        // Override in subclasses
    }

    /**
     * Calculate overall health status
     * @private
     */
    _calculateHealthStatus(checks) {
        if (checks.length === 0) {
            return 'healthy';
        }

        const unhealthyChecks = checks.filter(check => check.status === 'unhealthy');
        const degradedChecks = checks.filter(check => check.status === 'degraded');

        if (unhealthyChecks.length > 0) {
            return 'unhealthy';
        }

        if (degradedChecks.length > 0) {
            return 'degraded';
        }

        return 'healthy';
    }

    /**
     * Record health status
     * @private
     */
    _recordHealthStatus(status, details) {
        this.healthHistory.unshift({
            status,
            timestamp: Date.now(),
            details
        });

        // Keep history size limited
        if (this.healthHistory.length > this.maxHealthHistory) {
            this.healthHistory.pop();
        }
    }

    /**
     * Setup event subscriptions
     * @private
     */
    async _setupEventSubscriptions() {
        // Basic event subscription pattern - can be overridden
    }

    /**
     * Cleanup event subscriptions
     * @private
     */
    async _cleanupEventSubscriptions() {
        // Unsubscribe from all events
        for (const subscriptionId of this.eventSubscriptions) {
            this.context.eventBus.unsubscribe('*', subscriptionId);
        }
        this.eventSubscriptions = [];
    }

    /**
     * Subscribe to event
     * @param {string} eventType - Event type
     * @param {Function} callback - Event handler
     * @param {Object} options - Subscription options
     * @returns {string} Subscription ID
     */
    subscribe(eventType, callback, options = {}) {
        const subscriptionId = this.context.eventBus.subscribe(
            eventType,
            async (event) => {
                try {
                    await callback(event);
                } catch (error) {
                    console.error(`Event handler error for ${eventType}:`, error);
                }
            },
            options
        );

        this.eventSubscriptions.push(subscriptionId);
        return subscriptionId;
    }

    /**
     * Unsubscribe from event
     * @param {string} subscriptionId - Subscription ID
     */
    unsubscribe(subscriptionId) {
        this.context.eventBus.unsubscribe('*', subscriptionId);
        const index = this.eventSubscriptions.indexOf(subscriptionId);
        if (index > -1) {
            this.eventSubscriptions.splice(index, 1);
        }
    }

    /**
     * Emit event
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     * @param {Object} metadata - Event metadata
     * @returns {Promise<boolean>}
     */
    async emit(eventType, data, metadata) {
        return this.context.emit(eventType, data, metadata);
    }

    /**
     * Log message
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Log data
     */
    log(level, message, data) {
        return this.context.log(level, message, data);
    }

    /**
     * Get config value
     * @param {string} key - Config key
     * @param {*} defaultValue - Default value if key not found
     * @returns {*}
     */
    getConfig(key, defaultValue) {
        return this.context.getConfig(key, defaultValue);
    }

    /**
     * Get module statistics
     * @returns {Object}
     */
    getStats() {
        return {
            module: this.id,
            name: this.name,
            version: this.version,
            state: this.state,
            uptime: this.state === 'running' ? Date.now() - this.startTime : 0,
            dependencies: this.dependencies,
            servicesCount: this.services.size,
            resourcesCount: this.resources.size,
            eventSubscriptions: this.eventSubscriptions.length,
            config: this.config
        };
    }

    /**
     * Get health history
     * @param {number} limit - Number of records to return
     * @returns {Array}
     */
    getHealthHistory(limit = 10) {
        return this.healthHistory.slice(0, limit);
    }

    /**
     * Add service to module
     * @param {string} name - Service name
     * @param {Object} service - Service instance
     */
    addService(name, service) {
        this.services.set(name, service);
    }

    /**
     * Get service from module
     * @param {string} name - Service name
     * @returns {Object} Service instance
     */
    getService(name) {
        return this.services.get(name);
    }

    /**
     * Remove service from module
     * @param {string} name - Service name
     */
    removeService(name) {
        this.services.delete(name);
    }

    /**
     * Add resource to module
     * @param {string} name - Resource name
     * @param {*} resource - Resource
     */
    addResource(name, resource) {
        this.resources.set(name, resource);
    }

    /**
     * Get resource from module
     * @param {string} name - Resource name
     * @returns {*} Resource
     */
    getResource(name) {
        return this.resources.get(name);
    }

    /**
     * Remove resource from module
     * @param {string} name - Resource name
     */
    removeResource(name) {
        this.resources.delete(name);
    }

    /**
     * Check if module has required capabilities
     * @param {Array<string>} capabilities - Required capabilities
     * @returns {boolean}
     */
    hasCapabilities(capabilities) {
        // Override in subclasses to implement capability checking
        return capabilities.length === 0;
    }

    /**
     * Get module capabilities
     * @returns {Array<string>}
     */
    getCapabilities() {
        // Override in subclasses to implement capability reporting
        return [];
    }
}

module.exports = { Module };