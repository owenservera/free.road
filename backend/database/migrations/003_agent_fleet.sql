-- ============================================
-- AGENT FLEET SYSTEM MIGRATION
-- Version: 003
-- Description: Database schema for governance agent fleet
-- ============================================

-- ============================================
-- API KEY POOLS
-- Stores API key pools for different agent tiers
-- ============================================
CREATE TABLE IF NOT EXISTS api_key_pools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    priority INTEGER DEFAULT 0,
    keys_json TEXT NOT NULL, -- JSON: { provider: [keys] }
    budget_limit REAL,
    budget_period TEXT, -- 'hourly', 'daily', 'weekly', 'monthly'
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX idx_api_key_pools_priority ON api_key_pools(priority);

-- ============================================
-- AGENTS
-- Stores agent instances
-- ============================================
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL, -- 'code_review', 'doc_gen', 'debugger', 'governance', 'repo_manager', 'tooling', 'visualization', 'cost_observability', 'coordinator'
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT DEFAULT 'idle', -- 'idle', 'busy', 'error', 'terminated'
    pool_id TEXT,
    current_task_id TEXT,
    spawned_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_heartbeat_at INTEGER,
    terminated_at INTEGER,
    config_json TEXT, -- Agent-specific configuration
    FOREIGN KEY (pool_id) REFERENCES api_key_pools(id) ON DELETE SET NULL
);

CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_agents_type ON agents(agent_type);
CREATE INDEX idx_agents_pool ON agents(pool_id);

-- ============================================
-- AGENT TASKS
-- Stores tasks in the agent queue
-- ============================================
CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    agent_type TEXT NOT NULL,
    task_type TEXT NOT NULL, -- 'code_review', 'doc_gen', 'dependency_check', 'security_scan', 'tooling_suggest', 'visualization', 'cost_monitor'
    task_data TEXT NOT NULL, -- JSON: task payload
    priority INTEGER DEFAULT 5, -- 1-10, 10 highest
    status TEXT DEFAULT 'queued', -- 'queued', 'running', 'completed', 'failed', 'failed_permanent'
    result_json TEXT, -- Task result
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    started_at INTEGER,
    completed_at INTEGER,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX idx_agent_tasks_priority ON agent_tasks(priority DESC, created_at);
CREATE INDEX idx_agent_tasks_agent ON agent_tasks(agent_id);

-- ============================================
-- AGENT COSTS
-- Tracks costs per agent
-- ============================================
CREATE TABLE IF NOT EXISTS agent_costs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    task_id TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cost REAL NOT NULL,
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL
);

CREATE INDEX idx_agent_costs_agent ON agent_costs(agent_id);
CREATE INDEX idx_agent_costs_timestamp ON agent_costs(timestamp DESC);
CREATE INDEX idx_agent_costs_provider_model ON agent_costs(provider, model);

-- ============================================
-- AGENT BUDGETS
-- Budget limits per agent or pool
-- ============================================
CREATE TABLE IF NOT EXISTS agent_budgets (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    pool_id TEXT,
    "limit" REAL NOT NULL,
    period TEXT NOT NULL, -- 'hourly', 'daily', 'weekly', 'monthly'
    current_spent REAL DEFAULT 0,
    alert_threshold REAL DEFAULT 0.8, -- Alert at 80%
    alert_sent BOOLEAN DEFAULT 0,
    period_start INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (pool_id) REFERENCES api_key_pools(id) ON DELETE CASCADE
);

CREATE INDEX idx_agent_budgets_agent ON agent_budgets(agent_id);
CREATE INDEX idx_agent_budgets_pool ON agent_budgets(pool_id);

-- ============================================
-- AGENT SESSIONS
-- Tracks development mode sessions
-- ============================================
CREATE TABLE IF NOT EXISTS agent_sessions (
    id TEXT PRIMARY KEY,
    started_at INTEGER DEFAULT (strftime('%s', 'now')),
    ended_at INTEGER,
    trigger_type TEXT, -- 'dev_mode_detected', 'manual', 'scheduled'
    activity_count INTEGER DEFAULT 0,
    agents_spawned INTEGER DEFAULT 0,
    tasks_completed INTEGER DEFAULT 0,
    total_cost REAL DEFAULT 0
);

CREATE INDEX idx_agent_sessions_started ON agent_sessions(started_at DESC);

-- ============================================
-- REPOSITORY ANALYSIS
-- Stores analysis results for repositories
-- ============================================
CREATE TABLE IF NOT EXISTS repo_analysis (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    analysis_type TEXT NOT NULL, -- 'dependencies', 'security', 'dead_code', 'complexity', 'quality'
    result_json TEXT NOT NULL,
    severity TEXT, -- 'critical', 'high', 'medium', 'low', 'info'
    analyzed_at INTEGER DEFAULT (strftime('%s', 'now')),
    is_resolved BOOLEAN DEFAULT 0,
    resolved_at INTEGER,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX idx_repo_analysis_type ON repo_analysis(analysis_type);
CREATE INDEX idx_repo_analysis_severity ON repo_analysis(severity);
CREATE INDEX idx_repo_analysis_repo ON repo_analysis(repository_id);

-- ============================================
-- DEPENDENCIES
-- Tracks dependencies for repositories
-- ============================================
CREATE TABLE IF NOT EXISTS dependencies (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    ecosystem TEXT NOT NULL, -- 'npm', 'pip', 'cargo', 'go', 'composer', 'maven'
    is_dev_dependency BOOLEAN DEFAULT 0,
    latest_version TEXT,
    has_security_vulnerability BOOLEAN DEFAULT 0,
    vulnerability_details TEXT, -- JSON: vulnerability info
    last_checked_at INTEGER,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX idx_dependencies_repo ON dependencies(repository_id);
CREATE INDEX idx_dependencies_vuln ON dependencies(has_security_vulnerability);
CREATE INDEX idx_dependencies_name ON dependencies(name);

-- ============================================
-- TOOLING SUGGESTIONS
-- Suggested tools for repositories
-- ============================================
CREATE TABLE IF NOT EXISTS tooling_suggestions (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_type TEXT NOT NULL, -- 'linter', 'formatter', 'test_framework', 'ci_cd', 'build_tool'
    priority TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
    reason TEXT,
    install_command TEXT,
    config_template TEXT,
    status TEXT DEFAULT 'suggested', -- 'suggested', 'accepted', 'rejected', 'installed'
    suggested_at INTEGER DEFAULT (strftime('%s', 'now')),
    responded_at INTEGER,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX idx_tooling_suggestions_repo ON tooling_suggestions(repository_id);
CREATE INDEX idx_tooling_suggestions_status ON tooling_suggestions(status);
CREATE INDEX idx_tooling_suggestions_priority ON tooling_suggestions(priority);

-- ============================================
-- DOCS PUBLICATIONS
-- Generated documentation publications
-- ============================================
CREATE TABLE IF NOT EXISTS docs_publications (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    doc_type TEXT NOT NULL, -- 'api', 'architecture', 'readme', 'contributing'
    content TEXT NOT NULL,
    format TEXT NOT NULL, -- 'markdown', 'html', 'json'
    platform TEXT, -- 'github-wiki', 'confluence', 'notion'
    platform_url TEXT,
    published_at INTEGER,
    generated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX idx_docs_publications_repo ON docs_publications(repository_id);
CREATE INDEX idx_docs_publications_type ON docs_publications(doc_type);

-- ============================================
-- KNOWLEDGE BASE
-- Knowledge base entries for agents
-- ============================================
CREATE TABLE IF NOT EXISTS knowledge_base (
    id TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT, -- JSON array
    embedding_id TEXT, -- For semantic search
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE
);

CREATE INDEX idx_knowledge_base_repo ON knowledge_base(repository_id);
CREATE INDEX idx_knowledge_base_tags ON knowledge_base(tags);

-- ============================================
-- DEV MODE ACTIVITY
-- Activity tracking for dev mode detection
-- ============================================
CREATE TABLE IF NOT EXISTS dev_mode_activity (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    activity_type TEXT NOT NULL, -- 'file_change', 'git_commit', 'claude_code_activity'
    data TEXT NOT NULL, -- JSON: activity details
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE SET NULL
);

CREATE INDEX idx_dev_mode_activity_timestamp ON dev_mode_activity(timestamp DESC);
CREATE INDEX idx_dev_mode_activity_session ON dev_mode_activity(session_id);
CREATE INDEX idx_dev_mode_activity_type ON dev_mode_activity(activity_type);

-- ============================================
-- OBSERVABILITY METRICS
-- Agent performance and health metrics
-- ============================================
CREATE TABLE IF NOT EXISTS observability_metrics (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    metric_type TEXT NOT NULL, -- 'task_duration', 'token_usage', 'error_rate', 'success_rate'
    metric_value REAL NOT NULL,
    metric_unit TEXT,
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    tags TEXT, -- JSON: additional metadata
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX idx_observability_metrics_agent ON observability_metrics(agent_id);
CREATE INDEX idx_observability_metrics_type ON observability_metrics(metric_type);
CREATE INDEX idx_observability_metrics_timestamp ON observability_metrics(timestamp DESC);

-- ============================================
-- OBSERVABILITY LOGS
-- Agent logs
-- ============================================
CREATE TABLE IF NOT EXISTS observability_logs (
    id TEXT PRIMARY KEY,
    agent_id TEXT,
    level TEXT NOT NULL, -- 'debug', 'info', 'warn', 'error'
    message TEXT NOT NULL,
    data TEXT, -- JSON: additional context
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX idx_observability_logs_agent ON observability_logs(agent_id);
CREATE INDEX idx_observability_logs_level ON observability_logs(level);
CREATE INDEX idx_observability_logs_timestamp ON observability_logs(timestamp DESC);

-- ============================================
-- OBSERVABILITY ALERTS
-- Cost and performance alerts
-- ============================================
CREATE TABLE IF NOT EXISTS observability_alerts (
    id TEXT PRIMARY KEY,
    alert_type TEXT NOT NULL, -- 'budget_exceeded', 'anomaly_detected', 'agent_error', 'rate_limit_risk'
    severity TEXT NOT NULL, -- 'critical', 'high', 'medium', 'low'
    agent_id TEXT,
    message TEXT NOT NULL,
    data TEXT, -- JSON: alert details
    acknowledged BOOLEAN DEFAULT 0,
    acknowledged_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

CREATE INDEX idx_observability_alerts_type ON observability_alerts(alert_type);
CREATE INDEX idx_observability_alerts_severity ON observability_alerts(severity);
CREATE INDEX idx_observability_alerts_acknowledged ON observability_alerts(acknowledged);
CREATE INDEX idx_observability_alerts_created ON observability_alerts(created_at DESC);
