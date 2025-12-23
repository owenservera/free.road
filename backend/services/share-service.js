// Share Service - OpenCode-style session sharing
// Creates shareable URLs for agent sessions

const crypto = require('crypto');

class ShareService {
    constructor(db) {
        this.db = db;
        // Use local dev server URL by default
        this.baseUrl = process.env.SHARE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    }

    // Generate unique short share ID (6-8 char base62)
    generateShareId(length = 8) {
        const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        let result = '';
        const bytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            result += chars[bytes[i] % chars.length];
        }
        return result;
    }

    // Create a new shared session
    async createShare(sessionId, options = {}) {
        const {
            title = null,
            isPublic = true,
            expirationHours = 0,
            metadata = {}
        } = options;

        const shareId = this.generateShareId();

        // Calculate expiration
        let expiresAt = null;
        if (expirationHours > 0) {
            expiresAt = Math.floor(Date.now() / 1000) + (expirationHours * 3600);
        }

        // Create share record
        this.db.db.run(`
            INSERT INTO shared_sessions (id, session_id, title, is_public, expires_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            shareId,
            sessionId,
            title,
            isPublic ? 1 : 0,
            expiresAt,
            JSON.stringify(metadata)
        ]);
        await this.db.save();

        return {
            shareId,
            url: this.getShareUrl(shareId),
            expiresAt,
            isPublic
        };
    }

    // Get shared session by ID
    async getShare(shareId) {
        const stmt = this.db.db.prepare('SELECT * FROM shared_sessions WHERE id = :id');
        const result = stmt.getAsObject({ ':id': shareId });

        if (!result || !result.id) {
            return null;
        }

        // Check expiration
        if (result.expires_at && result.expires_at < Math.floor(Date.now() / 1000)) {
            return null; // Expired
        }

        // Parse metadata
        try {
            result.metadata = JSON.parse(result.metadata || '{}');
        } catch {
            result.metadata = {};
        }
        result.is_public = Boolean(result.is_public);

        return result;
    }

    // Get messages for a shared session
    async getShareMessages(shareId) {
        const stmt = this.db.db.prepare(`
            SELECT * FROM shared_messages
            WHERE share_id = :shareId
            ORDER BY timestamp ASC
        `);
        stmt.bind({ ':shareId': shareId });

        const messages = [];
        while (stmt.step()) {
            const msg = stmt.getAsObject();
            try {
                msg.tool_calls = JSON.parse(msg.tool_calls || 'null');
            } catch {
                msg.tool_calls = null;
            }
            messages.push(msg);
        }
        stmt.free();

        return messages;
    }

    // Add a message to a shared session
    async addMessage(shareId, role, content, toolCalls = null) {
        const msgId = 'msg_' + crypto.randomBytes(16).toString('hex');

        this.db.db.run(`
            INSERT INTO shared_messages (id, share_id, role, content, tool_calls)
            VALUES (?, ?, ?, ?, ?)
        `, [
            msgId,
            shareId,
            role,
            content,
            toolCalls ? JSON.stringify(toolCalls) : null
        ]);
        await this.db.save();

        return msgId;
    }

    // Sync all messages from an agent session to a share
    async syncSessionToShare(shareId, sessionId, messages) {
        // Clear existing messages
        this.db.db.run(`DELETE FROM shared_messages WHERE share_id = ?`, [shareId]);

        // Add all messages
        for (const msg of messages) {
            await this.addMessage(shareId, msg.role, msg.content, msg.tool_calls);
        }

        await this.db.save();
        return true;
    }

    // Delete/unshare a session
    async deleteShare(shareId) {
        this.db.db.run(`DELETE FROM shared_messages WHERE share_id = ?`, [shareId]);
        this.db.db.run(`DELETE FROM shared_sessions WHERE id = ?`, [shareId]);
        await this.db.save();
        return true;
    }

    // Increment view count
    async recordView(shareId) {
        this.db.db.run(`
            UPDATE shared_sessions
            SET view_count = view_count + 1
            WHERE id = ?
        `, [shareId]);
        await this.db.save();
    }

    // Get public share URL
    getShareUrl(shareId) {
        return `${this.baseUrl}/s/${shareId}`;
    }

    // Parse share ID from URL
    parseShareUrl(url) {
        const match = url.match(/\/s\/([a-zA-Z0-9]+)$/);
        return match ? match[1] : null;
    }

    // List all shares (for a session)
    async listShares(sessionId) {
        const stmt = this.db.db.prepare(`
            SELECT * FROM shared_sessions
            WHERE session_id = :sessionId
            ORDER BY created_at DESC
        `);
        stmt.bind({ ':sessionId': sessionId });

        const shares = [];
        while (stmt.step()) {
            const share = stmt.getAsObject();
            share.is_public = Boolean(share.is_public);
            share.url = this.getShareUrl(share.id);
            try {
                share.metadata = JSON.parse(share.metadata || '{}');
            } catch {
                share.metadata = {};
            }
            shares.push(share);
        }
        stmt.free();

        return shares;
    }

    // Update share metadata
    async updateShare(shareId, updates) {
        const fields = [];
        const values = [];

        if (updates.title !== undefined) {
            fields.push('title = ?');
            values.push(updates.title);
        }
        if (updates.is_public !== undefined) {
            fields.push('is_public = ?');
            values.push(updates.is_public ? 1 : 0);
        }
        if (updates.expires_at !== undefined) {
            fields.push('expires_at = ?');
            values.push(updates.expires_at);
        }
        if (updates.metadata !== undefined) {
            fields.push('metadata = ?');
            values.push(JSON.stringify(updates.metadata));
        }

        if (fields.length > 0) {
            values.push(shareId);
            this.db.db.run(`
                UPDATE shared_sessions
                SET ${fields.join(', ')}
                WHERE id = ?
            `, values);
            await this.db.save();
        }

        return await this.getShare(shareId);
    }

    // Clean up expired shares
    async cleanupExpiredShares() {
        const now = Math.floor(Date.now() / 1000);
        this.db.db.run(`
            DELETE FROM shared_sessions
            WHERE expires_at IS NOT NULL AND expires_at < ?
        `, [now]);
        await this.db.save();
    }
}

module.exports = ShareService;
