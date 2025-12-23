-- Finallica Multi-Repository Documentation Platform
-- Database Schema

-- ============================================
-- REPOSITORIES
-- ============================================
CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL, -- 'github', 'gitlab', 'bitbucket', 'https', 'ssh', 'zip', 'api'
    url TEXT,
    clone_url TEXT,
    branch TEXT DEFAULT 'main',
    description TEXT,
    tags TEXT, -- JSON array
    status TEXT DEFAULT 'pending', -- 'pending', 'cloning', 'active', 'error', 'archived'
    is_private BOOLEAN DEFAULT 0,
    auth_token_id TEXT,
    local_path TEXT,
    last_commit_hash TEXT,
    last_sync_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    stats TEXT -- JSON: {fileCount, markdownCount, totalSize}
);

CREATE INDEX idx_repos_status ON repositories(status);
CREATE INDEX idx_repos_source_type ON repositories(source_type);

-- ============================================
-- REPOSITORY FILES (indexed documents)
-- ============================================
CREATE TABLE IF NOT EXISTS repository_files (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    path TEXT NOT NULL,
    filename TEXT NOT NULL,
    extension TEXT,
    content_hash TEXT,
    size INTEGER,
    title TEXT,
    indexed_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_document BOOLEAN DEFAULT 1,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX idx_repo_files_repo ON repository_files(repository_id);
CREATE INDEX idx_repo_files_path ON repository_files(path);

-- ============================================
-- COLLECTIONS (curated repo groups)
-- ============================================
CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    is_featured BOOLEAN DEFAULT 0,
    is_public BOOLEAN DEFAULT 1,
    repository_ids TEXT, -- JSON array
    tags TEXT, -- JSON array
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- ============================================
-- SUBMISSIONS (user-submitted repos)
-- ============================================
CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY,
    repository_id TEXT,
    submitter_name TEXT,
    submitter_email TEXT,
    submitter_note TEXT,
    repo_url TEXT NOT NULL,
    repo_name TEXT,
    repo_description TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'needs_review'
    submitted_at INTEGER DEFAULT (strftime('%s', 'now')),
    reviewed_at INTEGER,
    reviewed_by TEXT,
    review_note TEXT,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE SET NULL
);

CREATE INDEX idx_submissions_status ON submissions(status);

-- ============================================
-- SYNC JOBS (background sync tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_jobs (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    status TEXT DEFAULT 'queued', -- 'queued', 'running', 'completed', 'failed'
    started_at INTEGER,
    completed_at INTEGER,
    duration_ms INTEGER,
    files_added INTEGER DEFAULT 0,
    files_modified INTEGER DEFAULT 0,
    files_deleted INTEGER DEFAULT 0,
    error_message TEXT,
    trigger_type TEXT, -- 'scheduled', 'manual', 'webhook'
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_jobs_repo ON sync_jobs(repository_id);
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);

-- ============================================
-- SYNC SCHEDULE (scheduler configuration)
-- ============================================
CREATE TABLE IF NOT EXISTS sync_schedule (
    id INTEGER PRIMARY KEY,
    is_enabled BOOLEAN DEFAULT 1,
    interval_minutes INTEGER DEFAULT 30,
    max_concurrent_jobs INTEGER DEFAULT 3,
    retry_attempts INTEGER DEFAULT 3,
    retry_delay_minutes INTEGER DEFAULT 5,
    last_run_at INTEGER,
    next_run_at INTEGER
);

-- Insert default schedule
INSERT OR IGNORE INTO sync_schedule (id, is_enabled, interval_minutes, max_concurrent_jobs)
VALUES (1, 1, 30, 3);

-- ============================================
-- AUTH TOKENS (for private repos)
-- ============================================
CREATE TABLE IF NOT EXISTS auth_tokens (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL, -- 'github', 'gitlab', 'bitbucket', 'notion', 'confluence'
    token_name TEXT,
    token_value_encrypted TEXT,
    iv TEXT,
    auth_tag TEXT,
    username TEXT,
    scope TEXT, -- JSON array
    is_active BOOLEAN DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_used_at INTEGER
);

-- ============================================
-- DISCOVERY RULES (auto-import rules)
-- ============================================
CREATE TABLE IF NOT EXISTS discovery_rules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source TEXT NOT NULL, -- 'github', 'gitlab'
    query TEXT NOT NULL,
    topics TEXT, -- JSON array
    language TEXT,
    stars_min INTEGER,
    forks_min INTEGER,
    updated_within_days INTEGER,
    auto_add BOOLEAN DEFAULT 0,
    target_collection_id TEXT,
    last_run_at INTEGER,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY (target_collection_id) REFERENCES collections(id) ON DELETE SET NULL
);

-- ============================================
-- ACTIVITY LOG (audit trail)
-- ============================================
CREATE TABLE IF NOT EXISTS activity_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id TEXT,
    user_id TEXT,
    details TEXT, -- JSON
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created ON activity_log(created_at);
