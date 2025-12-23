const { Module } = require('../../Module');
const ShareService = require('./services/share');
const CommandRegistry = require('./services/commands');
const createShareRoutes = require('./routes/share');
const createCommandRoutes = require('./routes/commands');

class SharingModule extends Module {
    constructor(options = {}) {
        super({
            id: 'sharing',
            name: 'Sharing Module',
            version: '1.0.0',
            description: 'Session sharing and command registry',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'collaboration';
    }

    async _onInitialize() {
        const db = this.context.database;

        const shareService = new ShareService(db);
        this.addService('share', shareService);

        const commandRegistry = new CommandRegistry(db);
        this.addService('commands', commandRegistry);
    }

    async _onStart() {
        const share = this.getService('share');
        this.shareRoutes = createShareRoutes(share, this.context.database);

        const commands = this.getService('commands');
        this.commandRoutes = createCommandRoutes(commands, this.context.database);
    }

    async _onStop() {
        const share = this.getService('share');
        if (share) {
            await share.stop();
        }
    }

    async _onHealthCheck(checks) {
        const share = this.getService('share');
        if (share && share.healthCheck) {
            try {
                const health = await share.healthCheck();
                checks.push({
                    service: 'share-service',
                    status: health.status,
                    message: health.message
                });
            } catch (error) {
                checks.push({
                    service: 'share-service',
                    status: 'error',
                    message: error.message
                });
            }
        }

        const commands = this.getService('commands');
        if (commands) {
            checks.push({
                service: 'command-registry',
                status: 'healthy',
                message: `${commands.get ? 'loaded' : commands.size} commands`
            });
        }
    }

    getRoutes() {
        return {
            ...this.shareRoutes,
            ...this.commandRoutes
        };
    }
}

module.exports = SharingModule;