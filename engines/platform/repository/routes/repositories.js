const express = require('express');
const crypto = require('crypto');

function createRepositoryRoutes(repositoryService, gitSync) {
    const router = express.Router();

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
            res.status(500).json({ error: 'Failed to list repositories' });
        }
    });

    router.get('/stats', (req, res) => {
        try {
            const stats = repositoryService.getStatsSummary();
            res.json(stats);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get statistics' });
        }
    });

    router.post('/', async (req, res) => {
        try {
            const { url, name, branch, description, tags, isPrivate } = req.body;

            if (!url) {
                return res.status(400).json({ error: 'URL is required' });
            }

            const repo = await repositoryService.createRepository({
                url,
                name,
                branch,
                description,
                tags: tags || [],
                isPrivate: isPrivate || false
            });

            res.status(201).json({ repository: repo });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/:id', (req, res) => {
        try {
            const repo = repositoryService.getRepository(req.params.id);

            if (!repo) {
                return res.status(404).json({ error: 'Repository not found' });
            }

            res.json({ repository: repo });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get repository' });
        }
    });

    router.delete('/:id', async (req, res) => {
        try {
            await repositoryService.deleteRepository(req.params.id, gitSync);
            res.json({ success: true, message: 'Repository deleted' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.get('/:id/files', async (req, res) => {
        try {
            const { path = '' } = req.query;
            const result = await gitSync.listFiles(req.params.id, path);

            if (!result.success) {
                return res.status(500).json({ error: result.error });
            }

            res.json({ files: result.files });
        } catch (error) {
            res.status(500).json({ error: 'Failed to list files' });
        }
    });

    return router;
}

module.exports = createRepositoryRoutes;
