// Commands Routes - OpenCode-style custom commands
// Manages and executes custom commands

const express = require('express');
const router = express.Router();

function createCommandRoutes(commandRegistry) {
    if (!commandRegistry) {
        console.warn('CommandRegistry not initialized - command routes disabled');
        return router;
    }

    // List all commands
    router.get('/', async (req, res) => {
        try {
            const { agentType, system, user } = req.query;

            const filters = {};
            if (agentType) filters.agentType = agentType;
            if (system === 'true') filters.systemOnly = true;
            if (user === 'true') filters.userOnly = true;

            const commands = await commandRegistry.listCommands(filters);
            res.json({ commands });
        } catch (error) {
            console.error('Error listing commands:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Search commands
    router.get('/search', async (req, res) => {
        try {
            const { q } = req.query;
            if (!q) {
                return res.status(400).json({ error: 'Query parameter q is required' });
            }

            const commands = await commandRegistry.searchCommands(q);
            res.json({ commands });
        } catch (error) {
            console.error('Error searching commands:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Get command by name
    router.get('/:name', async (req, res) => {
        try {
            const command = await commandRegistry.getCommand(req.params.name);

            if (!command) {
                return res.status(404).json({ error: 'Command not found' });
            }

            res.json({ command });
        } catch (error) {
            console.error('Error getting command:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Create new command
    router.post('/', async (req, res) => {
        try {
            const { name, description, agentType, model, template, markdown } = req.body;

            let command;

            if (markdown) {
                // Create from markdown
                command = await commandRegistry.createCommandFromMarkdown(markdown, req.body.createdBy);
            } else {
                // Create from fields
                if (!name || !template) {
                    return res.status(400).json({ error: 'name and template are required' });
                }

                command = await commandRegistry.registerCommand({
                    name,
                    description,
                    agent_type: agentType,
                    model,
                    template,
                    is_system: false,
                    created_by: req.body.createdBy || 'api'
                });
            }

            res.json({
                success: true,
                command
            });
        } catch (error) {
            console.error('Error creating command:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Update command
    router.put('/:name', async (req, res) => {
        try {
            const { description, agentType, model, template } = req.body;

            const updates = {};
            if (description !== undefined) updates.description = description;
            if (agentType !== undefined) updates.agent_type = agentType;
            if (model !== undefined) updates.model = model;
            if (template !== undefined) updates.template = template;

            const command = await commandRegistry.updateCommand(req.params.name, updates);
            res.json({
                success: true,
                command
            });
        } catch (error) {
            console.error('Error updating command:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Delete command
    router.delete('/:name', async (req, res) => {
        try {
            await commandRegistry.deleteCommand(req.params.name);
            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting command:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Execute command
    router.post('/:name/execute', async (req, res) => {
        try {
            const { args, context } = req.body;

            const result = await commandRegistry.executeCommand(
                req.params.name,
                args || {},
                context || {}
            );

            res.json({
                success: true,
                result
            });
        } catch (error) {
            console.error('Error executing command:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Export command as markdown
    router.get('/:name/export', async (req, res) => {
        try {
            const markdown = commandRegistry.exportCommandAsMarkdown(req.params.name);
            res.set('Content-Type', 'text/markdown');
            res.send(markdown);
        } catch (error) {
            console.error('Error exporting command:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Reload commands from files
    router.post('/reload', async (req, res) => {
        try {
            await commandRegistry.loadFromConfigFiles();
            res.json({
                success: true,
                message: 'Commands reloaded from config files'
            });
        } catch (error) {
            console.error('Error reloading commands:', error);
            res.status(500).json({ error: error.message });
        }
    });

    return router;
}

module.exports = createCommandRoutes;
