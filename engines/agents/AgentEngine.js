const Engine = require('../Engine');
const AgentFleetModule = require('./fleet/index');

/**
 * Agent Engine - Manages AI agent fleet
 */
class AgentEngine extends Engine {
    constructor(options = {}) {
        super({
            id: 'agents',
            name: 'Agent Engine',
            version: '1.0.0',
            description: 'AI agent fleet management',
            ...options
        });
    }

    /**
     * Get engine type
     * @returns {string}
     */
    getEngineType() {
        return 'agents';
    }

    /**
     * Setup engine configuration and register modules
     * @private
     */
    async _setupConfiguration() {
        // Register Agent Fleet module
        const fleetModule = new AgentFleetModule(this.config.fleet || {});
        await this.registerModule(fleetModule);
    }

    /**
     * Handle events from other engines
     * @param {Object} event - Event object
     */
    async onEvent(event) {
        switch (event.type) {
            case 'repository:synced':
                // Notify agents about repository changes
                const fleetModule = this.getModule('fleet');
                if (fleetModule && fleetModule.getService) {
                    const scheduler = fleetModule.getService('scheduler');
                    if (scheduler && scheduler.onRepositorySynced) {
                        await scheduler.onRepositorySynced(event.data);
                    }
                }
                break;
            case 'budget:alert':
                // Handle budget alerts
                if (fleetModule && fleetModule.getService) {
                    const budgetManager = fleetModule.getService('budget-manager');
                    if (budgetManager && budgetManager.handleAlert) {
                        await budgetManager.handleAlert(event.data);
                    }
                }
                break;
            default:
                await super.onEvent(event);
        }
    }

    async _startServices() {
        console.log('🤖 Agent services starting');
    }

    async _stopServices() {
        console.log('🤖 Agent services stopped');
    }

    async getHealth() {
        const engineHealth = await super.getHealth();

        return {
            ...engineHealth,
            engine: 'agents',
            capabilities: ['fleet', 'scheduling', 'budgeting']
        };
    }
}

module.exports = AgentEngine;
