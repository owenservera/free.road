const Engine = require('../Engine');
const SharingModule = require('./sharing/index');

/**
 * Collaboration Engine - Manages sharing and commands
 */
class CollaborationEngine extends Engine {
    constructor(options = {}) {
        super({
            id: 'collaboration',
            name: 'Collaboration Engine',
            version: '1.0.0',
            description: 'Session sharing and command system',
            ...options
        });
    }

    /**
     * Get engine type
     * @returns {string}
     */
    getEngineType() {
        return 'collaboration';
    }

    /**
     * Setup engine configuration and register modules
     * @private
     */
    async _setupConfiguration() {
        // Register Sharing module
        const sharingModule = new SharingModule(this.config.sharing || {});
        await this.registerModule(sharingModule);
    }

    /**
     * Handle events from other engines
     * @param {Object} event - Event object
     */
    async onEvent(event) {
        switch (event.type) {
            case 'session:completed':
                // Auto-share session based on user preferences
                const sharingModule = this.getModule('sharing');
                if (sharingModule && sharingModule.getService) {
                    const shareService = sharingModule.getService('share');
                    if (shareService && shareService.autoShare) {
                        await shareService.autoShare(event.data.sessionId);
                    }
                }
                break;
            case 'command:registered':
                // Notify about new commands
                if (sharingModule && sharingModule.getService) {
                    const commands = sharingModule.getService('commands');
                    if (commands && commands.notify) {
                        await commands.notify(event.data);
                    }
                }
                break;
            default:
                await super.onEvent(event);
        }
    }

    async _startServices() {
        console.log('🤝 Collaboration services starting');
    }

    async _stopServices() {
        console.log('🤝 Collaboration services stopped');
    }

    async getHealth() {
        const engineHealth = await super.getHealth();

        return {
            ...engineHealth,
            engine: 'collaboration',
            capabilities: ['sharing', 'commands', 'sessions']
        };
    }
}

module.exports = CollaborationEngine;
