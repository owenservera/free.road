const Engine = require('../Engine');
const DocumentationModule = require('./documentation/index');
const SearchModule = require('./search/index');

/**
 * Content Engine - Manages documentation and search
 */
class ContentEngine extends Engine {
    constructor(options = {}) {
        super({
            id: 'content',
            name: 'Content Engine',
            version: '1.0.0',
            description: 'Content management, documentation, and search',
            ...options
        });
    }

    /**
     * Get engine type
     * @returns {string}
     */
    getEngineType() {
        return 'content';
    }

    /**
     * Setup engine configuration and register modules
     * @private
     */
    async _setupConfiguration() {
        // Register Documentation module
        const docModule = new DocumentationModule(this.config.documentation || {});
        await this.registerModule(docModule);

        // Register Search module
        const searchModule = new SearchModule(this.config.search || {});
        await this.registerModule(searchModule);
    }

    /**
     * Handle events from other engines
     * @param {Object} event - Event object
     */
    async onEvent(event) {
        switch (event.type) {
            case 'repository:synced':
                // Trigger document reindexing when repository syncs
                const docModule = this.getModule('documentation');
                if (docModule && docModule.getService) {
                    const docIndexer = docModule.getService('doc-indexer');
                    if (docIndexer && docIndexer.indexRepository) {
                        await docIndexer.indexRepository(event.data.repositoryId);
                    }
                }
                break;
            default:
                await super.onEvent(event);
        }
    }

    async _startServices() {
        console.log('📄 Content services starting');
    }

    async _stopServices() {
        console.log('📄 Content services stopped');
    }

    async getHealth() {
        const engineHealth = await super.getHealth();

        return {
            ...engineHealth,
            engine: 'content',
            capabilities: ['documentation', 'search', 'indexing']
        };
    }
}

module.exports = ContentEngine;
