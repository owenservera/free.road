const WebSocket = require('ws');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class Context7Server {
    constructor(docPath, db, docIndexer) {
        this.docPath = docPath;
        this.db = db;
        this.docIndexer = docIndexer;
        this.wss = null;
        this.clients = new Map();
        this.indexedDocs = new Map();
    }

    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    async initialize(port = 31338) {
        this.wss = new WebSocket.Server({ port });

        await this.indexDocumentation();

        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });

        setInterval(() => {
            this.indexDocumentation();
        }, 10 * 60 * 1000);

        console.log(`Context7 Server running on ws://localhost:${port}`);
    }

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

    async handleMessage(client, message) {
        switch (message.method) {
            case 'search':
                await this.handleSearch(client, message.params);
                break;
            case 'list':
                await this.handleList(client, message.params);
                break;
            case 'get':
                await this.handleGet(client, message.params);
                break;
            default:
                console.log('Unknown method:', message.method);
        }
    }

    async handleSearch(client, params) {
        const { query, limit = 5 } = params;
        const results = await this.docIndexer.search(query, limit);

        this.sendMessage(client, {
            jsonrpc: '2.0',
            id: message.id,
            result: { success: true, query, results, count: results.length }
        });
    }

    async handleList(client, params) {
        const docs = await this.listAvailableDocs();

        this.sendMessage(client, {
            jsonrpc: '2.0',
            id: message.id,
            result: { success: true, docs }
        });
    }

    async handleGet(client, params) {
        const { docName } = params;
        const content = await this.getDocContent(docName);

        this.sendMessage(client, {
            jsonrpc: '2.0',
            id: message.id,
            result: { success: true, docName, content }
        });
    }

    sendMessage(client, message) {
        if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
        }
    }

    sendError(client, errorMessage) {
        this.sendMessage(client, {
            jsonrpc: '2.0',
            id: null,
            method: 'error',
            params: { error: errorMessage }
        });
    }

    async indexDocumentation() {
        try {
            const docsPath = this.docPath;
            const docs = await fs.readdir(docsPath);

            for (const docName of docs) {
                const docPath = path.join(docsPath, docName);

                if (!docName.endsWith('.md') && !docName.endsWith('.markdown')) {
                    continue;
                }

                const content = await fs.readFile(docPath, 'utf8');
                const docId = `doc_${docName.replace(/\.(md|markdown)$/, '')}`;
                await this.docIndexer.indexDocument(docId, content);
            }

            console.log(`Indexed ${docs.length} documents`);
        } catch (error) {
            console.error('Error indexing documentation:', error);
        }
    }

    async listAvailableDocs() {
        const docsPath = this.docPath;
        const docs = await fs.readdir(docsPath);

        return docs
            .filter(d => d.endsWith('.md') || d.endsWith('.markdown'))
            .map(d => ({
                name: d,
                path: path.join(docsPath, d),
                title: d.replace(/\.(md|markdown)$/, '')
            }));
    }

    async getDocContent(docName) {
        const docsPath = this.docPath;
        const docPath = path.join(docsPath, docName);

        try {
            const content = await fs.readFile(docPath, 'utf8');
            return content;
        } catch (error) {
            throw new Error(`Document not found: ${docName}`);
        }
    }

    getServerCapabilities() {
        return [
            'search',
            'list',
            'get',
            'streaming'
        ];
    }

    async searchDocs(query, limit = 5) {
        return await this.docIndexer.search(query, limit);
    }

    getStats() {
        return {
            connectedClients: this.clients.size,
            indexedDocs: this.indexedDocs.size,
            serverUptime: Date.now()
        };
    }

    async stop() {
        if (this.wss) {
            this.wss.close();
        }
        console.log('Context7 Server stopped');
    }
}

module.exports = Context7Server;
