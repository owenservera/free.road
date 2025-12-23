const { Module } = require('../../../Module');
const PrivacyService = require('./services/privacy');

class PrivacyModule extends Module {
    constructor(options = {}) {
        super({
            id: 'privacy',
            name: 'Privacy Module',
            version: '1.0.0',
            description: 'Tornado Cash privacy integration',
            ...options
        });

        this.dependencies = ['infrastructure'];
    }

    getEngine() {
        return 'governance';
    }

    async _onInitialize() {
        const db = this.context.database;

        const privacyService = new PrivacyService({
            rpcUrl: process.env.RPC_URL || 'https://mainnet.infura.io/v3/YOUR_INFURA_KEY',
            privacyRouterAddress: process.env.PRIVACY_ROUTER_ADDRESS,
            tornadoInstances: {
                ETH_0_1: process.env.TORNADO_ETH_0_1,
                ETH_1: process.env.TORNADO_ETH_1,
                ETH_10: process.env.TORNADO_ETH_10,
                ETH_100: process.env.TORNADO_ETH_100,
                USDC_100: process.env.TORNADO_USDC_100,
                BLF_100: process.env.TORNADO_BLF_100,
                BLF_1000: process.env.TORNADO_BLF_1000
            },
            relayerUrl: process.env.PRIVACY_RELAYER_URL
        });

        this.addService('privacy', privacyService);
    }

    async _onStart() {
        const privacy = this.getService('privacy');
        if (process.env.PRIVACY_ENABLED === 'true') {
            await privacy.start();
        }
    }

    async _onStop() {
        const privacy = this.getService('privacy');
        if (privacy) {
            await privacy.stop();
        }
    }

    async _onHealthCheck(checks) {
        const privacy = this.getService('privacy');
        if (privacy) {
            try {
                // Check if privacy service has healthCheck method
                if (privacy.healthCheck) {
                    const health = await privacy.healthCheck();
                    checks.push({
                        service: 'privacy-service',
                        status: health.status,
                        message: health.message
                    });
                } else {
                    checks.push({
                        service: 'privacy-service',
                        status: 'healthy',
                        message: 'Privacy service initialized'
                    });
                }
            } catch (error) {
                checks.push({
                    service: 'privacy-service',
                    status: 'error',
                    message: error.message
                });
            }
        } else {
            checks.push({
                service: 'privacy-service',
                status: 'disabled',
                message: 'Privacy service not initialized (PRIVACY_ENABLED=false)'
            });
        }
    }
}

module.exports = PrivacyModule;