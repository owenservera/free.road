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

// Multi-Repository System
const db = require('./database');
const GitSyncService = require('./services/git-sync');
const RepositoryService = require('./services/repository-service');
const createRepositoryRoutes = require('./routes/repositories');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
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
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || ''
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

        // Initialize services
        gitSync = new GitSyncService(db);
        repositoryService = new RepositoryService(db, gitSync);

        // Register routes
        app.use('/api/repositories', createRepositoryRoutes(db, repositoryService, gitSync));

        console.log('Multi-repository system initialized');
    } catch (error) {
        console.error('Failed to initialize repository system:', error);
    }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

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

// AI Provider Configuration
const AI_PROVIDERS = {
    anthropic: {
        name: 'Anthropic Claude',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        models: {
            'claude-sonnet-4-20250514': { name: 'Claude Sonnet 4', maxTokens: 200000, contextWindow: 200000 },
            'claude-3-5-sonnet-20241022': { name: 'Claude 3.5 Sonnet', maxTokens: 200000, contextWindow: 200000 },
            'claude-3-5-haiku-20241022': { name: 'Claude 3.5 Haiku', maxTokens: 200000, contextWindow: 200000 },
            'claude-3-opus-20240229': { name: 'Claude 3 Opus', maxTokens: 200000, contextWindow: 200000 }
        },
        headers: (apiKey) => ({
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        })
    },
    openai: {
        name: 'OpenAI GPT',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        models: {
            'gpt-4o': { name: 'GPT-4o', maxTokens: 128000, contextWindow: 128000 },
            'gpt-4o-mini': { name: 'GPT-4o Mini', maxTokens: 128000, contextWindow: 128000 },
            'gpt-4-turbo': { name: 'GPT-4 Turbo', maxTokens: 128000, contextWindow: 128000 },
            'gpt-3.5-turbo': { name: 'GPT-3.5 Turbo', maxTokens: 16385, contextWindow: 16385 }
        },
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'content-type': 'application/json'
        })
    },
    openrouter: {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
        models: {
            'anthropic/claude-sonnet-4': { name: 'Claude Sonnet 4 (via OpenRouter)', maxTokens: 200000, contextWindow: 200000 },
            'anthropic/claude-3.5-sonnet': { name: 'Claude 3.5 Sonnet (via OpenRouter)', maxTokens: 200000, contextWindow: 200000 },
            'openai/gpt-4o': { name: 'GPT-4o (via OpenRouter)', maxTokens: 128000, contextWindow: 128000 },
            'google/gemini-pro-1.5': { name: 'Gemini Pro 1.5 (via OpenRouter)', maxTokens: 1000000, contextWindow: 1000000 },
            'meta-llama/llama-3.1-70b-instruct': { name: 'Llama 3.1 70B (via OpenRouter)', maxTokens: 131072, contextWindow: 131072 }
        },
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'HTTP-Referer': 'https://finallica.io',
            'X-Title': 'Finallica Documentation'
        })
    },
    groq: {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
        models: {
            'llama-3.3-70b-versatile': { name: 'Llama 3.3 70B', maxTokens: 131072, contextWindow: 131072 },
            'llama-3.1-70b-versatile': { name: 'Llama 3.1 70B', maxTokens: 131072, contextWindow: 131072 },
            'mixtral-8x7b-32768': { name: 'Mixtral 8x7b', maxTokens: 32768, contextWindow: 32768 }
        },
        headers: (apiKey) => ({
            'Authorization': `Bearer ${apiKey}`,
            'content-type': 'application/json'
        })
    }
};

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

// Default model configuration
const DEFAULT_MODEL = process.env.AI_MODEL || 'claude-3-5-sonnet-20241022';
const DEFAULT_PROVIDER = process.env.AI_PROVIDER || 'anthropic';

// Chat endpoint with model selection
app.post('/api/chat', async (req, res) => {
    try {
        const { message, context, provider, model, stream = false } = req.body;

        const selectedProvider = provider || DEFAULT_PROVIDER;
        const selectedModel = model || DEFAULT_MODEL;

        // Check if provider has keys
        if (!keyManager.hasKeys(selectedProvider)) {
            return res.status(400).json({
                error: `No API keys configured for provider: ${selectedProvider}`,
                availableProviders: keyManager.getAvailableProviders()
            });
        }

        // Build system prompt with document context
        const systemPrompt = buildSystemPrompt();

        // Get conversation history from context if available
        const messages = context && context.history ? context.history : [];

        // Call the appropriate AI provider
        const response = await callAIProvider(selectedProvider, selectedModel, systemPrompt, message, messages);

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

async function callAIProvider(provider, model, systemPrompt, userMessage, history = []) {
    const providerConfig = AI_PROVIDERS[provider];
    const apiKey = keyManager.getNextKey(provider);

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
