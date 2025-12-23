# Finallica Web App - Project Instructions

## Open Source Philosophy

**Finallica is a public open source project. All are welcome.**

This is not just a license choice—it's a core architectural principle. The system must be designed for openness from the ground up:

- **Transparent Architecture**: All systems should be observable and understandable
- **Extensibility First**: Plugin system, hooks, and extension points for contributors
- **Multi-Tenant by Design**: Support for self-hosting, public instances, and community deployments
- **Open Standards**: Use open protocols, avoid vendor lock-in
- **Contributor Experience**: Low barrier to entry, clear contribution paths
- **Public Roadmap**: Development happens in the open

When building features, ask: "How would a contributor extend this? How would a community instance run this?"

## Package Manager

**IMPORTANT: This project uses Bun only.** Do not use npm or yarn.

```bash
# Install dependencies
bun install

# Start backend server
bun run backend/server.js

# Install new package
bun add <package-name>
```

## Project Overview

Finallica is a multi-repository documentation platform with AI-powered features, blockchain governance, and an Agent Fleet system for continuous development assistance.

## Key Architecture

- **Backend**: Node.js/Express with SQLite (sql.js)
- **Agent Fleet System**: Multi-agent system for code review, documentation, repo management, and cost observability
- **Database**: SQLite with migrations in `backend/database/migrations/`
- **AI Integration**: Multi-provider support (Anthropic, OpenAI, OpenRouter, Groq)

## Development

1. Install dependencies: `bun install`
2. Configure environment in `backend/.env`
3. Start server: `bun run backend/server.js`

---

## Git Worktree Workflow

This project uses **git worktrees** to enable parallel development across multiple agents, core services, and features. Each worktree has a specific intent and can be optimized for different AI models.

### Worktree Layout

```
~/
├── finallica-webapp/              # Main worktree (main branch)
├── finallica-agent-review/        # Code Review Agent
├── finallica-agent-docs/          # Documentation Agent
├── finallica-agent-repo/          # Repo Manager Agent
├── finallica-agent-tooling/       # Tooling Agent
├── finallica-agent-debug/         # Debugger Agent
├── finallica-agent-viz/           # Visualization Agent
├── finallica-agent-cost/          # Cost Observability Agent
├── finallica-core-fleet/          # Fleet Service
├── finallica-core-budget/         # Budget Manager
├── finallica-core-pool/           # API Key Pool
├── finallica-core-scheduler/      # Agent Scheduler
├── finallica-frontend/            # Frontend work
├── finallica-cli/                 # CLI enhancements
├── finallica-api/                 # API routes
└── finallica-integration/         # Integration testing
```

### Worktree Management Scripts

```bash
# List all available sessions
./bin/worktree-session list

# Show detailed status of all worktrees
./bin/worktree-status

# Clean up merged worktrees
./bin/worktree-cleanup clean-merged

# Remove a specific worktree
./bin/worktree-cleanup remove ../finallica-agent-review
```

### Predefined Sessions

Different worktree combinations for different development needs:

| Session | Purpose | Models |
|---------|---------|--------|
| `./bin/worktree-session core` | Core infrastructure | Opus 4, o1, Sonnet 4 |
| `./bin/worktree-session agents` | Agent development | Sonnet 4, Haiku, GPT-4o |
| `./bin/worktree-session frontend` | UI + API | GPT-4o, Sonnet 4 |
| `./bin/worktree-session cost-optimized` | Cost-effective work | Haiku, GPT-4o-mini, local |
| `./bin/worktree-session debug` | Debugging | Sonnet 4, o1-preview |

### Creating a New Worktree

```bash
# Create a new worktree for an agent
git worktree add ../finallica-agent-review -b agent/code-review

# Create a new worktree for a core service
git worktree add ../finallica-core-fleet -b core/fleet-service
```

### Weekly Integration Cycle

1. **Mon-Wed**: Feature development in parallel worktrees
2. **Thursday**: Merge to `test/integration` branch
3. **Friday**: Merge `test/integration` → `main`
4. **Saturday**: Cleanup stale worktrees

### Database Schema Coordination

**Important**: Database schema changes should only happen in the main worktree.

1. Make schema changes in `finallica-webapp` (main)
2. Other worktrees sync: `git pull origin main`
3. Then implement features using new schema

### Per-Worktree AI Configuration

Each worktree can have its own AI instructions. Create a `docs/AI-SESSION-GUIDE.md` in the worktree:

```markdown
# Worktree: Code Review Agent

## Recommended Model
- Claude Sonnet 4 or GPT-4o

## Scope
- Focus: `backend/services/agents/code-review-agent.js`
- Avoid: Other agent files

## Current Work
- Improving PR analysis
- Adding diff visualization
```

### CI/CD

Each branch type has automated tests:
- `agent/**` → Agent-specific tests
- `core/**` → Service-specific tests
- `test/**` → Integration tests

See `.github/workflows/` for details.
