const { Module } = require('../../Module');
const DatabaseService = require('./services/database');
const MonitoringService = require('./services/monitoring');
const BackupService = require('./services/backup');

class InfrastructureModule extends Module {
    constructor(options = {}) {
        super({
            id: 'infrastructure',
            name: 'Infrastructure Module',
            version: '1.0.0',
            description: 'Core platform infrastructure services',
            ...options
        });

        this.dependencies = [];
    }

    getEngine() {
        return 'platform';
    }

    getConfigSchema() {
        return {
            database: {
                type: 'object',
                properties: {
                    dbPath: { type: 'string' },
                    reposDir: { type: 'string' }
                }
            },
            monitoring: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    level: { type: 'string' },
                    interval: { type: 'number' }
                }
            },
            backup: {
                type: 'object',
                properties: {
                    enabled: { type: 'boolean' },
                    interval: { type: 'number' },
                    retentionDays: { type: 'number' }
                }
            }
        };
    }

    async _onInitialize() {
        const config = this.config;

        const dbService = new DatabaseService(config.database);
        await dbService.initialize();
        this.addService('database', dbService);

        const monitoringService = new MonitoringService(config.monitoring, this.context);
        this.addService('monitoring', monitoringService);

        const backupService = new BackupService(config.backup, this.context);
        this.addService('backup', backupService);
    }

    async _onStart() {
        const db = this.getService('database');
        await db.connect();

        const monitoring = this.getService('monitoring');
        await monitoring.start();

        const backup = this.getService('backup');
        await backup.start();
    }

    async _onStop() {
        const backup = this.getService('backup');
        if (backup) {
            await backup.stop();
        }

        const monitoring = this.getService('monitoring');
        if (monitoring) {
            await monitoring.stop();
        }

        const db = this.getService('database');
        if (db) {
            await db.disconnect();
        }
    }

    async _onHealthCheck(checks) {
        const db = this.getService('database');
        if (db) {
            const health = await db.healthCheck();
            checks.push({
                service: 'database',
                status: health.status,
                message: health.message
            });
        }

        const monitoring = this.getService('monitoring');
        if (monitoring) {
            const health = await monitoring.healthCheck();
            checks.push({
                service: 'monitoring',
                status: health.status,
                message: health.message
            });
        }

        const backup = this.getService('backup');
        if (backup) {
            const health = await backup.healthCheck();
            checks.push({
                service: 'backup',
                status: health.status,
                message: health.message
            });
        }
    }
}

module.exports = InfrastructureModule;
