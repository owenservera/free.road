/**
 * Suggestions Routes - Repository suggestion API endpoints
 */

const express = require('express');
const router = express.Router();

function createSuggestionRoutes(repoSuggester) {

    // GET /api/suggestions - Get repo suggestions for current context
    router.get('/', async (req, res) => {
        try {
            const {
                sessionId = req.sessionID || 'anonymous',
                currentDoc,
                limit = 10
            } = req.query;

            // Build context from request
            const sessionContext = {
                sessionId,
                currentDoc,
                recentEdits: req.query.edits ? JSON.parse(req.query.edits) : [],
                viewHistory: req.query.history ? JSON.parse(req.query.history) : [],
                activeRepos: req.query.active ? JSON.parse(req.query.active) : [],
                limit: parseInt(limit)
            };

            const suggestions = await repoSuggester.getSuggestions(sessionContext);

            res.json({
                success: true,
                suggestions,
                count: suggestions.length
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/suggestions/feedback - Record user feedback
    router.post('/feedback', async (req, res) => {
        try {
            const { repoId, action, context = {} } = req.body;
            const sessionId = req.sessionID || 'anonymous';

            if (!repoId || !action) {
                return res.status(400).json({ error: 'repoId and action are required' });
            }

            const feedback = await repoSuggester.recordFeedback(
                sessionId,
                repoId,
                action,
                context
            );

            res.json({
                success: true,
                feedback
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/suggestions/popular - Get most popular repositories
    router.get('/popular', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const popular = repoSuggester.getPopularRepos(limit);

            res.json({
                success: true,
                popular
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/suggestions/stats - Get suggestion statistics
    router.get('/stats', (req, res) => {
        try {
            const stats = repoSuggester.getStats();

            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/suggestions/refresh - Refresh popularity cache
    router.post('/refresh', async (req, res) => {
        try {
            await repoSuggester.updatePopularityCache();

            res.json({
                success: true,
                message: 'Popularity cache refreshed'
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createSuggestionRoutes;
