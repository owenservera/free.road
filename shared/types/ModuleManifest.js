// Module Manifest System
// Part of Finallica's open architecture

const fs = require('fs').promises;
const path = require('path');
const { ModuleMetadata } = require('./ModuleInterface');

/**
 * Module manifest structure
 */
class ModuleManifest {
    constructor(data) {
        this.id = data.id || '';
        this.name = data.name || this.id;
        this.version = data.version || '1.0.0';
        this.description = data.description || '';
        this.author = data.author || '';
        this.license = data.license || 'MIT';
        this.keywords = data.keywords || [];
        this.repository = data.repository || '';
        this.documentation = data.documentation || '';

        // Engine and module information
        this.engine = data.engine || '';
        this.type = data.type || 'core'; // 'core', 'contrib', 'plugin'

        // Dependencies
        this.dependencies = data.dependencies || []; // Other module IDs
        this.engines = data.engines || {}; // Engine requirements
        this.node = data.node || { required: true, version: '>=18.0.0' };

        // Entry points
        this.main = data.main || './index.js';
        this.bin = data.bin || {};
        this.files = data.files || ['dist', 'src', 'README.md'];

        // Configuration
        this.config = data.config || {};
        this.schemas = data.schemas || {};
        this.defaults = data.defaults || {};

        // Runtime information
        this.activation = data.activation || 'on-demand'; // 'on-demand', 'on-start', 'lazy'
        this.critical = data.critical || false;
        this.singleton = data.singleton || false;

        // API surface
        this.api = data.api || {};
        this.routes = data.routes || [];
        this.services = data.services || [];
        this.hooks = data.hooks || [];
        this.extensions = data.extensions || [];

        // Metadata
        this.tags = data.tags || [];
        this.categories = data.categories || [];
        this.keywords = data.keywords || [];

        // Support information
        this.bugs = data.bugs || {};
        this.contributors = data.contributors || [];
        this.funding = data.funding || {};

        // Development
        this.devDependencies = data.devDependencies || {};
        this.scripts = data.scripts || {};
        this.engines.dev = data.engines?.dev || 'node >=18.0.0';

        // Validation
        this.validate();
    }

    /**
     * Validate manifest
     * @throws {Error} If manifest is invalid
     */
    validate() {
        if (!this.id) {
            throw new Error('Module ID is required');
        }

        if (!this.version) {
            throw new Error('Module version is required');
        }

        if (!this.engine) {
            throw new Error('Engine is required');
        }

        // Validate version format
        if (!/^\d+\.\d+\.\d+(-[\w-]+(\.\d+)*)?(\+[\w-]+)?$/.test(this.version)) {
            throw new Error('Invalid version format');
        }

        // Validate dependencies format
        for (const dep of this.dependencies) {
            if (typeof dep === 'string') {
                const depMatch = dep.match(/^(@[\w-]+\/)?([\w-]+)(@[\^~]?\d+\.\d+\.\d+(-[\w-]+(\.\d+)*)?(\+[\w-]+)?)?$/);
                if (!depMatch) {
                    throw new Error(`Invalid dependency format: ${dep}`);
                }
            }
        }

        // Validate routes format
        for (const route of this.routes) {
            if (!route.path || !route.method) {
                throw new Error('Route must have path and method');
            }
        }

        // Validate services format
        for (const service of this.services) {
            if (!service.name || !service.path) {
                throw new Error('Service must have name and path');
            }
        }
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
            main: this.main,
            bin: this.bin,
            files: this.files,
            scripts: this.scripts,
            dependencies: this.dependencies.reduce((acc, dep) => {
                if (typeof dep === 'string') {
                    const [name, version] = dep.split('@');
                    acc[name] = version || '*';
                } else {
                    acc[dep.name] = dep.version || '*';
                }
                return acc;
            }, {}),
            devDependencies: this.devDependencies,
            engines: this.engines,
            os: ['!win32'], // Unix-like systems preferred
            cpu: ['x64', 'arm64'],
            keywords: ['finallica', this.engine, ...this.keywords],
            author: this.author,
            license: this.license,
            repository: this.repository ? {
                type: 'git',
                url: this.repository
            } : undefined,
            homepage: this.documentation,
            bugs: this.bugs,
            contributors: this.contributors,
            funding: this.funding,
            finallica: {
                engine: this.engine,
                type: this.type,
                activation: this.activation,
                critical: this.critical,
                singleton: this.singleton,
                config: this.config,
                schemas: this.schemas,
                defaults: this.defaults,
                api: this.api,
                routes: this.routes,
                services: this.services,
                hooks: this.hooks,
                extensions: this.extensions,
                tags: this.tags,
                categories: this.categories
            }
        };
    }

    /**
     * Get metadata object
     * @returns {ModuleMetadata}
     */
    toMetadata() {
        return new ModuleMetadata({
            id: this.id,
            name: this.name,
            version: this.version,
            description: this.description,
            author: this.author,
            engine: this.engine,
            dependencies: this.dependencies,
            keywords: this.keywords,
            license: this.license
        });
    }

    /**
     * Check if module can run on current system
     * @param {Object} systemInfo - System information
     * @returns {boolean}
     */
    isCompatible(systemInfo) {
        // Check engine compatibility
        if (this.engines.system && this.engines.system !== systemInfo.platform) {
            return false;
        }

        // Check Node.js version
        if (this.engines.node && !this._checkNodeVersion(systemInfo.nodeVersion)) {
            return false;
        }

        return true;
    }

    /**
     * Check Node.js version compatibility
     * @private
     */
    _checkNodeVersion(nodeVersion) {
        if (!nodeVersion || !this.node) {
            return true;
        }

        const versionRange = this.node.version || '>=18.0.0';
        return this._satisfiesVersion(nodeVersion, versionRange);
    }

    /**
     * Check version satisfies range
     * @private
     */
    _satisfiesVersion(version, range) {
        // Simplified version check - in production use semver
        if (range.startsWith('>=') && !range.includes('<')) {
            const minVersion = range.substring(2);
            return version >= minVersion;
        }

        if (range.startsWith('^') && !range.includes('<')) {
            const minVersion = range.substring(1);
            const major = parseInt(minVersion.split('.')[0]);
            const currentMajor = parseInt(version.split('.')[0]);
            return currentMajor === major;
        }

        return version === range;
    }

    /**
     * Create manifest from JSON file
     * @param {string} filePath - Path to manifest file
     * @returns {Promise<ModuleManifest>}
     */
    static async fromFile(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const data = JSON.parse(content);
            return new ModuleManifest(data);
        } catch (error) {
            throw new Error(`Failed to load manifest from ${filePath}: ${error.message}`);
        }
    }

    /**
     * Create manifest from directory
     * @param {string} dirPath - Path to module directory
     * @returns {Promise<ModuleManifest>}
     */
    static async fromDirectory(dirPath) {
        const manifestPath = path.join(dirPath, 'module.json');

        try {
            return await ModuleManifest.fromFile(manifestPath);
        } catch (error) {
            throw new Error(`Failed to load manifest from directory ${dirPath}: ${error.message}`);
        }
    }

    /**
     * Save manifest to file
     * @param {string} filePath - Path to save manifest
     * @returns {Promise<void>}
     */
    async save(filePath) {
        const content = JSON.stringify(this, null, 2);
        await fs.writeFile(filePath, content, 'utf8');
    }

    /**
     * Clone manifest
     * @returns {ModuleManifest}
     */
    clone() {
        return new ModuleManifest(this);
    }

    /**
     * Update manifest with new data
     * @param {Object} updates - Updates to apply
     * @returns {ModuleManifest}
     */
    update(updates) {
        const newData = { ...this, ...updates };
        return new ModuleManifest(newData);
    }

    /**
     * Get manifest as JSON
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            version: this.version,
            description: this.description,
            author: this.author,
            license: this.license,
            keywords: this.keywords,
            repository: this.repository,
            documentation: this.documentation,
            engine: this.engine,
            type: this.type,
            dependencies: this.dependencies,
            engines: this.engines,
            node: this.node,
            main: this.main,
            bin: this.bin,
            files: this.files,
            config: this.config,
            schemas: this.schemas,
            defaults: this.defaults,
            activation: this.activation,
            critical: this.critical,
            singleton: this.singleton,
            api: this.api,
            routes: this.routes,
            services: this.services,
            hooks: this.hooks,
            extensions: this.extensions,
            tags: this.tags,
            categories: this.categories,
            bugs: this.bugs,
            contributors: this.contributors,
            funding: this.funding,
            devDependencies: this.devDependencies,
            scripts: this.scripts
        };
    }
}

/**
 * Module registry
 */
class ModuleRegistry {
    constructor() {
        this.modules = new Map();
        this.engines = new Map();
        this.indexes = {
            byEngine: new Map(),
            byType: new Map(),
            byTag: new Map(),
            byCategory: new Map()
        };
    }

    /**
     * Register a module manifest
     * @param {ModuleManifest} manifest - Module manifest
     * @returns {void}
     */
    register(manifest) {
        // Check if already registered
        if (this.modules.has(manifest.id)) {
            throw new Error(`Module ${manifest.id} is already registered`);
        }

        // Register module
        this.modules.set(manifest.id, manifest);

        // Update indexes
        this._updateIndexes(manifest);

        console.log(`📦 Module ${manifest.id} registered`);
    }

    /**
     * Unregister a module
     * @param {string} moduleId - Module ID
     * @returns {void}
     */
    unregister(moduleId) {
        if (!this.modules.has(moduleId)) {
            throw new Error(`Module ${moduleId} not found`);
        }

        const manifest = this.modules.get(moduleId);

        // Remove from registry
        this.modules.delete(moduleId);

        // Remove from indexes
        this._removeFromIndexes(manifest);

        console.log(`📦 Module ${moduleId} unregistered`);
    }

    /**
     * Get module by ID
     * @param {string} moduleId - Module ID
     * @returns {ModuleManifest}
     */
    get(moduleId) {
        return this.modules.get(moduleId);
    }

    /**
     * Get all modules
     * @returns {Array<ModuleManifest>}
     */
    getAll() {
        return Array.from(this.modules.values());
    }

    /**
     * Get modules by engine
     * @param {string} engine - Engine name
     * @returns {Array<ModuleManifest>}
     */
    getByEngine(engine) {
        return this.indexes.byEngine.get(engine) || [];
    }

    /**
     * Get modules by type
     * @param {string} type - Module type
     * @returns {Array<ModuleManifest>}
     */
    getByType(type) {
        return this.indexes.byType.get(type) || [];
    }

    /**
     * Get modules by tag
     * @param {string} tag - Tag
     * @returns {Array<ModuleManifest>}
     */
    getByTag(tag) {
        return this.indexes.byTag.get(tag) || [];
    }

    /**
     * Get modules by category
     * @param {string} category - Category
     * @returns {Array<ModuleManifest>}
     */
    getByCategory(category) {
        return this.indexes.byCategory.get(category) || [];
    }

    /**
     * Search modules
     * @param {Object} options - Search options
     * @param {string} options.query - Search query
     * @param {string} options.engine - Filter by engine
     * @param {string} options.type - Filter by type
     * @param {string} options.tag - Filter by tag
     * @param {string} options.category - Filter by category
     * @param {boolean} options.critical - Filter by critical
     * @param {string} options.activation - Filter by activation
     * @returns {Array<ModuleManifest>}
     */
    search(options = {}) {
        let results = Array.from(this.modules.values());

        // Filter by engine
        if (options.engine) {
            results = results.filter(m => m.engine === options.engine);
        }

        // Filter by type
        if (options.type) {
            results = results.filter(m => m.type === options.type);
        }

        // Filter by tag
        if (options.tag) {
            results = results.filter(m => m.tags.includes(options.tag));
        }

        // Filter by category
        if (options.category) {
            results = results.filter(m => m.categories.includes(options.category));
        }

        // Filter by critical
        if (options.critical !== undefined) {
            results = results.filter(m => m.critical === options.critical);
        }

        // Filter by activation
        if (options.activation) {
            results = results.filter(m => m.activation === options.activation);
        }

        // Search query
        if (options.query) {
            const query = options.query.toLowerCase();
            results = results.filter(m =>
                m.name.toLowerCase().includes(query) ||
                m.description.toLowerCase().includes(query) ||
                m.id.toLowerCase().includes(query) ||
                m.keywords.some(k => k.toLowerCase().includes(query))
            );
        }

        return results;
    }

    /**
     * Get module statistics
     * @returns {Object}
     */
    getStats() {
        return {
            total: this.modules.size,
            byEngine: this._countByIndex('byEngine'),
            byType: this._countByIndex('byType'),
            byActivation: this._countByActivation(),
            critical: Array.from(this.modules.values()).filter(m => m.critical).length
        };
    }

    /**
     * Load manifests from directory
     * @param {string} dirPath - Directory path
     * @returns {Promise<Array<ModuleManifest>>}
     */
    async loadFromDirectory(dirPath) {
        const manifests = [];
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                try {
                    const manifest = await ModuleManifest.fromDirectory(
                        path.join(dirPath, entry.name)
                    );
                    manifests.push(manifest);
                } catch (error) {
                    console.warn(`Failed to load manifest from ${entry.name}:`, error.message);
                }
            }
        }

        // Register all manifests
        for (const manifest of manifests) {
            this.register(manifest);
        }

        return manifests;
    }

    /**
     * Update indexes
     * @private
     */
    _updateIndexes(manifest) {
        // By engine
        if (!this.indexes.byEngine.has(manifest.engine)) {
            this.indexes.byEngine.set(manifest.engine, []);
        }
        this.indexes.byEngine.get(manifest.engine).push(manifest);

        // By type
        if (!this.indexes.byType.has(manifest.type)) {
            this.indexes.byType.set(manifest.type, []);
        }
        this.indexes.byType.get(manifest.type).push(manifest);

        // By tag
        for (const tag of manifest.tags) {
            if (!this.indexes.byTag.has(tag)) {
                this.indexes.byTag.set(tag, []);
            }
            this.indexes.byTag.get(tag).push(manifest);
        }

        // By category
        for (const category of manifest.categories) {
            if (!this.indexes.byCategory.has(category)) {
                this.indexes.byCategory.set(category, []);
            }
            this.indexes.byCategory.get(category).push(manifest);
        }
    }

    /**
     * Remove from indexes
     * @private
     */
    _removeFromIndexes(manifest) {
        // By engine
        const engineModules = this.indexes.byEngine.get(manifest.engine);
        if (engineModules) {
            const index = engineModules.findIndex(m => m.id === manifest.id);
            if (index > -1) {
                engineModules.splice(index, 1);
            }
        }

        // By type
        const typeModules = this.indexes.byType.get(manifest.type);
        if (typeModules) {
            const index = typeModules.findIndex(m => m.id === manifest.id);
            if (index > -1) {
                typeModules.splice(index, 1);
            }
        }

        // By tag
        for (const tag of manifest.tags) {
            const tagModules = this.indexes.byTag.get(tag);
            if (tagModules) {
                const index = tagModules.findIndex(m => m.id === manifest.id);
                if (index > -1) {
                    tagModules.splice(index, 1);
                }
            }
        }

        // By category
        for (const category of manifest.categories) {
            const categoryModules = this.indexes.byCategory.get(category);
            if (categoryModules) {
                const index = categoryModules.findIndex(m => m.id === manifest.id);
                if (index > -1) {
                    categoryModules.splice(index, 1);
                }
            }
        }
    }

    /**
     * Count by index
     * @private
     */
    _countByIndex(indexName) {
        const counts = {};
        for (const [key, modules] of this.indexes[indexName]) {
            counts[key] = modules.length;
        }
        return counts;
    }

    /**
     * Count by activation
     * @private
     */
    _countByActivation() {
        const counts = {};
        for (const module of this.modules.values()) {
            counts[module.activation] = (counts[module.activation] || 0) + 1;
        }
        return counts;
    }
}

module.exports = { ModuleManifest, ModuleRegistry };