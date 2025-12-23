const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class DocIndexerService {
    constructor(db) {
        this.db = db;
        this.chunks = new Map();
        this.docHashes = new Map();
        this.chunkSize = 500;
        this.overlap = 50;
    }

    generateId() {
        return crypto.randomBytes(16).toString('hex');
    }

    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    parseMarkdown(content) {
        const sections = [];
        const lines = content.split('\n');
        let currentSection = { type: 'text', content: '', heading: '' };
        let codeBlock = null;

        for (const line of lines) {
            const trimmed = line.trim();

            if (trimmed.startsWith('```')) {
                if (codeBlock === null) {
                    codeBlock = { language: trimmed.slice(3), content: '' };
                    sections.push({ ...currentSection });
                    currentSection = { type: 'code', content: '', language: trimmed.slice(3) };
                } else {
                    currentSection.content = codeBlock.content;
                    sections.push({ ...currentSection });
                    currentSection = { type: 'text', content: '', heading: '' };
                    codeBlock = null;
                }
            } else if (codeBlock) {
                currentSection.content += line + '\n';
            } else if (trimmed.startsWith('#')) {
                if (currentSection.content) {
                    sections.push({ ...currentSection });
                }
                const match = trimmed.match(/^(#+)\s+(.+)/);
                currentSection = {
                    type: 'heading',
                    level: match[1].length,
                    heading: match[2],
                    content: ''
                };
            } else {
                currentSection.content += line + '\n';
            }
        }

        if (currentSection.content) {
            sections.push({ ...currentSection });
        }

        return sections;
    }

    createChunks(docId, sections) {
        const chunks = [];
        let currentChunk = [];
        let currentTokens = 0;

        for (const section of sections) {
            const tokens = Math.ceil(section.content.length / 4);

            if (currentTokens + tokens > this.chunkSize) {
                chunks.push({
                    id: this.generateId(),
                    docId,
                    chunkIndex: chunks.length,
                    content: currentChunk.map(s => s.content).join('\n\n'),
                    metadata: { types: currentChunk.map(s => s.type) }
                });

                currentChunk = [section];
                currentTokens = tokens;
            } else {
                currentChunk.push(section);
                currentTokens += tokens;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push({
                id: this.generateId(),
                docId,
                chunkIndex: chunks.length,
                content: currentChunk.map(s => s.content).join('\n\n'),
                metadata: { types: currentChunk.map(s => s.type) }
            });
        }

        return chunks;
    }

    async indexDocument(docId, content) {
        const hash = this.hashContent(content);
        const existing = this.docHashes.get(docId);

        if (existing === hash) {
            return { unchanged: true, chunks: 0 };
        }

        const sections = this.parseMarkdown(content);
        const chunks = this.createChunks(docId, sections);

        for (const chunk of chunks) {
            const chunkData = {
                id: chunk.id,
                doc_id: docId,
                chunk_index: chunk.chunkIndex,
                content: chunk.content,
                metadata: JSON.stringify(chunk.metadata),
                hash: this.hashContent(chunk.content),
                created_at: Math.floor(Date.now() / 1000),
                updated_at: Math.floor(Date.now() / 1000)
            };

            this.db.db.prepare(`
                INSERT OR REPLACE INTO doc_chunks (
                    id, doc_id, chunk_index, content, metadata, hash, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                chunkData.id,
                chunkData.doc_id,
                chunkData.chunk_index,
                chunkData.content,
                chunkData.metadata,
                chunkData.hash,
                chunkData.created_at,
                chunkData.updated_at
            );
        }

        this.db.db.prepare(`
            INSERT OR REPLACE INTO doc_index (
                doc_id, hash, last_indexed, chunk_count
            ) VALUES (?, ?, ?, ?)
        `).run(
            docId,
            hash,
            Math.floor(Date.now() / 1000),
            chunks.length
        );

        this.docHashes.set(docId, hash);

        return { unchanged: false, chunks: chunks.length };
    }

    async getChunks(docId) {
        const chunks = this.db.executeAll(`
            SELECT * FROM doc_chunks WHERE doc_id = :doc_id ORDER BY chunk_index
        `, { ':doc_id': docId });

        return chunks.map(c => ({
            ...c,
            metadata: c.metadata ? JSON.parse(c.metadata) : {}
        }));
    }

    async search(query, limit = 5) {
        const searchChunks = this.db.executeAll(`
            SELECT * FROM doc_chunks WHERE content LIKE :query LIMIT :limit
        `, {
            ':query': `%${query}%`,
            ':limit': limit
        });

        return searchChunks;
    }

    async initialize() {
        console.log('Doc Indexer initialized');
    }

    async stop() {
        console.log('Doc Indexer stopped');
    }

    async healthCheck() {
        return {
            status: 'healthy',
            message: 'Doc Indexer is running',
            chunksIndexed: this.chunks.size
        };
    }
}

module.exports = DocIndexerService;
