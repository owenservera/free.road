// Monitoring and Logging Service
// Provides structured logging, metrics collection, and alerting

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;

// ============================================
// Configuration
// ============================================

const LOG_DIR = path.join(__dirname, '../logs');
const METRICS_DIR = path.join(__dirname, '../metrics');

const LOG_CONFIG = {
    level: process.env.LOG_LEVEL || 'info',
    maxFiles: 10,
    maxSize: '20m',
    datePattern: 'YYYY-MM-DD',
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    consoleFormat: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
    )
};

const METRICS_CONFIG = {
    enabled: process.env.METRICS_ENABLED !== 'false',
    retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30'),
    collectionInterval: 60000 // 1 minute
};

// ============================================
// Metrics Collector
// ============================================

class MetricsCollector {
    constructor() {
        this.metrics = {
            counters: {},
            gauges: {},
            histograms: {},
            timers: {}
        };
        this.startTime = Date.now();
        this.lastFlush = Date.now();
    }

    /**
     * Increment a counter metric
     */
    increment(name, value = 1, tags = {}) {
        const key = this.metricKey(name, tags);
        this.metrics.counters[key] = (this.metrics.counters[key] || 0) + value;
    }

    /**
     * Set a gauge metric
     */
    gauge(name, value, tags = {}) {
        const key = this.metricKey(name, tags);
        this.metrics.gauges[key] = value;
    }

    /**
     * Record a histogram metric (distribution)
     */
    histogram(name, value, tags = {}) {
        const key = this.metricKey(name, tags);
        if (!this.metrics.histograms[key]) {
            this.metrics.histograms[key] = [];
        }
        this.metrics.histograms[key].push(value);
    }

    /**
     * Record a timer metric (duration)
     */
    timing(name, value, tags = {}) {
        const key = this.metricKey(name, tags);
        if (!this.metrics.timers[key]) {
            this.metrics.timers[key] = [];
        }
        this.metrics.timers[key].push(value);
    }

    /**
     * Generate metric key with tags
     */
    metricKey(name, tags) {
        const tagStr = Object.entries(tags)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return tagStr ? `${name}{${tagStr}}` : name;
    }

    /**
     * Get all metrics as Prometheus format
     */
    getPrometheusFormat() {
        const lines = [];

        // Counters
        for (const [key, value] of Object.entries(this.metrics.counters)) {
            lines.push(`# TYPE ${key} counter`);
            lines.push(`${key} ${value}`);
        }

        // Gauges
        for (const [key, value] of Object.entries(this.metrics.gauges)) {
            lines.push(`# TYPE ${key} gauge`);
            lines.push(`${key} ${value}`);
        }

        // Histograms
        for (const [key, values] of Object.entries(this.metrics.histograms)) {
            const sorted = values.sort((a, b) => a - b);
            const count = sorted.length;
            const sum = sorted.reduce((a, b) => a + b, 0);
            const avg = sum / count;
            const min = sorted[0];
            const max = sorted[count - 1];
            const p50 = sorted[Math.floor(count * 0.5)];
            const p95 = sorted[Math.floor(count * 0.95)];
            const p99 = sorted[Math.floor(count * 0.99)];

            lines.push(`# TYPE ${key} histogram`);
            lines.push(`${key}_count ${count}`);
            lines.push(`${key}_sum ${sum}`);
            lines.push(`${key}_avg ${avg.toFixed(2)}`);
            lines.push(`${key}_min ${min}`);
            lines.push(`${key}_max ${max}`);
            lines.push(`${key}_p50 ${p50}`);
            lines.push(`${key}_p95 ${p95}`);
            lines.push(`${key}_p99 ${p99}`);
        }

        // Timers
        for (const [key, values] of Object.entries(this.metrics.timers)) {
            const sorted = values.sort((a, b) => a - b);
            const count = sorted.length;
            const sum = sorted.reduce((a, b) => a + b, 0);
            const avg = sum / count;

            lines.push(`# TYPE ${key} summary`);
            lines.push(`${key}_count ${count}`);
            lines.push(`${key}_sum ${sum}`);
            lines.push(`${key}_avg ${avg.toFixed(2)}`);
        }

        return lines.join('\n');
    }

    /**
     * Get summary statistics
     */
    getSummary() {
        const uptime = Date.now() - this.startTime;

        return {
            uptime: uptime,
            uptimeHuman: this.formatDuration(uptime),
            counters: Object.keys(this.metrics.counters).length,
            gauges: Object.keys(this.metrics.gauges).length,
            histograms: Object.keys(this.metrics.histograms).length,
            timers: Object.keys(this.metrics.timers).length
        };
    }

    /**
     * Format duration in human readable form
     */
    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.metrics = {
            counters: {},
            gauges: {},
            histograms: {},
            timers: {}
        };
        this.startTime = Date.now();
    }
}

// ============================================
// Logger Instance
// ============================================

const logger = winston.createLogger({
    level: LOG_CONFIG.level,
    format: LOG_CONFIG.format,
    transports: [
        // Console transport
        new winston.transports.Console({
            format: LOG_CONFIG.consoleFormat
        }),
        // File transport - all logs
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'combined.log'),
            maxsize: LOG_CONFIG.maxSize,
            maxFiles: LOG_CONFIG.maxFiles,
            datePattern: LOG_CONFIG.datePattern
        }),
        // File transport - errors only
        new winston.transports.File({
            filename: path.join(LOG_DIR, 'error.log'),
            level: 'error',
            maxsize: LOG_CONFIG.maxSize,
            maxFiles: LOG_CONFIG.maxFiles,
            datePattern: LOG_CONFIG.datePattern
        })
    ]
});

// ============================================
// Metrics Instance
// ============================================

const metrics = new MetricsCollector();

// ============================================
// Monitoring Service Class
// ============================================

class MonitoringService {
    constructor() {
        this.alerts = [];
        this.alertHistory = [];
        this.collectionInterval = null;
    }

    /**
     * Start monitoring service
     */
    async start() {
        // Ensure directories exist
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        if (!fs.existsSync(METRICS_DIR)) {
            fs.mkdirSync(METRICS_DIR, { recursive: true });
        }

        // Start metrics collection
        if (METRICS_CONFIG.enabled) {
            this.startMetricsCollection();
        }

        // Load previous alerts
        await this.loadAlertHistory();

        logger.info('Monitoring service started', {
            metricsEnabled: METRICS_CONFIG.enabled,
            logLevel: LOG_CONFIG.level
        });
    }

    /**
     * Start periodic metrics collection
     */
    startMetricsCollection() {
        this.collectionInterval = setInterval(async () => {
            await this.collectSystemMetrics();
            await this.flushMetrics();
        }, METRICS_CONFIG.collectionInterval);

        logger.info('Metrics collection started', {
            interval: METRICS_CONFIG.collectionInterval
        });
    }

    /**
     * Collect system metrics
     */
    async collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        // Memory metrics
        metrics.gauge('process_memory_heap_used', memUsage.heapUsed, { unit: 'bytes' });
        metrics.gauge('process_memory_heap_total', memUsage.heapTotal, { unit: 'bytes' });
        metrics.gauge('process_memory_rss', memUsage.rss, { unit: 'bytes' });

        // CPU metrics
        metrics.gauge('process_cpu_user', cpuUsage.user, { unit: 'microseconds' });
        metrics.gauge('process_cpu_system', cpuUsage.system, { unit: 'microseconds' });

        // Event loop lag
        metrics.timing('event_loop_lag', this.measureEventLoopLag());

        // Uptime
        metrics.gauge('process_uptime', process.uptime(), { unit: 'seconds' });
    }

    /**
     * Measure event loop lag
     */
    measureEventLoopLag() {
        const start = process.hrtime();
        return new Promise(resolve => {
            setImmediate(() => {
                const delta = process.hrtime(start);
                resolve(delta[0] * 1e3 + delta[1] / 1e6); // Convert to ms
            });
        });
    }

    /**
     * Flush metrics to file
     */
    async flushMetrics() {
        const prometheusFormat = metrics.getPrometheusFormat();
        const timestamp = Date.now();

        await fs.writeFile(
            path.join(METRICS_DIR, 'prometheus.txt'),
            prometheusFormat
        );

        // Also save with timestamp for historical analysis
        const snapshotFile = path.join(METRICS_DIR, `snapshot-${timestamp}.json`);
        await fs.writeFile(snapshotFile, JSON.stringify({
            timestamp,
            metrics: metrics.metrics,
            summary: metrics.getSummary()
        }, null, 2));

        // Cleanup old snapshots
        await this.cleanupOldSnapshots();
    }

    /**
     * Cleanup old metric snapshots
     */
    async cleanupOldSnapshots() {
        try {
            const files = await fs.readdir(METRICS_DIR);
            const now = Date.now();
            const retentionMs = METRICS_CONFIG.retentionDays * 24 * 60 * 60 * 1000;

            for (const file of files) {
                if (file.startsWith('snapshot-') && file.endsWith('.json')) {
                    const filePath = path.join(METRICS_DIR, file);
                    const stats = await fs.stat(filePath);
                    const age = now - stats.mtimeMs;

                    if (age > retentionMs) {
                        await fs.unlink(filePath);
                        logger.debug(`Cleaned up old snapshot: ${file}`);
                    }
                }
            }
        } catch (error) {
            logger.error('Failed to cleanup old snapshots', { error: error.message });
        }
    }

    /**
     * Check and create alerts
     */
    checkAlerts() {
        const alerts = [];

        // High memory usage alert
        const memUsage = process.memoryUsage();
        const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        if (memPercent > 90) {
            alerts.push({
                type: 'high_memory',
                severity: 'critical',
                message: `High memory usage: ${memPercent.toFixed(1)}%`,
                value: memPercent,
                threshold: 90
            });
        }

        // High CPU usage alert
        const cpuUsage = process.cpuUsage();
        if (cpuUsage.user > 10000000 || cpuUsage.system > 10000000) {
            alerts.push({
                type: 'high_cpu',
                severity: 'warning',
                message: 'High CPU usage detected',
                value: cpuUsage
            });
        }

        // Save new alerts
        for (const alert of alerts) {
            this.createAlert(alert);
        }

        return alerts;
    }

    /**
     * Create an alert
     */
    createAlert(alert) {
        const alertWithId = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
            ...alert,
            timestamp: Date.now(),
            acknowledged: false
        };

        this.alerts.push(alertWithId);
        this.alertHistory.push(alertWithId);

        // Log the alert
        logger.warn('Alert created', {
            id: alertWithId.id,
            type: alertWithId.type,
            severity: alertWithId.severity,
            message: alertWithId.message
        });

        // Save to file
        this.saveAlerts();
    }

    /**
     * Acknowledge an alert
     */
    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            logger.info('Alert acknowledged', { id: alertId });
            this.saveAlerts();
        }
    }

    /**
     * Save alerts to file
     */
    async saveAlerts() {
        try {
            await fs.writeFile(
                path.join(METRICS_DIR, 'alerts.json'),
                JSON.stringify(this.alerts, null, 2)
            );
        } catch (error) {
            logger.error('Failed to save alerts', { error: error.message });
        }
    }

    /**
     * Load alert history
     */
    async loadAlertHistory() {
        try {
            const alertsFile = path.join(METRICS_DIR, 'alerts.json');
            const content = await fs.readFile(alertsFile, 'utf8');
            this.alerts = JSON.parse(content);
            this.alertHistory = [...this.alerts];
        } catch {
            // File doesn't exist yet
            this.alerts = [];
            this.alertHistory = [];
        }
    }

    /**
     * Stop monitoring service
     */
    async stop() {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
        }

        // Final flush
        await this.flushMetrics();
        await this.saveAlerts();

        logger.info('Monitoring service stopped', {
            uptime: metrics.formatDuration(Date.now() - metrics.startTime)
        });
    }

    /**
     * Get monitoring status
     */
    getStatus() {
        return {
            running: this.collectionInterval !== null,
            uptime: Date.now() - metrics.startTime,
            uptimeHuman: metrics.formatDuration(Date.now() - metrics.startTime),
            activeAlerts: this.alerts.filter(a => !a.acknowledged),
            totalAlerts: this.alertHistory.length,
            metricsSummary: metrics.getSummary()
        };
    }
}

// Create monitoring service instance
const monitoring = new MonitoringService();

// ============================================
// Helper Functions
// ============================================

/**
 * Create a logger with context
 */
function createLogger(context) {
    return {
        debug: (message, meta) => logger.debug(message, { ...meta, context }),
        info: (message, meta) => logger.info(message, { ...meta, context }),
        warn: (message, meta) => logger.warn(message, { ...meta, context }),
        error: (message, meta) => logger.error(message, { ...meta, context }),
        timing: (name, duration, meta) => {
            logger.debug(`Timing: ${name}`, { duration, ...meta, context });
            metrics.timing(name, duration, meta);
        }
    };
}

/**
 * Time a function execution
 */
async function timeAsync(name, fn) {
    const start = Date.now();
    try {
        const result = await fn();
        const duration = Date.now() - start;
        logger.debug(`Completed: ${name}`, { duration, unit: 'ms' });
        metrics.timing(name, duration, { type: 'async' });
        return result;
    } catch (error) {
        const duration = Date.now() - start;
        logger.error(`Failed: ${name}`, { error: error.message, duration, unit: 'ms' });
        metrics.timing(name, duration, { type: 'async', status: 'error' });
        throw error;
    }
}

/**
 * Time a synchronous function execution
 */
function timeSync(name, fn) {
    const start = Date.now();
    try {
        const result = fn();
        const duration = Date.now() - start;
        logger.debug(`Completed: ${name}`, { duration, unit: 'ms' });
        metrics.timing(name, duration, { type: 'sync' });
        return result;
    } catch (error) {
        const duration = Date.now() - start;
        logger.error(`Failed: ${name}`, { error: error.message, duration, unit: 'ms' });
        metrics.timing(name, duration, { type: 'sync', status: 'error' });
        throw error;
    }
}

// ============================================
// Middleware for Express
// ============================================

function createLoggingMiddleware() {
    return (req, res, next) => {
        const start = Date.now();
        const reqId = req.id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;

        // Add request ID to request
        req.id = reqId;

        // Log request
        logger.info('Request started', {
            reqId,
            method: req.method,
            path: req.path,
            ip: req.ip
        });

        // Track request metrics
        metrics.increment('http_requests_total', 1, {
            method: req.method,
            path: req.path
        });

        // Intercept response
        const originalSend = res.send;
        res.send = function(data) {
            res.send = originalSend;
            const duration = Date.now() - start;
            const statusCode = res.statusCode;

            // Log response
            const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
            logger[logLevel]('Request completed', {
                reqId,
                method: req.method,
                path: req.path,
                statusCode,
                duration
            });

            // Update metrics
            metrics.histogram('http_request_duration', duration, {
                method: req.method,
                path: req.path,
                status: statusCode
            });

            metrics.increment('http_responses_total', 1, {
                method: req.method,
                status: statusCode
            });

            // Call original send
            return res.send(data);
        };

        next();
    };
}

// ============================================
// Metrics API Routes
// ============================================

function createMetricsRoutes(monitoringService) {
    const express = require('express');
    const router = express.Router();

    // Prometheus metrics endpoint
    router.get('/metrics', (req, res) => {
        res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(metrics.getPrometheusFormat());
    });

    // Health check endpoint
    router.get('/health', (req, res) => {
        const status = monitoringService.getStatus();
        res.json({
            status: status.running ? 'healthy' : 'unhealthy',
            uptime: status.uptimeHuman,
            metrics: status.metricsSummary,
            alerts: {
                active: status.activeAlerts.length,
                total: status.totalAlerts
            }
        });
    });

    // Database query stats
    router.get('/database-stats', async (req, res) => {
        const db = require('./index.js');
        res.json(db.getQueryStats());
    });

    // Alert management
    router.get('/alerts', (req, res) => {
        res.json({
            active: monitoringService.alerts.filter(a => !a.acknowledged),
            history: monitoringService.alertHistory
        });
    });

    router.post('/alerts/:id/acknowledge', async (req, res) => {
        const { id } = req.params;
        monitoringService.acknowledgeAlert(id);
        res.json({ success: true });
    });

    return router;
}

// ============================================
// Exports
// ============================================

module.exports = {
    logger,
    metrics,
    monitoring,
    MonitoringService,
    createLogger,
    timeAsync,
    timeSync,
    createLoggingMiddleware,
    createMetricsRoutes,
    LOG_CONFIG,
    METRICS_CONFIG
};
