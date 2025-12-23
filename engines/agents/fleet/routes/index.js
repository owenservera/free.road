const express = require('express');

function createAgentRoutes(agentFleet) {
    const router = express.Router();

    router.get('/status', (req, res) => {
        const status = agentFleet ? agentFleet.getStatus() : { isRunning: false };
        res.json(status);
    });

    router.post('/start', async (req, res) => {
        try {
            await agentFleet.start();
            res.json({ success: true, message: 'Agent Fleet started' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/stop', async (req, res) => {
        try {
            await agentFleet.stop();
            res.json({ success: true, message: 'Agent Fleet stopped' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/', (req, res) => {
        const agents = agentFleet ? agentFleet.getAllAgents() : [];
        res.json({ agents, count: agents.length });
    });

    router.get('/:id', (req, res) => {
        const agent = agentFleet ? agentFleet.getAgent(req.params.id) : null;

        if (!agent) {
            return res.status(404).json({ error: 'Agent not found' });
        }

        res.json({ agent });
    });

    router.post('/:id/start', async (req, res) => {
        res.json({ success: true, message: 'Agent start endpoint - to be implemented' });
    });

    router.post('/:id/stop', async (req, res) => {
        res.json({ success: true, message: 'Agent stop endpoint - to be implemented' });
    });

    return router;
}

function createAIRoutes(agentFleet) {
    const router = express.Router();

    router.post('/chat', async (req, res) => {
        try {
            const { message, agentType = 'documentation' } = req.body;

            const response = {
                content: `[AI Response to: ${message}]`,
                agent: agentType,
                timestamp: Date.now()
            };

            res.json({
                success: true,
                response
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/status', (req, res) => {
        const status = agentFleet ? agentFleet.getStatus() : { isRunning: false };
        res.json({
            ...status,
            message: 'AI chat endpoint operational'
        });
    });

    return router;
}

module.exports = { createAgentRoutes, createAIRoutes };
