const { Module } = require('../../../Module');

class AgentFleetModule extends Module {
    constructor(options = {}) {
        super({
            id: 'fleet',
            name: 'Agent Fleet Module',
            version: '1.0.0',
            description: 'AI agent fleet orchestration',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'agents';
    }

    async _onInitialize() {
        const db = this.context.database;
        this.addService('database', db);

        const AgentFleetService = require('./services/agent-fleet');
        const agentFleet = new AgentFleetService(db, null, null);
        await agentFleet.initialize(process.cwd());
        this.addService('agent-fleet', agentFleet);
    }

    async _onStart() {
        const agentFleet = this.getService('agent-fleet');
        await agentFleet.start();
    }

    async _onStop() {
        const agentFleet = this.getService('agent-fleet');
        await agentFleet.stop();
    }

    async _onHealthCheck(checks) {
        const agentFleet = this.getService('agent-fleet');
        const status = agentFleet ? 'running' : 'not_initialized';

        checks.push({
            service: 'agent-fleet',
            status: agentFleet && agentFleet.isRunning ? 'healthy' : 'unhealthy',
            message: `Agent Fleet: ${status}`
        });
    }
}

module.exports = AgentFleetModule;
