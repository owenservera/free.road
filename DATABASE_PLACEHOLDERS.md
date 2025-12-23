# Database Interface Placeholders

> **Status:** Database connection established. Some methods may not be available to all modules.
> **Last Updated:** December 23, 2025

## Overview

The database singleton (`backend/database/index.js`) implements a full-featured SQLite interface using sql.js. All expected methods exist in the DatabaseManager class.

## Current Issue

The database is being passed correctly from `server-new.js` to engines, but some modules report receiving `undefined` for `this.context.database`. This is a **wiring issue**, not a missing implementation.

## Implemented Methods

### API Key Pools
- [x] `getAllAPIKeyPools()` - Returns all API key pools from database
- [x] `getAPIKeyPool(id)` - Returns specific pool by ID
- [x] `createAPIKeyPool(pool)` - Creates new API key pool
- [x] `updateAPIKeyPool(id, pool)` - Updates existing pool
- [x] `deleteAPIKeyPool(id)` - Deletes a pool

### Agent Sessions
- [x] `createAgentSession(session)` - Creates new agent session
- [x] `getAgentSession(id)` - Retrieves session by ID
- [x] `getAllAgentSessions()` - Returns all sessions
- [x] `updateAgentSession(id, data)` - Updates session

### Agents
- [x] `createAgent(agent)` - Creates new agent record
- [x] `getAgent(id)` - Retrieves agent by ID
- [x] `getAllAgents(filters)` - Returns all agents with optional filters
- [x] `updateAgent(id, data)` - Updates agent record
- [x] `deleteAgent(id)` - Deletes agent

### Agent Tasks
- [x] `createAgentTask(task)` - Creates new task
- [x] `getAgentTask(id)` - Retrieves task by ID
- [x] `updateAgentTask(id, data)` - Updates task
- [x] `getAllAgentTasks(filters)` - Returns all tasks

### Observability
- [x] `logObservabilityLog(agentId, level, message, data)` - Logs observability event
- [x] `createObservabilityAlert(type, severity, message)` - Creates alert
- [x] `logObservabilityMetric(agentId, metric, value, unit)` - Logs metric

## Temporarily Guarded Methods

These methods exist but have guards added to prevent crashes when database is unavailable:

1. **APIKeyPool.loadPoolsFromDatabase()** - `engines/agents/fleet/services/key-pool.js:193`
   - Guard: Checks if `this.db` exists and has `getAllAPIKeyPools` method
   - Behavior: Returns early with warning if database unavailable
   - TODO: Fix context wiring so database is always available

2. **AgentFleetService.start()** - `engines/agents/fleet/services/agent-fleet.js:86`
   - Guard: Checks database availability before creating session
   - Behavior: Creates session only if database available
   - TODO: Ensure database is passed to all services

## Required Implementation Notes

### Fix Database Context Wiring

**Problem:** Modules receive `undefined` for `context.database` even though it's passed in `server-new.js`.

**Suspected Root Cause:** The engine/module initialization flow may have a race condition or context merging issue.

**Investigation Steps:**
1. Check debug output for `[Engine:agents] Creating module context` messages
2. Verify `this.context.database` is set before modules initialize
3. Check if PlatformEngine initialization affects AgentEngine context

**Expected Behavior:**
- Every engine should receive `{ database: db, logger: console }` in initialize()
- Every module should receive `database` in its context
- All database methods should be callable without guards

## Stub Methods (None)

All database methods are implemented. No stubs needed.

## Testing

To verify database is available:

```javascript
// In module _onInitialize()
const db = this.context.database;
console.log('Database available:', !!db);
console.log('Has getAllAPIKeyPools:', typeof db?.getAllAPIKeyPools === 'function');
```
