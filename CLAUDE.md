# Finallica Web App - Project Instructions

## System Environment & Session Configuration

> **This session begins with system identification and configuration.** Since this tool will be deployed in different systems with different settings, each session must identify the environment and update CLAUDE.md to optimize for that particular setup.

### System Identification

**Current System:** VIVIM-Dev-Workstation
**Deployment Type:** Local Development
**Primary Development Environment:** CLI

### System-Specific Paths (LOCKED - DO NOT EDIT)

**Bun Executable Path:** `C:/Users/VIVIM.inc/.bun/bin/bun.exe`
**Bun Version:** 1.3.4

> **CRITICAL:** Always use the full path when running bun in this environment:
> ```bash
> "C:/Users/VIVIM.inc/.bun/bin/bun.exe" run <script>
> ```

### Core AI Editor Settings

- **Model Preference:** [Auto-detected or specified model]
- **Code Style:** [Auto-formatting, Linter integration, ESLint config]
- **Language Preferences:** [JavaScript/TypeScript, Bun only, Node.js versions]
- **Git Workflow:** [Standard commits, Conventional Commits, Squash merging]
- **Testing Framework:** [Testing strategy, test command]
- **Build System:** [Bun commands, build scripts, deployment targets]
- **IDE/Editor Integration:** [Language server, autocomplete, code intelligence]

### Dynamic Configuration

This CLAUDE.md file should be updated at the beginning of each session to include:

```markdown
## Session Configuration (Auto-generated)

### System Info
- **System:** [System identifier]
- **Environment:** [Development/Staging/Production]
- **Model:** [Active AI model]
- **Worktree:** [Current worktree if applicable]
- **Branch:** [Current branch]

### Project-Specific Settings
- **Package Manager:** [Detected package manager]
- **Dependencies:** [Checked dependencies]
- **Scripts:** [Available scripts]
- **Port:** [Active port]
- **API Keys:** [Key vault status]
```

> **When deploying to new systems:**
> 1. Update the System Identification section
> 2. Configure Core AI Editor Settings for the environment
> 3. Run `bun install --frozen-lockfile` for consistent dependencies
> 4. Verify system-specific configurations
> 5. Update this configuration at the start of each session

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

---

## AI Model Workflow: Opus 4.5 → Sonnet 4.5 → Haiku

**A surgical, cost-optimized approach to complex development tasks.**

### The Three-Model Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    TASK START                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 1: OPUS 4.5        │
│  Purpose:  Architecture & Planning                           │
│  Tasks:    • Complex analysis                               │
│            • System design                                  │
│            • Identify edge cases                            │
│            • Create detailed spec for Sonnet                │
│  Handoff:  → Pass context + plan to Sonnet 4.5              │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 2: SONNET 4.5      │
│  Purpose:  Implementation & Debugging                        │
│  Tasks:    • Read code deeply                               │
│            • Fix complex bugs                                │
│            • Implement core logic                            │
│            • Add guards/placeholders                         │
│            • Create detailed task spec for Haiku             │
│  Handoff:  → Pass precise instructions to Haiku             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STAGE 3: HAIKU        │
│  Purpose:  Mechanical & Systematic Execution                  │
│  Tasks:    • Repetitive refactoring                          │
│            • Adding similar stubs across files               │
│            • Running tests                                   │
│            • Documentation updates                           │
│            • Well-defined file operations                    │
│  Handoff:  → Report results to Sonnet for verification      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    TASK COMPLETE                              │
└─────────────────────────────────────────────────────────────┘
```

### When to Use Each Model

| Situation | Use Model | Reason |
|-----------|-----------|--------|
| New feature architecture | Opus 4.5 | Needs deep reasoning |
| Complex bug investigation | Opus 4.5 | Needs system-wide analysis |
| Unknown root cause | Opus 4.5 | Needs exploration |
| Implementing fixes | Sonnet 4.5 | Balance of speed + accuracy |
| Adding error handling | Sonnet 4.5 | Needs context awareness |
| Creating task specs | Sonnet 4.5 | Needs to understand codebase |
| Adding similar guards | Haiku | Mechanical pattern repetition |
| Updating 10+ files | Haiku | Cost efficiency |
| Running test suites | Haiku | Simple execution |
| Formatting changes | Haiku | Low complexity |

### Handoff Signals

**Opus → Sonnet:**
```
"I've analyzed the issue. Here's the root cause and fix approach.
Continue implementation and debug as needed. Create Haiku tasks for repetitive work."
```

**Sonnet → Haiku:**
```
"Here are the exact file changes needed. For each file:
1. Add [specific guard] at [specific line]
2. Use this exact format: [code pattern]
3. Report back when complete."
```

**Haiku → Sonnet:**
```
"Completed [N] files. Encountered [issue] in [file].
Awaiting verification and next instructions."
```

### General Rules

1. **Start with Opus** when: Problem is unclear, architecture is involved, or multiple systems interact
2. **Use Sonnet** for: Most implementation work, debugging, complex file changes
3. **Delegate to Haiku** for: Repetitive tasks, well-specified changes, test execution
4. **Never skip stages** when: Complexity increases, or errors cascade
5. **Fallback to previous model** when: Next model gets stuck or produces errors

### Example Task Flow

**Task:** Fix database context not passed to modules

```
Opus 4.5:  → Analyzes engine/module initialization flow
           → Identifies context merge issue
           → Documents exact fix locations
           → Passes to Sonnet

Sonnet 4.5: → Adds guards to prevent crashes
           → Creates debug logging
           → Documents placeholder spec
           → Passes mechanical work to Haiku

Haiku:     → Adds guards to 15+ similar files
           → Creates DATABASE_PLACEHOLDERS.md
           → Runs server to verify
           → Reports to Sonnet

Sonnet 4.5: → Verifies Haiku's work
           → Tests server startup
           → Commits changes
           → Task complete
```

### Cost Optimization

- **Opus:** ~15x cost, ~5x time → Use sparingly for thinking work
- **Sonnet:** ~3x cost, ~1.5x time → Use for most implementation
- **Haiku:** ~1x cost, ~1x time → Use for mechanical execution

**Target Distribution:** Opus 5% / Sonnet 35% / Haiku 60%

## Package Manager

**IMPORTANT: This project uses Bun for package management only.** Server files use Node.js runtime. Do not use npm or yarn.

**For VIVIM-Dev-Workstation**, use the full path:
```bash
# Install dependencies
"C:/Users/VIVIM.inc/.bun/bin/bun.exe" install

# Start backend server (Express app)
node backend/server.js

# Start main server (Express app)
node server-new.js

# Install new package
"C:/Users/VIVIM.inc/.bun/bin/bun.exe" add <package-name>
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

---

## Visualization System

**Plan:** [docs/VISUALIZATION-IMPLEMENTATION-PLAN.md](docs/VISUALIZATION-IMPLEMENTATION-PLAN.md)  
**Status:** Pending Opus 4.5 approval  
**Scope:** 3-stack architecture (Core App / Docs / Live Ops)
