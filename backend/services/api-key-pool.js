// API Key Pool Service
// Manages API key pools for different agent tiers with cost tracking

const crypto = require('crypto');

// Cost per million tokens (USD)
const PRICING = {
    anthropic: {
        'claude-opus-4-20250514': { input: 15.00, output: 75.00 },
        'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
        'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
        'claude-3-5-haiku-20241022': { input: 1.00, output: 5.00 },
        'claude-3-opus-20240229': { input: 15.00, output: 75.00 }
    },
    openai: {
        'gpt-4o': { input: 5.00, output: 15.00 },
        'gpt-4o-mini': { input: 0.15, output: 0.60 },
        'gpt-4-turbo': { input: 10.00, output: 30.00 },
        'gpt-3.5-turbo': { input: 0.50, output: 1.50 }
    },
    openrouter: {
        'anthropic/claude-opus-4': { input: 15.00, output: 75.00 },
        'anthropic/claude-sonnet-4': { input: 3.00, output: 15.00 },
        'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
        'openai/gpt-4o': { input: 5.00, output: 15.00 },
        'google/gemini-pro-1.5': { input: 2.50, output: 10.00 },
        'meta-llama/llama-3.1-70b-instruct': { input: 0.10, output: 0.10 }
    },
    groq: {
        'llama-3.3-70b-versatile': { input: 0.10, output: 0.10 },
        'llama-3.1-70b-versatile': { input: 0.10, output: 0.10 },
        'mixtral-8x7b-32768': { input: 0.10, output: 0.10 }
    }
};

class KeyPool {
    constructor(name, keys = [], budgetLimit = null, budgetPeriod = null) {
        this.name = name;
        this.keys = new Map();
        this.currentIndex = 0;
        this.failedKeys = new Set();
        this.budgetLimit = budgetLimit;
        this.budgetPeriod = budgetPeriod;
        this.spent = 0;
        this.usageStats = {};

        // Initialize keys
        keys.forEach(key => {
            this.keys.set(key, {
                key,
                failures: 0,
                lastUsed: null,
                requestCount: 0
            });
        });
    }

    getNextKey() {
        const availableKeys = Array.from(this.keys.entries())
            .filter(([key]) => !this.failedKeys.has(key))
            .map(([key, meta]) => ({ key, meta }));

        if (availableKeys.length === 0) {
            // Reset failed keys and try again
            this.failedKeys.clear();
            return this.keys.keys().next().value;
        }

        // Round-robin selection
        const selected = availableKeys[this.currentIndex % availableKeys.length];
        this.currentIndex = (this.currentIndex + 1) % availableKeys.length;

        selected.meta.lastUsed = Date.now();
        selected.meta.requestCount++;

        return selected.key;
    }

    markFailed(key) {
        this.failedKeys.add(key);
        const meta = this.keys.get(key);
        if (meta) {
            meta.failures++;
        }
    }

    recordUsage(provider, model, inputTokens, outputTokens) {
        const key = `${provider}:${model}`;
        if (!this.usageStats[key]) {
            this.usageStats[key] = {
                requests: 0,
                inputTokens: 0,
                outputTokens: 0,
                cost: 0
            };
        }

        const cost = this.calculateCost(provider, model, inputTokens, outputTokens);

        this.usageStats[key].requests++;
        this.usageStats[key].inputTokens += inputTokens;
        this.usageStats[key].outputTokens += outputTokens;
        this.usageStats[key].cost += cost;
        this.spent += cost;

        return cost;
    }

    calculateCost(provider, model, inputTokens, outputTokens) {
        const providerPricing = PRICING[provider];
        if (!providerPricing) {
            // Default to conservative estimate
            return (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
        }

        const modelPricing = providerPricing[model];
        if (!modelPricing) {
            // Default to Sonnet pricing
            return (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
        }

        return (inputTokens / 1_000_000) * modelPricing.input +
               (outputTokens / 1_000_000) * modelPricing.output;
    }

    getStats() {
        return {
            poolName: this.name,
            totalKeys: this.keys.size,
            activeKeys: this.keys.size - this.failedKeys.size,
            spent: this.spent,
            budgetLimit: this.budgetLimit,
            budgetRemaining: this.budgetLimit ? this.budgetLimit - this.spent : null,
            usageStats: this.usageStats
        };
    }

    hasKeys() {
        return this.keys.size > 0 && (this.keys.size - this.failedKeys.size) > 0;
    }
}

class APIKeyPool {
    constructor(db) {
        this.db = db;
        this.pools = new Map();
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        // Load environment keys
        this.loadEnvironmentKeys();

        // Load pools from database
        await this.loadPoolsFromDatabase();

        this.initialized = true;
        console.log('API Key Pool initialized');
    }

    loadEnvironmentKeys() {
        // Load keys from environment variables
        const envKeys = {
            anthropic: this.parseEnvKeys(process.env.ANTHROPIC_API_KEYS || process.env.ANTHROPIC_API_KEY),
            openai: this.parseEnvKeys(process.env.OPENAI_API_KEYS || process.env.OPENAI_API_KEY),
            openrouter: this.parseEnvKeys(process.env.OPENROUTER_API_KEYS || process.env.OPENROUTER_API_KEY),
            groq: this.parseEnvKeys(process.env.GROQ_API_KEYS || process.env.GROQ_API_KEY)
        };

        // Create default pool from environment keys
        const defaultKeys = Object.entries(envKeys).flatMap(([provider, keys]) =>
            keys.map(key => ({ provider, key }))
        );

        if (defaultKeys.length > 0) {
            this.createPool('default', defaultKeys, null, null);
        }

        // Create critical pool from CRITICAL_API_KEYS if available
        const criticalKeys = this.parseEnvKeys(process.env.CRITICAL_API_KEYS);
        if (criticalKeys.length > 0) {
            this.createPool('critical', criticalKeys, null, null);
        }
    }

    parseEnvKeys(envString) {
        if (!envString) return [];
        return envString.split(',').map(k => k.trim()).filter(k => k.length > 0);
    }

    async loadPoolsFromDatabase() {
        const pools = this.db.getAllAPIKeyPools();

        for (const pool of pools) {
            const keysByProvider = pool.keys_json;
            const keys = Object.entries(keysByProvider).flatMap(([provider, keys]) =>
                keys.map(key => ({ provider, key }))
            );

            this.createPool(
                pool.name,
                keys,
                pool.budget_limit,
                pool.budget_period
            );
        }
    }

    createPool(name, keys, budgetLimit = null, budgetPeriod = null, priority = 0) {
        // Convert flat key array to provider-based structure
        const keysByProvider = {};
        keys.forEach(({ provider, key }) => {
            if (!keysByProvider[provider]) {
                keysByProvider[provider] = [];
            }
            keysByProvider[provider].push(key);
        });

        const pool = new KeyPool(name, keys.flatMap(k => [k.key]), budgetLimit, budgetPeriod);
        pool.keysByProvider = keysByProvider;
        pool.priority = priority;

        this.pools.set(name, pool);
        return pool;
    }

    getKeyForAgent(agentType, provider) {
        // Determine which pool to use based on agent type
        const poolName = this.getPoolForAgent(agentType);
        const pool = this.pools.get(poolName);

        if (!pool || !pool.hasKeys()) {
            return null;
        }

        return pool.getNextKey();
    }

    getPoolForAgent(agentType) {
        // Map agent types to pools
        const poolMapping = {
            'governance': 'critical',      // Uses critical/Opus keys
            'coordinator': 'critical',     // Uses critical/Opus keys
            'debugger': 'critical',        // Uses critical/Sonnet keys
            'code_review': 'default',      // Uses default/Sonnet keys
            'documentation': 'default',    // Uses default/Sonnet keys
            'repo_manager': 'default',     // Uses default/Sonnet keys
            'visualization': 'default',    // Uses default/Sonnet keys
            'tooling': 'default',          // Uses default/Haiku keys
            'cost_observability': 'default' // Uses default/Haiku keys
        };

        return poolMapping[agentType] || 'default';
    }

    getModelForAgent(agentType) {
        // Map agent types to models (cost optimization)
        const modelMapping = {
            'governance': 'claude-opus-4-20250514',       // Opus for critical decisions
            'coordinator': 'claude-opus-4-20250514',      // Opus for orchestration
            'debugger': 'claude-sonnet-4-20250514',       // Sonnet for debugging
            'code_review': 'claude-sonnet-4-20250514',    // Sonnet for code review
            'documentation': 'claude-3-5-sonnet-20241022', // Sonnet for docs
            'repo_manager': 'claude-3-5-sonnet-20241022', // Sonnet for repo management
            'visualization': 'claude-3-5-sonnet-20241022', // Sonnet for visualization
            'tooling': 'claude-3-5-haiku-20241022',       // Haiku for simple tooling
            'cost_observability': 'claude-3-5-haiku-20241022' // Haiku for monitoring
        };

        return modelMapping[agentType] || 'claude-3-5-sonnet-20241022';
    }

    getProviderForAgent(agentType) {
        // Default to anthropic, but could be configurable
        return 'anthropic';
    }

    recordCost(agentId, provider, model, inputTokens, outputTokens) {
        const poolName = this.getDefaultPoolName();
        const pool = this.pools.get(poolName);

        if (!pool) return 0;

        return pool.recordUsage(provider, model, inputTokens, outputTokens);
    }

    calculateCost(provider, model, inputTokens, outputTokens) {
        const pool = this.pools.get('default');
        if (!pool) return 0;

        return pool.calculateCost(provider, model, inputTokens, outputTokens);
    }

    predictCost(agentType, taskData) {
        const provider = this.getProviderForAgent(agentType);
        const model = this.getModelForAgent(agentType);

        // Estimate tokens based on task type
        const estimates = {
            'code_review': { input: 5000, output: 2000 },
            'doc_gen': { input: 3000, output: 3000 },
            'debugger': { input: 4000, output: 1500 },
            'dependency_check': { input: 2000, output: 1000 },
            'tooling_suggest': { input: 2000, output: 1000 },
            'visualization': { input: 3000, output: 2000 },
            'cost_monitor': { input: 1000, output: 500 }
        };

        const estimate = estimates[agentType] || { input: 2000, output: 1000 };

        return this.calculateCost(provider, model, estimate.input, estimate.output);
    }

    getStats() {
        const stats = {
            pools: {},
            totalSpent: 0,
            totalBudgetLimit: 0
        };

        for (const [name, pool] of this.pools) {
            stats.pools[name] = pool.getStats();
            stats.totalSpent += pool.spent;
            stats.totalBudgetLimit += pool.budgetLimit || 0;
        }

        return stats;
    }

    getPoolStats(poolName) {
        const pool = this.pools.get(poolName);
        return pool ? pool.getStats() : null;
    }

    getDefaultPoolName() {
        return this.pools.has('default') ? 'default' : this.pools.keys().next().value;
    }

    hasKeys(provider) {
        // Check if any pool has keys for the given provider
        for (const pool of this.pools.values()) {
            if (pool.keysByProvider && pool.keysByProvider[provider]) {
                return true;
            }
        }
        return false;
    }

    getAvailableProviders() {
        const providers = new Set();
        for (const pool of this.pools.values()) {
            if (pool.keysByProvider) {
                Object.keys(pool.keysByProvider).forEach(p => providers.add(p));
            }
        }
        return Array.from(providers);
    }

    markKeyFailed(key) {
        for (const pool of this.pools.values()) {
            if (pool.keys.has(key)) {
                pool.markFailed(key);
            }
        }
    }
}

module.exports = APIKeyPool;
module.exports.PRICING = PRICING;
