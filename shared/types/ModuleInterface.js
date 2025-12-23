// Module Interface Specification
// Part of Finallica's open architecture

/**
 * Base interface for all modules
 */
class ModuleInterface {
    /**
     * Get module metadata
     * @returns {ModuleMetadata}
     */
    getMetadata() {
        throw new Error('Module must implement getMetadata()');
    }

    /**
     * Initialize the module
     * @param {Object} context - Module context (engine, dependencies, config)
     * @returns {Promise<void>}
     */
    async initialize(context) {
        throw new Error('Module must implement initialize()');
    }

    /**
     * Start the module
     * @returns {Promise<void>}
     */
    async start() {
        throw new Error('Module must implement start()');
    }

    /**
     * Stop the module
     * @returns {Promise<void>}
     */
    async stop() {
        throw new Error('Module must implement stop()');
    }

    /**
     * Get module health status
     * @returns {Promise<HealthStatus>}
     */
    async healthCheck() {
        throw new Error('Module must implement healthCheck()');
    }

    /**
     * Handle events
     * @param {Object} event - Event object
     * @returns {Promise<void>}
     */
    async onEvent(event) {
        // Optional override
    }

    /**
     * Get module configuration schema
     * @returns {Object}
     */
    getConfigSchema() {
        return {};
    }

    /**
     * Validate module configuration
     * @param {Object} config - Configuration to validate
     * @returns {boolean}
     */
    validateConfig(config) {
        // Basic validation override
        return true;
    }

    /**
     * Get module dependencies
     * @returns {Array<string>}
     */
    getDependencies() {
        return [];
    }
}

/**
 * Module metadata structure
 */
class ModuleMetadata {
    constructor(data) {
        this.id = data.id || '';
        this.version = data.version || '1.0.0';
        this.name = data.name || this.id;
        this.description = data.description || '';
        this.author = data.author || '';
        this.engine = data.engine || '';
        this.dependencies = data.dependencies || [];
        this.keywords = data.keywords || [];
        this.license = data.license || 'MIT';
        this.repository = data.repository || '';
        this.documentation = data.documentation || '';
        this.config = data.config || {};
    }

    /**
     * Validate metadata
     * @returns {boolean}
     */
    validate() {
        return !!this.id && !!this.version;
    }

    /**
     * Get package.json style object
     * @returns {Object}
     */
    toPackageJson() {
        return {
            name: `@finallica/${this.id}`,
            version: this.version,
            description: this.description,
            author: this.author,
            engines: {
                finallica: '>=1.0.0'
            },
            dependencies: this.dependencies.reduce((acc, dep) => {
                acc[`@finallica/${dep}`] = '*';
                return acc;
            }, {}),
            keywords: ['finallica', ...this.keywords],
            license: this.license,
            repository: this.repository,
            config: this.config
        };
    }
}

/**
 * Module configuration schema
 */
class ConfigSchema {
    constructor(fields) {
        this.fields = fields || {};
    }

    /**
     * Add a field
     * @param {string} name - Field name
     * @param {Object} options - Field options
     */
    addField(name, options) {
        this.fields[name] = options;
    }

    /**
     * Validate configuration against schema
     * @param {Object} config - Configuration to validate
     * @returns {ValidationError[]}
     */
    validate(config) {
        const errors = [];

        for (const [fieldName, fieldDef] of Object.entries(this.fields)) {
            const value = config[fieldName];

            // Check required fields
            if (fieldDef.required && (value === undefined || value === null)) {
                errors.push({
                    field: fieldName,
                    message: `${fieldName} is required`,
                    code: 'REQUIRED_FIELD'
                });
                continue;
            }

            // Skip validation if field is not required and undefined
            if (value === undefined || value === null) {
                continue;
            }

            // Check type
            if (fieldDef.type && typeof value !== fieldDef.type) {
                errors.push({
                    field: fieldName,
                    message: `${fieldName} must be of type ${fieldDef.type}`,
                    code: 'INVALID_TYPE'
                });
                continue;
            }

            // Check enum values
            if (fieldDef.enum && !fieldDef.enum.includes(value)) {
                errors.push({
                    field: fieldName,
                    message: `${fieldName} must be one of: ${fieldDef.enum.join(', ')}`,
                    code: 'INVALID_ENUM'
                });
                continue;
            }

            // Check custom validation
            if (fieldDef.validator && !fieldDef.validator(value)) {
                errors.push({
                    field: fieldName,
                    message: fieldDef.validatorMessage || `${fieldName} is invalid`,
                    code: 'CUSTOM_VALIDATION'
                });
            }
        }

        return errors;
    }

    /**
     * Get all fields
     * @returns {Object}
     */
    getFields() {
        return this.fields;
    }
}

/**
 * Health status structure
 */
class HealthStatus {
    constructor(status, details = {}) {
        this.status = status; // 'healthy', 'degraded', 'unhealthy'
        this.timestamp = Date.now();
        this.details = details;
        this.checks = details.checks || [];
    }

    /**
     * Check if healthy
     * @returns {boolean}
     */
    isHealthy() {
        return this.status === 'healthy';
    }

    /**
     * Check if degraded
     * @returns {boolean}
     */
    isDegraded() {
        return this.status === 'degraded';
    }

    /**
     * Check if unhealthy
     * @returns {boolean}
     */
    isUnhealthy() {
        return this.status === 'unhealthy';
    }
}

/**
 * ValidationError structure
 */
class ValidationError {
    constructor(field, message, code) {
        this.field = field;
        this.message = message;
        this.code = code;
    }
}

/**
 * Module context structure
 */
class ModuleContext {
    constructor(options) {
        this.engine = options.engine;
        this.dependencies = options.dependencies || new Map();
        this.eventBus = options.eventBus;
        this.config = options.config || {};
        this.logger = options.logger;
        this.database = options.database;
        this.storage = options.storage;
    }

    /**
     * Get dependency by ID
     * @param {string} id - Module ID
     * @returns {ModuleInterface}
     */
    getDependency(id) {
        return this.dependencies.get(id);
    }

    /**
     * Emit event
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     * @param {Object} metadata - Event metadata
     */
    async emit(eventType, data, metadata) {
        if (this.eventBus) {
            return this.eventBus.publish(eventType, data, metadata);
        }
    }

    /**
     * Log message
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} data - Log data
     */
    log(level, message, data) {
        if (this.logger) {
            this.logger[level](message, data);
        }
    }

    /**
     * Get config value
     * @param {string} key - Config key
     * @param {*} defaultValue - Default value if key not found
     * @returns {*}
     */
    getConfig(key, defaultValue) {
        return this.config[key] !== undefined ? this.config[key] : defaultValue;
    }
}

module.exports = {
    ModuleInterface,
    ModuleMetadata,
    ConfigSchema,
    HealthStatus,
    ValidationError,
    ModuleContext
};