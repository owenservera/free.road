// Database Service - Infrastructure Module
// Uses sql.js (pure JavaScript SQLite) with async patterns

const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');

class DatabaseService {
    constructor(config = {}) {
        this.db = null;
        this.SQL = null;
        this.pendingSaves = 0;
        this.saveTimeout = null;
        this.isSaving = false;
        this.saveQueue = new Set();
        this.queryStats = {
            total: 0,
            slowQueries: [],
            lastReset: Date.now()
        };

        this.dbPath = config.dbPath || path.join(process.cwd(), 'data/repositories.db');
        this.dataDir = path.dirname(this.dbPath);
        this.reposDir = config.reposDir || path.join(this.dataDir, 'repos');
    }

    async initialize() {
        await fs.mkdir(this.dataDir, { recursive: true });
        await fs.mkdir(this.reposDir, { recursive: true });

        this.SQL = await initSqlJs();

        try {
            const dbBuffer = await fs.readFile(this.dbPath);
            this.db = new this.SQL.Database(dbBuffer);
        } catch {
            this.db = new this.SQL.Database();
        }

        this.db.run('PRAGMA journal_mode = WAL;');
        this.db.run('PRAGMA synchronous = NORMAL;');
        this.db.run('PRAGMA cache_size = -64000;');
        this.db.run('PRAGMA temp_store = MEMORY;');
    }

    async connect() {
        console.log('Database connected');
    }

    async disconnect() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        if (this.pendingSaves > 0) {
            await this.saveImmediate();
        }
        if (this.db) {
            this.db.close();
        }
        console.log('Database disconnected');
    }

    async save(force = false) {
        if (this.isSaving && !force) {
            this.pendingSaves++;
            return;
        }

        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.saveTimeout = setTimeout(async () => {
            this.isSaving = true;
            const startTime = Date.now();

            try {
                const data = this.db.export();
                const buffer = Buffer.from(data);
                await fs.writeFile(this.dbPath, buffer);

                const saveTime = Date.now() - startTime;
                console.log(`Database saved in ${saveTime}ms (${this.pendingSaves} queued)`);

                this.pendingSaves = 0;
            } catch (error) {
                console.error('Database save failed:', error);
                throw error;
            } finally {
                this.isSaving = false;
            }
        }, 1000);
    }

    async saveImmediate() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.isSaving = true;
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            await fs.writeFile(this.dbPath, buffer);
            console.log('Database saved immediately');
        } catch (error) {
            console.error('Immediate save failed:', error);
            throw error;
        } finally {
            this.isSaving = false;
        }
    }

    prepare(sql) {
        const startTime = Date.now();
        const stmt = this.db.prepare(sql);

        if (Date.now() - startTime > 100) {
            this.queryStats.slowQueries.push({
                sql: sql.substring(0, 100),
                duration: Date.now() - startTime,
                timestamp: Date.now()
            });
        }

        return stmt;
    }

    execute(sql, params = {}) {
        const stmt = this.prepare(sql);
        stmt.bind(params);
        const result = stmt.getAsObject(params);
        this.queryStats.total++;
        return result;
    }

    executeAll(sql, params = {}) {
        const stmt = this.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject(params));
        }
        stmt.free();
        this.queryStats.total++;
        return results;
    }

    async executeTransaction(operations) {
        this.db.run('BEGIN TRANSACTION;');
        try {
            const results = await operations();
            this.db.run('COMMIT;');
            await this.save();
            return results;
        } catch (error) {
            this.db.run('ROLLBACK;');
            throw error;
        }
    }

    getReposPath() {
        return this.reposDir;
    }

    getQueryStats() {
        return {
            ...this.queryStats,
            uptimeSeconds: Math.floor((Date.now() - this.queryStats.lastReset) / 1000)
        };
    }

    async healthCheck() {
        try {
            this.db.exec('SELECT 1');
            return {
                status: 'healthy',
                message: 'Database connection is valid',
                stats: this.getQueryStats()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                message: error.message
            };
        }
    }
}

module.exports = DatabaseService;
