// Database module for Finallica Multi-Repository Platform - Improved
// Uses sql.js (pure JavaScript SQLite) with better async patterns and performance

const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/repositories.db');
const DATA_DIR = path.join(__dirname, '../data');
const REPOS_DIR = path.join(__dirname, '../data/repos');

// ============================================
// Database Configuration
// ============================================

const DB_CONFIG = {
    SAVE_DEBOUNCE_MS: 1000, // Batch saves up to 1 second
    SAVE_MAX_PENDING: 100, // Save after 100 operations
    ENABLE_QUERY_LOGGING: process.env.DB_QUERY_LOGGING === 'true',
    ENABLE_PERFORMANCE_TRACKING: process.env.DB_PERFORMANCE_TRACKING === 'true'
};

// ============================================
// Database Manager Class
// ============================================

class DatabaseManager {
    constructor() {
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
    }

    /**
     * Initialize database with async patterns
     */
    async initialize() {
        // Ensure directories exist
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(REPOS_DIR, { recursive: true });

        // Initialize SQL.js
        this.SQL = await initSqlJs();

        // Load or create database
        try {
            const dbBuffer = await fs.readFile(DB_PATH);
            this.db = new this.SQL.Database(dbBuffer);
        } catch {
            // Create new database
            this.db = new this.SQL.Database();
            await this.loadSchema();
        }

        // Enable WAL mode for better concurrency
        this.db.run('PRAGMA journal_mode = WAL;');
        this.db.run('PRAGMA synchronous = NORMAL;');
        this.db.run('PRAGMA cache_size = -64000;'); // 64MB cache
        this.db.run('PRAGMA temp_store = MEMORY;');

        console.log(`Database initialized: ${DB_PATH}`);
        console.log(`SQLite version: ${this.db.exec('SELECT sqlite_version() as version')[0].version}`);
    }

    /**
     * Load schema with better error handling
     */
    async loadSchema() {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');

        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Use transaction for schema creation
        const transaction = this.db.exec('BEGIN TRANSACTION;');
        try {
            for (const stmt of statements) {
                try {
                    this.db.run(stmt);
                } catch (error) {
                    console.error(`Schema statement failed: ${stmt.substring(0, 50)}...`, error.message);
                    // Continue with next statement
                }
            }
            this.db.exec('COMMIT;');
            await this.save();
        } catch (error) {
            this.db.exec('ROLLBACK;');
            throw error;
        }
    }

    /**
     * Optimized save with debouncing
     */
    async save(force = false) {
        // If already saving and not forced, queue save
        if (this.isSaving && !force) {
            this.pendingSaves++;
            return;
        }

        // Clear existing timeout
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        // Debounce save
        this.saveTimeout = setTimeout(async () => {
            this.isSaving = true;
            const startTime = Date.now();

            try {
                const data = this.db.export();
                const buffer = Buffer.from(data);
                await fs.writeFile(DB_PATH, buffer);

                const saveTime = Date.now() - startTime;
                console.log(`Database saved in ${saveTime}ms (${this.pendingSaves} queued)`);

                // Process pending saves
                this.pendingSaves = 0;
            } catch (error) {
                console.error('Database save failed:', error);
                throw error;
            } finally {
                this.isSaving = false;
            }
        }, DB_CONFIG.SAVE_DEBOUNCE_MS);
    }

    /**
     * Immediate save (for critical operations)
     */
    async saveImmediate() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }

        this.isSaving = true;
        try {
            const data = this.db.export();
            const buffer = Buffer.from(data);
            await fs.writeFile(DB_PATH, buffer);
            console.log('Database saved immediately');
        } catch (error) {
            console.error('Immediate save failed:', error);
            throw error;
        } finally {
            this.isSaving = false;
        }
    }

    // ============================================
    // Query Helpers
    // ============================================

    /**
     * Prepare statement with caching
     */
    prepare(sql) {
        const startTime = Date.now();

        const stmt = this.db.prepare(sql);

        if (DB_CONFIG.ENABLE_PERFORMANCE_TRACKING) {
            const duration = Date.now() - startTime;
            this.trackQuery(sql, duration);
        }

        return stmt;
    }

    /**
     * Execute query with performance tracking
     */
    execute(sql, params = {}) {
        const startTime = Date.now();

        const stmt = this.prepare(sql);
        stmt.bind(params);
        const result = stmt.getAsObject(params);

        if (DB_CONFIG.ENABLE_PERFORMANCE_TRACKING) {
            const duration = Date.now() - startTime;
            this.trackQuery(sql, duration);
        }

        return result;
    }

    /**
     * Execute query and get all rows
     */
    executeAll(sql, params = {}) {
        const startTime = Date.now();

        const stmt = this.prepare(sql);
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject(params));
        }
        stmt.free();

        if (DB_CONFIG.ENABLE_PERFORMANCE_TRACKING) {
            const duration = Date.now() - startTime;
            this.trackQuery(sql, duration, results.length);
        }

        return results;
    }

    /**
     * Execute query with transaction
     */
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

    /**
     * Track query performance
     */
    trackQuery(sql, duration, rowCount = 1) {
        this.queryStats.total++;

        if (duration > 100) { // Log slow queries (>100ms)
            this.queryStats.slowQueries.push({
                sql: sql.substring(0, 100),
                duration,
                timestamp: Date.now()
            });

            // Keep only last 100 slow queries
            if (this.queryStats.slowQueries.length > 100) {
                this.queryStats.slowQueries.shift();
            }
        }

        if (DB_CONFIG.ENABLE_QUERY_LOGGING) {
            console.log(`[DB Query ${duration}ms] ${sql.substring(0, 50)}...`);
        }
    }

    /**
     * Get query statistics
     */
    getQueryStats() {
        return {
            ...this.queryStats,
            uptimeSeconds: Math.floor((Date.now() - this.queryStats.lastReset) / 1000),
            queriesPerSecond: Math.round(this.queryStats.total /
                Math.max((Date.now() - this.queryStats.lastReset) / 1000, 1))
        };
    }

    // ============================================
    // Batch Operations
    // ============================================

    /**
     * Batch insert with better performance
     */
    async batchInsert(table, columns, rows) {
        if (rows.length === 0) return;

        const placeholders = columns.map(() => '?').join(',');
        const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;

        this.db.run('BEGIN TRANSACTION;');
        try {
            const stmt = this.db.prepare(sql);
            for (const row of rows) {
                stmt.run(row);
            }
            stmt.free();
            this.db.run('COMMIT;');
            await this.save();
        } catch (error) {
            this.db.run('ROLLBACK;');
            throw error;
        }
    }

    /**
     * Batch update with better performance
     */
    async batchUpdate(table, updates, idColumn = 'id') {
        if (updates.length === 0) return;

        this.db.run('BEGIN TRANSACTION;');
        try {
            for (const update of updates) {
                const setClause = Object.keys(update)
                    .filter(key => key !== idColumn)
                    .map(key => `${key} = ?`)
                    .join(', ');
                const values = Object.values(update);
                const sql = `UPDATE ${table} SET ${setClause} WHERE ${idColumn} = ?`;

                this.db.run(sql, values);
            }
            this.db.run('COMMIT;');
            await this.save();
        } catch (error) {
            this.db.run('ROLLBACK;');
            throw error;
        }
    }

    // ============================================
    // REPOSITORY OPERATIONS
    // ============================================

    async createRepository(repo) {
        const values = [
            repo.id || ('repo_' + Math.random().toString(36).substr(2, 16)),
            repo.name || 'Unknown',
            repo.sourceType || repo.source_type || 'github',
            repo.url || '',
            repo.cloneUrl || repo.url || '',
            repo.branch || repo.branch || 'main',
            repo.description || '',
            JSON.stringify(repo.tags || []),
            (repo.isPrivate || repo.is_private) ? 1 : 0,
            repo.authTokenId || null,
            repo.localPath || null,
            repo.status || 'pending'
        ];

        this.db.run(`
            INSERT INTO repositories (
                id, name, source_type, url, clone_url, branch,
                description, tags, is_private, auth_token_id,
                local_path, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, values);
        await this.save();
    }

    getRepository(id) {
        const result = this.execute(
            'SELECT * FROM repositories WHERE id = :id',
            { ':id': id }
        );

        if (result && result.id) {
            try {
                result.tags = JSON.parse(result.tags || '[]');
                result.stats = JSON.parse(result.stats || '{}');
                result.is_private = Boolean(result.is_private);
            } catch {
                result.tags = [];
                result.stats = {};
                result.is_private = false;
            }
            return result;
        }
        return null;
    }

    getAllRepositories(options = {}) {
        let query = 'SELECT * FROM repositories';
        const params = {};

        if (options.status) {
            query += ' WHERE status = :status';
            params[':status'] = options.status;
        }

        query += ' ORDER BY created_at DESC';

        if (options.limit) {
            query += ' LIMIT :limit';
            params[':limit'] = options.limit;
        }

        const results = this.executeAll(query, params);

        return results.map(repo => {
            try {
                repo.tags = JSON.parse(repo.tags || '[]');
                repo.stats = JSON.parse(repo.stats || '{}');
                repo.is_private = Boolean(repo.is_private);
            } catch {
                repo.tags = [];
                repo.stats = {};
                repo.is_private = false;
            }
            return repo;
        });
    }

    async updateRepository(id, updates) {
        const fields = [];
        const values = [];
        let hasUpdate = false;

        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
            hasUpdate = true;
        }
        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
            hasUpdate = true;
        }
        if (updates.last_commit_hash !== undefined) {
            fields.push('last_commit_hash = ?');
            values.push(updates.last_commit_hash);
            hasUpdate = true;
        }
        if (updates.last_sync_at !== undefined) {
            fields.push('last_sync_at = ?');
            values.push(updates.last_sync_at);
            hasUpdate = true;
        }
        if (updates.stats !== undefined) {
            fields.push('stats = ?');
            values.push(JSON.stringify(updates.stats));
            hasUpdate = true;
        }
        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
            hasUpdate = true;
        }
        if (updates.tags !== undefined) {
            fields.push('tags = ?');
            values.push(JSON.stringify(updates.tags));
            hasUpdate = true;
        }
        if (updates.branch !== undefined) {
            fields.push('branch = ?');
            values.push(updates.branch);
            hasUpdate = true;
        }

        if (hasUpdate) {
            fields.push('updated_at = ?');
            values.push(Math.floor(Date.now() / 1000));
            values.push(id);

            this.db.run(`
                UPDATE repositories SET ${fields.join(', ')} WHERE id = ?
            `, values);
            await this.save();
        }
    }

    async deleteRepository(id) {
        this.db.run('DELETE FROM repositories WHERE id = :id', { ':id': id });
        await this.save();
    }

    // ============================================
    // COLLECTION OPERATIONS
    // ============================================

    async createCollection(collection) {
        const values = [
            collection.id || ('col_' + Math.random().toString(36).substr(2, 16)),
            collection.name || 'Unknown Collection',
            collection.slug || collection.name?.toLowerCase().replace(/\s+/g, '-') || 'unknown',
            collection.description || '',
            (collection.isFeatured || collection.is_featured) ? 1 : 0,
            JSON.stringify(collection.repositoryIds || collection.repository_ids || []),
            JSON.stringify(collection.tags || []),
            collection.sortOrder || collection.sort_order || 0
        ];

        this.db.run(`
            INSERT INTO collections (
                id, name, slug, description, is_featured,
                repository_ids, tags, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, values);
        await this.save();
    }

    getCollection(id) {
        const result = this.execute(
            'SELECT * FROM collections WHERE id = :id',
            { ':id': id }
        );

        if (result && result.id) {
            try {
                result.repository_ids = JSON.parse(result.repository_ids || '[]');
                result.tags = JSON.parse(result.tags || '[]');
                result.is_featured = Boolean(result.is_featured);
                result.is_public = Boolean(result.is_public);
            } catch {
                result.repository_ids = [];
                result.tags = [];
            }
            return result;
        }
        return null;
    }

    getCollectionBySlug(slug) {
        const result = this.execute(
            'SELECT * FROM collections WHERE slug = :slug',
            { ':slug': slug }
        );

        if (result && result.id) {
            try {
                result.repository_ids = JSON.parse(result.repository_ids || '[]');
                result.tags = JSON.parse(result.tags || '[]');
                result.is_featured = Boolean(result.is_featured);
                result.is_public = Boolean(result.is_public);
            } catch {
                result.repository_ids = [];
                result.tags = [];
            }
            return result;
        }
        return null;
    }

    getAllCollections() {
        const results = this.executeAll('SELECT * FROM collections ORDER BY sort_order, created_at DESC');

        return results.map(col => {
            try {
                col.repository_ids = JSON.parse(col.repository_ids || '[]');
                col.tags = JSON.parse(col.tags || '[]');
                col.is_featured = Boolean(col.is_featured);
                col.is_public = Boolean(col.is_public);
            } catch {
                col.repository_ids = [];
                col.tags = [];
            }
            return col;
        });
    }

    async updateCollection(id, updates) {
        const fields = [];
        const values = [];
        let hasUpdate = false;

        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
            hasUpdate = true;
        }
        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
            hasUpdate = true;
        }
        if (updates.repository_ids !== undefined) {
            fields.push('repository_ids = ?');
            values.push(JSON.stringify(updates.repository_ids));
            hasUpdate = true;
        }
        if (updates.tags !== undefined) {
            fields.push('tags = ?');
            values.push(JSON.stringify(updates.tags));
            hasUpdate = true;
        }
        if (updates.is_featured !== undefined) {
            fields.push('is_featured = ?');
            values.push(updates.is_featured ? 1 : 0);
            hasUpdate = true;
        }

        if (hasUpdate) {
            fields.push('updated_at = ?');
            values.push(Math.floor(Date.now() / 1000));
            values.push(id);

            this.db.run(`
                UPDATE collections SET ${fields.join(', ')} WHERE id = ?
            `, values);
            await this.save();
        }
    }

    async deleteCollection(id) {
        this.db.run('DELETE FROM collections WHERE id = :id', { ':id': id });
        await this.save();
    }

    // ============================================
    // UTILITY
    // ============================================

    getReposPath() {
        return REPOS_DIR;
    }

    close() {
        // Save any pending changes before closing
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        if (this.pendingSaves > 0) {
            this.saveImmediate();
        }
        if (this.db) {
            this.db.close();
        }
    }
}

// Singleton instance
const db = new DatabaseManager();

module.exports = db;
