// Repository Service - Business logic for repository management

const crypto = require('crypto');

class RepositoryService {
    constructor(db, gitSync) {
        this.db = db;
        this.gitSync = gitSync;
    }

    generateId() {
        return 'repo_' + crypto.randomBytes(16).toString('hex');
    }

    /**
     * Parse Git URL to extract repository info
     */
    parseGitUrl(url) {
        // Handle various Git URL formats
        // GitHub: https://github.com/user/repo
        // GitLab: https://gitlab.com/user/repo
        // SSH: git@github.com:user/repo.git

        let sourceType = 'https';
        let name = '';
        let owner = '';

        // Remove .git suffix if present
        const cleanUrl = url.replace(/\.git$/, '');

        // Parse URL
        try {
            if (cleanUrl.startsWith('git@')) {
                // SSH format: git@github.com:user/repo
                const parts = cleanUrl.split(':');
                const host = parts[0].replace('git@', '');
                const pathParts = parts[1].split('/');

                if (host.includes('github')) {
                    sourceType = 'github';
                } else if (host.includes('gitlab')) {
                    sourceType = 'gitlab';
                } else if (host.includes('bitbucket')) {
                    sourceType = 'bitbucket';
                } else {
                    sourceType = 'ssh';
                }

                owner = pathParts[0] || '';
                name = pathParts[1] || '';
            } else {
                // HTTPS format
                const urlObj = new URL(cleanUrl);

                if (urlObj.hostname.includes('github')) {
                    sourceType = 'github';
                } else if (urlObj.hostname.includes('gitlab')) {
                    sourceType = 'gitlab';
                } else if (urlObj.hostname.includes('bitbucket')) {
                    sourceType = 'bitbucket';
                }

                const pathParts = urlObj.pathname.split('/').filter(p => p);
                owner = pathParts[0] || '';
                name = pathParts[1] || '';
            }
        } catch (e) {
            // If URL parsing fails, return defaults
        }

        return {
            sourceType,
            name: owner && name ? `${owner}/${name}` : cleanUrl.split('/').pop() || 'unknown',
            owner,
            repoName: name
        };
    }

    /**
     * Detect default branch from URL/headers
     */
    async detectDefaultBranch(url) {
        // Default to 'main' for modern repos, could fetch from API to verify
        return 'main';
    }

    /**
     * Create a new repository
     */
    async createRepository(data) {
        const urlInfo = this.parseGitUrl(data.url);

        const repo = {
            id: this.generateId(),
            name: data.name || urlInfo.name,
            sourceType: urlInfo.sourceType,
            url: data.url,
            cloneUrl: data.url, // Will be updated with auth if private
            branch: data.branch || 'main',
            description: data.description || '',
            tags: data.tags || [],
            isPrivate: data.isPrivate || false,
            authTokenId: data.authTokenId,
            localPath: null, // Will be set after clone
            status: 'pending'
        };

        // Create in database
        this.db.createRepository(repo);

        // Log activity
        this.db.logActivity('repo_added', 'repository', repo.id, null, {
            name: repo.name,
            sourceType: repo.sourceType
        });

        return repo;
    }

    /**
     * Get repository with details
     */
    getRepository(id) {
        return this.db.getRepository(id);
    }

    /**
     * List all repositories
     */
    listRepositories(options = {}) {
        return this.db.getAllRepositories(options);
    }

    /**
     * Update repository
     */
    updateRepository(id, updates) {
        const result = this.db.updateRepository(id, updates);

        if (Object.keys(updates).length > 0) {
            this.db.logActivity('repo_updated', 'repository', id, null, updates);
        }

        return result;
    }

    /**
     * Delete repository
     */
    async deleteRepository(id) {
        const repo = this.db.getRepository(id);
        if (!repo) {
            throw new Error('Repository not found');
        }

        // Delete cloned files
        await this.gitSync.deleteRepository(id);

        // Delete from database
        this.db.deleteRepository(id);

        // Log activity
        this.db.logActivity('repo_deleted', 'repository', id, null, {
            name: repo.name
        });

        return { success: true };
    }

    /**
     * Sync a repository (manual trigger)
     */
    async syncRepository(id) {
        const repo = this.db.getRepository(id);
        if (!repo) {
            throw new Error('Repository not found');
        }

        // Update status to syncing
        this.db.updateRepository(id, { status: 'cloning' });

        // Get auth token if private
        let authToken = null;
        if (repo.is_private && repo.auth_token_id) {
            authToken = this.db.getAuthToken(repo.auth_token_id);
        }

        // Perform sync
        const result = await this.gitSync.syncRepository(repo, authToken);

        // Update repository with results
        const updates = {
            status: result.success ? 'active' : 'error',
            last_commit_hash: result.commitHash,
            last_sync_at: Math.floor(Date.now() / 1000),
            stats: result.stats
        };

        if (!result.success) {
            updates.error_message = result.error;
        }

        this.db.updateRepository(id, updates);

        // Log activity
        this.db.logActivity('repo_synced', 'repository', id, null, {
            success: result.success,
            filesAdded: result.filesAdded,
            filesModified: result.filesModified,
            duration: result.duration
        });

        return result;
    }

    /**
     * Get files from a repository
     */
    async getRepositoryFiles(id, dirPath = '') {
        return this.gitSync.listFiles(id, dirPath);
    }

    /**
     * Get file content
     */
    async getFileContent(id, filePath) {
        return this.gitSync.getFileContent(id, filePath);
    }

    /**
     * Search repositories
     */
    searchRepositories(query) {
        const repos = this.db.getAllRepositories();

        if (!query) {
            return repos;
        }

        const lowerQuery = query.toLowerCase();

        return repos.filter(repo => {
            return (
                repo.name?.toLowerCase().includes(lowerQuery) ||
                repo.description?.toLowerCase().includes(lowerQuery) ||
                repo.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
            );
        });
    }

    /**
     * Get repositories by tag
     */
    getRepositoriesByTag(tag) {
        const repos = this.db.getAllRepositories();
        return repos.filter(repo =>
            repo.tags?.some(t => t.toLowerCase() === tag.toLowerCase())
        );
    }

    /**
     * Get repository statistics summary
     */
    getStatsSummary() {
        const repos = this.db.getAllRepositories();

        return {
            total: repos.length,
            active: repos.filter(r => r.status === 'active').length,
            error: repos.filter(r => r.status === 'error').length,
            pending: repos.filter(r => r.status === 'pending' || r.status === 'cloning').length,
            private: repos.filter(r => r.is_private).length,
            bySourceType: this.groupBy(repos, 'source_type')
        };
    }

    groupBy(array, key) {
        return array.reduce((result, item) => {
            const group = item[key] || 'unknown';
            result[group] = (result[group] || 0) + 1;
            return result;
        }, {});
    }
}

module.exports = RepositoryService;
