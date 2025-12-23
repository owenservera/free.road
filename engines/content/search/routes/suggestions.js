const express = require('express');

function createSuggestionRoutes(repoSuggester) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const {
                sessionId = 'anonymous',
                currentDoc = null,
                limit = 10
            } = req.query;

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
            res.status(500).json({ error: 'Failed to get suggestions' });
        }
    });

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

    router.get('/popular', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const popular = repoSuggester.getPopularRepos(limit);

            res.json({
                success: true,
                popular
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get popular repos' });
        }
    });

    return router;
}

module.exports = createSuggestionRoutes;
