# Finallica Documentation Webapp

A collaborative documentation system for the Finallica global financial privacy network, featuring:

- **Document Management**: View, edit, and version control all Finallica architecture docs
- **AI Chat Assistant**: Ask questions about the system and get instant answers
- **Proposal System**: Create and vote on changes using blockchain-based governance
- **Consensus Voting**: HotStuff BFT-inspired voting mechanism with stake-weighted decisions
- **Git Integration**: Automatic commits and version tracking
- **Real-time Updates**: WebSocket-powered live collaboration

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.x (for simple HTTP server)
- Git

### Installation

```bash
# Clone the repository
cd /c/Users/VIVIM.inc/finallica-webapp

# Install backend dependencies
cd backend
npm install

# Install contract dependencies (optional, for blockchain features)
cd ../contracts
npm install
```

### Running the Application

```bash
# Terminal 1: Start the backend API
cd backend
node server.js

# Terminal 2: Start the frontend
cd frontend
python -m http.server 8080

# Or install and run with a proper web server:
npx serve -l 8080
```

Then open your browser to:
- **Frontend**: http://localhost:8080
- **API**: http://localhost:3000

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Browser                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Documents │  │ AI Chat  │  │Proposals │  │Consensus │    │
│  └─────┬────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
└────────┼──────────┼──────────┼──────────┼──────────┼────────┘
         │          │          │          │
         ▼          ▼          ▼          ▼
┌────────────────────────────────────────────────────────────────┐
│                      Frontend (app.js)                        │
│  - Tab navigation, Document rendering, Modal dialogs          │
│  - WebSocket client, Wallet connection (MetaMask)              │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      Backend API (server.js)                    │
│  - REST endpoints, Git operations, Proposal management           │
│  - AI chat integration, Activity tracking                         │
└────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌────────────────────┐        ┌────────────────────────────┐
│   Git Repository   │        │   Smart Contracts (Solidity)│
│   (docs/finallica) │        │   - FinallicaGovernance    │
│   - Version control  │        │   - FinallicaProposals     │
│   - Commits on edit │        │   - FinallicaConsensus      │
└────────────────────┘        └────────────────────────────┘
```

## API Endpoints

### Documents
- `GET /api/documents` - List all documents
- `GET /api/documents/:docName` - Get document content
- `PUT /api/documents/:docName` - Update document
- `GET /api/documents/:docName/history` - Get version history

### Proposals
- `GET /api/proposals` - List all proposals
- `POST /api/proposals` - Create new proposal
- `GET /api/proposals/:id` - Get proposal details

### Voting
- `POST /api/vote` - Cast vote on proposal

### Consensus
- `GET /api/consensus` - Get consensus state

### AI Chat
- `POST /api/chat` - Send chat message

### Git
- `GET /api/git/status` - Get git status
- `POST /api/git/commit` - Commit changes
- `POST /api/git/merge` - Merge approved proposal

## Smart Contracts

### FinallicaGovernanceToken (BLF)
- ERC20 token with staking functionality
- Minimum stake: 500K BLF for VR, 2M BLF for Settlement Executor
- 30-day unbonding period

### FinallicaProposals
- Create and vote on documentation changes
- 7-day voting period
- 67% quorum threshold
- Proposal types: DOCUMENT_EDIT, NEW_SECTION, PROTOCOL_CHANGE, PARAMETER_UPDATE

### FinallicaConsensus
- HotStuff BFT-inspired consensus
- 8 notary nodes
- 4-phase protocol (PREPARE → PRE-COMMIT → COMMIT → DECIDE)
- State root finalization every 10 seconds

### FinallicaDocumentRegistry
- On-chain document hash storage
- Version history tracking
- Content verification

### FinallicaStaking
- Validator-Router registration
- Stake-based slashing conditions:
  - Double-sign: 100% slash
  - Censorship: 10% slash
  - Downtime: 1% slash

## Consensus Mathematics

The voting system uses **stake-weighted quadratic voting**:

```
Weighted Vote = stake^0.7 × (vote_weight / 100)

where:
  stake = user's staked BLF tokens
  vote_weight = percentage commitment (1-100)

Quorum = 67% of total staked tokens

Approval requires:
  votesFor > votesAgainst
  AND
  totalVotes ≥ Quorum
```

### Block Time & Finality

- **Block/Epoch**: Every 10 seconds (state root publication)
- **Voting Period**: 7 days per proposal
- **Finality**: 200ms (4 RTTs × 50ms)
- **Leader Rotation**: Every 8 blocks

## File Structure

```
finallica-webapp/
├── frontend/
│   ├── index.html          # Main HTML
│   ├── styles.css           # Styles
│   ├── app.js               # Frontend logic
│   └── *.md                # Documentation files
├── backend/
│   ├── server.js           # Express API server
│   └── package.json        # Backend dependencies
├── contracts/
│   ├── FinallicaGovernance.sol
│   ├── FinallicaProposals.sol
│   ├── FinallicaConsensus.sol
│   ├── FinallicaDocumentRegistry.sol
│   ├── FinallicaStaking.sol
│   ├── hardhat.config.js
│   └── package.json
└── README.md               # This file
```

## Development

### Adding New Features

1. **Backend**: Add routes to `server.js`
2. **Frontend**: Modify `app.js` for UI changes
3. **Contracts**: Update Solidity files in `contracts/`
4. **Styles**: Edit `styles.css` for theming

### Git Workflow

When users propose changes:

1. User creates proposal with Git diff
2. Stakeholders vote (67% quorum required)
3. If approved, changes auto-merge via Git commit
4. State root updated on-chain
5. All clients receive update via WebSocket

## Security Considerations

- **Wallet Connection**: MetaMask or demo mode
- **Stake Requirements**: Minimum 1000 BLF to propose
- **Slashing**: Misbehaving validators lose stake
- **Rate Limiting**: Token bucket per user
- **Input Validation**: All diffs and proposals validated

## License

MIT

---

*Built for the Finallica Project - A Global Financial Privacy Network*
