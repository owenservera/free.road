class KeyPoolService {
    constructor(db) {
        this.db = db;
        this.keys = new Map();
    }

    generateId() {
        return 'key_' + Date.now();
    }

    async initialize() {
        const keys = this.db.executeAll(`
            SELECT * FROM api_key_pools
        `) || [];

        for (const key of keys) {
            this.keys.set(key.id, key);
        }

        console.log(`Loaded ${keys.length} API keys`);
    }

    async getKey(poolId) {
        const keys = this.db.executeAll(`
            SELECT * FROM api_key_pools WHERE pool_id = :pool_id AND active = 1
        `, { ':pool_id': poolId }) || [];

        return keys;
    }

    async addKey(poolId, keyData) {
        const key = {
            id: this.generateId(),
            pool_id: poolId,
            ...keyData,
            active: true,
            created_at: Math.floor(Date.now() / 1000)
        };

        this.keys.set(key.id, key);

        this.db.db.prepare(`
            INSERT INTO api_key_pools (
                id, pool_id, provider, key, active, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            key.id,
            poolId,
            keyData.provider,
            keyData.key,
            1,
            Math.floor(Date.now() / 1000)
        );

        return key;
    }

    async healthCheck() {
        return {
            status: 'healthy',
            message: `Key Pool is running with ${this.keys.size} keys`,
            keysCount: this.keys.size
        };
    }
}

module.exports = KeyPoolService;
