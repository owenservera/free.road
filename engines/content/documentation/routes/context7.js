/**
 * Context7 Routes - API endpoints for documentation search and indexing
 */

const express = require('express');
const router = express.Router();

function createContext7Routes(context7Server) {

    // POST /api/context7/search - Semantic search over documentation
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

    // GET /api/context7/status - Get server status
    router.get('/status', (req, res) => {
        const stats = context7Server.getStats();

        res.json({
            running: true,
            stats
        });
    });

    // POST /api/context7/reindex - Force reindex of documentation
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

    // GET /api/context7/docs - List all indexed documents
    router.get('/docs', async (req, res) => {
        try {
            const docs = await context7Server.listAvailableDocs();

            res.json({
                success: true,
                docs
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/context7/docs/:docName - Get specific document content
    router.get('/docs/:docName', async (req, res) => {
        try {
            const { docName } = req.params;
            const content = await context7Server.getDocContent(docName);

            res.json({
                success: true,
                docName,
                content
            });
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    });

    // GET /api/context7/repos - Get repository information
    router.get('/repos/:repoId', async (req, res) => {
        try {
            const { repoId } = req.params;
            const repo = await context7Server.getRepoInfo(repoId);

            res.json({
                success: true,
                repo
            });
        } catch (error) {
            res.status(404).json({ error: error.message });
        }
    });

    // GET /api/context7/stats - Get detailed statistics
    router.get('/stats', (req, res) => {
        const stats = context7Server.getStats();

        res.json(stats);
    });

    return router;
}

module.exports = createContext7Routes;
