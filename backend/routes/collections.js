// Collection API Routes

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

function createCollectionRoutes(db) {
    // GET /api/collections - List all collections
    router.get('/', (req, res) => {
        try {
            const collections = db.getAllCollections();
            res.json({ collections });
        } catch (error) {
            console.error('Error listing collections:', error);
            res.status(500).json({ error: 'Failed to list collections' });
        }
    });

    // GET /api/collections/:id - Get collection by ID
    router.get('/:id', (req, res) => {
        try {
            const collection = db.getCollection(req.params.id);
            if (!collection) {
                return res.status(404).json({ error: 'Collection not found' });
            }

            // Get full repository details for each repo
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
            console.error('Error getting collection:', error);
            res.status(500).json({ error: 'Failed to get collection' });
        }
    });

    // GET /api/collections/slug/:slug - Get collection by slug
    router.get('/slug/:slug', (req, res) => {
        try {
            const collection = db.getCollectionBySlug(req.params.slug);
            if (!collection) {
                return res.status(404).json({ error: 'Collection not found' });
            }
            res.json({ collection });
        } catch (error) {
            console.error('Error getting collection by slug:', error);
            res.status(500).json({ error: 'Failed to get collection' });
        }
    });

    // POST /api/collections - Create new collection (admin)
    router.post('/', async (req, res) => {
        try {
            const { name, slug, description, repositoryIds, tags, isFeatured } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const collection = {
                id: 'col_' + crypto.randomBytes(16).toString('hex'),
                name,
                slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
                description: description || '',
                repositoryIds: repositoryIds || [],
                tags: tags || [],
                isFeatured: isFeatured || false
            };

            await db.createCollection(collection);

            res.status(201).json({ collection });
        } catch (error) {
            console.error('Error creating collection:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // PUT /api/collections/:id - Update collection
    router.put('/:id', async (req, res) => {
        try {
            const { name, description, repositoryIds, tags, isFeatured } = req.body;

            await db.updateCollection(req.params.id, {
                name,
                description,
                repositoryIds,
                tags,
                isFeatured
            });

            const collection = db.getCollection(req.params.id);
            res.json({ collection });
        } catch (error) {
            console.error('Error updating collection:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // DELETE /api/collections/:id - Delete collection
    router.delete('/:id', async (req, res) => {
        try {
            await db.deleteCollection(req.params.id);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting collection:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createCollectionRoutes;
