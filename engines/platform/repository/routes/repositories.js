// Repository API Routes

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

function createRepositoryRoutes(db, repositoryService, gitSync) {
    // GET /api/repositories - List all repositories
    router.get('/', (req, res) => {
        try {
            const { status, tag, search } = req.query;

            let repos;

            if (search) {
                repos = repositoryService.searchRepositories(search);
            } else if (tag) {
                repos = repositoryService.getRepositoriesByTag(tag);
            } else {
                repos = repositoryService.listRepositories({ status });
            }

            res.json({
                repositories: repos,
                total: repos.length,
                stats: repositoryService.getStatsSummary()
            });
        } catch (error) {
            console.error('Error listing repositories:', error);
            res.status(500).json({ error: 'Failed to list repositories' });
        }
    });

    // GET /api/repositories/stats - Get repository statistics
    router.get('/stats', (req, res) => {
        try {
            const stats = repositoryService.getStatsSummary();
            res.json(stats);
        } catch (error) {
            console.error('Error getting stats:', error);
            res.status(500).json({ error: 'Failed to get statistics' });
        }
    });

    // POST /api/repositories - Add new repository
    router.post('/', async (req, res) => {
        try {
            const { url, name, branch, description, tags, isPrivate, authTokenId } = req.body;

            if (!url) {
                return res.status(400).json({ error: 'URL is required' });
            }

            // Create repository
            const repo = await repositoryService.createRepository({
                url,
                name,
                branch,
                description,
                tags: tags || [],
                isPrivate: isPrivate || false,
                authTokenId
            });

            // Start initial sync in background
            setImmediate(async () => {
                try {
                    await repositoryService.syncRepository(repo.id);
                } catch (error) {
                    console.error('Initial sync error:', error);
                }
            });

            res.status(201).json({
                repository: repo,
                message: 'Repository added. Initial sync started.'
            });
        } catch (error) {
            console.error('Error creating repository:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/repositories/:id - Get repository details
    router.get('/:id', (req, res) => {
        try {
            const { id } = req.params;
            const repo = repositoryService.getRepository(id);

            if (!repo) {
                return res.status(404).json({ error: 'Repository not found' });
            }

            res.json({ repository: repo });
        } catch (error) {
            console.error('Error getting repository:', error);
            res.status(500).json({ error: 'Failed to get repository' });
        }
    });

    // PUT /api/repositories/:id - Update repository
    router.put('/:id', (req, res) => {
        try {
            const { id } = req.params;
            const { name, description, tags, branch } = req.body;

            const updates = {};
            if (name !== undefined) updates.name = name;
            if (description !== undefined) updates.description = description;
            if (tags !== undefined) updates.tags = tags;
            if (branch !== undefined) updates.branch = branch;

            repositoryService.updateRepository(id, updates);

            const repo = repositoryService.getRepository(id);
            res.json({ repository: repo });
        } catch (error) {
            console.error('Error updating repository:', error);
            res.status(500).json({ error: 'Failed to update repository' });
        }
    });

    // DELETE /api/repositories/:id - Remove repository
    router.delete('/:id', async (req, res) => {
        try {
            const { id } = req.params;
            await repositoryService.deleteRepository(id);
            res.json({ success: true, message: 'Repository deleted' });
        } catch (error) {
            console.error('Error deleting repository:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/repositories/:id/sync - Trigger manual sync
    router.post('/:id/sync', async (req, res) => {
        try {
            const { id } = req.params;

            // Create sync job
            const jobId = 'sync_' + crypto.randomBytes(16).toString('hex');
            db.createSyncJob({
                id: jobId,
                repositoryId: id,
                status: 'queued',
                triggerType: 'manual'
            });

            // Start sync in background
            setImmediate(async () => {
                try {
                    db.updateSyncJob(jobId, { status: 'running', started_at: Math.floor(Date.now() / 1000) });

                    const result = await repositoryService.syncRepository(id);

                    db.updateSyncJob(jobId, {
                        status: result.success ? 'completed' : 'failed',
                        completed_at: Math.floor(Date.now() / 1000),
                        duration_ms: result.duration,
                        files_added: result.filesAdded,
                        files_modified: result.filesModified,
                        error_message: result.error
                    });
                } catch (error) {
                    db.updateSyncJob(jobId, {
                        status: 'failed',
                        completed_at: Math.floor(Date.now() / 1000),
                        error_message: error.message
                    });
                }
            });

            res.json({
                success: true,
                message: 'Sync job queued',
                jobId
            });
        } catch (error) {
            console.error('Error queuing sync:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/repositories/:id/files - List repository files
    router.get('/:id/files', async (req, res) => {
        try {
            const { id } = req.params;
            const { path = '' } = req.query;

            const result = await repositoryService.getRepositoryFiles(id, path);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ files: result.files });
        } catch (error) {
            console.error('Error listing files:', error);
            res.status(500).json({ error: 'Failed to list files' });
        }
    });

    // GET /api/repositories/:id/files/* - Get file content
    router.get('/:id/files/*', async (req, res) => {
        try {
            const { id } = req.params;
            const filePath = req.params[0]; // Everything after /files/

            const result = await repositoryService.getFileContent(id, filePath);

            if (!result.success) {
                return res.status(404).json({ error: result.error || 'File not found' });
            }

            res.json({
                path: filePath,
                content: result.content
            });
        } catch (error) {
            console.error('Error getting file:', error);
            res.status(500).json({ error: 'Failed to get file content' });
        }
    });

    // GET /api/repositories/:id/history - Get sync history
    router.get('/:id/history', (req, res) => {
        try {
            const { id } = req.params;

            // Get sync jobs for this repository
            const stmt = db.db.prepare(`
                SELECT * FROM sync_jobs
                WHERE repository_id = ?
                ORDER BY started_at DESC
                LIMIT 20
            `);

            const jobs = stmt.all(id);

            res.json({ history: jobs });
        } catch (error) {
            console.error('Error getting history:', error);
            res.status(500).json({ error: 'Failed to get history' });
        }
    });

    return router;
}

module.exports = createRepositoryRoutes;
