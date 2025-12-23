/**
 * AI Provider Service - Centralized AI Provider Management
 *
 * This service replaces the hardcoded AI_PROVIDERS configuration with:
 * - Dynamic provider registration
 * - Model auto-discovery from provider APIs
 * - Version tracking and deprecation warnings
 * - Streaming support
 * - Smart fallbacks
 */

const https = require('https');
const { URL } = require('url');

// 2025 Model Definitions - Up to date as of December 2025
const LATEST_MODELS = {
    anthropic: {
        name: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        }),
        models: {
            'claude-sonnet-4-20250514': {
                name: 'Claude Sonnet 4',
                maxTokens: 200000,
                contextWindow: 200000,
                released: '2025-05-14',
                capabilities: ['vision', 'function-calling', 'streaming']
            },
            'claude-3-5-sonnet-20241022': {
                name: 'Claude 3.5 Sonnet',
                maxTokens: 200000,
                contextWindow: 200000,
                released: '2024-10-22',
                capabilities: ['vision', 'function-calling', 'streaming']
            },
            'claude-3-5-haiku-20241022': {
                name: 'Claude 3.5 Haiku',
                maxTokens: 200000,
                contextWindow: 200000,
                released: '2024-10-22',
                capabilities: ['vision', 'streaming']
            },
            'claude-3-opus-20240229': {
                name: 'Claude 3 Opus',
                maxTokens: 200000,
                contextWindow: 200000,
                released: '2024-02-29',
                deprecated: true,
                replacedBy: 'claude-sonnet-4-20250514',
                capabilities: ['vision', 'streaming']
            }
        },
        discoverEndpoint: 'https://docs.anthropic.com/en/docs/about-claude/models'
    },
    openai: {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        models: {
            'o1': {
                name: 'o1 (Reasoning)',
                maxTokens: 200000,
                contextWindow: 200000,
                released: '2024-12-17',
                capabilities: ['reasoning', 'function-calling']
            },
            'o1-mini': {
                name: 'o1-mini',
                maxTokens: 128000,
                contextWindow: 128000,
                released: '2024-12-17',
                capabilities: ['reasoning', 'function-calling']
            },
            'gpt-4o': {
                name: 'GPT-4o',
                maxTokens: 128000,
                contextWindow: 128000,
                released: '2024-05-13',
                capabilities: ['vision', 'function-calling', 'streaming', 'audio']
            },
            'gpt-4o-mini': {
                name: 'GPT-4o Mini',
                maxTokens: 128000,
                contextWindow: 128000,
                released: '2024-07-18',
                capabilities: ['vision', 'function-calling', 'streaming', 'audio']
            },
            'gpt-4-turbo': {
                name: 'GPT-4 Turbo',
                maxTokens: 128000,
                contextWindow: 128000,
                released: '2024-04-09',
                capabilities: ['vision', 'function-calling', 'streaming']
            },
            'gpt-3.5-turbo': {
                name: 'GPT-3.5 Turbo',
                maxTokens: 16385,
                contextWindow: 16385,
                released: '2023-11-06',
                deprecated: false,
                capabilities: ['function-calling', 'streaming']
            }
        },
        discoverApi: 'https://api.openai.com/v1/models'
    },
    google: {
        name: 'Google AI',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
        headers: (apiKey) => ({
            'Content-Type': 'application/json'
        }),
        models: {
            'gemini-2.0-flash-exp': {
                name: 'Gemini 2.0 Flash Experimental',
                maxTokens: 1000000,
                contextWindow: 1000000,
                released: '2024-12-11',
                capabilities: ['vision', 'function-calling', 'streaming', 'audio', 'video']
            },
            'gemini-1.5-pro': {
                name: 'Gemini 1.5 Pro',
                maxTokens: 2000000,
                contextWindow: 2000000,
                released: '2024-05-14',
                capabilities: ['vision', 'function-calling', 'streaming', 'audio', 'video']
            },
            'gemini-1.5-flash': {
                name: 'Gemini 1.5 Flash',
                maxTokens: 1000000,
                contextWindow: 1000000,
                released: '2024-05-14',
                capabilities: ['vision', 'function-calling', 'streaming']
            }
        },
        discoverApi: 'https://generativelanguage.googleapis.com/v1beta/models'
    },
    openrouter: {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://finallica.io',
            'X-Title': 'Finallica'
        }),
        models: {
            'anthropic/claude-sonnet-4': {
                name: 'Claude Sonnet 4 (via OpenRouter)',
                maxTokens: 200000,
                contextWindow: 200000,
                released: '2025-05-14',
                capabilities: ['vision', 'function-calling', 'streaming']
            },
            'anthropic/claude-3.5-sonnet': {
                name: 'Claude 3.5 Sonnet (via OpenRouter)',
                maxTokens: 200000,
                contextWindow: 200000,
                released: '2024-10-22',
                capabilities: ['vision', 'function-calling', 'streaming']
            },
            'openai/gpt-4o': {
                name: 'GPT-4o (via OpenRouter)',
                maxTokens: 128000,
                contextWindow: 128000,
                released: '2024-05-13',
                capabilities: ['vision', 'function-calling', 'streaming']
            },
            'google/gemini-2.0-flash-exp': {
                name: 'Gemini 2.0 Flash (via OpenRouter)',
                maxTokens: 1000000,
                contextWindow: 1000000,
                released: '2024-12-11',
                capabilities: ['vision', 'function-calling', 'streaming']
            },
            'meta-llama/llama-3.1-405b-instruct': {
                name: 'Llama 3.1 405B (via OpenRouter)',
                maxTokens: 131072,
                contextWindow: 131072,
                released: '2024-07-14',
                capabilities: ['function-calling', 'streaming']
            },
            'meta-llama/llama-3.3-70b-instruct': {
                name: 'Llama 3.3 70B (via OpenRouter)',
                maxTokens: 131072,
                contextWindow: 131072,
                released: '2024-12-06',
                capabilities: ['function-calling', 'streaming']
            }
        },
        discoverApi: 'https://openrouter.ai/api/v1/models'
    },
    groq: {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
        headers: (apiKey) => ({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        }),
        models: {
            'llama-3.3-70b-versatile': {
                name: 'Llama 3.3 70B Versatile',
                maxTokens: 131072,
                contextWindow: 131072,
                released: '2024-12-06',
                capabilities: ['function-calling', 'streaming']
            },
            'llama-3.1-70b-versatile': {
                name: 'Llama 3.1 70B Versatile',
                maxTokens: 131072,
                contextWindow: 131072,
                released: '2024-07-14',
                capabilities: ['function-calling', 'streaming']
            },
            'mixtral-8x7b-32768': {
                name: 'Mixtral 8x7b',
                maxTokens: 32768,
                contextWindow: 32768,
                released: '2024-01-10',
                capabilities: ['function-calling', 'streaming']
            },
            'gemma2-9b-it': {
                name: 'Gemma 2 9B',
                maxTokens: 8192,
                contextWindow: 8192,
                released: '2024-06-27',
                capabilities: ['streaming']
            }
        },
        discoverApi: 'https://api.groq.com/openai/v1/models'
    }
};

// Deprecated model mappings for auto-upgrade suggestions
const DEPRECATED_MAPPINGS = {
    'claude-3-opus-20240229': 'claude-sonnet-4-20250514',
    'gpt-4': 'gpt-4o',
    'gpt-4-32k': 'gpt-4o',
    'text-davinci-003': 'gpt-4o-mini',
    'claude-2': 'claude-3-5-sonnet-20241022'
};

class AIProviderService {
    constructor(keyManager) {
        this.keyManager = keyManager;
        this.providers = new Map();
        this.models = new Map();
        this.modelVersions = new Map();
        this.deprecationWarnings = new Map();
        this.discoveryCache = new Map();
        this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

        // Initialize with known providers
        this.initializeProviders();
    }

    /**
     * Initialize with all known providers
     */
    initializeProviders() {
        for (const [id, config] of Object.entries(LATEST_MODELS)) {
            this.registerProvider(id, config);
        }
    }

    /**
     * Register a provider dynamically
     */
    registerProvider(id, config) {
        this.providers.set(id, {
            id,
            ...config,
            registeredAt: Date.now()
        });

        // Register models
        for (const [modelId, modelConfig] of Object.entries(config.models)) {
            this.models.set(modelId, {
                ...modelConfig,
                provider: id,
                providerName: config.name
            });

            // Track deprecation
            if (modelConfig.deprecated) {
                this.deprecationWarnings.set(modelId, {
                    deprecated: true,
                    replacedBy: modelConfig.replacedBy,
                    message: `${modelConfig.name} is deprecated. Use ${modelConfig.replacedBy} instead.`
                });
            }
        }
    }

    /**
     * Get all available providers
     */
    getProviders() {
        return Array.from(this.providers.values());
    }

    /**
     * Get provider by ID
     */
    getProvider(id) {
        return this.providers.get(id);
    }

    /**
     * Get all available models
     */
    getModels(providerId = null) {
        const allModels = Array.from(this.models.values());

        if (providerId) {
            return allModels.filter(m => m.provider === providerId);
        }

        return allModels;
    }

    /**
     * Get model by ID
     */
    getModel(modelId) {
        return this.models.get(modelId);
    }

    /**
     * Check if model is deprecated and get replacement
     */
    getModelStatus(modelId) {
        const model = this.models.get(modelId);
        if (!model) {
            return { found: false };
        }

        const status = {
            found: true,
            model,
            deprecated: model.deprecated || false
        };

        if (this.deprecationWarnings.has(modelId)) {
            status.warning = this.deprecationWarnings.get(modelId);
        }

        return status;
    }

    /**
     * Get recommended replacement for deprecated model
     */
    getReplacement(modelId) {
        if (DEPRECATED_MAPPINGS[modelId]) {
            return DEPRECATED_MAPPINGS[modelId];
        }

        const model = this.models.get(modelId);
        if (model?.replacedBy) {
            return model.replacedBy;
        }

        // Find newest model from same provider
        if (model) {
            const providerModels = this.getModels(model.provider)
                .filter(m => !m.deprecated)
                .sort((a, b) => new Date(b.released) - new Date(a.released));

            return providerModels[0]?.modelId || modelId;
        }

        return null;
    }

    /**
     * Discover models from provider API
     */
    async discoverModels(providerId, apiKey = null) {
        const provider = this.providers.get(providerId);
        if (!provider || !provider.discoverApi) {
            return { error: 'Provider does not support discovery' };
        }

        // Check cache
        const cacheKey = `${providerId}_models`;
        if (this.discoveryCache.has(cacheKey)) {
            const cached = this.discoveryCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTTL) {
                return cached.data;
            }
        }

        try {
            const key = apiKey || this.keyManager.getNextKey(providerId);
            if (!key) {
                return { error: 'No API key available for discovery' };
            }

            const discovered = await this.fetchModelsFromAPI(provider, key);

            // Cache result
            this.discoveryCache.set(cacheKey, {
                data: discovered,
                timestamp: Date.now()
            });

            return discovered;
        } catch (error) {
            console.error(`Model discovery failed for ${providerId}:`, error.message);
            return { error: error.message };
        }
    }

    /**
     * Fetch models from provider API
     */
    async fetchModelsFromAPI(provider, apiKey) {
        const url = new URL(provider.discoverApi);

        // Add API key for Google
        if (provider.id === 'google') {
            url.searchParams.append('key', apiKey);
        }

        const options = {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname + url.search,
            method: 'GET',
            headers: provider.headers(apiKey)
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode !== 200) {
                            reject(new Error(`API returned ${res.statusCode}`));
                            return;
                        }

                        const json = JSON.parse(data);
                        const models = this.parseModelsResponse(provider.id, json);
                        resolve({ models, count: models.length });
                    } catch (e) {
                        reject(e);
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    /**
     * Parse models response from different providers
     */
    parseModelsResponse(providerId, response) {
        switch (providerId) {
            case 'openai':
                return response.data
                    .filter(m => m.id.includes('gpt') || m.id.includes('o1'))
                    .map(m => ({
                        id: m.id,
                        name: m.id,
                        created: m.created,
                        owned_by: m.owned_by
                    }));

            case 'openrouter':
                return response.data
                    .filter(m => m.id.includes('claude') || m.id.includes('gpt') || m.id.includes('gemini') || m.id.includes('llama'))
                    .map(m => ({
                        id: m.id,
                        name: m.name,
                        context_length: m.context_length,
                        pricing: m.pricing
                    }));

            case 'groq':
                return response.data
                    .filter(m => m.id.includes('llama') || m.id.includes('mixtral') || m.id.includes('gemma'))
                    .map(m => ({
                        id: m.id,
                        name: m.id,
                        type: m.type
                    }));

            case 'google':
                return response.models
                    .filter(m => m.name.includes('gemini'))
                    .map(m => ({
                        id: m.name.replace('models/', ''),
                        name: m.displayName,
                        version: m.version
                    }));

            default:
                return [];
        }
    }

    /**
     * Check for model version updates
     */
    async checkModelVersion(modelId) {
        const model = this.models.get(modelId);
        if (!model) {
            return { found: false };
        }

        // Check against our known models
        const status = this.getModelStatus(modelId);

        // Try to discover latest from API
        const discovered = await this.discoverModels(model.provider);
        if (discovered.models) {
            const providerLatest = discovered.models
                .filter(m => m.id.includes(model.provider))
                .sort((a, b) => {
                    // Try to sort by date if available
                    if (a.created && b.created) return b.created - a.created;
                    return 0;
                });

            if (providerLatest.length > 0) {
                status.latestAvailable = providerLatest[0].id;
            }
        }

        return status;
    }

    /**
     * Get streaming response from AI provider
     */
    async streamChat(providerId, modelId, messages, onChunk, apiKey = null) {
        const provider = this.providers.get(providerId);
        if (!provider) {
            throw new Error(`Unknown provider: ${providerId}`);
        }

        const key = apiKey || this.keyManager.getNextKey(providerId);
        if (!key) {
            throw new Error(`No API key available for ${providerId}`);
        }

        const model = this.models.get(modelId);
        if (!model) {
            throw new Error(`Unknown model: ${modelId}`);
        }

        // Build request based on provider
        let requestBody, url;

        if (providerId === 'anthropic') {
            // Anthropic streaming format
            requestBody = {
                model: modelId,
                max_tokens: model.maxTokens,
                messages: messages.map(m => ({
                    role: m.role,
                    content: m.content
                })),
                stream: true
            };
            url = provider.baseUrl;
        } else {
            // OpenAI-compatible format
            requestBody = {
                model: modelId,
                messages: messages,
                max_tokens: 4096,
                stream: true
            };
            url = provider.baseUrl;
        }

        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 443,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers: {
                    ...provider.headers(key),
                    'Content-Type': 'application/json'
                }
            };

            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) {
                    let error = '';
                    res.on('data', d => error += d);
                    res.on('end', () => reject(new Error(`${res.statusCode}: ${error}`)));
                    return;
                }

                let fullContent = '';

                res.on('data', (chunk) => {
                    const lines = chunk.toString().split('\n').filter(line => line.trim());

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);

                            if (data === '[DONE]') {
                                resolve({ content: fullContent });
                                return;
                            }

                            try {
                                const parsed = JSON.parse(data);
                                let content = '';

                                // Handle different provider formats
                                if (providerId === 'anthropic') {
                                    if (parsed.type === 'content_block_delta') {
                                        content = parsed.delta?.text || '';
                                    }
                                } else {
                                    // OpenAI format
                                    content = parsed.choices?.[0]?.delta?.content || '';
                                }

                                if (content) {
                                    fullContent += content;
                                    if (onChunk) onChunk(content, parsed);
                                }
                            } catch (e) {
                                // Ignore parse errors for keep-alive events
                            }
                        }
                    }
                });

                res.on('end', () => resolve({ content: fullContent }));
            });

            req.on('error', reject);
            req.write(JSON.stringify(requestBody));
            req.end();
        });
    }

    /**
     * Get usage statistics
     */
    getStats() {
        return {
            providers: this.providers.size,
            models: this.models.size,
            deprecatedModels: Array.from(this.deprecationWarnings.keys()),
            cacheSize: this.discoveryCache.size
        };
    }
}

module.exports = AIProviderService;
