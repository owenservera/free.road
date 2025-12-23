// Finallica Documentation System - Backend Server
// This handles API routes, WebSocket, Git integration, and consensus logic

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const simpleGit = require('simple-git');
const diff = require('diff');
const fs = require('fs').promises;
const path = require('path');

// Load environment variables from .env file
require('dotenv').config();

// Multi-Repository System
const db = require('./database');
const GitSyncService = require('./services/git-sync');
const RepositoryService = require('./services/repository-service');
const createRepositoryRoutes = require('./routes/repositories');
const createCollectionRoutes = require('./routes/collections');

// Privacy Service
const PrivacyService = require('./services/privacy-service');

// AI Services (2025 Upgrade)
const AIProviderService = require('./services/ai-provider-service');
const StreamingService = require('./services/streaming-service');
const createAIRoutes = require('./routes/ai');

// MCP Services (Model Context Protocol)
const MCPPassport = require('./services/mcp-passport');
const MCPClient = require('./services/mcp-client');
const createMCPRoutes = require('./routes/mcp');

// Context7 Server (Self-hosted documentation MCP server)
const Context7Server = require('./services/context7-server');
const createContext7Routes = require('./routes/context7');

// Documentation Indexing & Suggestions
const DocIndexer = require('./services/doc-indexer');
const RepoSuggesterService = require('./services/repo-suggester');
const createSuggestionRoutes = require('./routes/suggestions');

// ============================================
// AGENT FLEET SYSTEM (2025 Upgrade)
// ============================================

const APIKeyPool = require('./services/api-key-pool');
const BudgetManager = require('./services/budget-manager');
const AgentFleetService = require('./services/agent-fleet-service');
const AgentScheduler = require('./services/agent-scheduler');

// ============================================
// SHARE & COMMAND SYSTEM (OpenCode-style)
// ============================================

const ShareService = require('./services/share-service');
const CommandRegistry = require('./services/command-registry');
const createShareRoutes = require('./routes/share');
const createCommandRoutes = require('./routes/commands');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const DOCS_PATH = path.join(__dirname, '../docs/finallica');

// Configuration
const CONFIG = {
    VOTING_PERIOD: 7 * 24 * 60 * 60 * 1000, // 7 days
    QUORUM_PCT: 0.67, // 67%
    MIN_STAKE_PROPOSAL: 1000,
    MIN_STAKE_VR: 500000,
    MIN_STAKE_SE: 2000000,
    // AI Provider: 'claude' (Anthropic), 'openai', or 'demo'
    AI_PROVIDER: process.env.AI_PROVIDER || 'demo',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    // Privacy Configuration
    PRIVACY_ENABLED: process.env.PRIVACY_ENABLED === 'true',
    PRIVACY_ROUTER_ADDRESS: process.env.PRIVACY_ROUTER_ADDRESS || '',
    RPC_URL: process.env.RPC_URL || 'http://localhost:8545',
    RELAYER_URL: process.env.RELAYER_URL || ''
};

// State
const state = {
    documents: {},
    proposals: {},
    consensus: {
        blockNumber: 18492,
        epoch: 1,
        totalStake: 18432000, // BLF
        votesFor: 12345000,
        votesAgainst: 2100000,
        quorum: 12345600, // 67% of total
        totalVotes: 14445000,
        items: []
    },
    activity: [],
    clients: new Set()
};

// ============================================
// MULTI-REPOSITORY SYSTEM INITIALIZATION
// ============================================

let gitSync, repositoryService;

async function initializeRepositorySystem() {
    try {
        // Initialize database
        await db.initialize();

        // Run migrations
        await db.runMigrations();

        // Initialize services
        gitSync = new GitSyncService(db);
        repositoryService = new RepositoryService(db, gitSync);

        // Register routes
        app.use('/api/repositories', createRepositoryRoutes(db, repositoryService, gitSync));
        app.use('/api/collections', createCollectionRoutes(db));

        console.log('Multi-repository system initialized');
    } catch (error) {
        console.error('Failed to initialize repository system:', error);
    }
}

// ============================================
// AGENT FLEET SYSTEM INITIALIZATION
// ============================================

let apiKeyPool, budgetManager, agentFleet, scheduler;

async function initializeAgentFleetSystem() {
    // Only initialize if enabled
    if (process.env.AGENT_FLEET_ENABLED !== 'true') {
        console.log('Agent Fleet System: disabled (set AGENT_FLEET_ENABLED=true to enable)');
        return;
    }

    try {
        // Initialize services
        apiKeyPool = new APIKeyPool(db);
        await apiKeyPool.initialize();

        budgetManager = new BudgetManager(db, apiKeyPool);
        await budgetManager.initialize();

        agentFleet = new AgentFleetService(db, apiKeyPool, budgetManager);

        // Initialize the task scheduler with agent fleet service
        scheduler = new AgentScheduler(db, apiKeyPool, budgetManager, agentFleet, {
            concurrency: parseInt(process.env.AGENT_CONCURRENT_LIMIT || '3'),
            maxRetries: parseInt(process.env.AGENT_MAX_RETRIES || '3'),
            pollingInterval: parseInt(process.env.AGENT_SCHEDULER_POLLING_INTERVAL || '5000')
        });

        // Get project path for dev mode detection
        const projectPath = process.cwd();
        await agentFleet.initialize(projectPath);

        // Auto-start if configured
        if (process.env.AGENT_FLEET_AUTO_START === 'true') {
            await agentFleet.start();
            await scheduler.start();
        }

        // Register agent fleet routes
        app.get('/api/agent-fleet/status', (req, res) => {
            res.json(agentFleet.getStatus());
        });

        app.post('/api/agent-fleet/start', async (req, res) => {
            const { agents } = req.body;
            const result = await agentFleet.start(agents);
            res.json(result);
        });

        app.post('/api/agent-fleet/stop', async (req, res) => {
            const result = await agentFleet.stop();
            res.json(result);
        });

        app.get('/api/agents', (req, res) => {
            const agents = db.getAllAgents();
            res.json({ agents });
        });

        app.post('/api/agents/:id/terminate', async (req, res) => {
            try {
                await agentFleet.terminateAgent(req.params.id);
                res.json({ success: true });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.get('/api/agents/:id/tasks', (req, res) => {
            const tasks = db.getAgentTasks(req.params.id);
            res.json({ tasks });
        });

        // Cost routes
        app.get('/api/costs/summary', (req, res) => {
            const { period = 'day' } = req.query;
            res.json(budgetManager.getCostSummary(period));
        });

        app.get('/api/costs/by-agent', (req, res) => {
            const { agentId, period = 'day' } = req.query;
            res.json(budgetManager.getCostBreakdown(agentId, period));
        });

        app.get('/api/costs/timeline', (req, res) => {
            const { agentId, days = 7 } = req.query;
            budgetManager.getCostTimeline(agentId, days).then(timeline => {
                res.json({ timeline });
            });
        });

        app.get('/api/costs/anomalies', async (req, res) => {
            const { agentId, threshold = 2.0 } = req.query;
            const anomalies = await budgetManager.detectAnomalies(agentId, threshold);
            res.json(anomalies);
        });

        app.get('/api/costs/optimization-suggestions', async (req, res) => {
            const suggestions = await budgetManager.getOptimizationSuggestions();
            res.json({ suggestions });
        });

        app.post('/api/budgets/set', async (req, res) => {
            const { agentId, poolId, limit, period, alertThreshold } = req.body;
            let budget;
            if (agentId) {
                budget = await budgetManager.setBudget(agentId, limit, period, alertThreshold);
            } else if (poolId) {
                budget = await budgetManager.setPoolBudget(poolId, limit, period, alertThreshold);
            } else {
                return res.status(400).json({ error: 'Either agentId or poolId required' });
            }
            res.json({ budget });
        });

        app.get('/api/budgets/status', (req, res) => {
            const budgets = db.getAllBudgets();
            res.json({ budgets });
        });

        // Observability routes
        app.get('/api/observability/metrics', (req, res) => {
            const { agentId } = req.query;
            const metrics = db.getObservabilityMetrics(agentId);
            res.json({ metrics });
        });

        app.get('/api/observability/logs', (req, res) => {
            const { agentId, level, limit = 100 } = req.query;
            const logs = db.getObservabilityLogs(agentId, level, limit);
            res.json({ logs });
        });

        app.get('/api/observability/alerts', (req, res) => {
            const alerts = db.getObservabilityAlerts(false);
            res.json({ alerts });
        });

        app.post('/api/observability/alerts/:id/acknowledge', async (req, res) => {
            await db.acknowledgeAlert(req.params.id);
            res.json({ success: true });
        });

        app.get('/api/observability/health', async (req, res) => {
            const fleetStatus = agentFleet.getStatus();
            const health = {
                healthy: fleetStatus.isRunning,
                agents: fleetStatus.agents.map(a => ({
                    id: a.id,
                    type: a.agentType,
                    status: a.status,
                    uptime: Date.now() - a.spawnedAt
                }))
            };
            res.json(health);
        });

        // Task queue routes
        app.post('/api/tasks/queue', async (req, res) => {
            const { agentType, taskType, taskData, priority } = req.body;
            const taskId = await agentFleet.queueTask(agentType, taskType, taskData, priority);
            res.json({ taskId });
        });

        app.get('/api/tasks/pending', (req, res) => {
            const { limit = 50 } = req.query;
            const tasks = db.getPendingTasks(limit);
            res.json({ tasks });
        });

        // Share & Command integration with Agent Fleet
        app.post('/api/agent-fleet/share', async (req, res) => {
            try {
                const { title, isPublic, expirationHours } = req.body;
                const share = await agentFleet.shareSession({ title, isPublic, expirationHours });
                res.json({ success: true, share });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.get('/api/agent-fleet/share', async (req, res) => {
            try {
                const currentShare = agentFleet.getCurrentShare();
                res.json({ share: currentShare });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.delete('/api/agent-fleet/share', async (req, res) => {
            try {
                const unshared = await agentFleet.unshareSession();
                res.json({ success: unshared });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.get('/api/agent-fleet/messages', async (req, res) => {
            try {
                const messages = agentFleet.getSessionMessages();
                res.json({ messages });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.post('/api/agent-fleet/commands/:name/execute', async (req, res) => {
            try {
                const { args } = req.body;
                const result = await agentFleet.executeCommand(req.params.name, args || {});
                res.json({ success: true, result });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        app.get('/api/agent-fleet/commands', async (req, res) => {
            try {
                const { agentType } = req.query;
                const commands = await agentFleet.listCommands(agentType);
                res.json({ commands });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        console.log('Agent Fleet System initialized');
    } catch (error) {
        console.error('Failed to initialize Agent Fleet System:', error);
    }
}

// ============================================
// SHARE & COMMAND SYSTEM INITIALIZATION
// ============================================

let shareService, commandRegistry;

async function initializeShareAndCommandSystem() {
    try {
        // Initialize Share Service
        shareService = new ShareService(db);

        // Initialize Command Registry
        commandRegistry = new CommandRegistry(db);
        await commandRegistry.initialize();

        // Wire up share services to agent fleet if it exists
        if (agentFleet) {
            agentFleet.setShareServices(shareService, commandRegistry);
        }

        // Register Share routes
        app.use('/api/share', createShareRoutes(shareService));

        // Register Command routes
        app.use('/api/commands', createCommandRoutes(commandRegistry));

        // Public share view (no auth required)
        app.get('/s/:id', async (req, res) => {
            try {
                const share = await shareService.getShare(req.params.id);

                if (!share) {
                    return res.status(404).send(`
                        <!DOCTYPE html>
                        <html>
                        <head><title>Share Not Found</title></head>
                        <body>
                            <h1>Share Not Found</h1>
                            <p>This share may have expired or been deleted.</p>
                            <a href="/">Go to Finallica</a>
                        </body>
                        </html>
                    `);
                }

                // Record view
                await shareService.recordView(req.params.id);

                const messages = await shareService.getShareMessages(req.params.id);

                // Send HTML view
                res.send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Shared Session: ${share.title || share.id}</title>
                        <style>
                            body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                            .header { border-bottom: 1px solid #ddd; padding-bottom: 20px; margin-bottom: 20px; }
                            .message { margin: 20px 0; padding: 15px; border-radius: 8px; }
                            .message.user { background: #f0f0f0; }
                            .message.assistant { background: #e3f2fd; }
                            .message.system { background: #fff3e0; font-style: italic; }
                            .role { font-weight: bold; color: #666; font-size: 0.9em; }
                            .content { margin-top: 8px; white-space: pre-wrap; }
                            .metadata { color: #999; font-size: 0.85em; }
                        </style>
                    </head>
                    <body>
                        <div class="header">
                            <h1>${share.title || 'Shared Session'}</h1>
                            <p class="metadata">
                                Created: ${new Date(share.created_at * 1000).toLocaleString()} |
                                Views: ${share.view_count}
                            </p>
                        </div>
                        ${messages.map(msg => `
                            <div class="message ${msg.role}">
                                <div class="role">${msg.role}</div>
                                <div class="content">${escapeHtml(msg.content)}</div>
                            </div>
                        `).join('')}
                        <hr>
                        <p><a href="/">Open in Finallica</a></p>
                    </body>
                    </html>
                `);
            } catch (error) {
                console.error('Error viewing share:', error);
                res.status(500).send('Error loading share');
            }
        });

        function escapeHtml(text) {
            const div = { innerHTML: '' };
            div.textContent = text;
            return div.innerHTML;
        }

        console.log('Share & Command System initialized');
    } catch (error) {
        console.error('Failed to initialize Share & Command System:', error);
    }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// DOCUMENT ROUTES
// ============================================

app.get('/api/documents', async (req, res) => {
    try {
        await loadDocuments();
        res.json({ documents: state.documents });
    } catch (error) {
        console.error('Error loading documents:', error);
        res.status(500).json({ error: 'Failed to load documents' });
    }
});

app.get('/api/documents/:docName', async (req, res) => {
    try {
        const { docName } = req.params;
        const content = state.documents[docName];

        if (!content) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json({ content, docName });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load document' });
    }
});

app.put('/api/documents/:docName', async (req, res) => {
    try {
        const { docName } = req.params;
        const { content, committer } = req.body;

        // Write to file
        const filePath = path.join(DOCS_PATH, docName);
        await fs.writeFile(filePath, content, 'utf8');

        // Git commit
        const git = simpleGit(DOCS_PATH);
        await git.add(docName);
        await git.commit(`Update ${docName}`, {
            '--author': `${committer || 'Anonymous'} <>`
        });

        // Update state
        state.documents[docName] = content;

        // Broadcast update
        broadcast({
            type: 'document_update',
            doc: docName,
            content,
            committer
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ error: 'Failed to update document' });
    }
});

app.get('/api/documents/:docName/history', async (req, res) => {
    try {
        const { docName } = req.params;
        const git = simpleGit(DOCS_PATH);
        const log = await git.log({ file: docName });

        const history = log.all.map(commit => ({
            hash: commit.hash,
            message: commit.message,
            author: commit.author_name,
            date: commit.date,
            diff: commit.hash.substring(0, 7)
        }));

        res.json({ history });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load history' });
    }
});

// ============================================
// PROPOSAL ROUTES
// ============================================

app.get('/api/proposals', (req, res) => {
    res.json({ proposals: state.proposals });
});

app.post('/api/proposals', async (req, res) => {
    try {
        const proposal = req.body;

        // Validate
        if (!proposal.title || !proposal.type) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (proposal.stake < 1000) {
            return res.status(400).json({ error: 'Minimum stake is 1000 BLF' });
        }

        // Store proposal
        state.proposals[proposal.id] = proposal;

        // Add to consensus
        state.consensus.items.push({
            id: proposal.id,
            title: proposal.title,
            description: proposal.rationale || proposal.diff?.substring(0, 100),
            status: 'pending',
            deadline: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
            votesFor: proposal.stake,
            votesAgainst: 0,
            votesAbstain: 0
        });

        // Broadcast
        broadcast({
            type: 'new_proposal',
            proposal
        });

        res.json({ success: true, proposal });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create proposal' });
    }
});

app.get('/api/proposals/:proposalId', (req, res) => {
    const { proposalId } = req.params;
    const proposal = state.proposals[proposalId];

    if (!proposal) {
        return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json({ proposal });
});

// ============================================
// VOTING ROUTES
// ============================================

app.post('/api/vote', async (req, res) => {
    try {
        const { proposalId, voter, direction, stake } = req.body;

        const proposal = state.proposals[proposalId];
        if (!proposal) {
            return res.status(404).json({ error: 'Proposal not found' });
        }

        // Check if already voted
        if (proposal.voters[voter]) {
            return res.status(400).json({ error: 'Already voted' });
        }

        // Record vote
        proposal.voters[voter] = { direction, stake, timestamp: Date.now() };

        // Update totals
        if (direction === 'for') {
            proposal.votesFor += stake;
        } else if (direction === 'against') {
            proposal.votesAgainst += stake;
        } else {
            proposal.votesAbstain = (proposal.votesAbstain || 0) + stake;
        }

        proposal.totalStake += stake;

        // Check consensus
        const totalVotes = proposal.votesFor + proposal.votesAgainst + (proposal.votesAbstain || 0);
        const quorumMet = totalVotes >= (state.consensus.totalStake * CONFIG.QUORUM_PCT);

        if (quorumMet && proposal.votesFor > proposal.votesAgainst) {
            // Proposal approved - apply changes
            await applyProposal(proposal);
            proposal.status = 'approved';
        } else if (proposal.votesAgainst > proposal.votesFor) {
            proposal.status = 'rejected';
        }

        // Broadcast
        broadcast({
            type: 'vote_cast',
            proposalId,
            proposal,
            direction,
            voter
        });

        res.json({ success: true, proposal });
    } catch (error) {
        console.error('Voting error:', error);
        res.status(500).json({ error: 'Failed to cast vote' });
    }
});

// ============================================
// CONSENSUS ROUTES
// ============================================

app.get('/api/consensus', (req, res) => {
    // Calculate consensus state
    const totalVotes = Object.values(state.proposals).reduce((sum, p) =>
        sum + (p.votesFor || 0) + (p.votesAgainst || 0), 0
    );

    state.consensus.totalVotes = totalVotes;
    state.consensus.items = Object.values(state.proposals)
        .filter(p => p.status === 'pending')
        .map(p => ({
            id: p.id,
            title: p.title,
            description: p.rationale || 'No description',
            status: p.status,
            deadline: new Date(p.createdAt + CONFIG.VOTING_PERIOD),
            votesFor: p.votesFor,
            votesAgainst: p.votesAgainst
        }));

    res.json(state.consensus);
});

// ============================================
// AI CHAT ROUTES
// ============================================

// ============================================
// AI CHAT SERVICES (2025 Upgrade)
// ============================================

// API Key Management (with rotation)
class APIKeyManager {
    constructor() {
        this.keys = this.loadKeys();
        this.currentIndex = {};
        this.usageStats = {};
        this.failedKeys = new Set();
    }

    loadKeys() {
        const keys = {
            anthropic: (process.env.ANTHROPIC_API_KEYS || '').split(',').filter(k => k.trim()),
            openai: (process.env.OPENAI_API_KEYS || '').split(',').filter(k => k.trim()),
            openrouter: (process.env.OPENROUTER_API_KEYS || '').split(',').filter(k => k.trim()),
            groq: (process.env.GROQ_API_KEYS || '').split(',').filter(k => k.trim())
        };
        // Support single key format too
        if (process.env.ANTHROPIC_API_KEY && !keys.anthropic.length) {
            keys.anthropic = [process.env.ANTHROPIC_API_KEY];
        }
        if (process.env.OPENAI_API_KEY && !keys.openai.length) {
            keys.openai = [process.env.OPENAI_API_KEY];
        }
        if (process.env.OPENROUTER_API_KEY && !keys.openrouter.length) {
            keys.openrouter = [process.env.OPENROUTER_API_KEY];
        }
        if (process.env.GROQ_API_KEY && !keys.groq.length) {
            keys.groq = [process.env.GROQ_API_KEY];
        }
        return keys;
    }

    getNextKey(provider) {
        const providerKeys = this.keys[provider];
        if (!providerKeys || providerKeys.length === 0) {
            return null;
        }

        // Skip failed keys
        const availableKeys = providerKeys.filter(k => !this.failedKeys.has(k));
        if (availableKeys.length === 0) {
            // Reset failed keys and try again
            this.failedKeys.clear();
            return providerKeys[0];
        }

        if (!this.currentIndex[provider]) {
            this.currentIndex[provider] = 0;
        }

        // Round-robin selection
        const key = availableKeys[this.currentIndex[provider] % availableKeys.length];
        this.currentIndex[provider] = (this.currentIndex[provider] + 1) % availableKeys.length;

        return key;
    }

    markFailed(key) {
        this.failedKeys.add(key);
    }

    recordUsage(provider, model, inputTokens, outputTokens) {
        const key = `${provider}:${model}`;
        if (!this.usageStats[key]) {
            this.usageStats[key] = { requests: 0, inputTokens: 0, outputTokens: 0 };
        }
        this.usageStats[key].requests++;
        this.usageStats[key].inputTokens += inputTokens;
        this.usageStats[key].outputTokens += outputTokens;
    }

    getStats() {
        return this.usageStats;
    }

    hasKeys(provider) {
        return this.keys[provider] && this.keys[provider].length > 0;
    }

    getAvailableProviders() {
        return Object.entries(this.keys)
            .filter(([_, keys]) => keys.length > 0)
            .map(([provider, _]) => provider);
    }
}

const keyManager = new APIKeyManager();

// Initialize AI Services (2025 Upgrade)
const aiProviderService = new AIProviderService(keyManager);
const streamingService = new StreamingService();

// Register AI routes
app.use('/api/ai', createAIRoutes(aiProviderService, streamingService, keyManager));

// Initialize MCP Services
const mcpPassport = new MCPPassport();
const mcpClient = new MCPClient(mcpPassport);

// Register MCP routes
app.use('/api/mcp', createMCPRoutes(mcpPassport, mcpClient));

// Initialize Context7 Server (documentation MCP server)
let context7Server = null;
const CONTEXT7_PORT = process.env.CONTEXT7_PORT || 31338;

async function initializeContext7() {
    try {
        context7Server = new Context7Server(DOCS_PATH, db);
        await context7Server.initialize(CONTEXT7_PORT);
        console.log(`Context7 MCP Server initialized on port ${CONTEXT7_PORT}`);
    } catch (error) {
        console.error('Failed to initialize Context7 server:', error.message);
    }
}

// Register Context7 routes
app.use('/api/context7', createContext7Routes(() => context7Server));

// Initialize Documentation Indexer
const docIndexer = new DocIndexer(db);
docIndexer.initialize().then(() => {
    console.log('Documentation Indexer initialized');
}).catch(err => {
    console.error('Failed to initialize Doc Indexer:', err.message);
});

// Initialize Repository Suggester
const repoSuggester = new RepoSuggesterService(db, docIndexer);
repoSuggester.initialize().then(() => {
    console.log('Repository Suggester initialized');
}).catch(err => {
    console.error('Failed to initialize Repo Suggester:', err.message);
});

// Register Suggestions routes
app.use('/api/suggestions', createSuggestionRoutes(repoSuggester));

// Cleanup expired sessions every hour
setInterval(() => {
    mcpPassport.cleanup();
}, 60 * 60 * 1000);

// Default model configuration
const DEFAULT_MODEL = process.env.AI_MODEL || 'claude-3-5-sonnet-20241022';
const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'anthropic';

// Chat endpoint with model selection
app.post('/api/chat', async (req, res) => {
    try {
        const { message, context, provider, model, stream = false, userApiKey } = req.body;

        const selectedProvider = provider || DEFAULT_PROVIDER;
        const selectedModel = model || DEFAULT_MODEL;

        // Use user-provided API key if available, otherwise check if server has keys
        const apiKey = userApiKey || null;

        if (!apiKey && !keyManager.hasKeys(selectedProvider)) {
            return res.status(400).json({
                error: `No API keys configured for provider: ${selectedProvider}. Please add your API key in settings.`,
                availableProviders: keyManager.getAvailableProviders()
            });
        }

        // Build system prompt with document context
        const systemPrompt = buildSystemPrompt();

        // Get conversation history from context if available
        const messages = context && context.history ? context.history : [];

        // Call the appropriate AI provider
        const response = await callAIProvider(selectedProvider, selectedModel, systemPrompt, message, messages, apiKey);

        res.json({
            response: response.content,
            model: response.model,
            provider: selectedProvider,
            tokensUsed: response.tokens
        });
    } catch (error) {
        console.error('AI chat error:', error);
        res.status(500).json({
            error: error.message,
            fallback: await generateDemoResponse(message)
        });
    }
});

// Get available models endpoint
app.get('/api/ai/models', (req, res) => {
    const available = {};
    const providers = keyManager.getAvailableProviders();

    for (const provider of providers) {
        available[provider] = {
            name: AI_PROVIDERS[provider].name,
            models: AI_PROVIDERS[provider].models
        };
    }

    res.json({ providers: available, defaults: { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL } });
});

// Get AI usage stats endpoint
app.get('/api/ai/stats', (req, res) => {
    res.json({ stats: keyManager.getStats(), availableProviders: keyManager.getAvailableProviders() });
});

// Test user-provided API key endpoint
app.post('/api/ai/test-key', async (req, res) => {
    try {
        const { provider, apiKey } = req.body;

        if (!provider || !apiKey) {
            return res.status(400).json({ valid: false, error: 'Provider and API key are required' });
        }

        if (!AI_PROVIDERS[provider]) {
            return res.status(400).json({ valid: false, error: 'Unknown provider' });
        }

        // Test the API key with a minimal request
        const providerConfig = AI_PROVIDERS[provider];
        let testModel = Object.keys(providerConfig.models)[0];

        let apiUrl = providerConfig.baseUrl;
        let requestBody, headers;

        if (provider === 'anthropic') {
            apiUrl = 'https://api.anthropic.com/v1/messages';
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            };
            requestBody = {
                model: testModel,
                max_tokens: 10,
                messages: [{ role: 'user', content: 'Hi' }]
            };
        } else if (provider === 'openai' || provider === 'groq' || provider === 'openrouter') {
            headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            };
            if (provider === 'openrouter') {
                headers['HTTP-Referer'] = 'https://finallica.io';
                headers['X-Title'] = 'Finallica';
            }
            requestBody = {
                model: testModel,
                messages: [{ role: 'user', content: 'Hi' }],
                max_tokens: 10
            };
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        if (response.ok) {
            res.json({
                valid: true,
                provider,
                model: testModel,
                message: 'API key is valid'
            });
        } else {
            const errorData = await response.text();
            res.json({
                valid: false,
                error: `API returned ${response.status}: ${errorData.substring(0, 200)}`
            });
        }
    } catch (error) {
        console.error('API key test error:', error);
        res.json({ valid: false, error: error.message });
    }
});

// ============================================
// PRIVACY ROUTES
// ============================================

// Initialize privacy service if enabled
let privacyService = null;

if (CONFIG.PRIVACY_ENABLED && CONFIG.RPC_URL) {
    try {
        privacyService = new PrivacyService({
            rpcUrl: CONFIG.RPC_URL,
            privacyRouterAddress: CONFIG.PRIVACY_ROUTER_ADDRESS,
            relayerUrl: CONFIG.RELAYER_URL,
            tornadoInstances: {
                ETH_0_1: process.env.TORNADO_ETH_0_1,
                ETH_1: process.env.TORNADO_ETH_1,
                ETH_10: process.env.TORNADO_ETH_10,
                ETH_100: process.env.TORNADO_ETH_100,
                USDC_100: process.env.TORNADO_USDC_100,
                BLF_100: process.env.TORNADO_BLF_100,
                BLF_1000: process.env.TORNADO_BLF_1000
            }
        });
        console.log('Privacy service initialized');
    } catch (error) {
        console.error('Failed to initialize privacy service:', error.message);
    }
}

// Get privacy service status
app.get('/api/privacy/status', (req, res) => {
    res.json({
        enabled: CONFIG.PRIVACY_ENABLED,
        available: privacyService !== null,
        routerAddress: CONFIG.PRIVACY_ROUTER_ADDRESS,
        relayerUrl: CONFIG.RELAYER_URL || null
    });
});

// Get available privacy pools
app.get('/api/privacy/pools', async (req, res) => {
    if (!privacyService) {
        return res.status(503).json({ error: 'Privacy service not available' });
    }

    try {
        const pools = await privacyService.getAvailablePools();
        res.json({ pools });
    } catch (error) {
        console.error('Error fetching pools:', error);
        res.status(500).json({ error: 'Failed to fetch pools' });
    }
});

// Generate a privacy note
app.post('/api/privacy/note', async (req, res) => {
    if (!privacyService) {
        return res.status(503).json({ error: 'Privacy service not available' });
    }

    try {
        const { token, amount } = req.body;

        if (!token || !amount) {
            return res.status(400).json({ error: 'Token and amount are required' });
        }

        const note = await privacyService.generateNote(token, amount);

        // Broadcast to connected clients
        broadcast({
            type: 'privacy_note_generated',
            token,
            amount,
            poolId: note.poolId
        });

        res.json({ success: true, note });
    } catch (error) {
        console.error('Note generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Validate a privacy note
app.post('/api/privacy/note/validate', async (req, res) => {
    if (!privacyService) {
        return res.status(503).json({ error: 'Privacy service not available' });
    }

    try {
        const { note } = req.body;

        if (!note) {
            return res.status(400).json({ error: 'Note string is required' });
        }

        const isValid = privacyService.validateNote(note);
        const parsed = privacyService.parseNote(note);

        res.json({
            success: true,
            valid: isValid,
            token: parsed.token,
            amount: parsed.amount
        });
    } catch (error) {
        res.json({ success: true, valid: false, error: error.message });
    }
});

// Private deposit
app.post('/api/privacy/deposit', async (req, res) => {
    if (!privacyService) {
        return res.status(503).json({ error: 'Privacy service not available' });
    }

    try {
        const { note, privateKey, useRouter } = req.body;

        if (!note) {
            return res.status(400).json({ error: 'Note is required' });
        }

        // Parse the note if it's a string, otherwise use as-is
        const noteData = typeof note === 'string'
            ? { ...privacyService.parseNote(note), fullNote: note }
            : note;

        const result = await privacyService.deposit(
            noteData,
            privateKey,
            { useRouter }
        );

        // Broadcast deposit event
        broadcast({
            type: 'privacy_deposit',
            txHash: result.txHash,
            poolId: noteData.poolId
        });

        res.json({ success: true, result });
    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Calculate fees for privacy transaction
app.get('/api/privacy/fees', async (req, res) => {
    if (!privacyService) {
        return res.status(503).json({ error: 'Privacy service not available' });
    }

    try {
        const { token, amount } = req.query;

        if (!token || !amount) {
            return res.status(400).json({ error: 'Token and amount are required' });
        }

        const fees = privacyService.calculateFees(token, amount);
        res.json({ success: true, fees });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get withdrawal status
app.get('/api/privacy/withdrawal/:txHash', async (req, res) => {
    if (!privacyService) {
        return res.status(503).json({ error: 'Privacy service not available' });
    }

    try {
        const status = await privacyService.getWithdrawalStatus(req.params.txHash);
        res.json({ success: true, status });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// AI CHAT FUNCTIONS
// ============================================

function buildSystemPrompt() {
    const docList = Object.keys(state.documents).map(d => `- ${d}`).join('\n');

    // Get full content of key documents for context
    const keyDocs = ['README.md', 'ARCHITECTURE_OVERVIEW.md', 'CRYPTOGRAPHIC_DETAILS.md'];
    const relevantContext = keyDocs
        .filter(doc => state.documents[doc])
        .map(doc => `## ${doc}\n${state.documents[doc].substring(0, 3000)}`)
        .join('\n\n---\n\n');

    return `You are Finallica AI, an expert assistant for the Finallica global financial privacy network.

Your role is to help users understand the architecture, protocols, and technical specifications of Finallica.

Key concepts:
- Finallica is a global, trust-minimized payment overlay network with 127 jurisdictional shards
- ~12,000 Validator-Routers (VRs) form a clique mesh topology
- HotStuff BFT consensus with 8 notaries achieving 200ms finality
- Cryptography: BLS12-381 for signatures, Noise_XX for handshakes, ChaCha20-Poly1305 for encryption
- 3-hop payment channels with HTLC locks for privacy
- Pedersen commitments and Bulletproofs+ for amount hiding
- Anonymity set of ~1,200 users per transaction

Relevant documentation:
${relevantContext}

Available documents:
${docList}

Answer questions clearly and technically. Use code examples when helpful. Reference specific documents when citing information.
`;
}

async function callAIProvider(provider, model, systemPrompt, userMessage, history = [], userApiKey = null) {
    const providerConfig = AI_PROVIDERS[provider];
    const apiKey = userApiKey || keyManager.getNextKey(provider);

    if (!apiKey) {
        throw new Error(`No API key available for provider: ${provider}`);
    }

    // Build messages array
    let messages = [];
    let apiUrl = providerConfig.baseUrl;

    if (provider === 'anthropic') {
        // Anthropic format
        messages = [
            { role: 'user', content: `${systemPrompt}\n\nUser: ${userMessage}` }
        ];

        // Add conversation history if available
        if (history.length > 0) {
            const historyText = history.map(h => `${h.role}: ${h.content}`).join('\n\n');
            messages[0].content = `${systemPrompt}\n\nConversation history:\n${historyText}\n\nCurrent question: ${userMessage}`;
        }

        const requestBody = {
            model: model,
            max_tokens: 4096,
            messages: messages
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: providerConfig.headers(apiKey),
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.text();
            if (response.status === 401 || response.status === 403) {
                keyManager.markFailed(apiKey);
            }
            throw new Error(`Anthropic API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        keyManager.recordUsage(provider, model, data.usage?.input_tokens || 0, data.usage?.output_tokens || 0);

        return {
            content: data.content[0].text,
            model: model,
            tokens: {
                input: data.usage?.input_tokens || 0,
                output: data.usage?.output_tokens || 0
            }
        };

    } else {
        // OpenAI-compatible format (OpenAI, OpenRouter, Groq)
        messages = [
            { role: 'system', content: systemPrompt },
            ...history.slice(-10), // Last 10 messages
            { role: 'user', content: userMessage }
        ];

        const requestBody = {
            model: model,
            messages: messages,
            max_tokens: 4096,
            temperature: 0.7
        };

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: providerConfig.headers(apiKey),
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.text();
            if (response.status === 401 || response.status === 403) {
                keyManager.markFailed(apiKey);
            }
            throw new Error(`${providerConfig.name} API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        keyManager.recordUsage(provider, model, data.usage?.prompt_tokens || 0, data.usage?.completion_tokens || 0);

        return {
            content: data.choices[0].message.content,
            model: model,
            tokens: {
                input: data.usage?.prompt_tokens || 0,
                output: data.usage?.completion_tokens || 0
            }
        };
    }
}

// Demo fallback response (when no API keys available)
async function generateDemoResponse(message) {
    return await generateAIResponse(message, null, '');
}

async function generateAIResponse(message, context, docContext) {
    // Simple demo response generator
    const lower = message.toLowerCase();

    // Check for document queries
    if (lower.includes('readme') || lower.includes('overview') || lower.includes('what is')) {
        return `Finallica is a global, trust-minimized payment overlay network that adapts Tor's anonymity architecture for financial value transfer.

**Key characteristics:**
- 127 jurisdictional shards with ~12,000 Validator-Routers (VRs)
- HotStuff BFT consensus with 8 notaries (200ms finality)
- BLS12-381 stake attestations, Noise_XX handshakes, ChaCha20-Poly1305 encryption
- 3-hop payment channels with HTLC locks
- Pedersen commitments for amount hiding
- Anonymity set of ~1,200 users

**Current metrics:**
- Total payments per epoch: 38.4M
- Transaction value: $4.27B
- Average payment: $111.20
- Estimated users: 4.2M daily

Would you like more details on any specific aspect?`;
    }

    if (lower.includes('architecture') || lower.includes('topology')) {
        return `## Network Architecture

The Finallica network operates as a 127-shard topology:

**Components:**
1. **Global Consensus Layer** (8 Notaries) - Sign state roots every 10 seconds
2. **Shards** (127) - Each with ~2,400 VRs in clique mesh topology
3. **Validator-Routers** (12,000 total):
   - Guard VRs (Entry): Top 30% by stake, persistent
   - Middle VRs: Pure forwarding
   - Settlement Executors (Exit): Connect to SWIFT/ACH/BTC
4. **Cross-Shard Bridges** (15,240 links): Top 5% stake in each shard

**Data Plane:** DPDK UDP on port 31337 (kernel bypass)
**Control Plane:** TLS 1.3 on port 31338`;
    }

    if (lower.includes('consensus') || lower.includes('bft')) {
        return `## HotStuff BFT Consensus

Finallica uses a 4-phase HotStuff BFT protocol:

**Phases:**
1. **PREPARE** (50ms RTT) - Leader proposes block
2. **PRE-COMMIT** (50ms RTT) - Nodes lock block
3. **COMMIT** (50ms RTT) - Nodes commit to ledger
4. **DECIDE** (50ms RTT) - Notaries sign state root

**Finality:** 200ms total (4 RTTs × 50ms)

**Quorum:** 67% threshold (1,605 of 2,400 VRs per shard)

**State Root:** Published every 10 seconds by 8 notaries with BLS aggregated signatures`;
    }

    if (lower.includes('cryptography') || lower.includes('encryption') || lower.includes('bls')) {
        return `## Cryptographic Primitives

**Asymmetric:**
- **BLS12-381** - Stake attestations and signatures (48-byte pubkey, 96-byte sig)
- **X25519** - Noise_XX handshake ECDH
- **Ed25519** - Rekey signatures

**Symmetric:**
- **ChaCha20-Poly1305** - Payment cell encryption (1.2µs per hop)
- **BLAKE2s** - Hash function for key derivation

**Commitments:**
- **Pedersen Commitment**: C = v*G + b*H (33 bytes compressed)
- **Bulletproofs+**: Range proofs (700 bytes, 5-10ms verify)

**Performance:**
- Cell processing: 0.8µs per hop
- BLS batch verify (64): 0.15ms
- Channel build: 127-340ms`;
    }

    if (lower.includes('fee') || lower.includes('cost')) {
        return `## Fee Structure

**On a $100 payment:**

| Component | Fee | Notes |
|-----------|-----|-------|
| Guard VR (2 bps) | $0.020 | Stake: 15.7M BLF |
| Middle VR (3 bps) | $0.030 | Stake: 6.3M BLF |
| Exit SE (25 bps) | $0.250 | SWIFT rail |
| SWIFT Bank | $0.250 | Intermediary fees |
| Liquidity (85% util) | $0.030 | Dynamic |
| Padding overhead | $0.352 | Privacy cost |
| **Total** | **$0.932** | **0.93%** |

**Beneficiary receives:** $99.068

**Settlement time:** 1.8 days (SWIFT average)`;
    }

    if (lower.includes('security') || lower.includes('attack')) {
        return `## Security Analysis

**Attack Vectors:**

| Attack | Success Probability | Defense |
|--------|---------------------|---------|
| Timing Correlation | 12% | Padding + quantization |
| Guard Discovery | 0.31% per guard | 90-day rotation |
| Exit Compromise | 10% (20/200 exits) | 2-of-3 redundancy |
| Sybil Attack | Low | Stake^0.7 weighting |

**Anonymity Set:** ~1,200 users

**Staking Requirements:**
- VR: 500K BLF (~$2.25M)
- Settlement Executor: 2M BLF (~$9M)
- Notary: 10M BLF (~$45M)

**Slashing:**
- Double-sign: 100%
- Censorship: 10%
- Invalid settlement: 5%`;
    }

    if (lower.includes('help') || lower.includes('command')) {
        return `**Available Commands:**

- View documents: Click on any document in the sidebar
- Edit documents: Click "Edit" button, then "Propose Change"
- Create proposal: Click "Propose Change" and fill out the form
- Vote on proposals: Go to "Proposals" tab and click "Vote"
- Connect wallet: Click "Connect Wallet" (MetaMask or demo mode)

**Ask me about:**
- Architecture and topology
- Consensus mechanism (HotStuff BFT)
- Cryptographic primitives
- Fee structure
- Security analysis
- Protocol specifications`;
    }

    // Default response
    return `I can help you understand the Finallica system. You can ask me about:

- **Architecture** - Network topology, shards, VR roles
- **Consensus** - HotStuff BFT, notaries, state roots
- **Cryptography** - BLS signatures, encryption, commitments
- **Fees** - Cost breakdown, staking rewards
- **Security** - Attack vectors, defenses, anonymity

You said: "${message}"

For the most accurate information, please refer to the documentation in the sidebar.`;
}

// ============================================
// ACTIVITY ROUTES
// ============================================

app.post('/api/activity', (req, res) => {
    const activity = req.body;
    state.activity.unshift(activity);
    if (state.activity.length > 1000) state.activity.pop();
    res.json({ success: true });
});

app.get('/api/activity', (req, res) => {
    res.json({ activity: state.activity.slice(0, 100) });
});

// ============================================
// GIT ROUTES
// ============================================

app.post('/api/git/commit', async (req, res) => {
    try {
        const { docName, content, message, author } = req.body;

        const git = simpleGit(DOCS_PATH);
        await fs.writeFile(path.join(DOCS_PATH, docName), content);
        await git.add(docName);
        const result = await git.commit(message, {
            '--author': `${author || 'Anonymous'} <>`
        });

        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/git/status', async (req, res) => {
    try {
        const git = simpleGit(DOCS_PATH);
        const status = await git.status();
        const log = await git.log({ maxCount: 10 });

        res.json({ status, log: log.all });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/git/merge', async (req, res) => {
    try {
        const { proposalId } = req.body;
        const proposal = state.proposals[proposalId];

        if (!proposal || proposal.status !== 'approved') {
            return res.status(400).json({ error: 'Proposal not approved' });
        }

        // Apply diff
        await applyProposal(proposal);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function loadDocuments() {
    const files = await fs.readdir(DOCS_PATH);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    for (const file of mdFiles) {
        const content = await fs.readFile(path.join(DOCS_PATH, file), 'utf8');
        state.documents[file] = content;
    }
}

async function applyProposal(proposal) {
    if (proposal.type === 'document_edit' && proposal.diff) {
        const docPath = path.join(DOCS_PATH, proposal.document);
        const currentContent = await fs.readFile(docPath, 'utf8');
        const newContent = applyDiff(currentContent, proposal.diff);

        await fs.writeFile(docPath, newContent, 'utf8');
        state.documents[proposal.document] = newContent;

        // Git commit
        const git = simpleGit(DOCS_PATH);
        await git.add(proposal.document);
        await git.commit(`Merge proposal #${proposal.id.substring(0, 8)}: ${proposal.title}`);

        // Broadcast
        broadcast({
            type: 'proposal_merged',
            proposalId: proposal.id,
            document: proposal.document
        });
    }
}

function applyDiff(content, diffStr) {
    const lines = content.split('\n');
    const diffLines = diffStr.split('\n');

    let result = [...lines];
    let lineOffset = 0;

    for (const diffLine of diffLines) {
        if (diffLine.startsWith('@@')) {
            const match = diffLine.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
            if (match) {
                lineOffset = parseInt(match[1]) - parseInt(match[2]) - 1;
            }
        } else if (diffLine.startsWith('+')) {
            result.splice(lineOffset, 0, diffLine.substring(1));
            lineOffset++;
        } else if (diffLine.startsWith('-')) {
            result.splice(lineOffset, 1);
        } else {
            lineOffset++;
        }
    }

    return result.join('\n');
}

function broadcast(data) {
    const message = JSON.stringify(data);

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ============================================
// WEBSOCKET HANDLER
// ============================================

wss.on('connection', (ws) => {
    state.clients.add(ws);

    // Send initial state
    ws.send(JSON.stringify({
        type: 'init',
        documents: Object.keys(state.documents),
        proposals: state.proposals,
        consensus: state.consensus
    }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);

            switch (message.type) {
                case 'subscribe':
                    ws.subscriptions = message.channels || [];
                    break;

                case 'ping':
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
            }
        } catch (error) {
            console.error('WebSocket message error:', error);
        }
    });

    ws.on('close', () => {
        state.clients.delete(ws);
    });
});

// ============================================
// START SERVER
// ============================================

async function start() {
    // Initialize multi-repository system
    await initializeRepositorySystem();

    // Initialize Context7 documentation MCP server
    await initializeContext7();

    // Initialize agent fleet system
    await initializeAgentFleetSystem();

    // Initialize share and command system
    await initializeShareAndCommandSystem();

    // Load documents on startup
    await loadDocuments();

    // Initialize demo proposals
    initializeDemoProposals();

    server.listen(PORT, () => {
        console.log(`
╔══════════════════════════════════════════════════════════════╗
║           Finallica Documentation System                      ║
║                                                              ║
║  Server running on: http://localhost:${PORT}                      ║
║  Frontend: http://localhost:8080                            ║
║                                                              ║
║  Features:                                                   ║
║  • Multi-repository documentation platform                   ║
║  • Document management with Git integration                  ║
║  • Proposal system with blockchain voting                    ║
║  • AI chat assistant                                         ║
║  • Real-time collaboration via WebSocket                     ║
║  • Consensus voting on changes                               ║
║  • Session sharing (like /share)                             ║
║  • Custom commands with /<command>                           ║
║  • Public share URLs at /s/<id>                              ║
║                                                              ║
║  Press Ctrl+C to stop                                        ║
╚══════════════════════════════════════════════════════════════╝
        `);
    });
}

function initializeDemoProposals() {
    // Demo proposals for testing
    const demoProposals = [
        {
            id: '0x1234567890abcdef1234567890abcdef12345678',
            type: 'protocol_change',
            title: 'Increase HTLC Max Per Channel to 1000',
            document: 'PROTOCOL_SPECIFICATION.md',
            diff: '+ HTLC_MAX_PER_CHANNEL 1000',
            rationale: 'Current limit of 483 HTLCs constrains throughput. Increasing to 1000 would improve capacity.',
            stake: 50000,
            proposer: '0xdemo1234567890abcdef1234567890abcdef',
            createdAt: Date.now() - 86400000,
            status: 'pending',
            votesFor: 8500000,
            votesAgainst: 1200000,
            voters: {}
        },
        {
            id: '0xabcdef1234567890abcdef1234567890abcdef12',
            type: 'parameter_update',
            title: 'Reduce Guard Rotation to 60 Days',
            document: 'SECURITY_ANALYSIS.md',
            diff: '- GUARD_LIFETIME 7776000  # 90 days\n+ GUARD_LIFETIME 5184000   # 60 days',
            rationale: 'Faster rotation improves security against guard discovery attacks.',
            stake: 75000,
            proposer: '0xdemo0987654321fedcba0987654321fedcba',
            createdAt: Date.now() - 172800000,
            status: 'pending',
            votesFor: 12345000,
            votesAgainst: 2100000,
            voters: {}
        }
    ];

    for (const proposal of demoProposals) {
        state.proposals[proposal.id] = proposal;
    }

    // Add to consensus items
    state.consensus.items = Object.values(state.proposals)
        .filter(p => p.status === 'pending')
        .map(p => ({
            id: p.id,
            title: p.title,
            description: p.rationale,
            status: p.status,
            deadline: new Date(p.createdAt + CONFIG.VOTING_PERIOD),
            votesFor: p.votesFor,
            votesAgainst: p.votesAgainst
        }));
}

start();
