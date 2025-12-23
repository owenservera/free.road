# Infrastructure Module Status

> **Last Updated:** December 23, 2025
> **Status:** Partially Implemented - See Quick Plugs Below

## Removed Dependencies (Quick Plugs)

### Agent Fleet Module
- **Dependency:** `infrastructure` module
- **Status:** Removed from `engines/agents/ModuleManifest.json` and class dependencies
- **Reason:** Caused circular dependency issues during refactoring
- **Impact:** Agent Fleet may lack access to infrastructure services
- **TODO:** Properly resolve infrastructure dependencies or make them optional

### Original Architecture (Pre-Refactoring)

The infrastructure module was intended to provide:
1. **Database Service** - SQLite database wrapper
2. **Logger Service** - Centralized logging
3. **Monitoring Service** - Health checks and metrics
4. **Backup Service** - Database backups

## Current State

### Database Service
- **Status:** ✅ Implemented independently in `backend/database/index.js`
- **Wiring:** Passed directly to engines via `initialize({ database: db })`
- **Access:** Available via `this.context.database` in modules
- **Issue:** Some modules report database as undefined - context wiring problem

### Logger Service
- **Status:** ⚠️ Quick Plug - Using `console` directly
- **Location:** Passed as `logger: console` in engine initialization
- **TODO:** Implement proper logger service or remove requirement

### Monitoring Service
- **Status:** ⚠️ Quick Plug - Partially implemented
- **Implementation:** Basic health checks in Engine base class
- **TODO:** Full monitoring service with metrics and alerts

### Backup Service
- **Status:** ⚠️ Quick Plug - Configuration exists but not implemented
- **Location:** Referenced in PlatformEngine config
- **TODO:** Implement backup service or remove configuration

## Restored/Working Dependencies

### ✅ Database
- **File:** `backend/database/index.js`
- **Status:** Fully implemented with all required methods
- **Wiring:** Passed to engines in `server-new.js`
- **Access Pattern:** `this.context.database` in modules

### ✅ Event Bus
- **File:** `shared/event-bus/EventBus.js`
- **Status:** Implemented and working
- **Wiring:** Automatically created by Engine base class
- **Access Pattern:** `this.context.eventBus` or `this.subscribe()`

### ✅ Module Loader
- **File:** `shared/ModuleLoader.js`
- **Status:** Implemented with cross-engine support
- **Wiring:** Attached to engine context
- **Access Pattern:** `this.context.moduleLoader`

## Dependency Graph

```
server-new.js
    ├─> Database (backend/database/index.js)
    │   └─> Passed to all engines via initialize({ database: db })
    │
    ├─> PlatformEngine
    │   ├─> Repository Module
    │   ├─> Infrastructure Module (partially implemented)
    │   └─> Platform Module
    │
    ├─> ContentEngine
    │   ├─> Documentation Module
    │   └─> Search Module
    │
    ├─> AgentEngine
    │   └─> Fleet Module
    │       ├─> APIKeyPool Service (needs database)
    │       ├─> BudgetManager Service (needs database)
    │       ├─> AgentFleet Service (needs database)
    │       └─> Scheduler Service
    │
    ├─> CollaborationEngine
    │   └─> Sharing Module
    │
    └─> GovernanceEngine
        └─> Privacy Module
```

## Required Actions

### 1. Fix Database Context Wiring (HIGH PRIORITY)
- Investigate why `this.context.database` is undefined in some modules
- Add debug logging to trace context flow
- Ensure all engines receive database before initializing modules

### 2. Restore or Remove Infrastructure Module (MEDIUM PRIORITY)
- Option A: Implement infrastructure module properly with all services
- Option B: Keep services separate and remove infrastructure dependency
- Option C: Make infrastructure an optional dependency

### 3. Implement Logger Service (LOW PRIORITY)
- Create `LoggerService` class or use existing library
- Replace `console` with logger throughout codebase
- Add log levels, formatting, and output options

### 4. Implement Monitoring Service (LOW PRIORITY)
- Create health check endpoints for all services
- Add metrics collection (CPU, memory, request counts)
- Implement alerting for service failures

### 5. Implement Backup Service (LOW PRIORITY)
- Automatic database backups to `backend/data/backups/`
- Configurable retention period
- Backup restoration functionality

## Module Manifest Updates Needed

### engines/agents/ModuleManifest.json
```json
{
  "dependencies": [],
  "optionalDependencies": ["infrastructure"]
}
```

### engines/platform/ModuleManifest.json
```json
{
  "dependencies": ["infrastructure"]
}
```

## Testing Checklist

- [ ] All engines start without database-related errors
- [ ] All modules can access `this.context.database`
- [ ] Database methods are callable from all services
- [ ] Logger service works (if implemented)
- [ ] Monitoring endpoints return health status
- [ ] Backup service runs on schedule (if implemented)
