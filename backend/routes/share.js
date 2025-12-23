// Share Routes - OpenCode-style session sharing
// Creates shareable URLs for agent sessions

const express = require('express');
const router = express.Router();

function createShareRoutes(shareService) {
    if (!shareService) {
        console.warn('ShareService not initialized - share routes disabled');
        return router;
    }

    // Create a new share
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

            res.json({
                success: true,
                share: {
                    id: share.shareId,
                    url: share.url,
                    expiresAt: share.expiresAt,
                    isPublic: share.isPublic
                }
            });
        } catch (error) {
            console.error('Error creating share:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Get shared session
    router.get('/:id', async (req, res) => {
        try {
            const share = await shareService.getShare(req.params.id);

            if (!share) {
                return res.status(404).json({ error: 'Share not found or expired' });
            }

            // Record view
            await shareService.recordView(req.params.id);

            res.json({ share });
        } catch (error) {
            console.error('Error getting share:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Get share messages
    router.get('/:id/messages', async (req, res) => {
        try {
            const share = await shareService.getShare(req.params.id);

            if (!share) {
                return res.status(404).json({ error: 'Share not found or expired' });
            }

            if (!share.is_public) {
                return res.status(403).json({ error: 'This share is private' });
            }

            const messages = await shareService.getShareMessages(req.params.id);
            res.json({ messages });
        } catch (error) {
            console.error('Error getting share messages:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Delete/unshare a session
    router.delete('/:id', async (req, res) => {
        try {
            await shareService.deleteShare(req.params.id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting share:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Sync messages to share
    router.post('/:id/sync', async (req, res) => {
        try {
            const { messages } = req.body;

            if (!Array.isArray(messages)) {
                return res.status(400).json({ error: 'messages must be an array' });
            }

            const share = await shareService.getShare(req.params.id);
            if (!share) {
                return res.status(404).json({ error: 'Share not found' });
            }

            await shareService.syncSessionToShare(req.params.id, share.session_id, messages);
            res.json({ success: true });
        } catch (error) {
            console.error('Error syncing share:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Update share metadata
    router.put('/:id', async (req, res) => {
        try {
            const updates = req.body;
            const share = await shareService.updateShare(req.params.id, updates);
            res.json({ share });
        } catch (error) {
            console.error('Error updating share:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // List shares for a session
    router.get('/session/:sessionId/list', async (req, res) => {
        try {
            const shares = await shareService.listShares(req.params.sessionId);
            res.json({ shares });
        } catch (error) {
            console.error('Error listing shares:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Get user share preferences
    router.get('/user/:userId/preferences', async (req, res) => {
        try {
            const stmt = shareService.db.prepare('SELECT * FROM share_preferences WHERE user_id = :userId');
            const result = stmt.getAsObject({ ':userId': req.params.userId });

            if (result && result.user_id) {
                res.json({
                    userId: result.user_id,
                    autoShareMode: result.auto_share_mode,
                    defaultExpirationHours: result.default_expiration_hours
                });
            } else {
                // Return defaults
                res.json({
                    userId: req.params.userId,
                    autoShareMode: 'manual',
                    defaultExpirationHours: 0
                });
            }
        } catch (error) {
            console.error('Error getting preferences:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Update user share preferences
    router.put('/user/:userId/preferences', async (req, res) => {
        try {
            const { autoShareMode, defaultExpirationHours } = req.body;

            await shareService.db.run(`
                INSERT OR REPLACE INTO share_preferences (user_id, auto_share_mode, default_expiration_hours, updated_at)
                VALUES (?, ?, ?, ?)
            `, [
                req.params.userId,
                autoShareMode || 'manual',
                defaultExpirationHours || 0,
                Math.floor(Date.now() / 1000)
            ]);
            await shareService.db.save();

            res.json({
                success: true,
                preferences: {
                    userId: req.params.userId,
                    autoShareMode,
                    defaultExpirationHours
                }
            });
        } catch (error) {
            console.error('Error updating preferences:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Cleanup expired shares (admin endpoint)
    router.post('/admin/cleanup', async (req, res) => {
        try {
            await shareService.cleanupExpiredShares();
            res.json({ success: true });
        } catch (error) {
            console.error('Error cleaning up shares:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createShareRoutes;
