// EventBus - Inter-module communication system
// Part of Finallica's open architecture

class EventBus {
    constructor() {
        this.subscribers = new Map();
        this.eventHistory = [];
        this.maxHistory = 1000;
        this.middlewares = [];
    }

    /**
     * Subscribe to events
     * @param {string} eventType - Event type to subscribe to
     * @param {Function} callback - Event handler
     * @param {Object} options - Subscription options
     * @returns {string} Subscription ID
     */
    subscribe(eventType, callback, options = {}) {
        const id = this._generateId();

        if (!this.subscribers.has(eventType)) {
            this.subscribers.set(eventType, new Map());
        }

        const typeSubscribers = this.subscribers.get(eventType);
        typeSubscribers.set(id, {
            callback,
            once: options.once || false,
            priority: options.priority || 0
        });

        // Sort subscribers by priority (highest first)
        const subscribersArray = Array.from(typeSubscribers.values());
        subscribersArray.sort((a, b) => b.priority - a.priority);

        return id;
    }

    /**
     * Unsubscribe from events
     * @param {string} eventType - Event type to unsubscribe from
     * @param {string} subscriptionId - Subscription ID
     */
    unsubscribe(eventType, subscriptionId) {
        if (this.subscribers.has(eventType)) {
            this.subscribers.get(eventType).delete(subscriptionId);
        }
    }

    /**
     * Publish an event
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     * @param {Object} metadata - Event metadata
     * @returns {Promise<boolean>} Event published successfully
     */
    async publish(eventType, data = {}, metadata = {}) {
        try {
            const event = {
                id: this._generateId(),
                type: eventType,
                data,
                metadata: {
                    ...metadata,
                    timestamp: Date.now(),
                    source: metadata.source || 'unknown'
                }
            };

            // Apply middlewares
            const processedEvent = await this._applyMiddlewares(event);

            // Record in history
            this._addToHistory(processedEvent);

            // Get subscribers for this event type
            if (this.subscribers.has(eventType)) {
                const typeSubscribers = this.subscribers.get(eventType);
                const subscribersArray = Array.from(typeSubscribers.entries());

                // Execute subscribers in priority order
                for (const [id, subscriber] of subscribersArray) {
                    try {
                        await subscriber.callback(processedEvent);

                        // Remove if it's a one-time subscription
                        if (subscriber.once) {
                            typeSubscribers.delete(id);
                        }
                    } catch (error) {
                        console.error(`Error in event subscriber for ${eventType}:`, error);
                    }
                }
            }

            return true;
        } catch (error) {
            console.error('Error publishing event:', error);
            return false;
        }
    }

    /**
     * Add middleware to process events before publishing
     * @param {Function} middleware - Middleware function
     */
    use(middleware) {
        this.middlewares.push(middleware);
    }

    /**
     * Get event history
     * @param {Object} options - Filter options
     * @returns {Array} Filtered event history
     */
    getHistory(options = {}) {
        let filtered = [...this.eventHistory];

        if (options.type) {
            filtered = filtered.filter(e => e.type === options.type);
        }

        if (options.since) {
            filtered = filtered.filter(e => e.metadata.timestamp >= options.since);
        }

        if (options.limit) {
            filtered = filtered.slice(0, options.limit);
        }

        return filtered;
    }

    /**
     * Clear event history
     */
    clearHistory() {
        this.eventHistory = [];
    }

    /**
     * Apply middlewares to event
     * @private
     */
    async _applyMiddlewares(event) {
        let processedEvent = { ...event };

        for (const middleware of this.middlewares) {
            try {
                processedEvent = await middleware(processedEvent);
            } catch (error) {
                console.error('Middleware error:', error);
            }
        }

        return processedEvent;
    }

    /**
     * Add event to history
     * @private
     */
    _addToHistory(event) {
        this.eventHistory.unshift(event);

        // Keep history size limited
        if (this.eventHistory.length > this.maxHistory) {
            this.eventHistory.pop();
        }
    }

    /**
     * Generate unique ID
     * @private
     */
    _generateId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get subscriber count for an event type
     * @param {string} eventType - Event type
     * @returns {number} Number of subscribers
     */
    getSubscriberCount(eventType) {
        if (!this.subscribers.has(eventType)) {
            return 0;
        }
        return this.subscribers.get(eventType).size;
    }

    /**
     * Get all event types with subscribers
     * @returns {Array} Array of event types
     */
    getEventTypes() {
        return Array.from(this.subscribers.keys());
    }

    /**
     * Emit an event (alias for publish)
     */
    emit(eventType, data, metadata) {
        return this.publish(eventType, data, metadata);
    }

    /**
     * Listen for events (alias for subscribe)
     */
    on(eventType, callback, options) {
        return this.subscribe(eventType, callback, options);
    }

    /**
     * Listen for one-time events (alias for subscribe with once: true)
     */
    once(eventType, callback) {
        return this.subscribe(eventType, callback, { once: true });
    }
}

// Common event types
const Events = {
    // Engine events
    ENGINE_INITIALIZED: 'engine:initialized',
    ENGINE_STARTED: 'engine:started',
    ENGINE_STOPPED: 'engine:stopped',

    // Module events
    MODULE_REGISTERED: 'module:registered',
    MODULE_INITIALIZED: 'module:initialized',
    MODULE_STARTED: 'module:started',
    MODULE_STOPPED: 'module:stopped',
    MODULE_ERROR: 'module:error',

    // Content events
    CONTENT_CREATED: 'content:created',
    CONTENT_UPDATED: 'content:updated',
    CONTENT_DELETED: 'content:deleted',

    // Repository events
    REPOSITORY_SYNCED: 'repository:synced',
    REPOSITORY_ADDED: 'repository:added',
    REPOSITORY_ERROR: 'repository:error',

    // Agent events
    AGENT_STARTED: 'agent:started',
    AGENT_STOPPED: 'agent:stopped',
    AGENT_ERROR: 'agent:error',
    AGENT_TASK_STARTED: 'agent:task:started',
    AGENT_TASK_COMPLETED: 'agent:task:completed',
    AGENT_TASK_FAILED: 'agent:task:failed',

    // Governance events
    GOVERNANCE_PROPOSAL_CREATED: 'governance:proposal:created',
    GOVERNANCE_VOTE_CAST: 'governance:vote:cast',
    GOVERNANCE_PROPOSAL_APPROVED: 'governance:proposal:approved',

    // Collaboration events
    COLLABORATION_SHARED: 'collaboration:shared',
    COLLABORATION_VIEWED: 'collaboration:viewed',

    // System events
    HEALTH_CHECK: 'system:health:check',
    METRICS_COLLECTED: 'system:metrics:collected',
    ERROR_OCCURRED: 'system:error:occurred'
};

module.exports = { EventBus, Events };