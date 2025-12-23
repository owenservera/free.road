// Module Loader and Registry
// Part of Finallica's open architecture

const fs = require('fs').promises;
const path = require('path');
const { ModuleRegistry } = require('./types/ModuleManifest');
const { Module } = require('../engines/Module');

/**
 * Module loader class
 */
class ModuleLoader {
    constructor(options = {}) {
        this.registry = options.registry || new ModuleRegistry();
        this.engines = new Map();
        this.modules = new Map();
        this.loadedModules = new Map();
        this.modulePath = options.modulePath || './engines';
        this.config = options.config || {};
        this.logger = options.logger || console;
        this.eventBus = options.eventBus;
    }

    /**
     * Load all engines and modules
     * @param {Object} systemInfo - System information
     * @returns {Promise<void>}
     */
    async loadAll(systemInfo = {}) {
        try {
            this.logger.log('info', '🔍 Loading engines and modules...');

            // Load engines first
            await this._loadEngines(systemInfo);

            // Load modules
            await this._loadModules(systemInfo);

            // Resolve dependencies
            await this._resolveDependencies();

            this.logger.log('info', `✅ Loaded ${this.engines.size} engines and ${this.loadedModules.size} modules`);
        } catch (error) {
            this.logger.error('Failed to load engines and modules:', error);
            throw error;
        }
    }

    /**
     * Load all engines
     * @private
     */
    async _loadEngines(systemInfo) {
        const engineDir = path.join(this.modulePath);

        try {
            const entries = await fs.readdir(engineDir, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    await this._loadEngine(entry.name, systemInfo);
                }
            }
        } catch (error) {
            this.logger.error('Failed to load engines:', error);
            throw error;
        }
    }

    /**
     * Load a specific engine
     * @private
     */
    async _loadEngine(engineName, systemInfo) {
        const enginePath = path.join(this.modulePath, engineName);
        const manifestPath = path.join(enginePath, 'ModuleManifest.json');

        try {
            // Load engine manifest
            const manifest = await this._loadManifest(manifestPath);

            // Check compatibility
            if (!manifest.isCompatible(systemInfo)) {
                this.logger.warn(`Engine ${engineName} is not compatible with this system`);
                return;
            }

            // Load engine implementation
            const engineModule = await this._loadModule(manifest.main, enginePath);
            const EngineClass = engineModule.default || engineModule;

            if (!EngineClass) {
                throw new Error(`Engine ${engineName} doesn't export a default class`);
            }

            // Create engine instance
            const engine = new EngineClass({
                id: engineName,
                name: manifest.name,
                version: manifest.version,
                description: manifest.description,
                config: this.config[engineName] || {},
                eventBus: this.eventBus
            });

            // Register engine
            this.engines.set(engineName, {
                instance: engine,
                manifest: manifest,
                path: enginePath
            });

            this.logger.log('info', `🚀 Engine ${engineName} loaded`);

            // Initialize engine
            await engine.initialize({
                system: systemInfo,
                config: this.config
            });

            // Register modules from this engine
            for (const entry of await fs.readdir(enginePath, { withFileTypes: true })) {
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    await this._loadEngineModules(engineName, entry.name, systemInfo);
                }
            }
        } catch (error) {
            this.logger.error(`Failed to load engine ${engineName}:`, error);
            throw error;
        }
    }

    /**
     * Load modules for an engine
     * @private
     */
    async _loadEngineModules(engineName, moduleName, systemInfo) {
        const modulePath = path.join(this.modulePath, engineName, moduleName);
        const manifestPath = path.join(modulePath, 'ModuleManifest.json');

        try {
            const manifest = await this._loadManifest(manifestPath);

            // Check engine compatibility
            if (manifest.engine !== engineName) {
                this.logger.warn(`Module ${manifest.id} is not for engine ${engineName}`);
                return;
            }

            // Check compatibility
            if (!manifest.isCompatible(systemInfo)) {
                this.logger.warn(`Module ${manifest.id} is not compatible with this system`);
                return;
            }

            // Load module implementation
            const moduleModule = await this._loadModule(manifest.main, modulePath);
            const ModuleClass = moduleModule.default || moduleModule;

            if (!ModuleClass) {
                throw new Error(`Module ${manifest.id} doesn't export a default class`);
            }

            // Store module info
            this.modules.set(manifest.id, {
                class: ModuleClass,
                manifest: manifest,
                path: modulePath,
                engine: engineName
            });

            // Register in global registry
            this.registry.register(manifest);

            this.logger.log('info', `📦 Module ${manifest.id} loaded`);
        } catch (error) {
            this.logger.error(`Failed to load module ${moduleName} for engine ${engineName}:`, error);
            // Don't throw - continue loading other modules
        }
    }

    /**
     * Load all modules
     * @private
     */
    async _loadModules(systemInfo) {
        for (const [moduleId, moduleInfo] of this.modules) {
            // Skip if module is already loaded
            if (this.loadedModules.has(moduleId)) {
                continue;
            }

            try {
                await this._loadModuleInstance(moduleInfo, systemInfo);
            } catch (error) {
                this.logger.error(`Failed to create instance of module ${moduleId}:`, error);
            }
        }
    }

    /**
     * Create instance of a module
     * @private
     */
    async _loadModuleInstance(moduleInfo, systemInfo) {
        const { class: ModuleClass, manifest, engine } = moduleInfo;

        // Get engine instance
        const engineInfo = this.engines.get(engine);
        if (!engineInfo) {
            throw new Error(`Engine ${engine} not found for module ${manifest.id}`);
        }

        // Create module instance
        const module = new ModuleClass({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            description: manifest.description,
            author: manifest.author,
            license: manifest.license,
            keywords: manifest.keywords,
            dependencies: manifest.dependencies,
            config: this.config.modules?.[manifest.id] || manifest.defaults || {}
        });

        // Store module
        this.loadedModules.set(manifest.id, {
            instance: module,
            manifest: manifest,
            engine: engine
        });

        // Register module with engine
        await engineInfo.instance.registerModule(module);

        this.logger.log('info', `🎯 Module ${manifest.id} instantiated`);
    }

    /**
     * Resolve dependencies
     * @private
     */
    async _resolveDependencies() {
        const loadOrder = this._calculateLoadOrder();

        for (const moduleId of loadOrder) {
            const moduleInfo = this.loadedModules.get(moduleId);
            if (moduleInfo && moduleInfo.state === 'uninitialized') {
                const engineInfo = this.engines.get(moduleInfo.engine);
                await moduleInfo.instance.initialize(engineInfo.instance._createModuleContext(moduleInfo.instance));
            }
        }
    }

    /**
     * Calculate module load order based on dependencies
     * @private
     */
    _calculateLoadOrder() {
        const modules = Array.from(this.loadedModules.entries());
        const visited = new Set();
        const temp = new Set();
        const result = [];

        const visit = (moduleId) => {
            if (temp.has(moduleId)) {
                throw new Error(`Circular dependency detected involving ${moduleId}`);
            }

            if (visited.has(moduleId)) {
                return;
            }

            temp.add(moduleId);

            const moduleInfo = this.loadedModules.get(moduleId);
            if (moduleInfo) {
                for (const dep of moduleInfo.instance.dependencies) {
                    visit(dep);
                }
            }

            temp.delete(moduleId);
            visited.add(moduleId);
            result.push(moduleId);
        };

        for (const [moduleId] of modules) {
            visit(moduleId);
        }

        return result;
    }

    /**
     * Start all engines and modules
     * @returns {Promise<void>}
     */
    async startAll() {
        try {
            this.logger.log('info', '🚀 Starting all engines and modules...');

            // Start engines first
            for (const [engineName, engineInfo] of this.engines) {
                await engineInfo.instance.start();
            }

            // Start modules
            for (const [moduleId, moduleInfo] of this.loadedModules) {
                if (moduleInfo.instance.state === 'initialized') {
                    await moduleInfo.instance.start();
                }
            }

            this.logger.log('info', '✅ All engines and modules started');
        } catch (error) {
            this.logger.error('Failed to start engines and modules:', error);
            throw error;
        }
    }

    /**
     * Stop all engines and modules
     * @returns {Promise<void>}
     */
    async stopAll() {
        try {
            this.logger.log('info', '🛑 Stopping all engines and modules...');

            // Stop modules first
            for (const [moduleId, moduleInfo] of this.loadedModules) {
                if (moduleInfo.instance.state === 'running') {
                    await moduleInfo.instance.stop();
                }
            }

            // Stop engines
            for (const [engineName, engineInfo] of this.engines) {
                await engineInfo.instance.stop();
            }

            this.logger.log('info', '✅ All engines and modules stopped');
        } catch (error) {
            this.logger.error('Failed to stop engines and modules:', error);
            throw error;
        }
    }

    /**
     * Get engine by name
     * @param {string} engineName - Engine name
     * @returns {Object} Engine instance
     */
    getEngine(engineName) {
        return this.engines.get(engineName)?.instance;
    }

    /**
     * Get module by ID
     * @param {string} moduleId - Module ID
     * @returns {Object} Module instance
     */
    getModule(moduleId) {
        return this.loadedModules.get(moduleId)?.instance;
    }

    /**
     * Get all engines
     * @returns {Map} Engine instances
     */
    getEngines() {
        return new Map(this.engines);
    }

    /**
     * Get all modules
     * @returns {Map} Module instances
     */
    getModules() {
        return new Map(this.loadedModules);
    }

    /**
     * Get module registry
     * @returns {ModuleRegistry}
     */
    getRegistry() {
        return this.registry;
    }

    /**
     * Get system health
     * @returns {Promise<Object>}
     */
    async getHealth() {
        const engineHealth = new Map();
        const moduleHealth = new Map();

        // Get engine health
        for (const [engineName, engineInfo] of this.engines) {
            try {
                const health = await engineInfo.instance.getHealth();
                engineHealth.set(engineName, health);
            } catch (error) {
                engineHealth.set(engineName, {
                    engine: engineName,
                    status: 'unhealthy',
                    error: error.message
                });
            }
        }

        // Get module health
        for (const [moduleId, moduleInfo] of this.loadedModules) {
            try {
                const health = await moduleInfo.instance.healthCheck();
                moduleHealth.set(moduleId, health);
            } catch (error) {
                moduleHealth.set(moduleId, {
                    module: moduleId,
                    status: 'unhealthy',
                    error: error.message
                });
            }
        }

        return {
            timestamp: Date.now(),
            engines: Object.fromEntries(engineHealth),
            modules: Object.fromEntries(moduleHealth),
            overall: this._calculateOverallHealth(engineHealth, moduleHealth)
        };
    }

    /**
     * Calculate overall health status
     * @private
     */
    _calculateOverallHealth(engineHealth, moduleHealth) {
        const allHealth = [...engineHealth.values(), ...moduleHealth.values()];

        if (allHealth.length === 0) {
            return 'healthy';
        }

        const healthyCount = allHealth.filter(h => h.status === 'healthy').length;
        const unhealthyCount = allHealth.filter(h => h.status === 'unhealthy').length;

        if (unhealthyCount === 0) {
            return 'healthy';
        }

        if (unhealthyCount > 0 && unhealthyCount < allHealth.length) {
            return 'degraded';
        }

        return 'unhealthy';
    }

    /**
     * Load manifest from file
     * @private
     */
    async _loadManifest(manifestPath) {
        try {
            const manifestModule = await import(path.resolve(manifestPath));
            return manifestModule.default;
        } catch (error) {
            throw new Error(`Failed to load manifest from ${manifestPath}: ${error.message}`);
        }
    }

    /**
     * Load module file
     * @private
     */
    async _loadModule(modulePath, basePath) {
        const fullPath = path.resolve(basePath, modulePath);
        try {
            return await import(fullPath);
        } catch (error) {
            throw new Error(`Failed to load module from ${fullPath}: ${error.message}`);
        }
    }

    /**
     * Get system information
     * @returns {Object}
     */
    static getSystemInfo() {
        return {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            memoryUsage: process.memoryUsage(),
            cpus: require('os').cpus(),
            hostname: require('os').hostname(),
            env: process.env.NODE_ENV || 'development'
        };
    }
}

/**
 * Create and initialize module loader
 * @param {Object} options - Loader options
 * @returns {Promise<ModuleLoader>}
 */
async function createModuleLoader(options = {}) {
    const loader = new ModuleLoader(options);

    // Get system info
    const systemInfo = ModuleLoader.getSystemInfo();

    // Load all engines and modules
    await loader.loadAll(systemInfo);

    return loader;
}

module.exports = { ModuleLoader, createModuleLoader };