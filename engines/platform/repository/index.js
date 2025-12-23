const { Module } = require('../../Module');
const RepositoryService = require('./services/repository');
const GitSyncService = require('./services/git-sync');
const createRepositoryRoutes = require('./routes/repositories');
const createCollectionRoutes = require('./routes/collections');

class RepositoryModule extends Module {
    constructor(options = {}) {
        super({
            id: 'repository',
            name: 'Repository Module',
            version: '1.0.0',
            description: 'Repository management and Git synchronization',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'platform';
    }

    async _onInitialize() {
        const db = this.context.database;

        const gitSync = new GitSyncService(db.getReposPath());
        this.addService('git-sync', gitSync);

        const repositoryService = new RepositoryService(db);
        this.addService('repository', repositoryService);
    }

    async _onStart() {
        const repositoryService = this.getService('repository');

        this.routes = createRepositoryRoutes(repositoryService, this.getService('git-sync'));
        this.collectionRoutes = createCollectionRoutes(this.context.database);
    }

    async _onStop() {
    }

    async _onHealthCheck(checks) {
        const db = this.context.database;
        const health = await db.healthCheck();

        checks.push({
            service: 'repository',
            status: health.status,
            message: health.message
        });
    }

    getRoutes() {
        return this.routes;
    }

    getCollectionRoutes() {
        return this.collectionRoutes;
    }
}

module.exports = RepositoryModule;
