-- Migration: Add Share and Command System
-- This adds OpenCode-style share functionality and custom commands

-- ============================================
-- SHARED SESSIONS (like opencode.ai/s/<id>)
-- ============================================
CREATE TABLE IF NOT EXISTS shared_sessions (
    id TEXT PRIMARY KEY,              -- Unique share ID (e.g., "abc123xyz")
    session_id TEXT NOT NULL,         -- Agent fleet session ID
    title TEXT,
    is_public BOOLEAN DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER,               -- Optional expiration (0 = never)
    view_count INTEGER DEFAULT 0,
    metadata TEXT                     -- JSON: tags, description, etc.
);

CREATE INDEX IF NOT EXISTS idx_shared_sessions_session ON shared_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_shared_sessions_public ON shared_sessions(is_public);

-- ============================================
-- SHARED MESSAGES (conversation history)
-- ============================================
CREATE TABLE IF NOT EXISTS shared_messages (
    id TEXT PRIMARY KEY,
    share_id TEXT NOT NULL,
    role TEXT NOT NULL,               -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    tool_calls TEXT,                  -- JSON: tool invocations
    timestamp INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (share_id) REFERENCES shared_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shared_messages_share ON shared_messages(share_id);

-- ============================================
-- CUSTOM COMMANDS (like OpenCode .opencode/command/*.md)
-- ============================================
CREATE TABLE IF NOT EXISTS custom_commands (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    agent_type TEXT,                  -- Which agent handles this
    model TEXT,                       -- Override model
    template TEXT NOT NULL,           -- Prompt template
    is_system BOOLEAN DEFAULT 0,      -- Built-in vs user-created
    created_by TEXT,                  -- User ID
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_custom_commands_agent ON custom_commands(agent_type);

-- ============================================
-- USER SHARE PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS share_preferences (
    user_id TEXT PRIMARY KEY,
    auto_share_mode TEXT DEFAULT 'manual',  -- 'manual', 'auto', 'disabled'
    default_expiration_hours INTEGER DEFAULT 0,  -- 0 = never
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- ============================================
-- INSERT BUILT-IN COMMANDS
-- ============================================
INSERT OR IGNORE INTO custom_commands (id, name, description, agent_type, template, is_system) VALUES
    ('cmd_review', 'review', 'Review code changes', 'code_review', 'Review the following code changes:\n\n$ARGUMENTS\n\nFocus on:\n- Code quality and style\n- Potential bugs\n- Performance issues\n- Security concerns\n\nProvide actionable feedback.', 1),

    ('cmd_docs', 'docs', 'Generate documentation', 'documentation', 'Generate documentation for:\n\n$ARGUMENTS\n\nInclude:\n- Overview\n- API reference\n- Usage examples\n- Parameters and return types', 1),

    ('cmd_test', 'test', 'Run and analyze tests', 'tooling', '!`bun test`\n\nAnalyze the test results above. Identify:\n1. Failing tests and why they fail\n2. Coverage gaps\n3. Suggestions to improve test quality', 1),

    ('cmd_debug', 'debug', 'Debug an issue', 'debugger', 'Help debug the following issue:\n\n$ARGUMENTS\n\nSteps:\n1. Identify the root cause\n2. Explain what''s happening\n3. Propose a fix\n4. Suggest how to prevent similar issues', 1),

    ('cmd_init', 'init', 'Initialize project context', 'documentation', 'Project context for $ARGUMENTS:\n\n!`ls -la`\n\nPackage.json:\n@package.json\n\nREADME:\n@README.md\n\nProvide a summary of this project.', 1);
