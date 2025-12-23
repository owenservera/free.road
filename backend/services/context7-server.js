/**
 * Context7 Server - Self-hosted MCP Server for Documentation
 *
 * This service provides:
 * - MCP protocol server for documentation access
 * - Semantic search over Finallica documentation
 * - Context-aware code documentation injection
 * - Real-time document indexing
 */

const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class Context7Server {
    constructor(docPath, db) {
        this.docPath = docPath;
        this.db = db;
        this.wss = null;
        this.clients = new Map();
        this.indexedDocs = new Map();
        this.docChunks = new Map();
        this.embeddings = new Map();
    }

    /**
     * Initialize the MCP server
     */
    async initialize(port = 31338) {
        this.wss = new WebSocket.Server({ port });

        console.log(`Context7 MCP Server running on ws://localhost:${port}`);

        // Index documentation on startup
        await this.indexDocumentation();

        // Handle WebSocket connections
        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });

        // Reindex every 10 minutes
        setInterval(() => {
            this.indexDocumentation();
        }, 10 * 60 * 1000);

        return this;
    }

    /**
     * Handle incoming MCP connection
     */
    handleConnection(ws, req) {
        const clientId = crypto.randomBytes(16).toString('hex');

        const client = {
            id: clientId,
            ws,
            connectedAt: Date.now(),
            capabilities: null
        };

        this.clients.set(clientId, client);

        ws.on('message', async (data) => {
            try {
                const message = JSON.parse(data);
                await this.handleMessage(client, message);
            } catch (error) {
                this.sendError(client, error.message);
            }
        });

        ws.on('close', () => {
            this.clients.delete(clientId);
        });

        // Send welcome message
        this.sendMessage(client, {
            jsonrpc: '2.0',
            id: null,
            method: 'notification',
            params: {
                method: 'initialized',
                params: {
                    serverInfo: {
                        name: 'finallica-context7',
                        version: '1.0.0'
                    },
                    capabilities: this.getServerCapabilities()
                }
            }
        });
    }

    /**
     * Handle incoming MCP message
     */
    async handleMessage(client, message) {
        const { jsonrpc, id, method, params } = message;

        if (!method) {
            this.sendError(client, 'Method required');
            return;
        }

        switch (method) {
            case 'initialize':
                await this.handleInitialize(client, id, params);
                break;

            case 'tools/list':
                await this.handleListTools(client, id);
                break;

            case 'tools/call':
                await this.handleToolCall(client, id, params);
                break;

            case 'resources/list':
                await this.handleListResources(client, id);
                break;

            case 'resources/read':
                await this.handleReadResource(client, id, params);
                break;

            case 'prompts/list':
                await this.handleListPrompts(client, id);
                break;

            default:
                this.sendError(client, `Unknown method: ${method}`);
        }
    }

    /**
     * Handle initialize request
     */
    async handleInitialize(client, id, params) {
        client.capabilities = params.capabilities || {};

        this.sendMessage(client, {
            jsonrpc: '2.0',
            id,
            result: {
                protocolVersion: '2025-06-18',
                capabilities: this.getServerCapabilities(),
                serverInfo: {
                    name: 'finallica-context7',
                    version: '1.0.0'
                }
            }
        });
    }

    /**
     * Handle tools/list request
     */
    async handleListTools(client, id) {
        this.sendMessage(client, {
            jsonrpc: '2.0',
            id,
            result: {
                tools: [
                    {
                        name: 'search_finallica_docs',
                        description: 'Search Finallica documentation for relevant content',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'Search query'
                                },
                                limit: {
                                    type: 'number',
                                    description: 'Maximum number of results (default: 5)',
                                    default: 5
                                }
                            },
                            required: ['query']
                        }
                    },
                    {
                        name: 'get_doc_content',
                        description: 'Get the full content of a specific document',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                docName: {
                                    type: 'string',
                                    description: 'Document name (e.g., README.md)'
                                }
                            },
                            required: ['docName']
                        }
                    },
                    {
                        name: 'list_available_docs',
                        description: 'List all available documentation files',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'get_repo_info',
                        description: 'Get information about a specific repository',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                repoId: {
                                    type: 'string',
                                    description: 'Repository ID or name'
                                }
                            },
                            required: ['repoId']
                        }
                    }
                ]
            }
        });
    }

    /**
     * Handle tools/call request
     */
    async handleToolCall(client, id, params) {
        const { name, arguments: args } = params;

        try {
            let result;

            switch (name) {
                case 'search_finallica_docs':
                    result = await this.searchDocs(args.query, args.limit || 5);
                    break;

                case 'get_doc_content':
                    result = await this.getDocContent(args.docName);
                    break;

                case 'list_available_docs':
                    result = await this.listAvailableDocs();
                    break;

                case 'get_repo_info':
                    result = await this.getRepoInfo(args.repoId);
                    break;

                default:
                    throw new Error(`Unknown tool: ${name}`);
            }

            this.sendMessage(client, {
                jsonrpc: '2.0',
                id,
                result: {
                    content: [
                        {
                            type: 'text',
                            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                        }
                    ]
                }
            });
        } catch (error) {
            this.sendMessage(client, {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32000,
                    message: error.message
                }
            });
        }
    }

    /**
     * Handle resources/list request
     */
    async handleListResources(client, id) {
        const resources = [];

        // Document resources
        for (const [docName, doc] of this.indexedDocs.entries()) {
            resources.push({
                uri: `doc://${docName}`,
                name: docName,
                description: doc.description || `${docName} documentation`,
                mimeType: 'text/markdown'
            });
        }

        // Repository resources
        const repos = this.db.getAllRepositories();
        for (const repo of repos) {
            resources.push({
                uri: `repo://${repo.id}`,
                name: repo.name,
                description: repo.description || `Repository: ${repo.name}`,
                mimeType: 'application/json'
            });
        }

        this.sendMessage(client, {
            jsonrpc: '2.0',
            id,
            result: { resources }
        });
    }

    /**
     * Handle resources/read request
     */
    async handleReadResource(client, id, params) {
        const { uri } = params;

        try {
            let content;

            if (uri.startsWith('doc://')) {
                const docName = uri.replace('doc://', '');
                content = await this.getDocContent(docName);
            } else if (uri.startsWith('repo://')) {
                const repoId = uri.replace('repo://', '');
                content = await this.getRepoInfo(repoId);
            } else {
                throw new Error(`Unknown resource URI: ${uri}`);
            }

            this.sendMessage(client, {
                jsonrpc: '2.0',
                id,
                result: {
                    contents: [
                        {
                            uri,
                            mimeType: 'text/markdown',
                            text: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
                        }
                    ]
                }
            });
        } catch (error) {
            this.sendMessage(client, {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32001,
                    message: error.message
                }
            });
        }
    }

    /**
     * Handle prompts/list request
     */
    async handleListPrompts(client, id) {
        this.sendMessage(client, {
            jsonrpc: '2.0',
            id,
            result: {
                prompts: []
            }
        });
    }

    /**
     * Search documentation for relevant content
     */
    async searchDocs(query, limit = 5) {
        const queryLower = query.toLowerCase();
        const results = [];

        for (const [docName, doc] of this.indexedDocs.entries()) {
            // Search in title, tags, description
            let score = 0;

            if (doc.name.toLowerCase().includes(queryLower)) score += 10;
            if (doc.description && doc.description.toLowerCase().includes(queryLower)) score += 5;
            if (doc.tags) {
                for (const tag of doc.tags) {
                    if (tag.toLowerCase().includes(queryLower)) score += 3;
                }
            }

            // Search in content (sample)
            if (doc.content) {
                const contentLower = doc.content.toLowerCase();
                const matches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
                score += matches;
            }

            if (score > 0) {
                results.push({
                    docName,
                    name: doc.name,
                    description: doc.description,
                    score,
                    excerpt: this.getExcerpt(doc.content, query)
                });
            }
        }

        // Sort by score and return top results
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
    }

    /**
     * Get content of a specific document
     */
    async getDocContent(docName) {
        const doc = this.indexedDocs.get(docName);
        if (doc) {
            return doc.content;
        }

        // Try to load from filesystem
        try {
            const filePath = path.join(this.docPath, docName);
            const content = await fs.readFile(filePath, 'utf-8');
            return content;
        } catch (error) {
            throw new Error(`Document not found: ${docName}`);
        }
    }

    /**
     * List all available documentation files
     */
    async listAvailableDocs() {
        return Array.from(this.indexedDocs.values()).map(doc => ({
            name: doc.name,
            description: doc.description,
            tags: doc.tags || []
        }));
    }

    /**
     * Get information about a repository
     */
    async getRepoInfo(repoId) {
        const repo = this.db.getRepository(repoId);
        if (!repo) {
            // Try by name
            const repos = this.db.getAllRepositories();
            const found = repos.find(r => r.name === repoId || r.name.toLowerCase().includes(repoId.toLowerCase()));
            if (found) {
                return found;
            }
            throw new Error(`Repository not found: ${repoId}`);
        }
        return repo;
    }

    /**
     * Get excerpt from content
     */
    getExcerpt(content, query, length = 200) {
        if (!content) return '';

        const queryLower = query.toLowerCase();
        const index = content.toLowerCase().indexOf(queryLower);

        if (index === -1) return content.substring(0, length) + '...';

        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + query.length + 50);

        let excerpt = content.substring(start, end);

        if (start > 0) excerpt = '...' + excerpt;
        if (end < content.length) excerpt = excerpt + '...';

        return excerpt;
    }

    /**
     * Index all documentation files
     */
    async indexDocumentation() {
        console.log('Indexing Finallica documentation...');

        try {
            const files = await fs.readdir(this.docPath);
            const markdownFiles = files.filter(f => f.endsWith('.md'));

            for (const file of markdownFiles) {
                const filePath = path.join(this.docPath, file);
                const content = await fs.readFile(filePath, 'utf-8');

                // Extract metadata from frontmatter if present
                const metadata = this.extractMetadata(content);

                this.indexedDocs.set(file, {
                    name: file,
                    content,
                    description: metadata.description || '',
                    tags: metadata.tags || [],
                    indexedAt: Date.now()
                });

                // Create chunks for better search
                this.createChunks(file, content);
            }

            console.log(`Indexed ${markdownFiles.length} documentation files`);
        } catch (error) {
            console.error('Error indexing documentation:', error);
        }
    }

    /**
     * Extract YAML frontmatter metadata
     */
    extractMetadata(content) {
        const frontmatterRegex = /^---\n([\s\S]*?)\n---\n/;
        const match = content.match(frontmatterRegex);

        if (!match) return {};

        try {
            // Simple YAML parser for basic properties
            const yaml = match[1];
            const metadata = {};

            const titleMatch = yaml.match(/title:\s*(.+)/);
            if (titleMatch) metadata.description = titleMatch[1].trim();

            const tagMatches = yaml.matchAll(/tags:\s*\[(.*?)\]/g);
            const tags = [];
            for (const m of tagMatches) {
                const tagList = m[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
                tags.push(...tagList);
            }
            if (tags.length > 0) metadata.tags = tags;

            return metadata;
        } catch (error) {
            return {};
        }
    }

    /**
     * Create searchable chunks from content
     */
    createChunks(docName, content) {
        const chunkSize = 500; // Approximate token count
        const overlap = 50;

        // Simple chunking by paragraphs
        const paragraphs = content.split('\n\n+');
        const chunks = [];
        let currentChunk = '';

        for (const para of paragraphs) {
            if (currentChunk.length + para.length > chunkSize && currentChunk.length > 0) {
                chunks.push(currentChunk.trim());
                currentChunk = para;
            } else {
                currentChunk += (currentChunk ? '\n\n' : '') + para;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        this.docChunks.set(docName, chunks);
    }

    /**
     * Get server capabilities
     */
    getServerCapabilities() {
        return {
            tools: {},
            resources: {},
            prompts: {},
            streaming: false,
            sampling: false
        };
    }

    /**
     * Send message to client
     */
    sendMessage(client, message) {
        if (client.ws && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Send error to client
     */
    sendError(client, errorMessage) {
        this.sendMessage(client, {
            jsonrpc: '2.0',
            error: {
                code: -32600,
                message: errorMessage
            }
        });
    }

    /**
     * Get server statistics
     */
    getStats() {
        return {
            connectedClients: this.clients.size,
            indexedDocs: this.indexedDocs.size,
            totalChunks: Array.from(this.docChunks.values()).reduce((sum, chunks) => sum + chunks.length, 0)
        };
    }

    /**
     * Shutdown the server
     */
    shutdown() {
        if (this.wss) {
            this.wss.close();
        }
    }
}

module.exports = Context7Server;
