const crypto = require('crypto');

class RepositoryService {
    constructor(db) {
        this.db = db;
    }

    generateId() {
        return 'repo_' + crypto.randomBytes(16).toString('hex');
    }

    parseGitUrl(url) {
        let sourceType = 'https';
        let name = '';
        let owner = '';

        const cleanUrl = url.replace(/\.git$/, '');

        try {
            if (cleanUrl.startsWith('git@')) {
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
        }

        return {
            sourceType,
            name: owner && name ? `${owner}/${name}` : cleanUrl.split('/').pop() || 'unknown',
            owner,
            repoName: name
        };
    }

    async createRepository(data) {
        const urlInfo = this.parseGitUrl(data.url);

        const repo = {
            id: this.generateId(),
            name: data.name || urlInfo.name,
            source_type: urlInfo.sourceType,
            url: data.url,
            clone_url: data.url,
            branch: data.branch || 'main',
            description: data.description || '',
            tags: JSON.stringify(data.tags || []),
            is_private: data.isPrivate ? 1 : 0,
            auth_token_id: data.authTokenId || null,
            local_path: null,
            status: 'pending'
        };

        this.db.createRepository(repo);

        return repo;
    }

    getRepository(id) {
        return this.db.getRepository(id);
    }

    listRepositories(options = {}) {
        return this.db.getAllRepositories(options);
    }

    updateRepository(id, updates) {
        return this.db.updateRepository(id, updates);
    }

    async deleteRepository(id, gitSync) {
        const repo = this.db.getRepository(id);
        if (!repo) {
            throw new Error('Repository not found');
        }

        if (gitSync) {
            await gitSync.deleteRepository(id);
        }

        this.db.deleteRepository(id);

        return { success: true };
    }

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

    getRepositoriesByTag(tag) {
        const repos = this.db.getAllRepositories();
        return repos.filter(repo =>
            repo.tags?.some(t => t.toLowerCase() === tag.toLowerCase())
        );
    }

    getStatsSummary() {
        const repos = this.db.getAllRepositories();

        return {
            total: repos.length,
            active: repos.filter(r => r.status === 'active').length,
            error: repos.filter(r => r.status === 'error').length,
            pending: repos.filter(r => r.status === 'pending' || r.status === 'cloning').length,
            private: repos.filter(r => r.is_private).length
        };
    }
}

module.exports = RepositoryService;
