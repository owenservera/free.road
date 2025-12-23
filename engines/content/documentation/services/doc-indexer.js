/**
 * Documentation Indexer Service
 *
 * Provides:
 * - Advanced markdown parsing with code block extraction
 * - Token-based chunking with overlap
 * - Lightweight vector similarity search
 * - Incremental updates on doc changes
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class DocIndexer {
    constructor(db) {
        this.db = db;
        this.chunks = new Map();
        this.docHashes = new Map();
        this.embeddings = new Map();
        this.chunkSize = 500; // tokens
        this.overlap = 50; // tokens
    }

    /**
     * Initialize the indexer and create tables if needed
     */
    async initialize() {
        // Create chunks table if not exists
        this.db.run(`
            CREATE TABLE IF NOT EXISTS doc_chunks (
                id TEXT PRIMARY KEY,
                doc_id TEXT,
                chunk_index INTEGER,
                content TEXT,
                metadata TEXT,
                embedding TEXT,
                hash TEXT,
                created_at INTEGER,
                updated_at INTEGER,
                UNIQUE(doc_id, chunk_index)
            )
        `);

        // Create doc_index table for tracking document versions
        this.db.run(`
            CREATE TABLE IF NOT EXISTS doc_index (
                doc_id TEXT PRIMARY KEY,
                hash TEXT,
                last_indexed INTEGER,
                chunk_count INTEGER,
                metadata TEXT
            )
        `);

        // Load existing chunks into memory
        await this.loadChunks();
    }

    /**
     * Load chunks from database into memory
     */
    async loadChunks() {
        const chunks = this.db.getAllChunks?.() || [];

        for (const chunk of chunks) {
            const key = `${chunk.doc_id}:${chunk.chunk_index}`;
            this.chunks.set(key, {
                id: chunk.id,
                docId: chunk.doc_id,
                index: chunk.chunk_index,
                content: chunk.content,
                metadata: chunk.metadata ? JSON.parse(chunk.metadata) : {},
                embedding: chunk.embedding ? JSON.parse(chunk.embedding) : null,
                hash: chunk.hash
            });
        }

        console.log(`Loaded ${this.chunks.size} chunks from database`);
    }

    /**
     * Index a markdown document
     */
    async indexDocument(docId, content) {
        const hash = this.hashContent(content);
        const existing = this.docHashes.get(docId);

        // Skip if unchanged
        if (existing === hash) {
            return { unchanged: true, chunks: 0 };
        }

        // Clear existing chunks for this doc
        await this.clearDocumentChunks(docId);

        // Parse and chunk content
        const sections = this.parseMarkdown(content);
        const chunks = this.createChunks(docId, sections);

        // Store chunks
        for (const chunk of chunks) {
            await this.storeChunk(chunk);
        }

        // Update document index
        this.db.runDocIndex?.(`
            INSERT OR REPLACE INTO doc_index (doc_id, hash, last_indexed, chunk_count)
            VALUES (?, ?, ?, ?)
        `, [docId, hash, Date.now(), chunks.length]);

        this.docHashes.set(docId, hash);

        return { indexed: true, chunks: chunks.length };
    }

    /**
     * Index all markdown files in a directory
     */
    async indexDirectory(dirPath) {
        const results = { indexed: [], skipped: [], errors: [] };

        try {
            const files = await fs.readdir(dirPath);
            const markdownFiles = files.filter(f => f.endsWith('.md'));

            for (const file of markdownFiles) {
                const docId = path.basename(file, '.md');
                const filePath = path.join(dirPath, file);

                try {
                    const content = await fs.readFile(filePath, 'utf-8');
                    const result = await this.indexDocument(docId, content);

                    if (result.unchanged) {
                        results.skipped.push(docId);
                    } else {
                        results.indexed.push({ id: docId, chunks: result.chunks });
                    }
                } catch (error) {
                    results.errors.push({ id: docId, error: error.message });
                }
            }
        } catch (error) {
            console.error('Error indexing directory:', error);
        }

        return results;
    }

    /**
     * Parse markdown into sections
     */
    parseMarkdown(content) {
        const sections = [];
        const lines = content.split('\n');
        let currentSection = { title: '', content: '', level: 0, codeBlocks: [] };
        let inCodeBlock = false;
        let codeBlockLang = '';
        let codeBlockContent = [];

        for (const line of lines) {
            // Check for code fence
            if (line.startsWith('```')) {
                if (!inCodeBlock) {
                    inCodeBlock = true;
                    codeBlockLang = line.slice(3).trim() || 'text';
                    codeBlockContent = [];
                } else {
                    // End of code block
                    currentSection.codeBlocks.push({
                        language: codeBlockLang,
                        code: codeBlockContent.join('\n')
                    });
                    inCodeBlock = false;
                }
                continue;
            }

            // Accumulate code block content
            if (inCodeBlock) {
                codeBlockContent.push(line);
                continue;
            }

            // Check for header
            const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headerMatch) {
                // Save previous section
                if (currentSection.content || currentSection.codeBlocks.length > 0) {
                    sections.push({ ...currentSection });
                }

                // Start new section
                currentSection = {
                    title: headerMatch[2],
                    content: '',
                    level: headerMatch[1].length,
                    codeBlocks: []
                };
            } else {
                currentSection.content += line + '\n';
            }
        }

        // Don't forget the last section
        if (currentSection.content || currentSection.codeBlocks.length > 0) {
            sections.push(currentSection);
        }

        return sections;
    }

    /**
     * Create chunks from sections
     */
    createChunks(docId, sections) {
        const chunks = [];
        let currentChunk = {
            id: crypto.randomBytes(16).toString('hex'),
            docId,
            index: 0,
            content: '',
            metadata: { sections: [], codeBlocks: [] },
            tokens: 0
        };

        for (const section of sections) {
            const sectionTokens = this.estimateTokens(section.content);
            const sectionText = this.formatSection(section);

            // If section is larger than chunk size, split it
            if (sectionTokens > this.chunkSize) {
                // Save current chunk if it has content
                if (currentChunk.tokens > 0) {
                    chunks.push(this.finalizeChunk(currentChunk));
                    currentChunk = this.newChunk(docId, chunks.length);
                }

                // Split large section
                const subChunks = this.splitLargeSection(docId, section, chunks.length);
                chunks.push(...subChunks);
                continue;
            }

            // Check if we need to start a new chunk
            if (currentChunk.tokens + sectionTokens > this.chunkSize && currentChunk.tokens > 0) {
                chunks.push(this.finalizeChunk(currentChunk));
                currentChunk = this.newChunk(docId, chunks.length);
            }

            // Add section to current chunk
            currentChunk.content += sectionText + '\n\n';
            currentChunk.metadata.sections.push({
                title: section.title,
                level: section.level
            });
            currentChunk.metadata.codeBlocks.push(...section.codeBlocks);
            currentChunk.tokens += sectionTokens;
        }

        // Don't forget the last chunk
        if (currentChunk.tokens > 0) {
            chunks.push(this.finalizeChunk(currentChunk));
        }

        return chunks;
    }

    /**
     * Format a section for chunking
     */
    formatSection(section) {
        let text = '';

        if (section.title) {
            text += '#'.repeat(section.level) + ' ' + section.title + '\n';
        }

        text += section.content;

        // Add code blocks at the end
        for (const block of section.codeBlocks) {
            text += `\n\`\`\`${block.language}\n${block.code}\n\`\`\`\n`;
        }

        return text;
    }

    /**
     * Split a section that's too large
     */
    splitLargeSection(docId, section, startIndex) {
        const chunks = [];
        const paragraphs = section.content.split(/\n\n+/);
        let currentChunk = this.newChunk(docId, startIndex);

        for (const para of paragraphs) {
            const paraTokens = this.estimateTokens(para);

            if (currentChunk.tokens + paraTokens > this.chunkSize && currentChunk.tokens > 0) {
                chunks.push(this.finalizeChunk(currentChunk));
                currentChunk = this.newChunk(docId, startIndex + chunks.length);
            }

            currentChunk.content += para + '\n\n';
            currentChunk.tokens += paraTokens;
        }

        if (currentChunk.tokens > 0) {
            chunks.push(this.finalizeChunk(currentChunk));
        }

        return chunks;
    }

    /**
     * Create a new chunk object
     */
    newChunk(docId, index) {
        return {
            id: crypto.randomBytes(16).toString('hex'),
            docId,
            index,
            content: '',
            metadata: { sections: [], codeBlocks: [] },
            tokens: 0
        };
    }

    /**
     * Finalize a chunk for storage
     */
    finalizeChunk(chunk) {
        chunk.hash = this.hashContent(chunk.content);
        chunk.metadata.tokenCount = chunk.tokens;
        return chunk;
    }

    /**
     * Store a chunk in database and memory
     */
    async storeChunk(chunk) {
        const embedding = this.createEmbedding(chunk.content);
        chunk.embedding = embedding;

        // Store in memory
        const key = `${chunk.docId}:${chunk.index}`;
        this.chunks.set(key, chunk);

        // Store in database
        this.db.runChunk?.(`
            INSERT OR REPLACE INTO doc_chunks
            (id, doc_id, chunk_index, content, metadata, embedding, hash, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            chunk.id,
            chunk.docId,
            chunk.index,
            chunk.content,
            JSON.stringify(chunk.metadata),
            JSON.stringify(embedding),
            chunk.hash,
            Date.now(),
            Date.now()
        ]);
    }

    /**
     * Create a lightweight embedding using TF-IDF-like approach
     */
    createEmbedding(content) {
        // Simple word frequency vector
        const words = content.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length > 2);

        const freq = {};
        for (const word of words) {
            freq[word] = (freq[word] || 0) + 1;
        }

        // Return top terms as "embedding"
        const sorted = Object.entries(freq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 50)
            .map(e => e[0]);

        return { terms: sorted, freq, size: words.length };
    }

    /**
     * Search for relevant chunks
     */
    async search(query, limit = 5) {
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
        const results = [];

        for (const [key, chunk] of this.chunks.entries()) {
            let score = 0;
            const contentLower = chunk.content.toLowerCase();

            // Exact phrase match
            if (contentLower.includes(queryLower)) {
                score += 10;
            }

            // Word matches
            for (const word of queryWords) {
                if (contentLower.includes(word)) {
                    score += 2;
                }
                // Check in embedding terms
                if (chunk.embedding?.terms?.includes(word)) {
                    score += 1;
                }
            }

            // Title/section matches
            for (const section of chunk.metadata.sections || []) {
                if (section.title && section.title.toLowerCase().includes(queryLower)) {
                    score += 5;
                }
            }

            if (score > 0) {
                results.push({
                    docId: chunk.docId,
                    chunkIndex: chunk.index,
                    content: this.getExcerpt(chunk.content, query),
                    score,
                    metadata: chunk.metadata
                });
            }
        }

        // Sort by score and return top results
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, limit);
    }

    /**
     * Get excerpt from content
     */
    getExcerpt(content, query, maxLength = 300) {
        const queryLower = query.toLowerCase();
        const index = content.toLowerCase().indexOf(queryLower);

        if (index === -1) {
            return content.substring(0, maxLength) + '...';
        }

        const start = Math.max(0, index - 100);
        const end = Math.min(content.length, index + query.length + 100);

        let excerpt = content.substring(start, end);

        if (start > 0) excerpt = '...' + excerpt;
        if (end < content.length) excerpt = excerpt + '...';

        return excerpt;
    }

    /**
     * Clear chunks for a document
     */
    async clearDocumentChunks(docId) {
        // Remove from memory
        for (const [key, chunk] of this.chunks.entries()) {
            if (chunk.docId === docId) {
                this.chunks.delete(key);
            }
        }

        // Remove from database
        this.db.runClearDoc?.(`DELETE FROM doc_chunks WHERE doc_id = ?`, [docId]);
    }

    /**
     * Hash content for change detection
     */
    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Estimate token count (rough approximation: ~4 chars per token)
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get statistics
     */
    getStats() {
        return {
            totalChunks: this.chunks.size,
            totalDocs: this.docHashes.size,
            avgChunkSize: Array.from(this.chunks.values())
                .reduce((sum, c) => sum + c.tokens, 0) / Math.max(1, this.chunks.size)
        };
    }

    /**
     * Get chunks for a specific document
     */
    getDocumentChunks(docId) {
        return Array.from(this.chunks.values())
            .filter(c => c.docId === docId)
            .sort((a, b) => a.index - b.index);
    }
}

module.exports = DocIndexer;
