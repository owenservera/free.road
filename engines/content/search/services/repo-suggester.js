/**
 * Repository Suggester Service
 *
 * Provides intelligent repository suggestions using multi-factor scoring:
 * - Content-based matching (40%)
 * - Session pattern matching (30%)
 * - Global popularity (20%)
 * - User feedback history (10%)
 */

const crypto = require('crypto');

class RepoSuggesterService {
    constructor(db, docIndexer) {
        this.db = db;
        this.docIndexer = docIndexer;
        this.feedbackHistory = new Map();
        this.popularityCache = new Map();
        this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
        this.lastCacheUpdate = 0;
    }

    /**
     * Initialize the suggester
     */
    async initialize() {
        // Create feedback table if not exists
        this.db.run(`
            CREATE TABLE IF NOT EXISTS repo_suggestions_feedback (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                repo_id TEXT,
                action TEXT,
                context TEXT,
                created_at INTEGER,
                FOREIGN KEY (repo_id) REFERENCES repositories(id)
            )
        `);

        // Create popularity stats table
        this.db.run(`
            CREATE TABLE IF NOT EXISTS repo_popularity (
                repo_id TEXT PRIMARY KEY,
                view_count INTEGER DEFAULT 0,
                add_count INTEGER DEFAULT 0,
                click_count INTEGER DEFAULT 0,
                impression_count INTEGER DEFAULT 0,
                last_updated INTEGER,
                FOREIGN KEY (repo_id) REFERENCES repositories(id)
            )
        `);

        // Load feedback history
        await this.loadFeedbackHistory();
    }

    /**
     * Load feedback history from database
     */
    async loadFeedbackHistory() {
        const feedback = this.db.getAllSuggestionFeedback?.() || [];

        for (const item of feedback) {
            const key = `${item.session_id}:${item.repo_id}`;
            this.feedbackHistory.set(key, item);
        }

        console.log(`Loaded ${feedback.length} feedback records`);
    }

    /**
     * Get suggestions for current session context
     */
    async getSuggestions(sessionContext) {
        const {
            sessionId,
            currentDoc,
            recentEdits = [],
            viewHistory = [],
            activeRepos = [],
            limit = 10
        } = sessionContext;

        // Get all available repositories
        const allRepos = this.db.getAllRepositories() || [];

        // Update popularity cache if needed
        await this.updatePopularityCache();

        // Score each repository
        const scoredRepos = [];

        for (const repo of allRepos) {
            // Skip if already active
            if (activeRepos.some(r => r.id === repo.id)) {
                continue;
            }

            const score = await this.scoreRepository(repo, {
                currentDoc,
                recentEdits,
                viewHistory,
                sessionId,
                allRepos
            });

            scoredRepos.push({
                repo,
                score,
                reasons: score.breakdown
            });
        }

        // Sort by score
        scoredRepos.sort((a, b) => b.score.total - a.score.total);

        // Record impressions
        for (let i = 0; i < Math.min(limit, scoredRepos.length); i++) {
            await this.recordImpression(sessionId, scoredRepos[i].repo.id, i + 1);
        }

        return scoredRepos.slice(0, limit);
    }

    /**
     * Score a single repository using multi-factor analysis
     */
    async scoreRepository(repo, context) {
        const weights = {
            content: 0.40,
            pattern: 0.30,
            popularity: 0.20,
            feedback: 0.10
        };

        const contentScore = await this.scoreByContent(repo, context);
        const patternScore = await this.scoreByPattern(repo, context);
        const popularityScore = this.scoreByPopularity(repo.id);
        const feedbackScore = this.scoreByFeedback(repo.id, context.sessionId);

        const total = (
            contentScore * weights.content +
            patternScore * weights.pattern +
            popularityScore * weights.popularity +
            feedbackScore * weights.feedback
        );

        return {
            total,
            breakdown: {
                content: { score: contentScore, weight: weights.content },
                pattern: { score: patternScore, weight: weights.pattern },
                popularity: { score: popularityScore, weight: weights.popularity },
                feedback: { score: feedbackScore, weight: weights.feedback }
            },
            reasons: [
                ...this.getContentReasons(repo, contentScore),
                ...this.getPatternReasons(repo, patternScore),
                ...this.getPopularityReasons(repo, popularityScore)
            ]
        };
    }

    /**
     * Score by content-based matching
     */
    async scoreByContent(repo, context) {
        let score = 0;

        // Match against current document content
        if (context.currentDoc) {
            const docMatches = this.findContentMatches(repo, context.currentDoc);
            score += Math.min(docMatches * 0.3, 1);
        }

        // Match against recent edits
        for (const edit of context.recentEdits) {
            const editMatches = this.findContentMatches(repo, edit.content || edit);
            score += Math.min(editMatches * 0.2, 0.5);
        }

        // Tag matching
        if (repo.tags && repo.tags.length > 0) {
            const contextText = this.buildContextText(context);
            for (const tag of repo.tags) {
                if (contextText.toLowerCase().includes(tag.toLowerCase())) {
                    score += 0.15;
                }
            }
        }

        // Language matching
        if (repo.language && context.currentDoc) {
            const langPatterns = {
                'javascript': /\b(function|const|let|var|async|await|import|export)\b/i,
                'python': /\b(def|class|import|from|async|await|lambda)\b/i,
                'rust': /\b(fn|let|mut|impl|struct|enum|use|mod)\b/i,
                'go': /\b(func|var|const|type|struct|interface|go)\b/i,
                'typescript': /\b(interface|type|enum|namespace|implements)\b/i
            };

            const pattern = langPatterns[repo.language.toLowerCase()];
            if (pattern && pattern.test(context.currentDoc)) {
                score += 0.2;
            }
        }

        return Math.min(score, 1);
    }

    /**
     * Find content matches in repository
     */
    findContentMatches(repo, content) {
        if (!content || !repo.description) return 0;

        const contentLower = content.toLowerCase();
        const descLower = repo.description.toLowerCase();
        const nameLower = repo.name.toLowerCase();

        let matches = 0;

        // Direct keyword matches
        const keywords = this.extractKeywords(content);
        for (const keyword of keywords) {
            if (descLower.includes(keyword) || nameLower.includes(keyword)) {
                matches += 0.5;
            }
        }

        return matches;
    }

    /**
     * Score by session pattern matching
     */
    async scoreByPattern(repo, context) {
        let score = 0;

        // Check view history patterns
        for (const view of context.viewHistory) {
            // Similarity based on shared tags/categories
            if (view.tags && repo.tags) {
                const sharedTags = view.tags.filter(t =>
                    repo.tags.some(rt => rt.toLowerCase() === t.toLowerCase())
                );
                score += sharedTags.length * 0.1;
            }

            // Language consistency
            if (view.language === repo.language) {
                score += 0.15;
            }

            // Time decay - more recent views matter more
            if (view.timestamp) {
                const age = Date.now() - view.timestamp;
                const decay = Math.max(0, 1 - age / (7 * 24 * 60 * 60 * 1000)); // 7 days
                score *= (0.5 + decay * 0.5);
            }
        }

        return Math.min(score, 1);
    }

    /**
     * Score by global popularity
     */
    scoreByPopularity(repoId) {
        const stats = this.popularityCache.get(repoId);
        if (!stats) return 0.1; // Base score for unknown repos

        // Normalize scores (these could be adjusted based on actual data distribution)
        const viewsScore = Math.min(stats.view_count / 100, 1) * 0.3;
        const addsScore = Math.min(stats.add_count / 50, 1) * 0.4;
        const clicksScore = Math.min(stats.click_count / stats.impression_count || 0, 1) * 0.3;

        return viewsScore + addsScore + clicksScore;
    }

    /**
     * Score by user feedback history
     */
    scoreByFeedback(repoId, sessionId) {
        // Check for previous positive feedback
        let score = 0;

        for (const [key, feedback] of this.feedbackHistory.entries()) {
            if (feedback.repo_id === repoId) {
                // Positive actions
                if (feedback.action === 'added') score += 0.5;
                if (feedback.action === 'clicked') score += 0.2;
                if (feedback.action === 'dismissed') score -= 0.3;
            }
        }

        return Math.max(0, Math.min(score, 1));
    }

    /**
     * Build context text from session data
     */
    buildContextText(context) {
        const parts = [];

        if (context.currentDoc) parts.push(context.currentDoc);
        for (const edit of context.recentEdits) {
            parts.push(edit.content || edit);
        }

        return parts.join(' ').substring(0, 5000); // Limit size
    }

    /**
     * Extract keywords from content
     */
    extractKeywords(content) {
        // Simple keyword extraction
        const words = content.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 3);

        // Count frequency
        const freq = {};
        for (const word of words) {
            freq[word] = (freq[word] || 0) + 1;
        }

        // Return top keywords
        return Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(e => e[0]);
    }

    /**
     * Get content-based reason strings
     */
    getContentReasons(repo, score) {
        const reasons = [];

        if (score > 0.5) {
            reasons.push(`Strong content match with "${repo.name}"`);
        } else if (score > 0.2) {
            reasons.push(`Related to ${repo.tags?.slice(0, 2).join(', ') || 'this topic'}`);
        }

        return reasons;
    }

    /**
     * Get pattern-based reason strings
     */
    getPatternReasons(repo, score) {
        const reasons = [];

        if (score > 0.5) {
            reasons.push(`Matches your viewing pattern`);
        } else if (repo.language) {
            reasons.push(`${repo.language} project`);
        }

        return reasons;
    }

    /**
     * Get popularity-based reason strings
     */
    getPopularityReasons(repo, score) {
        const reasons = [];

        const stats = this.popularityCache.get(repo.id);
        if (stats) {
            if (stats.add_count > 10) {
                reasons.push(`Popular choice (${stats.add_count} adds)`);
            }
        }

        return reasons;
    }

    /**
     * Update popularity cache
     */
    async updatePopularityCache() {
        const now = Date.now();

        if (now - this.lastCacheUpdate < this.cacheExpiry) {
            return;
        }

        const stats = this.db.getAllPopularityStats?.() || [];

        for (const stat of stats) {
            this.popularityCache.set(stat.repo_id, stat);
        }

        this.lastCacheUpdate = now;
        console.log(`Updated popularity cache with ${stats.length} entries`);
    }

    /**
     * Record user feedback
     */
    async recordFeedback(sessionId, repoId, action, context = {}) {
        const feedback = {
            id: crypto.randomBytes(16).toString('hex'),
            session_id: sessionId,
            repo_id: repoId,
            action, // 'clicked', 'added', 'dismissed', 'viewed'
            context: JSON.stringify(context),
            created_at: Date.now()
        };

        this.db.runFeedback?.(`
            INSERT INTO repo_suggestions_feedback
            (id, session_id, repo_id, action, context, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [feedback.id, feedback.session_id, feedback.repo_id,
            feedback.action, feedback.context, feedback.created_at]);

        // Update in-memory history
        const key = `${sessionId}:${repoId}`;
        this.feedbackHistory.set(key, feedback);

        // Update popularity stats
        await this.updatePopularityStat(repoId, action);

        return feedback;
    }

    /**
     * Record impression for CTR tracking
     */
    async recordImpression(sessionId, repoId, position) {
        const stats = this.popularityCache.get(repoId) || {
            repo_id: repoId,
            view_count: 0,
            add_count: 0,
            click_count: 0,
            impression_count: 0
        };

        stats.impression_count = (stats.impression_count || 0) + 1;
        this.popularityCache.set(repoId, stats);

        // Save to DB
        this.db.runUpsertPopularity?.(`
            INSERT INTO repo_popularity (repo_id, impression_count, last_updated)
            VALUES (?, ?, ?)
            ON CONFLICT(repo_id) DO UPDATE SET
                impression_count = impression_count + 1,
                last_updated = ?
        `, [repoId, Date.now(), Date.now()]);
    }

    /**
     * Update popularity stat based on action
     */
    async updatePopularityStat(repoId, action) {
        const stats = this.popularityCache.get(repoId) || {
            repo_id: repoId,
            view_count: 0,
            add_count: 0,
            click_count: 0,
            impression_count: 0
        };

        switch (action) {
            case 'clicked':
                stats.click_count = (stats.click_count || 0) + 1;
                break;
            case 'added':
                stats.add_count = (stats.add_count || 0) + 1;
                break;
            case 'viewed':
                stats.view_count = (stats.view_count || 0) + 1;
                break;
        }

        this.popularityCache.set(repoId, stats);

        // Update DB
        const column = action === 'clicked' ? 'click_count' :
                      action === 'added' ? 'add_count' : 'view_count';

        this.db.runUpsertPopularity?.(`
            INSERT INTO repo_popularity (repo_id, ${column}, last_updated)
            VALUES (?, 1, ?)
            ON CONFLICT(repo_id) DO UPDATE SET
                ${column} = ${column} + 1,
                last_updated = ?
        `, [repoId, Date.now(), Date.now()]);
    }

    /**
     * Get popular repositories
     */
    getPopularRepos(limit = 10) {
        const sorted = Array.from(this.popularityCache.entries())
            .sort((a, b) => {
                const aScore = (b[1].add_count || 0) * 2 + (b[1].click_count || 0);
                const bScore = (a[1].add_count || 0) * 2 + (a[1].click_count || 0);
                return bScore - aScore;
            })
            .slice(0, limit);

        return sorted.map(([repoId, stats]) => ({
            repoId,
            ...stats
        }));
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            feedbackRecords: this.feedbackHistory.size,
            trackedRepos: this.popularityCache.size,
            lastCacheUpdate: new Date(this.lastCacheUpdate).toISOString()
        };
    }
}

module.exports = RepoSuggesterService;
