const crypto = require('crypto');

class RepoSuggesterService {
    constructor(db, docIndexer) {
        this.db = db;
        this.docIndexer = docIndexer;
        this.feedbackHistory = new Map();
        this.popularityCache = new Map();
    }

    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async initialize() {
        console.log('Repo Suggester initialized');
        await this.loadFeedbackHistory();
    }

    async loadFeedbackHistory() {
        const feedback = this.db.executeAll(`
            SELECT * FROM repo_suggestions_feedback
        `) || [];

        for (const item of feedback) {
            const key = `${item.session_id}:${item.repo_id}`;
            this.feedbackHistory.set(key, item);
        }

        console.log(`Loaded ${feedback.length} feedback records`);
    }

    async getSuggestions(sessionContext) {
        const {
            sessionId = 'anonymous',
            currentDoc = null,
            recentEdits = [],
            viewHistory = [],
            activeRepos = [],
            limit = 10
        } = sessionContext;

        const allRepos = this.db.getAllRepositories() || [];
        await this.updatePopularityCache();

        const scoredRepos = [];

        for (const repo of allRepos) {
            if (activeRepos.some(r => r.id === repo.id)) {
                continue;
            }

            const score = await this.scoreRepository(repo, {
                currentDoc,
                recentEdits,
                viewHistory
            });

            scoredRepos.push({ ...repo, score });
        }

        scoredRepos.sort((a, b) => b.score - a.score);

        return scoredRepos.slice(0, limit);
    }

    async scoreRepository(repo, context) {
        let score = 0;

        const popularity = this.popularityCache.get(repo.id) || { score: 0 };
        score += popularity.score * 0.2;

        const feedback = Array.from(this.feedbackHistory.values())
            .filter(f => f.repo_id === repo.id);

        if (feedback.length > 0) {
            const positiveFeedback = feedback.filter(f => f.action === 'view' || f.action === 'add').length;
            const negativeFeedback = feedback.filter(f => f.action === 'remove').length;
            score += (positiveFeedback - negativeFeedback) * 0.1;
        }

        return { ...repo, score };
    }

    async updatePopularityCache() {
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);

        const repos = this.db.executeAll(`
            SELECT repo_id, view_count, add_count, click_count, impression_count
            FROM repo_popularity
        `) || [];

        for (const repo of repos) {
            const score = (repo.view_count * 3) + (repo.add_count * 2) + repo.click_count;
            this.popularityCache.set(repo.repo_id, { score, lastUpdated: oneDayAgo });
        }

        console.log(`Updated popularity cache for ${repos.length} repos`);
    }

    async recordFeedback(sessionId, repoId, action, context = {}) {
        const feedback = {
            id: this.generateId(),
            session_id: sessionId,
            repo_id: repoId,
            action,
            context: JSON.stringify(context),
            created_at: Math.floor(Date.now() / 1000)
        };

        this.db.db.prepare(`
            INSERT INTO repo_suggestions_feedback (
                id, session_id, repo_id, action, context, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            feedback.id,
            feedback.session_id,
            feedback.repo_id,
            feedback.action,
            feedback.context,
            feedback.created_at
        );

        const key = `${sessionId}:${repoId}`;
        this.feedbackHistory.set(key, feedback);

        return feedback;
    }

    getPopularRepos(limit = 10) {
        const popular = Array.from(this.popularityCache.entries())
            .sort((a, b) => b[1].score - a[1].score)
            .slice(0, limit)
            .map(([id, data]) => ({
                id,
                score: data.score
            }));

        return popular;
    }

    async stop() {
        console.log('Repo Suggester stopped');
    }

    async healthCheck() {
        return {
            status: 'healthy',
            message: 'Repo Suggester is running',
            feedbackRecords: this.feedbackHistory.size,
            cachedRepos: this.popularityCache.size
        };
    }
}

module.exports = RepoSuggesterService;
