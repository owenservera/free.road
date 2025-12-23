/**
 * Streaming Service - Server-Sent Events (SSE) for AI responses
 *
 * Provides real-time streaming of AI responses to the frontend
 */

class StreamingService {
    constructor() {
        this.activeStreams = new Map();
    }

    /**
     * Create a new SSE stream
     */
    createStream(req, res) {
        const streamId = this.generateStreamId();

        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Send initial connection event
        this.sendEvent(res, 'connected', { streamId });

        // Track the stream
        const stream = {
            id: streamId,
            req,
            res,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };
        this.activeStreams.set(streamId, stream);

        // Handle client disconnect
        req.on('close', () => {
            this.closeStream(streamId);
        });

        return stream;
    }

    /**
     * Send an event to the stream
     */
    sendEvent(res, type, data) {
        const event = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(event);
    }

    /**
     * Send a chunk of content
     */
    sendChunk(stream, content, metadata = {}) {
        if (!stream || !stream.res) return;

        this.sendEvent(stream.res, 'chunk', {
            content,
            ...metadata
        });

        stream.lastActivity = Date.now();
    }

    /**
     * Send a progress update
     */
    sendProgress(stream, current, total, message) {
        if (!stream || !stream.res) return;

        this.sendEvent(stream.res, 'progress', {
            current,
            total,
            percentage: Math.round((current / total) * 100),
            message
        });

        stream.lastActivity = Date.now();
    }

    /**
     * Send error to stream
     */
    sendError(stream, error) {
        if (!stream || !stream.res) return;

        this.sendEvent(stream.res, 'error', {
            error: error.message || error
        });
    }

    /**
     * Complete the stream
     */
    completeStream(stream, finalData = {}) {
        if (!stream || !stream.res) return;

        this.sendEvent(stream.res, 'done', finalData);
        this.closeStream(stream.id);
    }

    /**
     * Close a stream
     */
    closeStream(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (stream) {
            try {
                stream.res.end();
            } catch (e) {
                // Stream already closed
            }
            this.activeStreams.delete(streamId);
        }
    }

    /**
     * Get active stream count
     */
    getActiveStreamCount() {
        return this.activeStreams.size;
    }

    /**
     * Clean up stale streams
     */
    cleanupStaleStreams(maxAge = 5 * 60 * 1000) { // 5 minutes
        const now = Date.now();
        for (const [id, stream] of this.activeStreams.entries()) {
            if (now - stream.lastActivity > maxAge) {
                this.closeStream(id);
            }
        }
    }

    /**
     * Generate unique stream ID
     */
    generateStreamId() {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Wrap an async generator for streaming
     */
    async *streamAsyncGenerator(asyncGen, stream) {
        try {
            for await (const chunk of asyncGen) {
                this.sendChunk(stream, chunk);
                yield chunk;
            }
            this.completeStream(stream);
        } catch (error) {
            this.sendError(stream, error);
            throw error;
        }
    }

    /**
     * Create an async generator from AI provider stream
     */
    async *aiStreamGenerator(aiProviderService, providerId, modelId, messages, apiKey) {
        const contentChunks = [];

        await aiProviderService.streamChat(
            providerId,
            modelId,
            messages,
            (chunk, metadata) => {
                contentChunks.push(chunk);
                return chunk;
            },
            apiKey
        );

        yield* contentChunks;
    }
}

module.exports = StreamingService;
