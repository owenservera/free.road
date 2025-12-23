// Database module for Finallica Multi-Repository Platform
// Uses sql.js (pure JavaScript SQLite)

const initSqlJs = require('sql.js');
const fs = require('fs').promises;
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/repositories.db');
const DATA_DIR = path.join(__dirname, '../data');
const REPOS_DIR = path.join(__dirname, '../data/repos');

class DatabaseManager {
    constructor() {
        this.db = null;
        this.SQL = null;
    }

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

        console.log(`Database initialized: ${DB_PATH}`);
    }

    async loadSchema() {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = await fs.readFile(schemaPath, 'utf8');

        // Split schema by semicolons and execute each statement
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const stmt of statements) {
            this.db.run(stmt);
        }

        await this.save();
    }

    async save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        await fs.writeFile(DB_PATH, buffer);
    }

    // ============================================
    // REPOSITORY OPERATIONS
    // ============================================

    async createRepository(repo) {
        // Ensure all values are defined
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
        const stmt = this.db.prepare('SELECT * FROM repositories WHERE id = :id');
        const result = stmt.getAsObject({ ':id': id });

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

        const stmt = this.db.prepare(query);
        stmt.bind(params);

        const repos = [];
        while (stmt.step()) {
            const repo = stmt.getAsObject();
            try {
                repo.tags = JSON.parse(repo.tags || '[]');
                repo.stats = JSON.parse(repo.stats || '{}');
                repo.is_private = Boolean(repo.is_private);
            } catch {
                repo.tags = [];
                repo.stats = {};
                repo.is_private = false;
            }
            repos.push(repo);
        }
        stmt.free();

        return repos;
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
        const stmt = this.db.prepare('SELECT * FROM collections WHERE id = :id');
        const col = stmt.getAsObject({ ':id': id });
        stmt.free();

        if (col && col.id) {
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
        }
        return null;
    }

    getCollectionBySlug(slug) {
        const stmt = this.db.prepare('SELECT * FROM collections WHERE slug = :slug');
        const col = stmt.getAsObject({ ':slug': slug });
        stmt.free();

        if (col && col.id) {
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
        }
        return null;
    }

    getAllCollections() {
        const stmt = this.db.prepare('SELECT * FROM collections ORDER BY sort_order, created_at DESC');
        const collections = [];

        while (stmt.step()) {
            const col = stmt.getAsObject();
            try {
                col.repository_ids = JSON.parse(col.repository_ids || '[]');
                col.tags = JSON.parse(col.tags || '[]');
                col.is_featured = Boolean(col.is_featured);
                col.is_public = Boolean(col.is_public);
            } catch {
                col.repository_ids = [];
                col.tags = [];
            }
            collections.push(col);
        }
        stmt.free();

        return collections;
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
    // SYNC JOB OPERATIONS
    // ============================================

    async createSyncJob(job) {
        this.db.run(`
            INSERT INTO sync_jobs (
                id, repository_id, status, trigger_type
            ) VALUES (?, ?, ?, ?)
        `, [job.id, job.repositoryId, job.status || 'queued', job.triggerType || 'manual']);
        await this.save();
    }

    async updateSyncJob(id, updates) {
        const fields = [];
        const values = [];

        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.started_at !== undefined) {
            fields.push('started_at = ?');
            values.push(updates.started_at);
        }
        if (updates.completed_at !== undefined) {
            fields.push('completed_at = ?');
            values.push(updates.completed_at);
        }
        if (updates.duration_ms !== undefined) {
            fields.push('duration_ms = ?');
            values.push(updates.duration_ms);
        }
        if (updates.files_added !== undefined) {
            fields.push('files_added = ?');
            values.push(updates.files_added);
        }
        if (updates.files_modified !== undefined) {
            fields.push('files_modified = ?');
            values.push(updates.files_modified);
        }
        if (updates.files_deleted !== undefined) {
            fields.push('files_deleted = ?');
            values.push(updates.files_deleted);
        }
        if (updates.error_message !== undefined) {
            fields.push('error_message = ?');
            values.push(updates.error_message);
        }

        if (fields.length > 0) {
            values.push(id);
            this.db.run(`
                UPDATE sync_jobs SET ${fields.join(', ')} WHERE id = ?
            `, values);
            await this.save();
        }
    }

    getSyncJob(id) {
        const stmt = this.db.prepare('SELECT * FROM sync_jobs WHERE id = :id');
        const job = stmt.getAsObject({ ':id': id });
        stmt.free();
        return job && job.id ? job : null;
    }

    getActiveSyncJobs() {
        const stmt = this.db.prepare(`
            SELECT sj.*, r.name as repository_name
            FROM sync_jobs sj
            JOIN repositories r ON sj.repository_id = r.id
            WHERE sj.status IN ('queued', 'running')
            ORDER BY sj.started_at DESC
        `);
        const jobs = [];
        while (stmt.step()) {
            jobs.push(stmt.getAsObject());
        }
        stmt.free();
        return jobs;
    }

    getRecentSyncJobs(limit = 50) {
        const stmt = this.db.prepare(`
            SELECT sj.*, r.name as repository_name
            FROM sync_jobs sj
            JOIN repositories r ON sj.repository_id = r.id
            WHERE sj.status IN ('completed', 'failed')
            ORDER BY sj.completed_at DESC
            LIMIT :limit
        `);
        stmt.bind({ ':limit': limit });
        const jobs = [];
        while (stmt.step()) {
            jobs.push(stmt.getAsObject());
        }
        stmt.free();
        return jobs;
    }

    // ============================================
    // SUBMISSION OPERATIONS
    // ============================================

    async createSubmission(submission) {
        this.db.run(`
            INSERT INTO submissions (
                id, submitter_name, submitter_email, submitter_note,
                repo_url, repo_name, repo_description
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            submission.id,
            submission.submitterName,
            submission.submitterEmail,
            submission.submitterNote,
            submission.repoUrl,
            submission.repoName,
            submission.repoDescription
        ]);
        await this.save();
    }

    getSubmission(id) {
        const stmt = this.db.prepare('SELECT * FROM submissions WHERE id = :id');
        const sub = stmt.getAsObject({ ':id': id });
        stmt.free();
        return sub && sub.id ? sub : null;
    }

    getAllSubmissions(filters = {}) {
        let query = 'SELECT * FROM submissions';
        const conditions = [];
        const params = {};

        if (filters.status) {
            conditions.push('status = :status');
            params[':status'] = filters.status;
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY submitted_at DESC';

        if (filters.limit) {
            query += ' LIMIT :limit';
            params[':limit'] = filters.limit;
        }

        const stmt = this.db.prepare(query);
        stmt.bind(params);
        const submissions = [];
        while (stmt.step()) {
            submissions.push(stmt.getAsObject());
        }
        stmt.free();
        return submissions;
    }

    async updateSubmission(id, updates) {
        const fields = [];
        const values = [];

        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.repository_id !== undefined) {
            fields.push('repository_id = ?');
            values.push(updates.repository_id);
        }
        if (updates.reviewed_by !== undefined) {
            fields.push('reviewed_by = ?');
            values.push(updates.reviewed_by);
        }
        if (updates.review_note !== undefined) {
            fields.push('review_note = ?');
            values.push(updates.review_note);
        }
        if (updates.status && updates.status !== 'pending') {
            fields.push('reviewed_at = ?');
            values.push(Math.floor(Date.now() / 1000));
        }

        if (fields.length > 0) {
            values.push(id);
            this.db.run(`
                UPDATE submissions SET ${fields.join(', ')} WHERE id = ?
            `, values);
            await this.save();
        }
    }

    // ============================================
    // AUTH TOKEN OPERATIONS
    // ============================================

    async createAuthToken(token) {
        this.db.run(`
            INSERT INTO auth_tokens (
                id, provider, token_name, token_value_encrypted,
                iv, auth_tag, username, scope
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            token.id,
            token.provider,
            token.tokenName,
            token.tokenValueEncrypted,
            token.iv,
            token.authTag,
            token.username,
            JSON.stringify(token.scope || [])
        ]);
        await this.save();
    }

    getAuthToken(id) {
        const stmt = this.db.prepare('SELECT * FROM auth_tokens WHERE id = :id AND is_active = 1');
        const token = stmt.getAsObject({ ':id': id });
        stmt.free();

        if (token && token.id) {
            try {
                token.scope = JSON.parse(token.scope || '[]');
                token.is_active = Boolean(token.is_active);
            } catch {
                token.scope = [];
            }
            return token;
        }
        return null;
    }

    getAllAuthTokens() {
        const stmt = this.db.prepare('SELECT id, provider, token_name, username, scope, is_active, created_at, last_used_at FROM auth_tokens ORDER BY created_at DESC');
        const tokens = [];
        while (stmt.step()) {
            const token = stmt.getAsObject();
            try {
                token.scope = JSON.parse(token.scope || '[]');
                token.is_active = Boolean(token.is_active);
            } catch {
                token.scope = [];
            }
            tokens.push(token);
        }
        stmt.free();
        return tokens;
    }

    async deleteAuthToken(id) {
        this.db.run('DELETE FROM auth_tokens WHERE id = :id', { ':id': id });
        await this.save();
    }

    async updateAuthTokenLastUsed(id) {
        this.db.run(`
            UPDATE auth_tokens SET last_used_at = :timestamp WHERE id = :id
        `, {
            ':timestamp': Math.floor(Date.now() / 1000),
            ':id': id
        });
        await this.save();
    }

    // ============================================
    // ACTIVITY LOG
    // ============================================

    async logActivity(action, entityType, entityId, userId, details = {}) {
        this.db.run(`
            INSERT INTO activity_log (action, entity_type, entity_id, user_id, details)
            VALUES (?, ?, ?, ?, ?)
        `, [action, entityType, entityId, userId, JSON.stringify(details)]);
        await this.save();
    }

    getRecentActivity(limit = 100) {
        const stmt = this.db.prepare(`
            SELECT * FROM activity_log
            ORDER BY created_at DESC
            LIMIT :limit
        `);
        stmt.bind({ ':limit': limit });
        const activities = [];
        while (stmt.step()) {
            const activity = stmt.getAsObject();
            try {
                activity.details = JSON.parse(activity.details || '{}');
            } catch {
                activity.details = {};
            }
            activities.push(activity);
        }
        stmt.free();
        return activities;
    }

    // ============================================
    // MIGRATIONS
    // ============================================

    async runMigrations() {
        // Create migrations tracking table if it doesn't exist
        this.db.run(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                version TEXT NOT NULL UNIQUE,
                applied_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);

        // Get available migrations
        const migrations = await this.getMigrations();

        for (const migration of migrations) {
            const applied = this.db.exec(`SELECT 1 FROM schema_migrations WHERE version = '${migration.version}'`);
            if (applied.length === 0) {
                console.log(`Applying migration: ${migration.version}`);
                await migration.up(this);
                this.db.run(`INSERT INTO schema_migrations (version) VALUES ('${migration.version}')`);
                await this.save();
                console.log(`Migration ${migration.version} applied successfully`);
            }
        }
    }

    async getMigrations() {
        const migrationsDir = path.join(__dirname, 'migrations');
        const migrations = [];

        try {
            const files = await fs.readdir(migrationsDir);
            for (const file of files) {
                if (file.endsWith('.sql')) {
                    const version = file.replace('.sql', '');
                    const filePath = path.join(migrationsDir, file);
                    const sql = await fs.readFile(filePath, 'utf8');
                    migrations.push({
                        version,
                        up: async (db) => {
                            // Split and execute each statement
                            const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);
                            for (const stmt of statements) {
                                db.db.run(stmt);
                            }
                        }
                    });
                }
            }
        } catch (error) {
            console.log('No migrations directory found, skipping migrations');
        }

        return migrations.sort((a, b) => a.version.localeCompare(b.version));
    }

    // ============================================
    // AGENT FLEET: API KEY POOLS
    // ============================================

    async createAPIKeyPool(pool) {
        this.db.run(`
            INSERT INTO api_key_pools (id, name, description, priority, keys_json, budget_limit, budget_period)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            pool.id,
            pool.name,
            pool.description || '',
            pool.priority || 0,
            JSON.stringify(pool.keys || {}),
            pool.budget_limit || null,
            pool.budget_period || null
        ]);
        await this.save();
    }

    getAPIKeyPool(id) {
        const stmt = this.db.prepare('SELECT * FROM api_key_pools WHERE id = :id');
        const pool = stmt.getAsObject({ ':id': id });
        stmt.free();
        if (pool) {
            pool.keys_json = JSON.parse(pool.keys_json || '{}');
        }
        return pool;
    }

    getAllAPIKeyPools() {
        const stmt = this.db.prepare('SELECT * FROM api_key_pools ORDER BY priority DESC');
        const pools = [];
        while (stmt.step()) {
            const pool = stmt.getAsObject();
            pool.keys_json = JSON.parse(pool.keys_json || '{}');
            pools.push(pool);
        }
        stmt.free();
        return pools;
    }

    // ============================================
    // AGENT FLEET: AGENTS
    // ============================================

    async createAgent(agent) {
        this.db.run(`
            INSERT INTO agents (id, agent_type, model, provider, status, pool_id, config_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            agent.id,
            agent.agent_type,
            agent.model,
            agent.provider,
            agent.status || 'idle',
            agent.pool_id || null,
            JSON.stringify(agent.config || {})
        ]);
        await this.save();
    }

    getAgent(id) {
        const stmt = this.db.prepare('SELECT * FROM agents WHERE id = :id');
        const agent = stmt.getAsObject({ ':id': id });
        stmt.free();
        if (agent) {
            agent.config_json = JSON.parse(agent.config_json || '{}');
        }
        return agent;
    }

    getAllAgents(filters = {}) {
        let query = 'SELECT * FROM agents';
        const params = {};

        if (filters.status) {
            query += ' WHERE status = :status';
            params[':status'] = filters.status;
        }

        query += ' ORDER BY spawned_at DESC';

        const stmt = this.db.prepare(query);
        stmt.bind(params);
        const agents = [];
        while (stmt.step()) {
            const agent = stmt.getAsObject();
            agent.config_json = JSON.parse(agent.config_json || '{}');
            agents.push(agent);
        }
        stmt.free();
        return agents;
    }

    async updateAgent(id, updates) {
        const fields = [];
        const values = [];

        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.current_task_id !== undefined) {
            fields.push('current_task_id = ?');
            values.push(updates.current_task_id);
        }
        if (updates.last_heartbeat_at !== undefined) {
            fields.push('last_heartbeat_at = ?');
            values.push(updates.last_heartbeat_at);
        }
        if (updates.terminated_at !== undefined) {
            fields.push('terminated_at = ?');
            values.push(updates.terminated_at);
        }

        if (fields.length > 0) {
            values.push(id);
            this.db.run(`UPDATE agents SET ${fields.join(', ')} WHERE id = ?`, values);
            await this.save();
        }
    }

    // ============================================
    // AGENT FLEET: AGENT TASKS
    // ============================================

    async createAgentTask(task) {
        this.db.run(`
            INSERT INTO agent_tasks (id, agent_id, agent_type, task_type, task_data, priority, status)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            task.id,
            task.agent_id || null,
            task.agent_type,
            task.task_type,
            JSON.stringify(task.task_data || {}),
            task.priority || 5,
            task.status || 'queued'
        ]);
        await this.save();
    }

    getAgentTask(id) {
        const stmt = this.db.prepare('SELECT * FROM agent_tasks WHERE id = :id');
        const task = stmt.getAsObject({ ':id': id });
        stmt.free();
        if (task) {
            task.task_data = JSON.parse(task.task_data || '{}');
            task.result_json = JSON.parse(task.result_json || '{}');
        }
        return task;
    }

    getPendingTasks(limit = 50) {
        const stmt = this.db.prepare(`
            SELECT * FROM agent_tasks
            WHERE status = 'queued'
            ORDER BY priority DESC, created_at ASC
            LIMIT :limit
        `);
        stmt.bind({ ':limit': limit });
        const tasks = [];
        while (stmt.step()) {
            const task = stmt.getAsObject();
            task.task_data = JSON.parse(task.task_data || '{}');
            task.result_json = JSON.parse(task.result_json || '{}');
            tasks.push(task);
        }
        stmt.free();
        return tasks;
    }

    getAgentTasks(agentId) {
        const stmt = this.db.prepare(`
            SELECT * FROM agent_tasks
            WHERE agent_id = :agent_id
            ORDER BY created_at DESC
        `);
        stmt.bind({ ':agent_id': agentId });
        const tasks = [];
        while (stmt.step()) {
            const task = stmt.getAsObject();
            task.task_data = JSON.parse(task.task_data || '{}');
            task.result_json = JSON.parse(task.result_json || '{}');
            tasks.push(task);
        }
        stmt.free();
        return tasks;
    }

    async updateAgentTask(id, updates) {
        const fields = [];
        const values = [];

        if (updates.status !== undefined) {
            fields.push('status = ?');
            values.push(updates.status);
        }
        if (updates.agent_id !== undefined) {
            fields.push('agent_id = ?');
            values.push(updates.agent_id);
        }
        if (updates.result_json !== undefined) {
            fields.push('result_json = ?');
            values.push(JSON.stringify(updates.result_json));
        }
        if (updates.error_message !== undefined) {
            fields.push('error_message = ?');
            values.push(updates.error_message);
        }
        if (updates.retry_count !== undefined) {
            fields.push('retry_count = ?');
            values.push(updates.retry_count);
        }
        if (updates.started_at !== undefined) {
            fields.push('started_at = ?');
            values.push(updates.started_at);
        }
        if (updates.completed_at !== undefined) {
            fields.push('completed_at = ?');
            values.push(updates.completed_at);
        }

        if (fields.length > 0) {
            values.push(id);
            this.db.run(`UPDATE agent_tasks SET ${fields.join(', ')} WHERE id = ?`, values);
            await this.save();
        }
    }

    // ============================================
    // AGENT FLEET: AGENT COSTS
    // ============================================

    async createAgentCost(cost) {
        this.db.run(`
            INSERT INTO agent_costs (id, agent_id, task_id, provider, model, input_tokens, output_tokens, cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            cost.id,
            cost.agent_id,
            cost.task_id || null,
            cost.provider,
            cost.model,
            cost.input_tokens || 0,
            cost.output_tokens || 0,
            cost.cost
        ]);
        await this.save();
    }

    getAgentCosts(agentId, period = 'day') {
        let timeFilter = '';
        const now = Math.floor(Date.now() / 1000);

        if (period === 'hour') {
            timeFilter = `AND timestamp >= ${now - 3600}`;
        } else if (period === 'day') {
            timeFilter = `AND timestamp >= ${now - 86400}`;
        } else if (period === 'week') {
            timeFilter = `AND timestamp >= ${now - 604800}`;
        } else if (period === 'month') {
            timeFilter = `AND timestamp >= ${now - 2592000}`;
        }

        const stmt = this.db.prepare(`
            SELECT * FROM agent_costs
            WHERE agent_id = :agent_id ${timeFilter}
            ORDER BY timestamp DESC
        `);
        stmt.bind({ ':agent_id': agentId });
        const costs = [];
        while (stmt.step()) {
            costs.push(stmt.getAsObject());
        }
        stmt.free();
        return costs;
    }

    async getTotalAgentCost(agentId, period = 'day') {
        const costs = this.getAgentCosts(agentId, period);
        return costs.reduce((sum, c) => sum + c.cost, 0);
    }

    getCostSummary(period = 'day') {
        let timeFilter = '';
        const now = Math.floor(Date.now() / 1000);

        if (period === 'hour') {
            timeFilter = `WHERE timestamp >= ${now - 3600}`;
        } else if (period === 'day') {
            timeFilter = `WHERE timestamp >= ${now - 86400}`;
        } else if (period === 'week') {
            timeFilter = `WHERE timestamp >= ${now - 604800}`;
        } else if (period === 'month') {
            timeFilter = `WHERE timestamp >= ${now - 2592000}`;
        }

        const stmt = this.db.prepare(`
            SELECT
                agent_id,
                provider,
                model,
                SUM(input_tokens) as total_input_tokens,
                SUM(output_tokens) as total_output_tokens,
                SUM(cost) as total_cost,
                COUNT(*) as request_count
            FROM agent_costs
            ${timeFilter}
            GROUP BY agent_id, provider, model
        `);

        const summary = [];
        while (stmt.step()) {
            summary.push(stmt.getAsObject());
        }
        stmt.free();
        return summary;
    }

    // ============================================
    // AGENT FLEET: AGENT BUDGETS
    // ============================================

    async createAgentBudget(budget) {
        this.db.run(`
            INSERT INTO agent_budgets (id, agent_id, pool_id, limit, period, current_spent, alert_threshold)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            budget.id,
            budget.agent_id || null,
            budget.pool_id || null,
            budget.limit,
            budget.period,
            budget.current_spent || 0,
            budget.alert_threshold || 0.8
        ]);
        await this.save();
    }

    getAgentBudget(agentId) {
        const stmt = this.db.prepare('SELECT * FROM agent_budgets WHERE agent_id = :agent_id');
        const budget = stmt.getAsObject({ ':agent_id': agentId });
        stmt.free();
        return budget;
    }

    getAllBudgets() {
        const stmt = this.db.prepare('SELECT * FROM agent_budgets');
        const budgets = [];
        while (stmt.step()) {
            budgets.push(stmt.getAsObject());
        }
        stmt.free();
        return budgets;
    }

    async updateBudgetSpent(agentId, amount) {
        this.db.run(`
            UPDATE agent_budgets SET current_spent = current_spent + ?
            WHERE agent_id = ?
        `, [amount, agentId]);
        await this.save();
    }

    // ============================================
    // AGENT FLEET: DEV MODE ACTIVITY
    // ============================================

    async createAgentSession(session) {
        this.db.run(`
            INSERT INTO agent_sessions (id, trigger_type)
            VALUES (?, ?)
        `, [session.id, session.trigger_type || 'manual']);
        await this.save();
        return session.id;
    }

    async logDevModeActivity(sessionId, activityType, data) {
        this.db.run(`
            INSERT INTO dev_mode_activity (session_id, activity_type, data)
            VALUES (?, ?, ?)
        `, [sessionId || null, activityType, JSON.stringify(data || {})]);
        await this.save();
    }

    getRecentDevModeActivity(limit = 100) {
        const stmt = this.db.prepare(`
            SELECT * FROM dev_mode_activity
            ORDER BY timestamp DESC
            LIMIT :limit
        `);
        stmt.bind({ ':limit': limit });
        const activities = [];
        while (stmt.step()) {
            const activity = stmt.getAsObject();
            activity.data = JSON.parse(activity.data || '{}');
            activities.push(activity);
        }
        stmt.free();
        return activities;
    }

    // ============================================
    // AGENT FLEET: OBSERVABILITY
    // ============================================

    async logObservabilityMetric(agentId, metricType, metricValue, metricUnit = '', tags = {}) {
        this.db.run(`
            INSERT INTO observability_metrics (agent_id, metric_type, metric_value, metric_unit, tags)
            VALUES (?, ?, ?, ?, ?)
        `, [agentId, metricType, metricValue, metricUnit, JSON.stringify(tags)]);
        await this.save();
    }

    getObservabilityMetrics(agentId, metricType = null) {
        let query = 'SELECT * FROM observability_metrics WHERE agent_id = :agent_id';
        const params = { ':agent_id': agentId };

        if (metricType) {
            query += ' AND metric_type = :metric_type';
            params[':metric_type'] = metricType;
        }

        query += ' ORDER BY timestamp DESC LIMIT 1000';

        const stmt = this.db.prepare(query);
        stmt.bind(params);
        const metrics = [];
        while (stmt.step()) {
            const metric = stmt.getAsObject();
            metric.tags = JSON.parse(metric.tags || '{}');
            metrics.push(metric);
        }
        stmt.free();
        return metrics;
    }

    async logObservabilityLog(agentId, level, message, data = {}) {
        this.db.run(`
            INSERT INTO observability_logs (agent_id, level, message, data)
            VALUES (?, ?, ?, ?)
        `, [agentId || null, level, message, JSON.stringify(data)]);
        await this.save();
    }

    getObservabilityLogs(agentId = null, level = null, limit = 100) {
        let query = 'SELECT * FROM observability_logs';
        const params = { ':limit': limit };
        const conditions = [];

        if (agentId) {
            conditions.push('agent_id = :agent_id');
            params[':agent_id'] = agentId;
        }
        if (level) {
            conditions.push('level = :level');
            params[':level'] = level;
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY timestamp DESC LIMIT :limit';

        const stmt = this.db.prepare(query);
        stmt.bind(params);
        const logs = [];
        while (stmt.step()) {
            const log = stmt.getAsObject();
            log.data = JSON.parse(log.data || '{}');
            logs.push(log);
        }
        stmt.free();
        return logs;
    }

    async createObservabilityAlert(alertType, severity, agentId, message, data = {}) {
        this.db.run(`
            INSERT INTO observability_alerts (alert_type, severity, agent_id, message, data)
            VALUES (?, ?, ?, ?, ?)
        `, [alertType, severity, agentId || null, message, JSON.stringify(data)]);
        await this.save();
    }

    getObservabilityAlerts(acknowledgedOnly = false) {
        let query = 'SELECT * FROM observability_alerts';
        if (!acknowledgedOnly) {
            query += ' WHERE acknowledged = 0';
        }
        query += ' ORDER BY created_at DESC';

        const stmt = this.db.prepare(query);
        const alerts = [];
        while (stmt.step()) {
            const alert = stmt.getAsObject();
            alert.data = JSON.parse(alert.data || '{}');
            alerts.push(alert);
        }
        stmt.free();
        return alerts;
    }

    async acknowledgeAlert(alertId) {
        this.db.run(`
            UPDATE observability_alerts SET acknowledged = 1, acknowledged_at = ?
            WHERE id = ?
        `, [Math.floor(Date.now() / 1000), alertId]);
        await this.save();
    }

    // ============================================
    // UTILITY
    // ============================================

    getReposPath() {
        return REPOS_DIR;
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

// Singleton instance
const db = new DatabaseManager();

module.exports = db;
