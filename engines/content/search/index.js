const { Module } = require('../../Module');
const RepoSuggesterService = require('./services/repo-suggester');
const createSuggestionRoutes = require('./routes/suggestions');

class SearchModule extends Module {
    constructor(options = {}) {
        super({
            id: 'search',
            name: 'Search Module',
            version: '1.0.0',
            description: 'Repository suggestions and search',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'content';
    }

    async _onInitialize() {
        const db = this.context.database;

        const repoSuggester = new RepoSuggesterService(db, null);
        await repoSuggester.initialize();
        this.addService('repo-suggester', repoSuggester);
    }

    async _onStart() {
        const repoSuggester = this.getService('repo-suggester');
        this.suggestionRoutes = createSuggestionRoutes(repoSuggester);
    }

    async _onStop() {
        const repoSuggester = this.getService('repo-suggester');
        await repoSuggester.stop();
    }

    async _onHealthCheck(checks) {
        const repoSuggester = this.getService('repo-suggester');
        const health = await repoSuggester.healthCheck();

        checks.push({
            service: 'repo-suggester',
            status: health.status,
            message: health.message
        });
    }

    getRoutes() {
        return this.suggestionRoutes;
    }
}

module.exports = SearchModule;
