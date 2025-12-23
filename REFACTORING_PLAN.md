# Finalica System Refactoring Plan

## Overview

This document outlines the refactoring plan to migrate Finallica from its current monolithic backend structure to the new modular engine architecture.

## Current State Analysis

### Current Structure
```
backend/
├── server.js              # Main server file (1764 lines)
├── database/
│   ├── index.js           # Database connection
│   ├── index-improved.js  # Improved database implementation
│   ├── schema.sql         # Database schema
│   └── migrations/        # Database migrations
├── services/              # 22 service files
├── routes/               # 8 route files
└── config/               # Configuration files
```

### Services Breakdown

| Service | Purpose | Dependencies | Target Engine/Module |
|---------|---------|--------------|----------------------|
| agent-fleet-service.js | Agent fleet management | api-key-pool, budget-manager | Agent/Fleet |
| agent-scheduler.js | Task scheduling | api-key-pool, budget-manager, agent-fleet | Agent/Fleet |
| api-key-pool.js | API key management | database | Agent/Fleet |
| budget-manager.js | Cost tracking | api-key-pool, database | Agent/Fleet |
| backup-service.js | Database backup | database | Platform/Infrastructure |
| command-registry.js | Command registry | database | Collaboration/Sharing |
| context7-server.js | Documentation MCP server | database | Content/Documentation |
| dev-mode-detector.js | Development mode detection | - | Platform/Infrastructure |
| doc-indexer.js | Document indexing | database | Content/Documentation |
| git-sync.js | Git repository synchronization | database | Platform/Repository |
| mcp-client.js | MCP protocol client | mcp-passport | Platform/Infrastructure |
| mcp-passport.js | MCP authentication | database | Platform/Infrastructure |
| monitor-ing-service.js | System monitoring | database | Platform/Infrastructure |
| privacy-service.js | Privacy (Tornado) | database | Governance/Governance |
| repository-service.js | Repository management | database, git-sync | Platform/Repository |
| repo-suggester.js | Repository suggestions | database, doc-indexer | Content/Search |
| share-service.js | Session sharing | database | Collaboration/Sharing |
| streaming-service.js | Real-time streaming | database | Agent/Fleet |
| ai-provider-service.js | AI provider integration | database | Agent/Fleet |
| doc-indexer.js | Document indexing | database | Content/Documentation |

### Routes Breakdown

| Route | Purpose | Target Engine/Module |
|-------|---------|----------------------|
| repositories.js | Repository CRUD | Platform/Repository |
| collections.js | Collection management | Platform/Repository |
| ai.js | AI chat interface | Agent/Fleet |
| context7.js | Context7 MCP server | Content/Documentation |
| mcp.js | MCP routes | Platform/Infrastructure |
| suggestions.js | Repository suggestions | Content/Search |
| share.js | Sharing functionality | Collaboration/Sharing |
| commands.js | Command execution | Collaboration/Sharing |

### Database Schema

| Table | Purpose | Target Engine/Module |
|-------|---------|----------------------|
| repositories | Git repository management | Platform/Repository |
| repository_files | Indexed documentation content | Content/Documentation |
| collections | Repository grouping | Platform/Repository |
| submissions | User-submitted repositories | Platform/Repository |
| sync_jobs | Background sync tracking | Platform/Repository |
| sync_schedule | Scheduler configuration | Platform/Repository |
| auth_tokens | Authentication tokens | Platform/Infrastructure |
| discovery_rules | Auto-import rules | Content/Search |
| activity_log | System audit trail | Platform/Infrastructure |
| doc_chunks | Document search indexing | Content/Documentation |
| doc_index | Document versioning | Content/Documentation |
| repo_suggestions_feedback | User interaction tracking | Content/Search |
| repo_popularity | Search ranking | Content/Search |
| agents | Agent registry | Agent/Fleet |
| agent_tasks | Agent task queue | Agent/Fleet |
| budgets | Budget management | Agent/Fleet |
| api_key_pools | API key management | Agent/Fleet |
| observability_* | System monitoring | Platform/Infrastructure |
| shares | Session sharing | Collaboration/Sharing |
| share_views | Share analytics | Collaboration/Sharing |

## Refactoring Strategy

### Phase 1: Foundation (Priority: HIGH)

**Goal**: Create working Platform Engine with core infrastructure

#### 1.1 Create Platform Engine Base
```javascript
// engines/platform/index.js
class PlatformEngine extends Engine {
  constructor() {
    super({ id: 'platform' });
  }

  async initialize() {
    // Initialize database, logging, monitoring
    await this._initializeCoreServices();
  }
}
```

#### 1.2 Move Core Infrastructure Services
- `backend/database/` → `engines/platform/infrastructure/database/`
- `backend/services/monitoring-service.js` → `engines/platform/infrastructure/services/monitoring.js`
- `backend/services/backup-service.js` → `engines/platform/infrastructure/services/backup.js`

#### 1.3 Create Module Structure
```json
// engines/platform/infrastructure/ModuleManifest.json
{
  "id": "infrastructure",
  "engine": "platform",
  "dependencies": [],
  "services": ["database", "monitoring", "backup"]
}
```

#### 1.4 Update Server.js
```javascript
// New entry point
const PlatformEngine = require('./engines/PlatformEngine');
const engine = new PlatformEngine();
await engine.initialize();
await engine.start();
```

### Phase 2: Repository Management (Priority: HIGH)

**Goal**: Extract repository management into proper module

#### 2.1 Create Repository Module
- Move `backend/services/repository-service.js` → `engines/platform/repository/services/`
- Move `backend/services/git-sync.js` → `engines/platform/repository/services/`
- Move `backend/routes/repositories.js` → `engines/platform/repository/routes/`

#### 2.2 Create Repository Module Manifest
```json
{
  "id": "repository",
  "engine": "platform",
  "dependencies": ["infrastructure"],
  "services": ["repository", "git-sync"],
  "routes": ["/api/repositories", "/api/collections"]
}
```

#### 2.3 Update Dependencies
- Repository module depends on Infrastructure module
- Database service is shared through engine context

### Phase 3: Content Engine (Priority: MEDIUM)

**Goal**: Extract document indexing and search functionality

#### 3.1 Create Content Engine
- `engines/content/DocumentationEngine.js`
- `engines/content/SearchEngine.js`

#### 3.2 Move Content Services
- `backend/services/doc-indexer.js` → `engines/content/documentation/services/`
- `backend/services/repo-suggester.js` → `engines/content/search/services/`
- `backend/routes/context7.js` → `engines/content/documentation/routes/`
- `backend/routes/suggestions.js` → `engines/content/search/routes/`

#### 3.3 Create Module Structure
- Documentation module: `engines/content/documentation/ModuleManifest.json`
- Search module: `engines/content/search/ModuleManifest.json`

### Phase 4: Agent Fleet (Priority: MEDIUM)

**Goal**: Extract AI agent system

#### 4.1 Create Agent Engine
- `engines/agents/AgentEngine.js`
- Move existing agent fleet services
- Create new module structure

#### 4.2 Move Agent Services
- `backend/services/agent-fleet-service.js` → `engines/agents/fleet/services/`
- `backend/services/agent-scheduler.js` → `engines/agents/fleet/services/`
- `backend/services/budget-manager.js` → `engines/agents/fleet/services/`
- `backend/services/api-key-pool.js` → `engines/agents/fleet/services/`
- `backend/services/ai-provider-service.js` → `engines/agents/fleet/services/`
- `backend/services/streaming-service.js` → `engines/agents/fleet/services/`

#### 4.3 Update Routes
- `backend/routes/ai.js` → `engines/agents/fleet/routes/`
- Move WebSocket handlers to appropriate modules

### Phase 5: Collaboration Engine (Priority: MEDIUM)

**Goal**: Extract sharing and command systems

#### 5.1 Create Collaboration Engine
- `engines/collaboration/CollaborationEngine.js`

#### 5.2 Move Collaboration Services
- `backend/services/share-service.js` → `engines/collaboration/sharing/services/`
- `backend/services/command-registry.js` → `engines/collaboration/sharing/services/`
- `backend/routes/share.js` → `engines/collaboration/sharing/routes/`
- `backend/routes/commands.js` → `engines/collaboration/sharing/routes/`

### Phase 6: Governance Engine (Priority: LOW)

**Goal**: Extract governance and privacy systems

#### 6.1 Create Governance Engine
- `engines/governance/GovernanceEngine.js`

#### 6.2 Move Governance Services
- `backend/services/privacy-service.js` → `engines/governance/governance/services/`
- Move privacy-related routes
- Move voting and proposal logic (in server.js)

## Implementation Plan

### Step 1: Setup (1-2 days)
1. Create engine directory structure
2. Implement basic Engine and Module classes
3. Create EventBus system
4. Setup module loader

### Step 2: Platform Engine (3-4 days)
1. Implement PlatformEngine base
2. Move database infrastructure
3. Create Infrastructure module
4. Update server.js to use new system

### Step 3: Repository Management (2-3 days)
1. Create Repository module
2. Move repository services
3. Update routes
4. Test functionality

### Step 4: Content Engine (3-4 days)
1. Create ContentEngine
2. Move documentation services
3. Implement search module
4. Test indexing and search

### Step 5: Agent Fleet (4-5 days)
1. Create AgentEngine
2. Move agent services
3. Implement WebSocket handling
4. Test agent functionality

### Step 6: Collaboration (2-3 days)
1. Create CollaborationEngine
2. Move sharing services
3. Implement command system
4. Test sharing functionality

### Step 7: Governance (2-3 days)
1. Create GovernanceEngine
2. Move privacy services
3. Implement voting system
4. Test governance features

### Step 8: Integration (2-3 days)
1. Full system integration
2. Performance testing
3. Bug fixes
4. Documentation

## Migration Strategy

### Parallel Development
1. Keep existing backend running
2. Build new engine system alongside
3. Gradually migrate services
4. Switch via feature flag

### Data Migration
1. Database schema changes in Platform Engine
2. Keep existing database structure
3. Add new tables to engine modules
4. Migration scripts for existing data

### Configuration Migration
1. Move config from backend/.env to engine modules
2. Create unified configuration system
3. Environment-specific configs
4. Validation schemas

## Testing Strategy

### Unit Tests
- Each engine gets its own test suite
- Module-level testing
- Service isolation testing

### Integration Tests
- Engine-to-engine communication
- Event bus testing
- Database interaction testing

### End-to-End Tests
- Full system functionality
- Performance testing
- Load testing

## Risk Mitigation

### Breaking Changes
- Keep existing API endpoints
- Gradual migration strategy
- Feature flags for new functionality

### Performance Impact
- Load testing at each phase
- Performance monitoring
- Optimization as needed

### Data Loss
- Backup before migration
- Data validation scripts
- Rollback procedures

## Success Criteria

1. ✅ All existing functionality preserved
2. ✅ New modular architecture working
3. ✅ Performance maintained or improved
4. ✅ Code quality improved
5. ✅ Extensibility enabled
6. ✅ Documentation updated

## Timeline

| Phase | Duration | Dependencies | Output |
|-------|----------|--------------|--------|
| Foundation | 2 days | - | Platform Engine |
| Repository | 3 days | Foundation | Repository Module |
| Content | 4 days | Foundation | Content Engine |
| Agents | 5 days | Foundation | Agent Engine |
| Collaboration | 3 days | Foundation | Collaboration Engine |
| Governance | 3 days | Foundation | Governance Engine |
| Integration | 3 days | All phases | Complete System |
| **Total** | **23 days** | | **Migrated System** |

## Post-Migration

1. **Code Cleanup**
   - Remove deprecated files
   - Update documentation
   - Add examples

2. **Optimization**
   - Performance tuning
   - Memory optimization
   - Database indexing

3. **Enhancements**
   - New modules
   - Additional features
   - Community contributions

---

**Status**: Planning Complete
**Next**: Implementation Agent will begin with Foundation Phase