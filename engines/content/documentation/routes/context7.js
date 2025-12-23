const express = require('express');

function createContext7Routes(context7Server, docIndexer) {
    const router = express.Router();

    router.post('/search', async (req, res) => {
        try {
            const { query, limit = 5 } = req.body;

            if (!query) {
                return res.status(400).json({ error: 'Query is required' });
            }

            const results = await context7Server.searchDocs(query, limit);

            res.json({
                success: true,
                query,
                results,
                count: results.length
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/status', (req, res) => {
        try {
            const stats = context7Server.getStats();
            res.json({
                running: true,
                stats
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get status' });
        }
    });

    router.post('/reindex', async (req, res) => {
        try {
            await context7Server.indexDocumentation();
            res.json({
                success: true,
                message: 'Documentation reindexed successfully'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/docs', async (req, res) => {
        try {
            const docs = await context7Server.listAvailableDocs();
            res.json({
                success: true,
                docs
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to list documents' });
        }
    });

    return router;
}

module.exports = createContext7Routes;
