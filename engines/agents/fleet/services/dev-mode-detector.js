// Dev Mode Detector Service
// Detects when user is actively developing (using AI coding tools)
// and triggers the agent fleet to start

const chokidar = require('chokidar');
const simpleGit = require('simple-git');
const fs = require('fs').promises;
const path = require('path');

class DevModeDetector {
    constructor(db, config = {}) {
        this.db = db;
        this.isDevMode = false;
        this.activityBuffer = [];
        this.watchers = new Map();
        this.sessionId = null;

        // Configuration
        this.activityThreshold = config.activityThreshold || 3; // events to trigger dev mode
        this.timeWindowMinutes = config.timeWindowMinutes || 5; // time window for activity
        this.idleTimeoutMinutes = config.idleTimeoutMinutes || 10; // idle timeout to stop

        // Callbacks
        this.onDevModeStart = config.onDevModeStart || (() => {});
        this.onDevModeStop = config.onDevModeStop || (() => {});

        // Check interval
        this.checkInterval = null;
    }

    async startWatching(projectPath) {
        if (this.watchers.has(projectPath)) {
            console.log(`Already watching: ${projectPath}`);
            return;
        }

        // Start file watcher
        const watcher = chokidar.watch(projectPath, {
            ignored: /node_modules|\.git|dist|build|\.cache|coverage/,
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 100
            }
        });

        watcher.on('change', (filePath) => this.onFileChange(filePath));
        watcher.on('add', (filePath) => this.onFileAdd(filePath));
        watcher.on('unlink', (filePath) => this.onFileDelete(filePath));

        this.watchers.set(projectPath, watcher);

        // Also check for Claude Code activity
        await this.checkClaudeCodeActivity(projectPath);

        // Start periodic checks
        this.startPeriodicChecks();

        console.log(`Dev Mode Detector watching: ${projectPath}`);
    }

    async stopWatching(projectPath) {
        const watcher = this.watchers.get(projectPath);
        if (watcher) {
            await watcher.close();
            this.watchers.delete(projectPath);
        }
    }

    async stopAll() {
        for (const [path, watcher] of this.watchers) {
            await watcher.close();
        }
        this.watchers.clear();

        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }

    onFileChange(filePath) {
        this.recordActivity('file_change', {
            path: filePath,
            timestamp: Date.now(),
            action: 'modified'
        });
    }

    onFileAdd(filePath) {
        this.recordActivity('file_change', {
            path: filePath,
            timestamp: Date.now(),
            action: 'added'
        });
    }

    onFileDelete(filePath) {
        this.recordActivity('file_change', {
            path: filePath,
            timestamp: Date.now(),
            action: 'deleted'
        });
    }

    async checkClaudeCodeActivity(projectPath) {
        const markers = [
            '.claude',
            '.claude_cache',
            '.claude_prompt_history',
            '.claude_plan'
        ];

        for (const marker of markers) {
            const markerPath = path.join(projectPath, marker);
            try {
                const stats = await fs.stat(markerPath);
                if (stats.isFile() || stats.isDirectory()) {
                    this.recordActivity('claude_code_detected', {
                        marker,
                        path: markerPath,
                        timestamp: Date.now()
                    });
                }
            } catch (e) {
                // Marker doesn't exist, continue
            }
        }

        // Check for recent git commits by Claude
        try {
            const git = simpleGit(projectPath);
            const log = await git.log({ maxCount: 10 });

            for (const commit of log.all) {
                if (commit.author_name.includes('Claude') ||
                    commit.author_email.includes('claude') ||
                    commit.message.includes('[Claude Code]') ||
                    commit.message.includes('Co-Authored-By: Claude')) {

                    this.recordActivity('claude_code_commit', {
                        hash: commit.hash,
                        message: commit.message.substring(0, 100),
                        author: commit.author_name,
                        date: commit.date,
                        timestamp: Date.now()
                    });
                    break; // Only record once per check
                }
            }
        } catch (e) {
            // Not a git repo or git error
        }
    }

    recordActivity(activityType, data) {
        const activity = {
            type: activityType,
            data,
            timestamp: Date.now()
        };

        this.activityBuffer.push(activity);

        // Log to database
        this.db.logDevModeActivity(this.sessionId, activityType, data);

        // Check if we should activate dev mode
        this.checkDevMode();
    }

    checkDevMode() {
        const now = Date.now();
        const windowMs = this.timeWindowMinutes * 60 * 1000;

        // Filter activities within time window
        const recentActivities = this.activityBuffer.filter(
            a => now - a.timestamp < windowMs
        );

        this.activityBuffer = recentActivities;

        if (recentActivities.length >= this.activityThreshold) {
            this.activateDevMode();
        } else if (recentActivities.length === 0 && this.isDevMode) {
            // Check idle timeout
            const lastActivity = this.activityBuffer[this.activityBuffer.length - 1];
            if (lastActivity && (now - lastActivity.timestamp) > this.idleTimeoutMinutes * 60 * 1000) {
                this.deactivateDevMode();
            }
        }
    }

    async activateDevMode() {
        if (this.isDevMode) return;

        this.isDevMode = true;

        // Create new session
        const crypto = require('crypto');
        this.sessionId = 'session_' + crypto.randomBytes(16).toString('hex');

        await this.db.createAgentSession({
            id: this.sessionId,
            trigger_type: 'dev_mode_detected'
        });

        console.log(`[Dev Mode] ACTIVATED - Session: ${this.sessionId}`);
        await this.db.logObservabilityLog(null, 'info', 'Dev mode activated', {
            sessionId: this.sessionId,
            activityCount: this.activityBuffer.length
        });

        // Trigger callback
        this.onDevModeStart(this.sessionId);
    }

    async deactivateDevMode() {
        if (!this.isDevMode) return;

        this.isDevMode = false;
        const sessionId = this.sessionId;

        // Update session
        if (sessionId) {
            this.db.run(`
                UPDATE agent_sessions SET ended_at = ?
                WHERE id = ?
            `, [Math.floor(Date.now() / 1000), sessionId]);
            await this.db.save();
        }

        console.log(`[Dev Mode] DEACTIVATED - Session: ${sessionId}`);
        await this.db.logObservabilityLog(null, 'info', 'Dev mode deactivated', {
            sessionId,
            reason: 'idle_timeout'
        });

        // Trigger callback
        this.onDevModeStop(sessionId);

        this.sessionId = null;
    }

    startPeriodicChecks() {
        if (this.checkInterval) return;

        // Check for Claude Code activity every 30 seconds
        this.checkInterval = setInterval(async () => {
            for (const projectPath of this.watchers.keys()) {
                await this.checkClaudeCodeActivity(projectPath);
            }
        }, 30000);
    }

    getStatus() {
        return {
            isDevMode: this.isDevMode,
            sessionId: this.sessionId,
            activityCount: this.activityBuffer.length,
            watching: Array.from(this.watchers.keys())
        };
    }

    async manualStart() {
        await this.activateDevMode();
    }

    async manualStop() {
        await this.deactivateDevMode();
    }

    getActivitySummary(sessionId = null) {
        const activities = sessionId
            ? this.db.getRecentDevModeActivity(1000)
                .filter(a => a.session_id === sessionId)
            : this.db.getRecentDevModeActivity(100);

        const summary = {
            total: activities.length,
            byType: {},
            recent: activities.slice(0, 10)
        };

        for (const activity of activities) {
            if (!summary.byType[activity.activity_type]) {
                summary.byType[activity.activity_type] = 0;
            }
            summary.byType[activity.activity_type]++;
        }

        return summary;
    }
}

module.exports = DevModeDetector;
