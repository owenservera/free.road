/**
 * AI Routes - API endpoints for AI provider management and streaming
 */

const express = require('express');
const router = express.Router();

function createAIRoutes(aiProviderService, streamingService, keyManager) {

    // GET /api/ai/providers - List all available providers
    router.get('/providers', (req, res) => {
        const providers = aiProviderService.getProviders();
        res.json({
            providers: providers.map(p => ({
                id: p.id,
                name: p.name,
                modelCount: Object.keys(p.models).length
            }))
        });
    });

    // GET /api/ai/models - List all available models
    router.get('/models', (req, res) => {
        const { provider } = req.query;
        const models = aiProviderService.getModels(provider);
        const availableProviders = keyManager.getAvailableProviders();

        res.json({
            providers: availableProviders,
            models: models.map(m => ({
                id: m.provider ? `${m.provider}/${m.name}` : m.name,
                modelId: m.name,
                name: m.name,
                provider: m.provider,
                providerName: m.providerName,
                maxTokens: m.maxTokens,
                contextWindow: m.contextWindow,
                capabilities: m.capabilities,
                released: m.released,
                deprecated: m.deprecated
            }))
        });
    });

    // GET /api/ai/models/:modelId - Get specific model details
    router.get('/models/:modelId', (req, res) => {
        const { modelId } = req.params;
        const status = aiProviderService.getModelStatus(modelId);

        if (!status.found) {
            return res.status(404).json({ error: 'Model not found' });
        }

        const replacement = status.deprecated ? aiProviderService.getReplacement(modelId) : null;

        res.json({
            model: status.model,
            deprecated: status.deprecated,
            warning: status.warning,
            replacement,
            capabilities: status.model.capabilities
        });
    });

    // POST /api/ai/discover - Discover models from provider API
    router.post('/discover', async (req, res) => {
        const { provider, apiKey } = req.body;

        if (!provider) {
            return res.status(400).json({ error: 'Provider is required' });
        }

        const result = await aiProviderService.discoverModels(provider, apiKey);
        res.json(result);
    });

    // GET /api/ai/versions - Check for model updates
    router.get('/versions', async (req, res) => {
        const { model } = req.query;

        if (model) {
            const status = await aiProviderService.checkModelVersion(model);
            res.json(status);
        } else {
            // Check all models for updates
            const allModels = aiProviderService.getModels();
            const updates = [];

            for (const m of allModels) {
                if (m.deprecated) {
                    updates.push({
                        model: m.name,
                        deprecated: true,
                        replacement: aiProviderService.getReplacement(m.name)
                    });
                }
            }

            res.json({ updates });
        }
    });

    // POST /api/ai/stream - Streaming chat endpoint
    router.post('/stream', (req, res) => {
        const { message, provider, model, context = {}, apiKey } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const selectedProvider = provider || 'anthropic';
        const selectedModel = model || 'claude-3-5-sonnet-20241022';

        // Check if provider has keys
        const keyToUse = apiKey || keyManager.getNextKey(selectedProvider);
        if (!keyToUse) {
            return res.status(400).json({
                error: `No API keys configured for provider: ${selectedProvider}`
            });
        }

        // Create SSE stream
        const stream = streamingService.createStream(req, res);

        // Build messages array
        const messages = context.history || [];
        messages.push({ role: 'user', content: message });

        // Start streaming
        let fullContent = '';

        aiProviderService.streamChat(
            selectedProvider,
            selectedModel,
            messages,
            (chunk, metadata) => {
                fullContent += chunk;
                streamingService.sendChunk(stream, chunk, {
                    model: selectedModel,
                    provider: selectedProvider
                });
            },
            keyToUse
        ).then(() => {
            streamingService.completeStream(stream, {
                content: fullContent,
                model: selectedModel,
                provider: selectedProvider,
                tokens: {
                    input: metadata?.tokens?.input || 0,
                    output: metadata?.tokens?.output || fullContent.length
                }
            });
        }).catch((error) => {
            streamingService.sendError(stream, error);
            streamingService.closeStream(stream.id);
        });
    });

    // POST /api/ai/chat - Standard (non-streaming) chat endpoint
    router.post('/chat', async (req, res) => {
        const { message, provider, model, context = {}, apiKey } = req.body;

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        const selectedProvider = provider || 'anthropic';
        const selectedModel = model || 'claude-3-5-sonnet-20241022';

        // Check if provider has keys
        const keyToUse = apiKey || keyManager.getNextKey(selectedProvider);
        if (!keyToUse) {
            return res.status(400).json({
                error: `No API keys configured for provider: ${selectedProvider}`
            });
        }

        try {
            // Build messages array
            const messages = context.history || [];
            messages.push({ role: 'user', content: message });

            // Get non-streaming response
            const result = await aiProviderService.streamChat(
                selectedProvider,
                selectedModel,
                messages,
                null,
                keyToUse
            );

            res.json({
                response: result.content,
                model: selectedModel,
                provider: selectedProvider
            });
        } catch (error) {
            console.error('AI chat error:', error);
            res.status(500).json({
                error: error.message
            });
        }
    });

    // POST /api/ai/test-key - Test an API key
    router.post('/test-key', async (req, res) => {
        const { provider, apiKey } = req.body;

        if (!provider || !apiKey) {
            return res.status(400).json({ valid: false, error: 'Provider and API key are required' });
        }

        const providerConfig = aiProviderService.getProvider(provider);
        if (!providerConfig) {
            return res.status(400).json({ valid: false, error: 'Unknown provider' });
        }

        try {
            const result = await aiProviderService.discoverModels(provider, apiKey);

            if (result.error) {
                res.json({ valid: false, error: result.error });
            } else {
                res.json({
                    valid: true,
                    provider,
                    modelCount: result.count || 0,
                    message: 'API key is valid'
                });
            }
        } catch (error) {
            res.json({ valid: false, error: error.message });
        }
    });

    // GET /api/ai/stats - Get usage statistics
    router.get('/stats', (req, res) => {
        const stats = aiProviderService.getStats();
        res.json({
            ...stats,
            activeStreams: streamingService.getActiveStreamCount(),
            keyManagerStats: keyManager.getStats()
        });
    });

    return router;
}

module.exports = createAIRoutes;
