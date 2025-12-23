/**
 * MCP Routes - Model Context Protocol API endpoints
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

function createMCPRoutes(mcpPassport, mcpClient) {

    // POST /api/mcp/auth - Authenticate and get session token
    router.post('/auth', async (req, res) => {
        try {
            const { serverId, challengeId, signature, capabilities, role } = req.body;

            const result = await mcpPassport.authenticate({
                serverId,
                challengeId,
                signature,
                capabilities
            }, role || 'client');

            if (result.success) {
                res.json({
                    success: true,
                    session: {
                        id: result.session.id,
                        token: result.session.token,
                        serverId: result.session.serverId,
                        capabilities: result.session.capabilities
                    },
                    serverCapabilities: result.serverCapabilities
                });
            } else {
                res.status(401).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // GET /api/mcp/challenge - Get a new authentication challenge
    router.get('/challenge', (req, res) => {
        const { serverId } = req.query;

        if (!serverId) {
            return res.status(400).json({ error: 'serverId is required' });
        }

        const challenge = mcpPassport.generateChallenge(serverId || 'unknown');

        res.json({
            challengeId: challenge.id,
            nonce: challenge.nonce,
            expiresAt: challenge.expiresAt
        });
    });

    // POST /api/mcp/servers - Register a new MCP server
    router.post('/servers', async (req, res) => {
        try {
            const { serverId, name, url, capabilities } = req.body;

            if (!serverId) {
                return res.status(400).json({ error: 'serverId is required' });
            }

            // Generate credentials
            const publicKey = crypto.randomBytes(32).toString('hex');

            const result = mcpPassport.registerServer(serverId, {
                name,
                url,
                publicKey,
                capabilities,
                registeredAt: Date.now()
            });

            res.json({
                success: true,
                serverId: result.serverId,
                publicKey
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/mcp/servers - List all registered servers
    router.get('/servers', (req, res) => {
        const servers = mcpPassport.getServers();
        const connections = mcpClient.getConnections();

        const serversWithStatus = servers.map(server => {
            const connection = connections.find(c => c.url === server.url);
            return {
                ...server,
                connected: !!connection,
                connectionState: connection?.state || 'disconnected'
            };
        });

        res.json({ servers: serversWithStatus });
    });

    // GET /api/mcp/servers/:id - Get server details
    router.get('/servers/:id', (req, res) => {
        const { id } = req.params;
        const session = mcpPassport.getSession(id);

        if (!session) {
            return res.status(404).json({ error: 'Server not found' });
        }

        const connections = mcpClient.getConnections();
        const connection = connections.find(c => c.id === id);

        res.json({
            server: session,
            connected: !!connection,
            connectionState: connection?.state
        });
    });

    // DELETE /api/mcp/servers/:id - Unregister a server
    router.delete('/servers/:id', (req, res) => {
        const { id } = req.params;

        // Disconnect if connected
        mcpClient.disconnect(id);

        const result = mcpPassport.unregisterServer(id);

        if (result.success) {
            res.json({ success: true, serverId: id });
        } else {
            res.status(404).json({ error: 'Server not found' });
        }
    });

    // POST /api/mcp/servers/:id/connect - Connect to a server
    router.post('/servers/:id/connect', async (req, res) => {
        try {
            const { id } = req.params;
            const { url } = req.body;

            const connection = await mcpClient.connectToServer(url);

            res.json({
                success: true,
                connection: {
                    id: connection.id,
                    state: connection.state,
                    capabilities: connection.capabilities
                }
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/mcp/servers/:id/disconnect - Disconnect from a server
    router.post('/servers/:id/disconnect', (req, res) => {
        const { id } = req.params;

        const result = mcpClient.disconnect(id);

        if (result) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Connection not found' });
        }
    });

    // GET /api/mcp/servers/:id/tools - List available tools from a server
    router.get('/servers/:id/tools', async (req, res) => {
        try {
            const { id } = req.params;

            const tools = await mcpClient.listTools(id);

            res.json({ tools });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // POST /api/mcp/servers/:id/tools/:toolId - Execute a tool
    router.post('/servers/:id/tools/:toolId', async (req, res) => {
        try {
            const { id, toolId } = req.params;
            const { params = {} } = req.body;

            const result = await mcpClient.executeTool(id, toolId, params);

            res.json({ result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/mcp/servers/:id/resources - List available resources
    router.get('/servers/:id/resources', async (req, res) => {
        try {
            const { id } = req.params;

            const resources = await mcpClient.listResources(id);

            res.json({ resources });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/mcp/servers/:id/resources/read - Read a specific resource
    router.post('/servers/:id/resources/read', async (req, res) => {
        try {
            const { id } = req.params;
            const { uri } = req.body;

            if (!uri) {
                return res.status(400).json({ error: 'URI is required' });
            }

            const result = await mcpClient.readResource(id, uri);

            res.json({ result });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // GET /api/mcp/stats - Get MCP statistics
    router.get('/stats', (req, res) => {
        const passportStats = mcpPassport.getStats();
        const clientStats = mcpClient.getStats();

        res.json({
            ...passportStats,
            ...clientStats
        });
    });

    // POST /api/mcp/cleanup - Clean up expired sessions
    router.post('/cleanup', (req, res) => {
        mcpPassport.cleanup();

        res.json({ success: true });
    });

    return router;
}

module.exports = createMCPRoutes;
