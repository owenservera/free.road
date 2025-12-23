const crypto = require('crypto');

class ShareService {
    constructor(db) {
        this.db = db;
    }

    generateId() {
        return 'share_' + crypto.randomBytes(16).toString('hex');
    }

    async createShare(sessionId, options = {}) {
        const { title, isPublic, expirationHours, metadata } = options;

        const shareId = this.generateId();

        const share = {
            id: shareId,
            session_id: sessionId,
            title: title || null,
            is_public: isPublic ? 1 : 0,
            expiration_hours: expirationHours || 0,
            metadata: JSON.stringify(metadata || {}),
            created_at: Math.floor(Date.now() / 1000)
        };

        this.db.db.prepare(`
            INSERT INTO shared_sessions (
                id, session_id, title, is_public, expires_at, metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            shareId,
            sessionId,
            title || null,
            isPublic ? 1 : 0,
            expirationHours * 3600 || null,
            JSON.stringify(share.metadata),
            share.created_at
        );

        const url = this.getShareUrl(shareId);

        return {
            ...share,
            url
        };
    }

    async getShare(shareId) {
        const stmt = this.db.db.prepare('SELECT * FROM shared_sessions WHERE id = :id');
        const result = stmt.getAsObject({ ':id': shareId });

        if (!result) {
            return null;
        }

        const now = Math.floor(Date.now() / 1000);
        if (result.expires_at && result.expires_at < now) {
            return null;
        }

        result.is_public = Boolean(result.is_public);
        result.metadata = result.metadata ? JSON.parse(result.metadata) : {};

        return result;
    }

    async deleteShare(shareId) {
        this.db.db.prepare('DELETE FROM shared_sessions WHERE id = :id').run({ ':id': shareId });
    }

    getShareUrl(shareId) {
        const baseUrl = process.env.SHARE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        return `${baseUrl}/share/${shareId}`;
    }

    async healthCheck() {
        return {
            status: 'healthy',
            message: 'Share Service is running'
        };
    }
}

module.exports = ShareService;
