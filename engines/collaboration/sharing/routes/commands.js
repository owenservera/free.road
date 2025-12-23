const express = require('express');

function createCommandRoutes(commandRegistry) {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const { agentType, system, user } = req.query;

            const commands = await commandRegistry.listCommands({
                agentType,
                systemOnly: system === 'true',
                userOnly: user === 'true'
            });

            res.json({ commands, count: commands.length });
        } catch (error) {
            res.status(500).json({ error: 'Failed to list commands' });
        }
    });

    router.get('/search', async (req, res) => {
        try {
            const { q } = req.query;

            if (!q) {
                return res.status(400).json({ error: 'Query parameter q is required' });
            }

            const commands = await commandRegistry.searchCommands(q);

            res.json({ commands, count: commands.length });
        } catch (error) {
            res.status(500).json({ error: 'Failed to search commands' });
        }
    });

    router.get('/:name', async (req, res) => {
        try {
            const command = await commandRegistry.getCommand(req.params.name);

            if (!command) {
                return res.status(404).json({ error: 'Command not found' });
            }

            res.json({ command });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    router.post('/', async (req, res) => {
        try {
            const { name, description, agentType, model, template, markdown } = req.body;

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }

            const commandRegistry = this.commands || await new CommandRegistry(this.db).initialize();

            let command;
            if (markdown) {
                command = await commandRegistry.createCommandFromMarkdown(markdown, req.body.createdBy || 'api');
            } else {
                if (!template) {
                    return res.status(400).json({ error: 'Template is required' });
                }

                command = await commandRegistry.registerCommand({
                    name,
                    description,
                    agentType,
                    model,
                    template,
                    is_system: false,
                    created_by: 'api'
                });
            }

            res.json({ success: true, command });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createCommandRoutes;
