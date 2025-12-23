// Monitoring Service - Infrastructure Module
// Provides structured logging and metrics collection

const winston = require('winston');
const fs = require('fs');

class MonitoringService {
    constructor(config = {}, context = {}) {
        this.config = config;
        this.context = context;
        this.alerts = [];
        this.alertHistory = [];
        this.collectionInterval = null;

        const logDir = config.logDir || path.join(process.cwd(), 'logs');
        const metricsDir = config.metricsDir || path.join(process.cwd(), 'metrics');

        this.logger = winston.createLogger({
            level: config.level || process.env.LOG_LEVEL || 'info',
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.errors({ stack: true }),
                winston.format.splat(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        winston.format.timestamp({ format: 'HH:mm:ss' }),
                        winston.format.printf(({ level, message, timestamp, ...meta }) => {
                            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
                            return `${timestamp} [${level}]: ${message} ${metaStr}`;
                        })
                    )
                }),
                new winston.transports.File({
                    filename: path.join(logDir, 'combined.log'),
                    maxsize: 20 * 1024 * 1024,
                    maxFiles: 10
                }),
                new winston.transports.File({
                    filename: path.join(logDir, 'error.log'),
                    level: 'error',
                    maxsize: 20 * 1024 * 1024,
                    maxFiles: 10
                })
            ]
        });

        this.metrics = {
            counters: {},
            gauges: {},
            histograms: {},
            timers: {},
            startTime: Date.now()
        };
    }

    async start() {
        const logDir = this.config.logDir || path.join(process.cwd(), 'logs');
        const metricsDir = this.config.metricsDir || path.join(process.cwd(), 'metrics');

        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        if (!fs.existsSync(metricsDir)) {
            fs.mkdirSync(metricsDir, { recursive: true });
        }

        await this.loadAlertHistory();

        if (this.config.enabled !== false) {
            this.startMetricsCollection();
        }

        this.logger.info('Monitoring service started');
    }

    async stop() {
        if (this.collectionInterval) {
            clearInterval(this.collectionInterval);
        }
        await this.flushMetrics();
        await this.saveAlerts();
        this.logger.info('Monitoring service stopped');
    }

    startMetricsCollection() {
        this.collectionInterval = setInterval(async () => {
            await this.collectSystemMetrics();
            await this.flushMetrics();
        }, this.config.interval || 60000);
    }

    async collectSystemMetrics() {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        this.gauge('process_memory_heap_used', memUsage.heapUsed);
        this.gauge('process_memory_heap_total', memUsage.heapTotal);
        this.gauge('process_memory_rss', memUsage.rss);
        this.gauge('process_uptime', process.uptime());
    }

    increment(name, value = 1, tags = {}) {
        const key = this.metricKey(name, tags);
        this.metrics.counters[key] = (this.metrics.counters[key] || 0) + value;
    }

    gauge(name, value, tags = {}) {
        const key = this.metricKey(name, tags);
        this.metrics.gauges[key] = value;
    }

    histogram(name, value, tags = {}) {
        const key = this.metricKey(name, tags);
        if (!this.metrics.histograms[key]) {
            this.metrics.histograms[key] = [];
        }
        this.metrics.histograms[key].push(value);
    }

    metricKey(name, tags) {
        const tagStr = Object.entries(tags)
            .map(([k, v]) => `${k}="${v}"`)
            .join(',');
        return tagStr ? `${name}{${tagStr}}` : name;
    }

    async flushMetrics() {
        const metricsDir = this.config.metricsDir || path.join(process.cwd(), 'metrics');
        const prometheusFormat = this.getPrometheusFormat();

        await fs.promises.writeFile(
            path.join(metricsDir, 'prometheus.txt'),
            prometheusFormat
        );
    }

    getPrometheusFormat() {
        const lines = [];

        for (const [key, value] of Object.entries(this.metrics.counters)) {
            lines.push(`# TYPE ${key} counter`);
            lines.push(`${key} ${value}`);
        }

        for (const [key, value] of Object.entries(this.metrics.gauges)) {
            lines.push(`# TYPE ${key} gauge`);
            lines.push(`${key} ${value}`);
        }

        return lines.join('\n');
    }

    async loadAlertHistory() {
        const alertsFile = path.join(
            this.config.metricsDir || path.join(process.cwd(), 'metrics'),
            'alerts.json'
        );
        try {
            const content = await fs.promises.readFile(alertsFile, 'utf8');
            this.alerts = JSON.parse(content);
            this.alertHistory = [...this.alerts];
        } catch {
            this.alerts = [];
            this.alertHistory = [];
        }
    }

    async saveAlerts() {
        const alertsFile = path.join(
            this.config.metricsDir || path.join(process.cwd(), 'metrics'),
            'alerts.json'
        );
        await fs.promises.writeFile(
            alertsFile,
            JSON.stringify(this.alerts, null, 2)
        );
    }

    recordError(error) {
        this.logger.error(error.message, { stack: error.stack });
    }

    recordModuleError(moduleError) {
        this.logger.error(`Module error: ${moduleError.module}`, {
            error: moduleError.error
        });
    }

    async getMetrics(options = {}) {
        return {
            counters: this.metrics.counters,
            gauges: this.metrics.gauges,
            histograms: this.metrics.histograms,
            uptime: Date.now() - this.metrics.startTime
        };
    }

    async healthCheck() {
        return {
            status: 'healthy',
            message: 'Monitoring service is running',
            uptime: Date.now() - this.metrics.startTime,
            alerts: this.alerts.filter(a => !a.acknowledged).length
        };
    }

    createLogger(context) {
        return {
            debug: (message, meta) => this.logger.debug(message, { ...meta, context }),
            info: (message, meta) => this.logger.info(message, { ...meta, context }),
            warn: (message, meta) => this.logger.warn(message, { ...meta, context }),
            error: (message, meta) => this.logger.error(message, { ...meta, context })
        };
    }
}

module.exports = MonitoringService;
