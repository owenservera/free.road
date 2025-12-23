const Engine = require('../Engine');
const PrivacyModule = require('./privacy/index');

/**
 * Governance Engine - Manages privacy and governance
 */
class GovernanceEngine extends Engine {
    constructor(options = {}) {
        super({
            id: 'governance',
            name: 'Governance Engine',
            version: '1.0.0',
            description: 'Privacy and governance services',
            ...options
        });
    }

    /**
     * Get engine type
     * @returns {string}
     */
    getEngineType() {
        return 'governance';
    }

    /**
     * Setup engine configuration and register modules
     * @private
     */
    async _setupConfiguration() {
        // Register Privacy module
        const privacyModule = new PrivacyModule(this.config.privacy || {});
        await this.registerModule(privacyModule);
    }

    /**
     * Handle events from other engines
     * @param {Object} event - Event object
     */
    async onEvent(event) {
        switch (event.type) {
            case 'transaction:initiated':
                // Apply privacy layer if configured
                const privacyModule = this.getModule('privacy');
                if (privacyModule && privacyModule.getService) {
                    const privacy = privacyModule.getService('privacy');
                    if (privacy && privacy.shouldApplyPrivacy && event.data) {
                        const shouldApply = await privacy.shouldApplyPrivacy(event.data);
                        if (shouldApply && privacy.applyPrivacyLayer) {
                            await privacy.applyPrivacyLayer(event.data);
                        }
                    }
                }
                break;
            default:
                await super.onEvent(event);
        }
    }

    async _startServices() {
        console.log('⚖️ Governance services starting');
    }

    async _stopServices() {
        console.log('⚖️ Governance services stopped');
    }

    async getHealth() {
        const engineHealth = await super.getHealth();

        return {
            ...engineHealth,
            engine: 'governance',
            capabilities: ['privacy', 'governance']
        };
    }
}

module.exports = GovernanceEngine;
