const { Module } = require('../../../Module');
const DocIndexerService = require('./services/doc-indexer');
const Context7Server = require('./services/context7-server');
const createContext7Routes = require('./routes/context7');

class DocumentationModule extends Module {
    constructor(options = {}) {
        super({
            id: 'documentation',
            name: 'Documentation Module',
            version: '1.0.0',
            description: 'Documentation indexing and Context7 MCP server',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'content';
    }

    async _onInitialize() {
        const db = this.context.database;

        const docIndexer = new DocIndexerService(db);
        this.addService('doc-indexer', docIndexer);

        const docPath = path.join(process.cwd(), '../docs/finallica');
        const context7Server = new Context7Server(docPath, db, docIndexer);
        this.addService('context7-server', context7Server);
    }

    async _onStart() {
        const context7Server = this.getService('context7-server');

        await context7Server.initialize(31338);

        this.context7Routes = createContext7Routes(context7Server, this.getService('doc-indexer'));
    }

    async _onStop() {
        const context7Server = this.getService('context7-server');
        await context7Server.stop();
    }

    async _onHealthCheck(checks) {
        const context7Server = this.getService('context7-server');
        const health = await context7Server.healthCheck();

        checks.push({
            service: 'context7-server',
            status: health.status,
            message: health.message
        });
    }

    getRoutes() {
        return this.context7Routes;
    }
}

const path = require('path');
module.exports = DocumentationModule;
