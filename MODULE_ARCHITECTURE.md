# Finallica Module Architecture

> Open System Design for Public Collaboration
> Last Updated: 2025-12-23

## Design Philosophy

**Finallica is a public open source project. All are welcome.**

This is not just a license choice—it's a core architectural principle. The system must be designed for openness from the ground up:

- **Transparent Architecture**: All systems should be observable and understandable
- **Extensibility First**: Plugin system, hooks, and extension points for contributors
- **Multi-Tenant by Design**: Support for self-hosting, public instances, and community deployments
- **Open Standards**: Use open protocols, avoid vendor lock-in
- **Contributor Experience**: Low barrier to entry, clear contribution paths
- **Public Roadmap**: Development happens in the open

When building features, ask: *"How would a contributor extend this? How would a community instance run this?"*

---

## Module Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                     FINALICA OPEN SYSTEM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  L0: 5 Core Engines                                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                                                              │ │
│  │  Content Engine │ Agent Engine │ Collab │ Platform │ Gov   │ │
│  │       │         │      │       │ Engine │  Engine │ Engine │ │
│  │       │         │      │       │        │         │        │ │
│  │  L1: 10 Modules                                                 │
│  │  ─────────────────────────────────────────────────────────  │ │
│  │  • Documentation      • Agent Fleet    • Collaboration      │ │
│  │  • Search & Discovery • Sandbox Engine • Sharing            │ │
│  │                                            │                 │ │
│  │                                            ▼                 │ │
│  │  • Infrastructure      • CI/CD          • Governance        │ │
│  │  • Repository Mgmt     • Incentives                         │ │
│  │                                                              │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## L0: 5 Core Engines

| # | Engine | Scope | Owner |
|---|--------|-------|-------|
| 1 | **Content Engine** | Documentation, Search & Discovery | `content/` |
| 2 | **Agent Engine** | Agent Fleet, Sandbox | `agents/` |
| 3 | **Collaboration Engine** | Sharing, comments, multi-user | `collaboration/` |
| 4 | **Platform Engine** | Infrastructure, CI/CD, Repository Management | `platform/` |
| 5 | **Governance Engine** | Auth, permissions, Incentives, blockchain | `governance/` |

---

## L1: 10 Modules

### Content Engine (2 modules)

| Module | Current Files | Target Path | Status |
|--------|---------------|-------------|--------|
| **Documentation** | `docs/`, doc routes, DocIndexer | `content/documentation/` | Partial |
| **Search & Discovery** | RepoSuggester, doc_chunks, doc_index | `content/search/` | New |

### Agent Engine (2 modules)

| Module | Current Files | Target Path | Status |
|--------|---------------|-------------|--------|
| **Agent Fleet** | agent-fleet-service.js, agent-scheduler.js, budget-manager.js, api-key-pool.js | `agents/fleet/` | ✅ Exists |
| **Sandbox Engine** | (none) | `agents/sandbox/` | ❌ New |

### Collaboration Engine (1 module)

| Module | Current Files | Target Path | Status |
|--------|---------------|-------------|--------|
| **Collaboration** | share-service.js, share routes | `collaboration/` | ✅ Exists |

### Platform Engine (3 modules)

| Module | Current Files | Target Path | Status |
|--------|---------------|-------------|--------|
| **Infrastructure** | server.js, database/, monitoring-service.js, backup-service.js | `platform/infrastructure/` | Partial |
| **CI/CD Integration** | (none - basic git integration) | `platform/cicd/` | New |
| **Repository Management** | git-sync.js, repository-service.js, repo routes, collections routes | `platform/repository/` | ✅ Exists |

### Governance Engine (2 modules)

| Module | Current Files | Target Path | Status |
|--------|---------------|-------------|--------|
| **Governance** | Privacy service, consensus routes, voting, proposals | `governance/` | Partial |
| **Incentives** | (none) | `governance/incentives/` | ❌ New |

---

## Current State Analysis

### Existing Services Map

```
backend/services/
├── git-sync.js                    → Platform/Repository
├── repository-service.js          → Platform/Repository
├── privacy-service.js             → Governance/Governance
├── ai-provider-service.js         → Agent/Agent Fleet (dependency)
├── streaming-service.js           → Infrastructure (utility)
├── agent-scheduler.js             → Agent/Agent Fleet
├── api-key-pool.js                → Agent/Agent Fleet
├── budget-manager.js              → Agent/Agent Fleet
├── context7-server.js             → Content/Documentation (MCP)
├── dev-mode-detector.js           → Platform/Infrastructure
├── doc-indexer.js                 → Content/Documentation
├── mcp-client.js                  → Infrastructure (protocol)
├── mcp-passport.js                → Infrastructure (auth)
├── repo-suggester.js              → Content/Search
├── monitoring-service.js          → Platform/Infrastructure
├── api-docs-service.js            → Platform/Infrastructure
├── share-service.js               → Collaboration
├── command-registry.js            → Collaboration
├── agent-fleet-service.js         → Agent/Agent Fleet
└── backup-service.js              → Platform/Infrastructure

backend/routes/
├── repositories.js                → Platform/Repository
├── collections.js                 → Platform/Repository
├── ai.js                          → Agent/Agent Fleet
├── context7.js                    → Content/Documentation
├── mcp.js                         → Infrastructure
├── suggestions.js                 → Content/Search
├── share.js                       → Collaboration
└── commands.js                    → Collaboration
```

### Database Schema (Current)

```sql
-- Current tables and their module mapping:

repositories              → Platform/Repository
repository_files          → Content/Documentation
collections               → Content/Documentation
submissions               → Content/Documentation
sync_jobs                 → Platform/Repository
sync_schedule             → Platform/Repository
auth_tokens               → Governance/Governance
discovery_rules           → Content/Search
activity_log              → Platform/Infrastructure
doc_chunks                → Content/Documentation
doc_index                 → Content/Documentation
repo_suggestions_feedback → Content/Search
repo_popularity           → Content/Search

-- Agent Fleet tables (003_agent_fleet.sql):
agents                    → Agent/Agent Fleet
agent_tasks               → Agent/Agent Fleet
budgets                   → Agent/Agent Fleet
api_key_pools             → Agent/Agent Fleet
observability_metrics     → Platform/Infrastructure
observability_logs        → Platform/Infrastructure
observability_alerts      → Platform/Infrastructure

-- Share system (add_share_system.sql):
shares                    → Collaboration
share_views               → Collaboration
```

---

## Migration Plan

### Phase 1: Foundation (Week 1-2)

**Goal**: Establish module structure without breaking existing functionality

1. **Create directory structure**
   ```
   engines/
   ├── content/
   │   ├── documentation/
   │   └── search/
   ├── agents/
   │   ├── fleet/
   │   └── sandbox/
   ├── collaboration/
   ├── platform/
   │   ├── infrastructure/
   │   ├── cicd/
   │   └── repository/
   └── governance/
       ├── governance/
       └── incentives/
   ```

2. **Create module manifest system**
   - Each engine has a `manifest.json`
   - Each module has `module.json` with:
     - Name, description, dependencies
     - Routes, services, database tables
     - Public API surface

3. **Create shared interfaces**
   - `Engine` base class
   - `Module` base class
   - Event bus for inter-module communication

### Phase 2: Move Existing Code (Week 3-4)

**Goal**: Migrate existing services to new structure

| Priority | Module | Effort | Dependencies |
|----------|--------|--------|--------------|
| 1 | Platform/Infrastructure | Low | None |
| 2 | Platform/Repository | Medium | Infrastructure |
| 3 | Agent/Agent Fleet | Low | Already modular |
| 4 | Content/Documentation | Medium | Infrastructure |
| 5 | Collaboration | Low | Infrastructure |
| 6 | Content/Search | Medium | Documentation |
| 7 | Governance/Governance | High | Infrastructure |
| 8 | Platform/CI-CD | High | Infrastructure, Repository |
| 9 | Agent/Sandbox | High | Fleet, Infrastructure |
| 10 | Governance/Incentives | High | Governance, Agents |

### Phase 3: Build New Modules (Week 5-8)

**Goal**: Implement missing modules

1. **Sandbox Engine** (Week 5-6)
   - Environment isolation
   - Mock blockchain
   - Snapshot/restore
   - Per-sandbox databases

2. **Incentives** (Week 6-7)
   - Token economics
   - Contribution tracking
   - Reward distribution
   - Staking pools

3. **CI/CD Integration** (Week 7-8)
   - GitHub Actions integration
   - Pipeline management
   - Deployment automation

### Phase 4: Integration & Polish (Week 9-10)

**Goal**: Ensure all modules work together seamlessly

1. Inter-module event system
2. Module discovery and loading
3. API gateway for all modules
4. Unified configuration system
5. Testing and documentation

---

## Module Interface Specification

Each module must implement:

```typescript
interface Module {
  // Metadata
  id: string;
  version: string;
  engine: EngineType;
  dependencies: string[];

  // Lifecycle
  initialize(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;

  // API
  getRoutes(): Route[];
  getServices(): Service[];
  getDatabaseMigrations(): Migration[];

  // Events
  onEvent(event: Event): Promise<void>;

  // Health
  healthCheck(): Promise<HealthStatus>;
}

interface Engine {
  id: string;
  modules: Map<string, Module>;
  eventBus: EventBus;
  initialize(): Promise<void>;
  registerModule(module: Module): Promise<void>;
  getModule(id: string): Module;
}
```

---

## Open Extension Points

For contributors to extend the system:

1. **Custom Agents** - Add new agent types to Agent Fleet
2. **Search Providers** - Plug in search backends
3. **Storage Backends** - Alternative database/storage
4. **Auth Providers** - Additional authentication methods
5. **Notification Channels** - Custom notification delivery
6. **Incentive Rules** - Custom reward calculation logic

---

## File Structure (Target)

```
finallica-webapp/
├── engines/                    # L0: Core Engines
│   ├── content/
│   │   ├── documentation/      # L1: Documentation module
│   │   │   ├── services/
│   │   │   ├── routes/
│   │   │   ├── models/
│   │   │   ├── migrations/
│   │   │   └── module.json
│   │   └── search/             # L1: Search & Discovery
│   ├── agents/
│   │   ├── fleet/              # L1: Agent Fleet
│   │   └── sandbox/            # L1: Sandbox Engine
│   ├── collaboration/
│   │   └── sharing/            # L1: Collaboration
│   ├── platform/
│   │   ├── infrastructure/     # L1: Infrastructure
│   │   ├── cicd/               # L1: CI/CD Integration
│   │   └── repository/         # L1: Repository Management
│   └── governance/
│       ├── governance/         # L1: Governance
│       └── incentives/         # L1: Incentives
├── shared/                     # Shared utilities
│   ├── database/
│   ├── event-bus/
│   ├── middleware/
│   └── types/
├── backend/                    # Legacy (during migration)
└── frontend/
```

---

## Next Steps

1. ✅ Define module hierarchy (this document)
2. ⏳ Create directory structure
3. ⏳ Implement Engine/Module base classes
4. ⏳ Migrate Platform/Infrastructure first
5. ⏳ Migrate remaining modules in priority order
6. ⏳ Implement Sandbox Engine
7. ⏳ Implement Incentives module
8. ⏳ Implement CI/CD Integration
9. ⏳ Full integration testing
10. ⏳ Public documentation for contributors

---

## Questions for Contributors

- How should modules be packaged for distribution?
- Should we support hot-reloading of modules?
- What's the right API versioning strategy?
- How do we handle breaking database migrations?

*All welcome to contribute to the discussion.*
