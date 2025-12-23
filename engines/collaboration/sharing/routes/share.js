const express = require('express');

function createShareRoutes(shareService) {
    const router = express.Router();

    router.post('/create', async (req, res) => {
        try {
            const { sessionId, title, isPublic, expirationHours, metadata } = req.body;

            if (!sessionId) {
                return res.status(400).json({ error: 'sessionId is required' });
            }

            const share = await shareService.createShare(sessionId, {
                title,
                isPublic,
                expirationHours,
                metadata
            });

            res.json({ success: true, share });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/:id', async (req, res) => {
        try {
            const share = await shareService.getShare(req.params.id);

            if (!share) {
                return res.status(404).json({ error: 'Share not found or expired' });
            }

            res.json({ share });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.delete('/:id', async (req, res) => {
        try {
            await shareService.deleteShare(req.params.id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createShareRoutes;
