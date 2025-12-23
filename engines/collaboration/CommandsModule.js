const { Module } = require('../Module');

class CommandsModule extends Module {
    constructor(options = {}) {
        super({
            id: 'commands',
            name: 'Commands Module',
            version: '1.0.0',
            description: 'Custom command management system',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'collaboration';
    }

    async _onInitialize() {
        const db = this.context.database;

        const CommandRegistry = require('./services/commands');
        const commandRegistry = new CommandRegistry(db);
        await commandRegistry.initialize();
        this.addService('commands', commandRegistry);
    }

    async _onStart() {
        this.commandRoutes = require('./routes/commands')(this.getService('commands'));
    }

    async _onStop() {
        const commandRegistry = this.getService('commands');
        await commandRegistry.stop();
    }

    async _onHealthCheck(checks) {
        const commandRegistry = this.getService('commands');
        const health = await commandRegistry.healthCheck();

        checks.push({
            service: 'commands',
            status: health.status,
            message: health.message
        });
    }

    getRoutes() {
        return this.commandRoutes;
    }
}

module.exports = CommandsModule;
