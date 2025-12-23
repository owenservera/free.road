// Finallica Documentation System - Main Application
// This file handles all frontend logic including document management,
// AI chat, proposals, voting, and consensus

const CONFIG = {
    API_BASE: 'http://localhost:3000/api',
    WS_BASE: 'ws://localhost:3000/ws',
    CHAIN_ID: 31337, // Finallica testnet chain ID
    MIN_STAKE_PROPOSAL: 1000, // BLF
    VOTING_PERIOD: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    QUORUM_PCT: 0.67 // 67% needed
};

// State Management
const state = {
    wallet: null,
    account: null,
    stake: 0,
    currentDoc: 'README.md',
    documents: {},
    proposals: {},
    consensus: {},
    chatHistory: [],
    activity: [],
    // AI Configuration
    aiProviders: {},
    aiDefaults: { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
    selectedProvider: null,
    selectedModel: null
};

// Utility Functions
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function formatNumber(num) {
    return new Intl.NumberFormat().format(num);
}

function formatAddress(addr) {
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

function showToast(message, type = 'info') {
    const container = $('#toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-content">${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// ============================================
// DOCUMENT MANAGEMENT
// ============================================

async function loadDocuments() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/documents`);
        const data = await response.json();
        state.documents = data.documents;
        renderDocTree();

        // Load initial document
        if (state.documents['README.md']) {
            loadDocument('README.md');
        }
    } catch (error) {
        console.error('Failed to load documents:', error);
        showToast('Failed to load documents', 'error');
    }
}

function renderDocTree() {
    const tree = $('#docTree');
    tree.innerHTML = '';

    const structure = {
        'Overview': ['README.md'],
        'Architecture': ['ARCHITECTURE_OVERVIEW.md', 'NETWORK_TOPOLOGY.md'],
        'Protocol': ['PROTOCOL_SPECIFICATION.md', 'STATE_MACHINES.md'],
        'Performance': ['PERFORMANCE_ANALYSIS.md'],
        'Cryptography': ['CRYPTOGRAPHIC_DETAILS.md'],
        'Liquidity': ['LIQUIDITY_MANAGEMENT.md'],
        'Consensus': ['CONSENSUS_MECHANISM.md'],
        'Security': ['SECURITY_ANALYSIS.md'],
        'Operations': ['OPERATIONAL_METRICS.md'],
        'Reference': ['TOR_FINALLIKA_MAPPING.md', 'RESEARCH_PROPOSALS.md', 'CONSTANTS_REFERENCE.md']
    };

    for (const [section, docs] of Object.entries(structure)) {
        const sectionEl = document.createElement('div');
        sectionEl.className = 'doc-tree-section';
        sectionEl.textContent = section;
        tree.appendChild(sectionEl);

        for (const doc of docs) {
            const link = document.createElement('a');
            link.className = 'doc-tree-item';
            link.textContent = doc.replace('.md', '');
            link.dataset.doc = doc;
            if (doc === state.currentDoc) link.classList.add('active');
            link.addEventListener('click', () => loadDocument(doc));
            tree.appendChild(link);
        }
    }
}

async function loadDocument(docName) {
    try {
        state.currentDoc = docName;
        $('#currentDoc').textContent = docName;

        const response = await fetch(`${CONFIG.API_BASE}/documents/${docName}`);
        const data = await response.json();

        $('#docContent').innerHTML = renderMarkdown(data.content);
        $('#documentViewer').classList.remove('hidden');
        $('#editorPanel').classList.add('hidden');

        // Update active state in tree
        $$('.doc-tree-item').forEach(el => {
            el.classList.toggle('active', el.dataset.doc === docName);
        });

        // Track view
        trackActivity('view', { document: docName });
    } catch (error) {
        console.error('Failed to load document:', error);
        showToast('Failed to load document', 'error');
    }
}

function renderMarkdown(content) {
    // Simple markdown renderer (in production, use marked.js)
    return content
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/\n/g, '<br>');
}

function editDocument() {
    const content = state.documents[state.currentDoc];
    $('#docEditor').value = content;
    $('#editorTitle').textContent = `Edit ${state.currentDoc}`;
    $('#documentViewer').classList.add('hidden');
    $('#editorPanel').classList.remove('hidden');
}

function previewChanges() {
    const content = $('#docEditor').value;
    $('#editPreview').innerHTML = renderMarkdown(content);
    $('#editPreview').classList.remove('hidden');
}

async function saveEdit() {
    const content = $('#docEditor').value;
    const diff = generateDiff(state.documents[state.currentDoc], content);

    // Create as a proposal
    showProposalModal({
        type: 'document_edit',
        document: state.currentDoc,
        diff: diff,
        title: `Edit ${state.currentDoc}`
    });
}

function cancelEdit() {
    $('#documentViewer').classList.remove('hidden');
    $('#editorPanel').classList.add('hidden');
}

function generateDiff(original, modified) {
    // Simple diff generator
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    let diff = '';

    let i = 0, j = 0;
    while (i < originalLines.length || j < modifiedLines.length) {
        if (i < originalLines.length && j < modifiedLines.length && originalLines[i] === modifiedLines[j]) {
            i++; j++;
        } else {
            if (j < modifiedLines.length) {
                diff += `+ ${modifiedLines[j]}\n`;
                j++;
            }
            if (i < originalLines.length) {
                diff += `- ${originalLines[i]}\n`;
                i++;
            }
        }
    }

    return diff;
}

// ============================================
// PROPOSALS & VOTING
// ============================================

async function loadProposals() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/proposals`);
        const data = await response.json();
        state.proposals = data.proposals;
        renderProposals();
        updatePendingCount();
    } catch (error) {
        console.error('Failed to load proposals:', error);
    }
}

function renderProposals() {
    // Summary
    const summary = $('#proposalsSummary');
    const pending = Object.values(state.proposals).filter(p => p.status === 'pending').length;
    const approved = Object.values(state.proposals).filter(p => p.status === 'approved').length;
    const rejected = Object.values(state.proposals).filter(p => p.status === 'rejected').length;

    summary.innerHTML = `
        <div class="proposal-card">
            <h4>Pending</h4>
            <div class="stat">${pending}</div>
        </div>
        <div class="proposal-card">
            <h4>Approved</h4>
            <div class="stat">${approved}</div>
        </div>
        <div class="proposal-card">
            <h4>Rejected</h4>
            <div class="stat">${rejected}</div>
        </div>
    `;

    // Detail list
    const detail = $('#proposalsDetail');
    detail.innerHTML = '';

    const sortedProposals = Object.values(state.proposals)
        .sort((a, b) => b.createdAt - a.createdAt);

    for (const proposal of sortedProposals) {
        const forPct = (proposal.votesFor / proposal.totalStake) * 100;
        const againstPct = (proposal.votesAgainst / proposal.totalStake) * 100;

        const item = document.createElement('div');
        item.className = `proposal-item ${proposal.status}`;
        item.innerHTML = `
            <div class="proposal-header">
                <span class="proposal-title">${proposal.title}</span>
                <span class="proposal-id">#${proposal.id.substring(0, 8)}</span>
            </div>
            <div class="proposal-meta">
                <span>Type: ${proposal.type}</span>
                <span>By: ${formatAddress(proposal.proposer)}</span>
                <span>${new Date(proposal.createdAt).toLocaleDateString()}</span>
            </div>
            <div class="proposal-votes">
                <div class="vote-bar">
                    <div class="vote-bar-fill for" style="width: ${forPct}%"></div>
                </div>
                <div class="vote-bar">
                    <div class="vote-bar-fill against" style="width: ${againstPct}%"></div>
                </div>
            </div>
            <div style="font-size: 0.75rem; margin-top: 0.5rem; color: var(--color-text-muted)">
                ${formatNumber(proposal.votesFor)} for • ${formatNumber(proposal.votesAgainst)} against • ${formatNumber(proposal.totalStake - proposal.votesFor - proposal.votesAgainst)} abstain
            </div>
            <button class="btn btn-secondary" style="margin-top: 0.5rem; font-size: 0.75rem;" onclick="openVotingModal('${proposal.id}')">
                Vote
            </button>
        `;
        detail.appendChild(item);
    }
}

function updatePendingCount() {
    const pending = Object.values(state.proposals).filter(p => p.status === 'pending').length;
    $('#pendingCount').textContent = pending;
    $('#pendingCount').classList.toggle('hidden', pending === 0);
}

function showProposalModal(preFill = {}) {
    $('#proposalModal').classList.remove('hidden');

    // Populate document options
    const docSelect = $('#proposalDoc');
    docSelect.innerHTML = '';
    for (const doc of Object.keys(state.documents)) {
        const option = document.createElement('option');
        option.value = doc;
        option.textContent = doc;
        docSelect.appendChild(option);
    }

    // Pre-fill if provided
    if (preFill.type) $('#proposalType').value = preFill.type;
    if (preFill.document) $('#proposalDoc').value = preFill.document;
    if (preFill.diff) $('#proposalDiff').value = preFill.diff;
    if (preFill.title) $('#proposalTitle').value = preFill.title;
}

function closeModal() {
    $('#proposalModal').classList.add('hidden');
    $('#proposalForm').reset();
}

async function submitProposal() {
    if (!state.account) {
        showToast('Please connect wallet first', 'error');
        return;
    }

    const proposal = {
        id: generateId(),
        type: $('#proposalType').value,
        title: $('#proposalTitle').value,
        document: $('#proposalDoc').value,
        diff: $('#proposalDiff').value,
        rationale: $('#proposalRationale').value,
        stake: parseInt($('#proposalStake').value),
        proposer: state.account,
        createdAt: Date.now(),
        status: 'pending',
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0,
        totalStake: 0,
        voters: {}
    };

    try {
        const response = await fetch(`${CONFIG.API_BASE}/proposals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proposal)
        });

        if (response.ok) {
            state.proposals[proposal.id] = proposal;
            renderProposals();
            closeModal();
            showToast('Proposal submitted successfully', 'success');
            trackActivity('propose', { proposalId: proposal.id, title: proposal.title });
        }
    } catch (error) {
        console.error('Failed to submit proposal:', error);
        showToast('Failed to submit proposal', 'error');
    }
}

function openVotingModal(proposalId) {
    const proposal = state.proposals[proposalId];
    if (!proposal) return;

    $('#votingProposalDetails').innerHTML = `
        <h4>${proposal.title}</h4>
        <p style="font-size: 0.875rem; color: var(--color-text-muted); margin-top: 0.5rem;">
            ${proposal.rationale || proposal.diff.substring(0, 200)}...
        </p>
        <div style="margin-top: 1rem;">
            <strong>Current Standings:</strong><br>
            For: ${formatNumber(proposal.votesFor)} BLF<br>
            Against: ${formatNumber(proposal.votesAgainst)} BLF<br>
            Abstain: ${formatNumber(proposal.totalStake - proposal.votesFor - proposal.votesAgainst)} BLF
        </div>
    `;

    // Store current proposal for voting
    $('#votingModal').dataset.proposalId = proposalId;
    $('#votingModal').classList.remove('hidden');
}

function closeVotingModal() {
    $('#votingModal').classList.add('hidden');
}

async function vote(direction) {
    if (!state.account) {
        showToast('Please connect wallet first', 'error');
        return;
    }

    const proposalId = $('#votingModal').dataset.proposalId;
    const stakeWeight = parseInt($('#stakeWeight').value) / 100;
    const voteAmount = Math.floor(state.stake * stakeWeight);

    const voteData = {
        proposalId,
        voter: state.account,
        direction, // 'for', 'against', 'abstain'
        stake: voteAmount,
        timestamp: Date.now()
    };

    try {
        const response = await fetch(`${CONFIG.API_BASE}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(voteData)
        });

        if (response.ok) {
            const result = await response.json();
            state.proposals[proposalId] = result.proposal;
            renderProposals();
            closeVotingModal();
            showToast(`Vote cast: ${direction}`, 'success');
            trackActivity('vote', { proposalId, direction, amount: voteAmount });
        }
    } catch (error) {
        console.error('Failed to cast vote:', error);
        showToast('Failed to cast vote', 'error');
    }
}

// ============================================
// AI CHAT
// ============================================

async function sendChatMessage() {
    const input = $('#chatInput');
    const message = input.value.trim();

    if (!message) return;

    // Add user message
    addChatMessage('user', message);
    input.value = '';

    // Show typing indicator
    showTyping();

    try {
        const response = await fetch(`${CONFIG.API_BASE}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message,
                provider: state.selectedProvider || state.aiDefaults.provider,
                model: state.selectedModel || state.aiDefaults.model,
                context: {
                    currentDoc: state.currentDoc,
                    documents: Object.keys(state.documents),
                    proposals: state.proposals,
                    history: state.chatHistory.slice(-20) // Last 20 messages
                }
            })
        });

        const data = await response.json();
        hideTyping();

        if (data.error && data.fallback) {
            // Using fallback demo mode
            addChatMessage('ai', data.fallback);
            showToast(`AI API Error: ${data.error}. Using demo mode.`, 'warning');
            state.chatHistory.push({ role: 'user', content: message });
            state.chatHistory.push({ role: 'assistant', content: data.fallback });
        } else if (data.error) {
            addChatMessage('system', `Error: ${data.error}`);
            showToast(data.error, 'error');
        } else {
            addChatMessage('ai', data.response);
            state.chatHistory.push({ role: 'user', content: message });
            state.chatHistory.push({ role: 'assistant', content: data.response });

            // Show token usage if available
            if (data.tokensUsed) {
                const tokenInfo = `${data.tokensUsed.input + data.tokensUsed.output} tokens (${data.tokensUsed.input} in, ${data.tokensUsed.out} out)`;
                showToast(tokenInfo, 'info');
            }
        }
    } catch (error) {
        console.error('Chat error:', error);
        hideTyping();
        addChatMessage('system', 'Sorry, I encountered an error. Please try again.');
        showToast('Chat error: ' + error.message, 'error');
    }
}

function addChatMessage(type, content) {
    const messages = $('#chatMessages');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${type}`;

    const avatar = type === 'ai' ? '🤖' : type === 'user' ? '👤' : '⚙️';

    msgDiv.innerHTML = `
        <div class="chat-avatar">${avatar}</div>
        <div class="chat-message-content">
            <div class="message-bubble">
                <div class="message-content">${renderMarkdown(content)}</div>
            </div>
            <div class="message-meta">${new Date().toLocaleTimeString()}</div>
        </div>
    `;

    messages.appendChild(msgDiv);
    messages.scrollTop = messages.scrollHeight;
}

function showTyping() {
    const messages = $('#chatMessages');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'chat-message ai typing-indicator';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `
        <div class="chat-avatar">🤖</div>
        <div class="message-bubble">
            <div class="message-content"><span class="spinner"></span> Thinking...</div>
        </div>
    `;
    messages.appendChild(typingDiv);
    messages.scrollTop = messages.scrollHeight;
}

function hideTyping() {
    $('#typingIndicator')?.remove();
}

function clearChat() {
    $('#chatMessages').innerHTML = `
        <div class="chat-message system">
            <div class="message-content">
                Chat cleared. Ask about Finallica architecture, protocols, or any topic.
            </div>
        </div>
    `;
    state.chatHistory = [];
}

// ============================================
// CONSENSUS
// ============================================

async function loadConsensus() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/consensus`);
        const data = await response.json();
        state.consensus = data;
        renderConsensus();
    } catch (error) {
        console.error('Failed to load consensus:', error);
    }
}

function renderConsensus() {
    // Stats
    $('#currentBlock').textContent = formatNumber(state.consensus.blockNumber || 0);
    $('#currentEpoch').textContent = formatNumber(state.consensus.epoch || 0);
    $('#totalVotes').textContent = formatNumber(state.consensus.totalVotes || 0);

    $('#totalStake').textContent = `${formatNumber(state.consensus.totalStake || 0)} BLF`;

    const quorumReached = (state.consensus.totalVotes || 0) >= (state.consensus.quorum || 0);
    $('#quorumStatus').textContent = quorumReached ? 'Reached' : 'Not Reached';
    $('#quorumStatus').style.color = quorumReached ? 'var(--color-success)' : 'var(--color-warning)';

    const approvalRate = state.consensus.totalStake > 0
        ? ((state.consensus.votesFor || 0) / state.consensus.totalStake * 100).toFixed(1)
        : 0;
    $('#approvalRate').textContent = `${approvalRate}%`;

    // List
    const list = $('#consensusList');
    list.innerHTML = '';

    const items = state.consensus.items || [];
    for (const item of items) {
        const itemEl = document.createElement('div');
        itemEl.className = 'consensus-item';
        itemEl.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                <div>
                    <strong>${item.title}</strong>
                    <span class="consensus-status ${item.status}">${item.status}</span>
                </div>
                <span class="proposal-id">#${item.id.substring(0, 8)}</span>
            </div>
            <p style="font-size: 0.875rem; color: var(--color-text-muted);">${item.description}</p>
            <div style="margin-top: 0.5rem; font-size: 0.75rem;">
                Ends: ${new Date(item.deadline).toLocaleString()}
            </div>
        `;
        list.appendChild(itemEl);
    }
}

// ============================================
// WALLET CONNECTION
// ============================================

async function connectWallet() {
    // Check for MetaMask or compatible wallet
    if (typeof window.ethereum !== 'undefined') {
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const account = accounts[0];

            state.account = account;
            state.wallet = window.ethereum;

            // Get balance (assuming BLF token contract)
            const balance = await getTokenBalance(account);
            state.stake = balance;

            updateWalletUI();
            showToast('Wallet connected', 'success');
            trackActivity('connect', { address: account });

            // Setup listeners
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);

        } catch (error) {
            console.error('Wallet connection error:', error);
            showToast('Failed to connect wallet', 'error');
        }
    } else {
        // Demo mode - create mock wallet
        state.account = '0xdemo' + generateId().substring(0, 38);
        state.stake = 1000000; // 1M BLF demo stake

        updateWalletUI();
        showToast('Demo wallet connected', 'info');
    }
}

async function getTokenBalance(account) {
    // In production, call actual BLF token contract
    // For demo, return mock value
    return 1000000; // 1M BLF
}

function updateWalletUI() {
    $('#connectWallet').classList.add('hidden');
    $('#walletInfo').classList.remove('hidden');
    $('.wallet-address').textContent = formatAddress(state.account);
    $('.wallet-balance').textContent = `${formatNumber(state.stake)} BLF`;
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectWallet();
    } else {
        state.account = accounts[0];
        updateWalletUI();
    }
}

function handleChainChanged() {
    window.location.reload();
}

function disconnectWallet() {
    state.account = null;
    state.wallet = null;
    state.stake = 0;

    $('#connectWallet').classList.remove('hidden');
    $('#walletInfo').classList.add('hidden');
    showToast('Wallet disconnected', 'info');
}

// ============================================
// ACTIVITY TRACKING
// ============================================

function trackActivity(type, data) {
    const activity = {
        type,
        data,
        timestamp: Date.now(),
        user: state.account || 'anonymous'
    };

    state.activity.unshift(activity);
    if (state.activity.length > 100) state.activity.pop();

    renderActivity();

    // Send to server
    fetch(`${CONFIG.API_BASE}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activity)
    }).catch(console.error);
}

function renderActivity() {
    const feed = $('#activityFeed');
    feed.innerHTML = '';

    const icons = {
        'view': '👁️',
        'edit': '✎️',
        'propose': '📝',
        'vote': '🗳️',
        'connect': '⚡',
        'consensus': '⛓️',
        'merge': '🔀'
    };

    for (const activity of state.activity.slice(0, 20)) {
        const item = document.createElement('div');
        item.className = 'activity-item';
        item.innerHTML = `
            <div class="activity-icon">${icons[activity.type] || '•'}</div>
            <div class="activity-content">
                <div class="activity-title">${getActivityText(activity)}</div>
                <div class="activity-time">${getTimeAgo(activity.timestamp)}</div>
            </div>
        `;
        feed.appendChild(item);
    }
}

function getActivityText(activity) {
    const user = activity.user ? formatAddress(activity.user) : 'Anonymous';

    switch (activity.type) {
        case 'view':
            return `${user} viewed ${activity.data.document || 'a document'}`;
        case 'propose':
            return `${user} proposed "${activity.data.title}"`;
        case 'vote':
            return `${user} voted ${activity.data.direction} on proposal`;
        case 'connect':
            return `${user} connected wallet`;
        case 'consensus':
            return `Consensus reached on ${activity.data.proposalId}`;
        case 'merge':
            return `Changes merged to ${activity.data.document}`;
        default:
            return `${user} performed ${activity.type}`;
    }
}

function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

// ============================================
// WEBSOCKET CONNECTION
// ============================================

function connectWebSocket() {
    const ws = new WebSocket(CONFIG.WS_BASE);

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setTimeout(connectWebSocket, 5000);
    };

    state.ws = ws;
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'document_update':
            state.documents[data.doc] = data.content;
            if (state.currentDoc === data.doc) {
                loadDocument(data.doc);
            }
            showToast(`Document updated: ${data.doc}`, 'info');
            break;

        case 'new_proposal':
            state.proposals[data.proposal.id] = data.proposal;
            renderProposals();
            showToast(`New proposal: ${data.proposal.title}`, 'info');
            break;

        case 'vote_cast':
            if (state.proposals[data.proposalId]) {
                state.proposals[data.proposalId] = data.proposal;
                renderProposals();
            }
            break;

        case 'consensus_update':
            state.consensus = data.consensus;
            renderConsensus();
            break;

        case 'proposal_merged':
            const proposal = state.proposals[data.proposalId];
            if (proposal) {
                proposal.status = 'approved';
                renderProposals();
                showToast(`Proposal merged: ${proposal.title}`, 'success');
                trackActivity('merge', { proposalId: data.proposalId, title: proposal.title });
            }
            break;
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateId() {
    return '0x' + Array.from({ length: 40 }, () =>
        Math.floor(Math.random() * 16).toString(16)
    ).join('');
}

// ============================================
// ============================================
// AI MODEL MANAGEMENT
// ============================================

async function loadAIModels() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/ai/models`);
        const data = await response.json();

        state.aiProviders = data.providers || {};
        state.aiDefaults = data.defaults || { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' };

        // Set default selections
        state.selectedProvider = state.aiDefaults.provider;
        state.selectedModel = state.aiDefaults.model;

        renderModelSelector();
    } catch (error) {
        console.error('Failed to load AI models:', error);
        // Use demo mode defaults
        renderModelSelector();
    }
}

function renderModelSelector() {
    const container = $('#aiModelSelector');
    if (!container) return;

    const providers = Object.entries(state.aiProviders);
    if (providers.length === 0) {
        container.innerHTML = '<div class="ai-status">Demo Mode (no API keys)</div>';
        return;
    }

    let html = '<div class="ai-selector">';

    // Provider dropdown
    html += '<select id="aiProvider" class="ai-select">';
    for (const [id, config] of providers) {
        const selected = id === state.selectedProvider ? 'selected' : '';
        html += `<option value="${id}" ${selected}>${config.name}</option>`;
    }
    html += '</select>';

    // Model dropdown (will be populated by provider selection)
    html += '<select id="aiModel" class="ai-select">';
    const currentProvider = state.aiProviders[state.selectedProvider];
    if (currentProvider && currentProvider.models) {
        for (const [id, config] of Object.entries(currentProvider.models)) {
            const selected = id === state.selectedModel ? 'selected' : '';
            html += `<option value="${id}" ${selected}>${config.name}</option>`;
        }
    }
    html += '</select>';

    html += '</div>';

    container.innerHTML = html;

    // Add event listeners
    $('#aiProvider')?.addEventListener('change', (e) => {
        state.selectedProvider = e.target.value;
        const provider = state.aiProviders[e.target.value];
        const firstModel = Object.keys(provider.models)[0];
        state.selectedModel = firstModel;
        renderModelSelector();
    });

    $('#aiModel')?.addEventListener('change', (e) => {
        state.selectedModel = e.target.value;
    });
}

// ============================================
// INITIALIZATION
// ============================================

function init() {
    // Tab navigation
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            $$('.tab-btn').forEach(b => b.classList.remove('active'));
            $$('.tab-pane').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            $(`#${tab}`)?.classList.add('active');
        });
    });

    // Button event listeners
    $('#connectWallet').addEventListener('click', connectWallet);
    $('#refreshDocs').addEventListener('click', loadDocuments);
    $('#editDoc').addEventListener('click', editDocument);
    $('#previewChanges').addEventListener('click', previewChanges);
    $('#saveEdit').addEventListener('click', saveEdit);
    $('#cancelEdit').addEventListener('click', cancelEdit);
    $('#proposeChange').addEventListener('click', () => showProposalModal());
    $('#viewHistory').addEventListener('click', () => {
        $('.tab-btn[data-tab="activity"]').click();
    });
    $('#closeModal').addEventListener('click', closeModal);
    $('#cancelProposal').addEventListener('click', closeModal);
    $('#submitProposal').addEventListener('click', submitProposal);
    $('#closeVotingModal').addEventListener('click', closeVotingModal);
    $('#voteFor').addEventListener('click', () => vote('for'));
    $('#voteAgainst').addEventListener('click', () => vote('against'));
    $('#voteAbstain').addEventListener('click', () => vote('abstain'));
    $('#sendChat').addEventListener('click', sendChatMessage);
    $('#clearChat').addEventListener('click', clearChat);

    // Chat input enter key
    $('#chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendChatMessage();
        }
    });

    // Slider value update
    $('#stakeWeight').addEventListener('input', (e) => {
        $('#stakeWeightValue').textContent = e.target.value;
    });

    // Load initial data
    loadDocuments();
    loadProposals();
    loadConsensus();
    loadAIModels();
    renderActivity();
    connectWebSocket();
}

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', init);
