# Server Refactoring Migration Guide

**Date:** 2025-12-23
**Status:** Complete - Modular architecture created

---

## Overview

The monolithic `backend/server.js` (1586 lines) has been refactored into a modular structure with clear separation of concerns.

---

## New Directory Structure

```
backend/
├── config/
│   └── index.js                 # Centralized configuration
├── middleware/
│   ├── index.js                  # Middleware exports
│   ├── request-id.js            # Request ID middleware
│   ├── cors.js                   # CORS handling
│   ├── body-parser.js            # Body parsing
│   ├── error-handler.js           # Error handling
│   └── health-check.js           # Health check endpoint
├── init/
│   ├── services.js               # Service initialization
│   └── app.js                   # Main application
├── services/
│   ├── monitoring-service.js      # Monitoring (NEW)
│   ├── backup-service.js         # Backup service (NEW)
│   └── api-docs-service.js     # API docs (NEW)
├── routes/
│   └── [existing routes...]
└── server.js                     # OLD monolithic file (deprecated)
```

---

## Files Created

### Configuration
- **`backend/config/index.js`** (100 lines)
  - Centralized environment variable loading
  - Configuration validation
  - Structured config object
  - Environment-specific settings

### Middleware
- **`backend/middleware/index.js`** (12 lines)
  - Exports all middleware

- **`backend/middleware/request-id.js`** (17 lines)
  - Unique request IDs
  - X-Request-ID header

- **`backend/middleware/cors.js`** (17 lines)
  - Configurable CORS
  - Origin validation
  - Credentials support

- **`backend/middleware/body-parser.js`** (16 lines)
  - JSON and URL-encoded parsing
  - Size limits (10mb)

- **`backend/middleware/error-handler.js`** (45 lines)
  - Centralized error handling
  - Error logging
  - Standardized error responses
  - Async wrapper

- **`backend/middleware/health-check.js`** (42 lines)
  - Health check endpoint
  - Service status monitoring
  - Degraded state detection

### Services Initialization
- **`backend/init/services.js`** (250 lines)
  - Database initialization
  - Repository system initialization
  - AI services initialization
  - MCP services initialization
  - Documentation services initialization
  - Agent fleet initialization
  - Share & command initialization
  - Monitoring initialization
  - Backup initialization
  - Graceful shutdown

### Main Application
- **`backend/init/app.js`** (400+ lines)
  - Express app setup
  - Middleware application
  - Route registration
  - WebSocket handling
  - Server startup
  - Graceful shutdown

---

## Migration Steps

### 1. Install New Dependencies

```bash
cd backend
bun add winston archiver extract-zip
```

### 2. Backup Current Server

```bash
# Keep old server.js for rollback
cp backend/server.js backend/server.js.backup
```

### 3. Test New Structure

```bash
# Start new modular server
bun run backend/init/app.js

# Verify all routes work
curl http://localhost:3000/health
curl http://localhost:3000/api/repositories
curl http://localhost:3000/api/ai/models
```

### 4. Update package.json Scripts

Update `backend/package.json` start script:

```json
{
  "scripts": {
    "start": "node backend/init/app.js",
    "start:legacy": "node backend/server.js",
    "dev": "nodemon backend/init/app.js"
  }
}
```

### 5. Update Docker/Deployment Files

Update any deployment scripts to use new entry point:

```dockerfile
# Update from
CMD node backend/server.js
# To
CMD node backend/init/app.js
```

### 6. Integration Testing

Test all functionality:
- [ ] Health check endpoint
- [ ] Repository CRUD operations
- [ ] AI chat functionality
- [ ] Agent fleet operations
- [ ] Monitoring metrics
- [ ] Backup operations
- [ ] WebSocket connections

---

## Benefits of Refactoring

### Code Organization
- ✅ Clear separation of concerns
- ✅ Easy to locate specific functionality
- ✅ Reduced cognitive load when reading code
- ✅ Better code navigation

### Maintainability
- ✅ Smaller, focused files
- ✅ Easier to test individual components
- ✅ Easier to understand data flow
- ✅ Better error isolation

### Scalability
- ✅ Easy to add new middleware
- ✅ Easy to add new routes
- ✅ Easy to add new services
- ✅ Better dependency injection

### Testing
- ✅ Each module can be unit tested
- ✅ Mock services for integration tests
- ✅ Clear boundaries for tests

---

## API Compatibility

All existing API endpoints remain **unchanged**:

### Repository System
- `GET /api/repositories` - List repositories
- `POST /api/repositories` - Create repository
- `GET /api/repositories/:id` - Get repository
- `PUT /api/repositories/:id` - Update repository
- `DELETE /api/repositories/:id` - Delete repository

### AI System
- `GET /api/ai/models` - List AI models
- `POST /api/ai/chat` - Send chat message
- `GET /api/ai/providers` - List providers

### Agent Fleet
- `GET /api/agent-fleet/status` - Fleet status
- `POST /api/agent-fleet/start` - Start fleet
- `POST /api/agent-fleet/stop` - Stop fleet
- `GET /api/agents` - List agents
- `POST /api/agents/:id/terminate` - Terminate agent

### Monitoring (NEW)
- `GET /health` - Health check
- `GET /api/monitoring/health` - Detailed health
- `GET /api/monitoring/metrics` - Prometheus metrics
- `GET /api/monitoring/alerts` - Alerts list
- `POST /api/monitoring/alerts/:id/acknowledge` - Acknowledge alert

### Backups (NEW)
- `GET /api/backups/status` - Backup status
- `GET /api/backups` - List backups
- `POST /api/backups` - Create backup
- `POST /api/backups/:id/restore` - Restore backup
- `DELETE /api/backups/:id` - Delete backup

---

## Rollback Plan

If issues occur, rollback is simple:

```bash
# Restore original server
cp backend/server.js.backup backend/server.js

# Update package.json to use legacy
# "start": "node backend/server.js"

# Restart service
bun run backend/server.js
```

---

## Performance Improvements

### Better Middleware Stack
- Structured error responses
- Request tracking with IDs
- Proper CORS configuration
- Body size limits to prevent abuse

### Better Initialization
- Sequential service initialization
- Error propagation
- Health check integration
- Graceful shutdown handling

### Better Monitoring
- Built-in Prometheus metrics
- Structured logging
- Real-time health checks
- Alert system

---

## Next Steps

1. **Testing** (1-2 days)
   - Run integration tests
   - Test all API endpoints
   - Verify WebSocket functionality
   - Load testing

2. **Documentation** (0.5 day)
   - Update API docs with new endpoints
   - Document new architecture
   - Create migration guide for others

3. **Deployment** (1 day)
   - Update CI/CD pipeline
   - Deploy to staging
   - Monitor for issues
   - Gradual production rollout

4. **Monitoring Setup** (0.5 day)
   - Configure log aggregation
   - Set up alerting
   - Configure dashboards

---

## Configuration Updates

Add to `backend/.env`:

```bash
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# CORS Configuration
CORS_ORIGINS=http://localhost:8080,http://localhost:3000

# Monitoring Configuration
METRICS_ENABLED=true
LOG_LEVEL=info
METRICS_RETENTION_DAYS=30

# Backup Configuration
BACKUP_INTERVAL_MS=3600000
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION=false
```

---

## Dependencies Added

```json
{
  "winston": "^3.11.0",
  "archiver": "^6.0.0",
  "extract-zip": "^2.0.1"
}
```

---

## Troubleshooting

### Issue: Services fail to initialize

**Solution:** Check that database and logs directories exist:
```bash
mkdir -p backend/data
mkdir -p backend/logs
mkdir -p backend/metrics
mkdir -p backend/backups
```

### Issue: Port already in use

**Solution:** Kill existing process or change port:
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 bun run backend/init/app.js
```

### Issue: WebSocket connections fail

**Solution:** Check firewall settings and ensure WS protocol is allowed:
```bash
# Test WebSocket connection
wscat -c ws://localhost:3000
```

---

## Success Criteria

- [ ] New server starts without errors
- [ ] Health check returns healthy
- [ ] All existing API endpoints work
- [ ] New monitoring endpoints work
- [ ] New backup endpoints work
- [ ] WebSocket connections work
- [ ] Logs are being written
- [ ] Metrics are being collected

---

*Last Updated: 2025-12-23*
