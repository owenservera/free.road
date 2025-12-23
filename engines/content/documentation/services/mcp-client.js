/**
 * MCP Client - Model Context Protocol Client Implementation
 *
 * This service provides:
 * - WebSocket connection to MCP servers
 * - Tool execution framework
 * - Resource fetching
 * - Prompt template management
 */

const WebSocket = require('ws');
const { URL } = require('url');
const crypto = require('crypto');

class MCPClient {
    constructor(mcpPassport) {
        this.mcpPassport = mcpPassport;
        this.connections = new Map();
        this.toolResults = new Map();
    }

    /**
     * Connect to an MCP server
     */
    async connectToServer(serverUrl, credentials = {}) {
        const wsUrl = serverUrl.replace(/^https?:\/\//, 'ws://');
        const ws = new WebSocket(wsUrl, {
            headers: {
                'X-MCP-Protocol-Version': '2025-06-18',
                'X-MCP-Client-Id': 'finallica-docs'
            }
        });

        const connectionId = crypto.randomBytes(16).toString('hex');

        const connection = {
            id: connectionId,
            url: serverUrl,
            ws,
            state: 'connecting',
            tools: new Map(),
            resources: new Map(),
            capabilities: null,
            createdAt: Date.now()
        };

        this.connections.set(connectionId, connection);

        return new Promise((resolve, reject) => {
            ws.on('open', async () => {
                connection.state = 'connected';

                // Initialize handshake
                try {
                    await this.performHandshake(connection, credentials);
                    resolve(connection);
                } catch (error) {
                    reject(error);
                }
            });

            ws.on('message', (data) => {
                this.handleMessage(connection, data);
            });

            ws.on('error', (error) => {
                connection.state = 'error';
                connection.lastError = error;
                reject(error);
            });

            ws.on('close', () => {
                connection.state = 'disconnected';
                this.connections.delete(connectionId);
            });

            // Timeout after 30 seconds
            setTimeout(() => {
                if (connection.state === 'connecting') {
                    ws.close();
                    reject(new Error('Connection timeout'));
                }
            }, 30000);
        });
    }

    /**
     * Perform initial handshake with MCP server
     */
    async performHandshake(connection, credentials) {
        // Send initialize request
        this.sendMessage(connection, {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-06-18',
                capabilities: this.mcpPassport.getServerCapabilities(),
                clientInfo: {
                    name: 'finallica-docs',
                    version: '1.0.0'
                }
            }
        });

        // Wait for initialized response
        await new Promise((resolve) => {
            const checkInit = setInterval(() => {
                if (connection.state === 'initialized') {
                    clearInterval(checkInit);
                    resolve();
                }
            }, 100);
        });
    }

    /**
     * Handle incoming message from MCP server
     */
    handleMessage(connection, data) {
        try {
            const message = JSON.parse(data);

            // Handle response to initialize
            if (message.id === 1 && message.result) {
                connection.capabilities = message.result.capabilities;
                connection.state = 'initialized';
                return;
            }

            // Handle tool execution results
            if (message.result && message.result.toolResult) {
                const { toolCallId, result } = message.result;
                this.toolResults.set(toolCallId, result);
                return;
            }

        } catch (error) {
            console.error('Failed to handle MCP message:', error);
        }
    }

    /**
     * Send message to MCP server
     */
    sendMessage(connection, message) {
        if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
            connection.ws.send(JSON.stringify(message));
            return true;
        }
        return false;
    }

    /**
     * List available tools from server
     */
    async listTools(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.state !== 'initialized') {
            throw new Error('Connection not ready');
        }

        const requestId = Date.now();

        this.sendMessage(connection, {
            jsonrpc: '2.0',
            id: requestId,
            method: 'tools/list',
            params: {}
        });

        // Wait for response (simplified - in production use proper async handling)
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve([]), 5000);

            connection.ws.once('message', (data) => {
                clearTimeout(timeout);
                try {
                    const response = JSON.parse(data);
                    resolve(response.result?.tools || []);
                } catch {
                    resolve([]);
                }
            });
        });
    }

    /**
     * Execute a tool on the MCP server
     */
    async executeTool(connectionId, toolId, params = {}) {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.state !== 'initialized') {
            throw new Error('Connection not ready');
        }

        const toolCallId = crypto.randomBytes(16).toString('hex');
        const requestId = Date.now();

        this.sendMessage(connection, {
            jsonrpc: '2.0',
            id: requestId,
            method: 'tools/call',
            params: {
                name: toolId,
                arguments: params,
                _meta: {
                    toolCallId
                }
            }
        });

        // Wait for result
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Tool execution timeout')), 30000);

            const handler = (data) => {
                try {
                    const response = JSON.parse(data);
                    if (response.id === requestId) {
                        clearTimeout(timeout);
                        connection.ws.removeListener('message', handler);

                        if (response.error) {
                            reject(new Error(response.error.message));
                        } else {
                            resolve(response.result);
                        }
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            };

            connection.ws.on('message', handler);
        });
    }

    /**
     * List available resources from server
     */
    async listResources(connectionId) {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.state !== 'initialized') {
            throw new Error('Connection not ready');
        }

        const requestId = Date.now();

        this.sendMessage(connection, {
            jsonrpc: '2.0',
            id: requestId,
            method: 'resources/list',
            params: {}
        });

        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve([]), 5000);

            connection.ws.once('message', (data) => {
                clearTimeout(timeout);
                try {
                    const response = JSON.parse(data);
                    resolve(response.result?.resources || []);
                } catch {
                    resolve([]);
                }
            });
        });
    }

    /**
     * Read a resource from the server
     */
    async readResource(connectionId, uri) {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.state !== 'initialized') {
            throw new Error('Connection not ready');
        }

        const requestId = Date.now();

        this.sendMessage(connection, {
            jsonrpc: '2.0',
            id: requestId,
            method: 'resources/read',
            params: { uri }
        });

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Resource read timeout')), 10000);

            const handler = (data) => {
                try {
                    const response = JSON.parse(data);
                    if (response.id === requestId) {
                        clearTimeout(timeout);
                        connection.ws.removeListener('message', handler);

                        if (response.error) {
                            reject(new Error(response.error.message));
                        } else {
                            resolve(response.result);
                        }
                    }
                } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            };

            connection.ws.on('message', handler);
        });
    }

    /**
     * Disconnect from a server
     */
    disconnect(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.ws.close();
            this.connections.delete(connectionId);
            return true;
        }
        return false;
    }

    /**
     * Get all active connections
     */
    getConnections() {
        return Array.from(this.connections.values()).map(conn => ({
            id: conn.id,
            url: conn.url,
            state: conn.state,
            capabilities: conn.capabilities,
            toolCount: conn.tools.size,
            resourceCount: conn.resources.size
        }));
    }

    /**
     * Get connection stats
     */
    getStats() {
        return {
            activeConnections: this.connections.size,
            toolResultsCached: this.toolResults.size
        };
    }
}

module.exports = MCPClient;
