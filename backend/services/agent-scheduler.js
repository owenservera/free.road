// Agent Scheduler - Task Queue with Priority Management
// Manages task distribution across agent fleet with retry logic and monitoring

const EventEmitter = require('events');

class AgentScheduler extends EventEmitter {
    constructor(db, keyPool, budgetManager, agentFleetService, config = {}) {
        super();
        this.db = db;
        this.keyPool = keyPool;
        this.budgetManager = budgetManager;
        this.agentFleetService = agentFleetService;
        this.isRunning = false;
        this.pollingInterval = config.pollingInterval || 5000; // 5 seconds
        this.concurrency = config.concurrency || 3;
        this.maxRetries = config.maxRetries || 3;
        this.processingTasks = new Map(); // taskId -> task data
        this.workers = new Map(); // agentId -> task count
        this.pollTimer = null;
    }

    /**
     * Start the scheduler
     */
    async start() {
        if (this.isRunning) {
            console.log('[AgentScheduler] Already running');
            return;
        }

        this.isRunning = true;
        console.log('[AgentScheduler] Starting task queue processor');

        // Start polling for tasks
        this.pollTimer = setInterval(() => {
            this.processQueue().catch(err => {
                console.error('[AgentScheduler] Error processing queue:', err);
            });
        }, this.pollingInterval);

        // Start monitoring workers
        this.monitorInterval = setInterval(() => {
            this.monitorWorkers().catch(err => {
                console.error('[AgentScheduler] Error monitoring workers:', err);
            });
        }, 30000); // Every 30 seconds

        // Process initial queue
        await this.processQueue();

        this.emit('started');
    }

    /**
     * Stop the scheduler
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        // Wait for current tasks to complete (with timeout)
        const timeout = setTimeout(() => {
            console.log('[AgentScheduler] Force stopping with tasks still processing');
        }, 30000);

        while (this.processingTasks.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        clearTimeout(timeout);

        this.emit('stopped');
        console.log('[AgentScheduler] Stopped');
    }

    /**
     * Queue a new task
     */
    async queueTask(agentType, taskType, taskData, priority = 5, options = {}) {
        const taskId = options.taskId || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const task = {
            id: taskId,
            agent_type: agentType,
            task_type: taskType,
            task_data: JSON.stringify(taskData),
            priority: priority,
            status: 'queued',
            retry_count: 0,
            created_at: Math.floor(Date.now() / 1000)
        };

        await this.db.createAgentTask(task);
        console.log(`[AgentScheduler] Task queued: ${taskId} (${agentType}/${taskType}) priority=${priority}`);

        this.emit('taskQueued', { taskId, agentType, taskType, priority });

        return taskId;
    }

    /**
     * Process the task queue
     */
    async processQueue() {
        if (!this.isRunning) {
            return;
        }

        // Check if we're at concurrency limit
        if (this.processingTasks.size >= this.concurrency) {
            return;
        }

        // Get available workers (idle agents)
        const availableSlots = this.concurrency - this.processingTasks.size;

        // Get pending tasks ordered by priority (higher first) and age
        const tasks = await this.db.getPendingTasks(availableSlots);

        if (tasks.length === 0) {
            return;
        }

        // Process each task
        for (const task of tasks) {
            if (this.processingTasks.size >= this.concurrency) {
                break;
            }

            await this.assignTask(task);
        }
    }

    /**
     * Assign a task to an agent
     */
    async assignTask(task) {
        const { id: taskId, agent_type: agentType, task_type: taskType, task_data: taskDataJson } = task;
        const taskData = JSON.parse(taskDataJson);

        try {
            // Find idle agent of matching type
            const agents = await this.db.getAllAgents();
            const agent = agents.find(a =>
                a.agent_type === agentType &&
                a.status === 'idle'
            );

            if (!agent) {
                // No available agent, keep task queued
                console.log(`[AgentScheduler] No available ${agentType} agent for task ${taskId}`);
                return;
            }

            // Check budget before proceeding
            const estimatedCost = await this.keyPool.predictCost(agent.id, { taskType, taskData });
            const canProceed = await this.budgetManager.canProceed(agent.id, estimatedCost);

            if (!canProceed.allowed) {
                // Budget exceeded, mark task as failed
                await this.db.updateAgentTask(taskId, {
                    status: 'failed',
                    error_message: `Budget exceeded: ${canProceed.reason}`
                });
                this.emit('taskFailed', { taskId, reason: 'Budget exceeded' });
                return;
            }

            // Update task status to processing
            await this.db.updateAgentTask(taskId, {
                status: 'processing',
                agent_id: agent.id,
                started_at: Math.floor(Date.now() / 1000)
            });

            // Update agent status
            await this.db.updateAgent(agent.id, {
                status: 'busy',
                current_task_id: taskId
            });

            // Track processing task
            this.processingTasks.set(taskId, { taskId, agentId: agent.id, taskType, taskData });

            // Update worker count
            this.workers.set(agent.id, (this.workers.get(agent.id) || 0) + 1);

            // Execute the task
            this.executeTask(agent, task).catch(err => {
                console.error(`[AgentScheduler] Task execution error: ${err.message}`);
            });

            this.emit('taskAssigned', { taskId, agentId: agent.id });

        } catch (error) {
            console.error(`[AgentScheduler] Error assigning task ${taskId}:`, error);

            // Mark as failed
            await this.db.updateAgentTask(taskId, {
                status: 'failed',
                error_message: error.message
            });

            this.emit('taskFailed', { taskId, error: error.message });
        }
    }

    /**
     * Execute a task (runs in background)
     */
    async executeTask(agent, task) {
        const { id: taskId, task_type: taskType, task_data: taskDataJson } = task;
        const taskData = JSON.parse(taskDataJson);

        let result = null;
        let error = null;

        try {
            // Get the agent instance from the fleet service
            if (!this.agentFleetService) {
                throw new Error('Agent Fleet Service not initialized');
            }

            const agentInstance = this.agentFleetService.agents.get(agent.id);
            if (!agentInstance) {
                throw new Error(`Agent instance not found: ${agent.id}`);
            }

            // Execute the task
            result = await agentInstance.processTask({
                task_type: taskType,
                task_data: taskData
            });

            // Mark task as completed
            await this.db.updateAgentTask(taskId, {
                status: 'completed',
                result_json: JSON.stringify(result),
                completed_at: Math.floor(Date.now() / 1000)
            });

            // Reset agent status
            await this.db.updateAgent(agent.id, {
                status: 'idle',
                current_task_id: null
            });

            console.log(`[AgentScheduler] Task completed: ${taskId}`);

            this.emit('taskCompleted', { taskId, result });

        } catch (err) {
            error = err;

            // Check if we should retry
            const currentTask = await this.db.getAgentTask(taskId);
            const retryCount = currentTask.retry_count || 0;

            if (retryCount < this.maxRetries) {
                // Increment retry count and requeue
                await this.db.updateAgentTask(taskId, {
                    status: 'queued',
                    agent_id: null,
                    retry_count: retryCount + 1,
                    error_message: err.message
                });

                // Reset agent status
                await this.db.updateAgent(agent.id, {
                    status: 'idle',
                    current_task_id: null
                });

                console.log(`[AgentScheduler] Task retry ${retryCount + 1}/${this.maxRetries}: ${taskId}`);

                this.emit('taskRetry', { taskId, retryCount: retryCount + 1 });

            } else {
                // Max retries exceeded, mark as failed
                await this.db.updateAgentTask(taskId, {
                    status: 'failed',
                    error_message: `Max retries exceeded: ${err.message}`
                });

                // Reset agent status
                await this.db.updateAgent(agent.id, {
                    status: 'idle',
                    current_task_id: null
                });

                console.error(`[AgentScheduler] Task failed after ${this.maxRetries} retries: ${taskId}`);

                this.emit('taskFailed', { taskId, error: err.message, retries: retryCount });
            }
        } finally {
            // Remove from processing tasks
            this.processingTasks.delete(taskId);

            // Update worker count
            const workerCount = this.workers.get(agent.id) || 0;
            if (workerCount <= 1) {
                this.workers.delete(agent.id);
            } else {
                this.workers.set(agent.id, workerCount - 1);
            }
        }
    }

    /**
     * Monitor workers for stalled tasks
     */
    async monitorWorkers() {
        if (!this.isRunning) {
            return;
        }

        const staleThreshold = 30 * 60; // 30 minutes

        for (const [taskId, data] of this.processingTasks.entries()) {
            const task = await this.db.getAgentTask(taskId);

            if (!task || task.status !== 'processing') {
                this.processingTasks.delete(taskId);
                continue;
            }

            const startedAt = task.started_at || 0;
            const elapsed = Math.floor(Date.now() / 1000) - startedAt;

            if (elapsed > staleThreshold) {
                console.warn(`[AgentScheduler] Stale task detected: ${taskId} (${elapsed}s elapsed)`);

                // Reset agent status
                if (task.agent_id) {
                    await this.db.updateAgent(task.agent_id, {
                        status: 'idle',
                        current_task_id: null
                    });
                }

                // Requeue task
                await this.db.updateAgentTask(taskId, {
                    status: 'queued',
                    agent_id: null
                });

                this.processingTasks.delete(taskId);

                this.emit('taskStale', { taskId, elapsed });
            }
        }
    }

    /**
     * Get queue statistics
     */
    async getQueueStats() {
        const tasks = await this.db.getAllAgentTasks();

        const stats = {
            queued: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            byAgentType: {},
            byPriority: {}
        };

        for (const task of tasks) {
            stats[task.status] = (stats[task.status] || 0) + 1;

            // Count by agent type
            const agentType = task.agent_type;
            stats.byAgentType[agentType] = stats.byAgentType[agentType] || { queued: 0, processing: 0, completed: 0, failed: 0 };
            stats.byAgentType[agentType][task.status]++;

            // Count by priority
            const priority = task.priority || 5;
            stats.byPriority[priority] = stats.byPriority[priority] || { queued: 0, processing: 0, completed: 0, failed: 0 };
            stats.byPriority[priority][task.status]++;
        }

        return {
            ...stats,
            processing: this.processingTasks.size,
            workers: Object.fromEntries(this.workers)
        };
    }

    /**
     * Retry failed tasks
     */
    async retryFailedTasks(agentType = null, limit = 10) {
        const tasks = await this.db.getFailedTasks(limit, agentType);

        for (const task of tasks) {
            await this.db.updateAgentTask(task.id, {
                status: 'queued',
                agent_id: null,
                retry_count: 0,
                error_message: null
            });

            this.emit('taskRetry', { taskId: task.id, manualRetry: true });
        }

        return tasks.length;
    }

    /**
     * Cancel a task
     */
    async cancelTask(taskId) {
        const task = await this.db.getAgentTask(taskId);

        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }

        if (task.status === 'completed' || task.status === 'failed') {
            throw new Error(`Cannot cancel task with status: ${task.status}`);
        }

        // If processing, reset agent status
        if (task.status === 'processing' && task.agent_id) {
            await this.db.updateAgent(task.agent_id, {
                status: 'idle',
                current_task_id: null
            });

            this.processingTasks.delete(taskId);
        }

        // Mark as cancelled
        await this.db.updateAgentTask(taskId, {
            status: 'cancelled',
            completed_at: Math.floor(Date.now() / 1000)
        });

        this.emit('taskCancelled', { taskId });

        return true;
    }

    /**
     * Clear old completed/failed tasks
     */
    async clearOldTasks(ageDays = 7, status = ['completed', 'failed', 'cancelled']) {
        const cutoffTime = Math.floor(Date.now() / 1000) - (ageDays * 24 * 60 * 60);

        const tasks = await this.db.getAllAgentTasks();
        let deletedCount = 0;

        for (const task of tasks) {
            if (status.includes(task.status) && task.completed_at && task.completed_at < cutoffTime) {
                await this.db.deleteAgentTask(task.id);
                deletedCount++;
            }
        }

        console.log(`[AgentScheduler] Cleared ${deletedCount} old tasks (age > ${ageDays} days)`);

        return deletedCount;
    }

    /**
     * Get scheduler status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            processing: this.processingTasks.size,
            concurrency: this.concurrency,
            workers: Object.fromEntries(this.workers),
            pollingInterval: this.pollingInterval
        };
    }
}

module.exports = AgentScheduler;
