const express = require('express');
const crypto = require('crypto');

function createCollectionRoutes(db) {
    const router = express.Router();

    router.get('/', (req, res) => {
        try {
            const collections = db.getAllCollections();
            res.json({ collections });
        } catch (error) {
            res.status(500).json({ error: 'Failed to list collections' });
        }
    });

    router.get('/:id', (req, res) => {
        try {
            const collection = db.getCollection(req.params.id);

            if (!collection) {
                return res.status(404).json({ error: 'Collection not found' });
            }

            const repos = [];
            if (collection.repository_ids) {
                for (const repoId of collection.repository_ids) {
                    const repo = db.getRepository(repoId);
                    if (repo) {
                        repos.push({
                            id: repo.id,
                            name: repo.name,
                            description: repo.description,
                            tags: repo.tags,
                            status: repo.status
                        });
                    }
                }
            }

            res.json({
                collection: {
                    ...collection,
                    repositories: repos
                }
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get collection' });
        }
    });

    router.get('/slug/:slug', (req, res) => {
        try {
            const collection = db.getCollectionBySlug(req.params.slug);

            if (!collection) {
                return res.status(404).json({ error: 'Collection not found' });
            }

            res.json({ collection });
        } catch (error) {
            res.status(500).json({ error: 'Failed to get collection' });
        }
    });

    router.post('/', async (req, res) => {
        try {
            const { name, slug, description, repositoryIds, tags } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const collection = {
                id: 'col_' + crypto.randomBytes(16).toString('hex'),
                name,
                slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
                description: description || '',
                repository_ids: repositoryIds || [],
                tags: tags || []
            };

            await db.createCollection(collection);

            res.status(201).json({ collection });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.put('/:id', async (req, res) => {
        try {
            const { name, description, repositoryIds, tags } = req.body;

            await db.updateCollection(req.params.id, {
                name,
                description,
                repository_ids: repositoryIds,
                tags
            });

            const collection = db.getCollection(req.params.id);
            res.json({ collection });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.delete('/:id', async (req, res) => {
        try {
            await db.deleteCollection(req.params.id);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createCollectionRoutes;
