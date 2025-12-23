const { Module } = require('../Module');

class SharingModule extends Module {
    constructor(options = {}) {
        super({
            id: 'sharing',
            name: 'Sharing Module',
            version: '1.0.0',
            description: 'Session sharing functionality',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'collaboration';
    }

    async _onInitialize() {
        const db = this.context.database;

        const ShareService = require('./services/share');
        const shareService = new ShareService(db);
        this.addService('share', shareService);
    }

    async _onStart() {
        this.shareRoutes = require('./routes/share')(this.getService('share'));
    }

    async _onStop() {
    }

    async _onHealthCheck(checks) {
        const shareService = this.getService('share');
        const health = await shareService.healthCheck();

        checks.push({
            service: 'share',
            status: health.status,
            message: health.message
        });
    }

    getRoutes() {
        return this.shareRoutes;
    }
}

module.exports = SharingModule;
