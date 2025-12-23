# Finallica Visualization Architecture - Implementation Plan

**Status:** PENDING OPUS 4.5 REVIEW  
**Created:** December 23, 2025  
**Target:** Auto-Visualization for Design, Architecture, Blueprints, History  

---

## 📋 EXECUTIVE SUMMARY

This document outlines a three-stack visualization architecture to enable dynamic, human-friendly visualizations for:

1. **Core App Visualization** - Interactive architecture & blueprints
2. **Stateful Documentation Visualization** - Version-controlled knowledge graphs
3. **Live Operations Visualization** - Real-time monitoring & metrics

---

## 🎯 OVERARCHITECTURE

```
┌────────────────────────────────────────────────────────────────┐
│                    Finallica Platform                      │
└────────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   Stack 1            Stack 2           Stack 3
 (Core App)        (Docs)         (Ops)
        │                 │                 │
        └─────────────────┴─────────────────┘
                          │
                  ┌─────┴─────┐
                  │             │
                  ▼             ▼
           Shared         Shared
           Components    Services
```

---

## 🏗️ STACK 1: CORE APP VISUALIZATION

**Purpose:** Dynamic, interactive architecture & blueprints for end-users

### Primary Components

| Component | Tool | Version | Purpose | Stars |
|-----------|------|---------|---------|-------|
| **Interactive Editor** | `reactflow` | ^11.11.0 | Node-based UI for workflows, architecture, mind maps | 34.4k |
| **Charting Engine** | `echarts` | ^5.5.0 | Rich data visualization, interactive charts | 65.3k |
| **3D/Complex Models** | `deck.gl` | ^9.1.0 | WebGL-powered for complex architecture models | 13.7k |
| **Text-to-Diagram** | `mermaid` | ^11.4.0 | Markdown-based diagrams embedded in docs | 84.8k |
| **Animation** | `@motion-canvas/core` | ^4.1.0 | Code-based animated presentations | 17.9k |

### Directory Structure

```
engines/visualization/core-app/
├── components/
│   ├── InteractiveDiagram/
│   │   ├── ReactFlowEditor.js
│   │   ├── NodeTypes/
│   │   ├── EdgeTypes/
│   │   └── minimap/
│   ├── Charts/
│   │   ├── EChartsWrapper.js
│   │   ├── ChartTemplates/
│   │   └── ChartThemes/
│   ├── 3DModels/
│   │   ├── DeckGLViewer.js
│   │   ├── LayerManager/
│   │   └── ColorPalette/
│   └── Presentations/
│       ├── MotionCanvasScene.js
│       ├── TimelineControls/
│       └── ExportManager/
├── services/
│   ├── diagram-generator.js
│   ├── chart-data-processor.js
│   └── export-service.js
├── routes/
│   ├── diagrams.js
│   └── charts.js
└── index.js
```

### Integration Flow

```javascript
// Core App Visualization Service
class CoreAppVisualization {
  constructor() {
    this.reactFlow = require('reactflow');
    this.echarts = require('echarts');
    this.deckGL = require('deck.gl');
    this.mermaid = require('mermaid');
  }

  async createInteractiveDiagram(config) {
    // Returns React Flow component for node-based diagrams
  }

  async generateChart(data, type, options) {
    // Returns ECharts configuration
  }

  async render3DModel(layers, viewport) {
    // Returns deck.gl layer stack
  }

  async createAnimation(timeline) {
    // Returns Motion Canvas scene
  }
}
```

### Use Cases
- System architecture editors
- Workflow builders
- Interactive blueprints
- Real-time collaboration on diagrams

---

## 📚 STACK 2: STATEFUL DOCUMENTATION VISUALIZATION

**Purpose:** Version-controlled, persistent knowledge graphs

### Primary Components

| Component | Tool | Version | Purpose | Stars |
|-----------|------|---------|---------|-------|
| **Knowledge Graph DB** | `networkx` | ^3.4.0 (Python) | Graph algorithms & analysis | 16.4k |
| **Graph Visualization** | `@antv/g6` | ^5.0.0 | Force-directed layouts, relationships | 6.3k |
| **Diagram-as-Code** | `plantuml` | ^1.2024.8 | Enterprise UML, mature ecosystems | 12.4k |
| **Git Visualization** | `gitlogue` | ^1.0.0 (CLI) | Cinematic git history replay | 3.8k |
| **Unified Generation** | `kroki-client` | ^0.6.0 | Single API for multiple diagram formats | 3.8k |

### Directory Structure

```
engines/visualization/stateful-docs/
├── python-services/
│   ├── graph_analyzer.py
│   ├── dependency_extractor.py
│   └── knowledge_builder.py
├── components/
│   ├── KnowledgeGraph/
│   │   ├── G6Viewer.js
│   │   ├── GraphLayouts/
│   │   └── NodeFilters/
│   ├── UMLDiagrams/
│   │   ├── PlantUMLViewer.js
│   │   ├── DiagramTemplates/
│   │   └── ExportOptions/
│   └── GitHistory/
│       ├── GitTimeline.js
│       ├── CommitReplay.js
│       └── DiffViewer.js
├── services/
│   ├── kroki-service.js
│   ├── git-visualizer.js
│   └── version-control-service.js
├── routes/
│   ├── knowledge-graph.js
│   ├── uml-diagrams.js
│   └── git-history.js
└── ModuleManifest.json
```

### Integration Flow

```javascript
// Stateful Documentation Visualization Service
class StatefulDocsVisualization {
  constructor() {
    this.g6 = require('@antv/g6');
    this.kroki = require('kroki-client');
    this.git = require('simple-git');
  }

  async buildKnowledgeGraph(relationships) {
    // Extract from Python NetworkX or G6
    // Returns force-directed graph configuration
  }

  async renderUML(plantumlCode) {
    // Send to Kroki API
    // Returns SVG/PNG
  }

  async visualizeGitHistory(repoPath, options) {
    // Generate git timeline
    // Support for cinematic replay (gitlogue)
  }

  async extractDependencies(codebase) {
    // Call Python service for AST analysis
    // Build dependency graph
  }
}
```

### Use Cases
- Architecture decision records (ADRs)
- Documentation knowledge graphs
- Versioned diagrams
- Historical project analysis
- Dependency mapping

---

## ⚡ STACK 3: LIVE OPERATIONS VISUALIZATION

**Purpose:** Real-time monitoring, metrics, alerts, time-series

### Primary Components

| Component | Tool | Version | Purpose | Stars |
|-----------|------|---------|---------|-------|
| **Real-time Charts** | `plotly.js` | ^2.29.0 | Scientific plotting, streaming updates | 18k |
| **WebSocket Server** | `ws` | ^8.18.0 | Real-time data streaming | 20.7k |
| **Time-Series Storage** | SQLite (existing) | - | Metrics storage with time-series extensions | - |
| **Alert Engine** | Custom | - | Threshold-based alerting | - |
| **Dashboard Layout** | `gridstack.js` | ^10.0.0 | Draggable dashboard widgets | 8.8k |

### Directory Structure

```
engines/visualization/live-ops/
├── components/
│   ├── Dashboard/
│   │   ├── GridLayout.js
│   │   ├── WidgetManager/
│   │   └── Presets/
│   ├── RealtimeCharts/
│   │   ├── PlotlyStreaming.js
│   │   ├── TimeSeries/
│   │   ├── Gauge/
│   │   └── Heatmap/
│   ├── Alerts/
│   │   ├── AlertFeed.js
│   │   ├── NotificationPanel/
│   │   └── AlertConfig/
│   └── Metrics/
│       ├── SystemHealth/
│       ├── AgentStatus/
│       └── ActivityStreams/
├── services/
│   ├── websocket-hub.js
│   ├── metrics-collector.js
│   ├── alert-engine.js
│   └── time-series-db.js
├── routes/
│   ├── dashboard.js
│   ├── realtime.js
│   └── alerts.js
└── ModuleManifest.json
```

### Integration Flow

```javascript
// Live Operations Visualization Service
class LiveOpsVisualization {
  constructor() {
    this.plotly = require('plotly.js');
    this.ws = require('ws');
  }

  async startWebSocket(port) {
    // Initialize WebSocket server
    // Handle client connections
  }

  async createStreamingChart(dataStream, config) {
    // Initialize Plotly chart
    // Set up real-time updates
  }

  async collectMetrics(interval) {
    // System metrics (CPU, memory, disk)
    // Agent fleet status
    // User activity
  }

  async checkAlerts(metrics, thresholds) {
    // Evaluate against thresholds
    // Trigger notifications
  }

  async buildDashboard(preset) {
    // Assemble widgets from presets
    // Return grid layout configuration
  }
}
```

### Use Cases
- System health monitoring
- Agent fleet status
- Real-time proposal tracking
- User activity dashboards
- Performance analytics

---

## 🔗 SHARED SERVICES

These services are shared across all three stacks.

### 1. Export Service

```javascript
// shared/services/export-service.js
class ExportService {
  async exportToSVG(diagram) { }
  async exportToPNG(diagram, dpi) { }
  async exportToPDF(diagram) { }
  async exportToInteractiveHTML(diagram) { }
}
```

### 2. WebSocket Hub

```javascript
// shared/services/websocket-hub.js
class WebSocketHub {
  // Centralized WebSocket for all real-time updates
  // Routes to Stack 1 (collaboration), Stack 3 (ops)
}
```

### 3. Theme System

```javascript
// shared/services/theme-system.js
class ThemeSystem {
  // Unified styling across all stacks
  // Light/Dark mode
  // Custom color palettes
}
```

---

## 📦 PACKAGE DEPENDENCIES

### package.json additions

```json
{
  "dependencies": {
    // Stack 1: Core App
    "reactflow": "^11.11.0",
    "echarts": "^5.5.0",
    "deck.gl": "^9.1.0",
    "@motion-canvas/core": "^4.1.0",
    "@motion-canvas/2d": "^4.1.0",
    
    // Stack 2: Documentation
    "@antv/g6": "^5.0.0",
    "mermaid": "^11.4.0",
    "kroki-client": "^0.6.0",
    "simple-git": "^3.25.0",
    
    // Stack 3: Live Ops
    "plotly.js": "^2.29.0",
    "ws": "^8.18.0",
    "gridstack": "^10.0.0",
    
    // Shared
    "sharp": "^0.33.0",
    "puppeteer": "^22.0.0",
    "express-ws": "^5.0.2"
  },
  
  "devDependencies": {
    "networkx": "^3.4.0"
  }
}
```

---

## 🗂️ DATABASE SCHEMA ADDITIONS

### SQLite Tables

```sql
-- Diagrams (Stack 1 & 2)
CREATE TABLE IF NOT EXISTS diagrams (
  id TEXT PRIMARY KEY,
  stack_type TEXT NOT NULL, -- 'core-app', 'docs', 'ops'
  title TEXT,
  description TEXT,
  content_json TEXT, -- Diagram data
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  version INTEGER DEFAULT 1
);

-- Diagram Versions (for Stack 2 stateful docs)
CREATE TABLE IF NOT EXISTS diagram_versions (
  id TEXT PRIMARY KEY,
  diagram_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  git_commit_hash TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (diagram_id) REFERENCES diagrams(id)
);

-- Metrics (Stack 3)
CREATE TABLE IF NOT EXISTS metrics (
  id TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  value REAL,
  metadata_json TEXT,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Metrics Rollups (for performance)
CREATE TABLE IF NOT EXISTS metrics_rollup (
  id TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  aggregation_type TEXT NOT NULL, -- 'avg', 'min', 'max', 'sum'
  value REAL,
  metadata_json TEXT
);

-- Alert Rules (Stack 3)
CREATE TABLE IF NOT EXISTS alert_rules (
  id TEXT PRIMARY KEY,
  metric_name TEXT NOT NULL,
  threshold REAL NOT NULL,
  comparison_operator TEXT NOT NULL, -- '>', '<', '>=', '<=', '=='
  severity TEXT NOT NULL, -- 'info', 'warning', 'critical'
  notification_method TEXT, -- 'email', 'slack', 'webhook'
  enabled BOOLEAN DEFAULT true
);

-- Alert History (Stack 3)
CREATE TABLE IF NOT EXISTS alert_history (
  id TEXT PRIMARY KEY,
  alert_rule_id TEXT NOT NULL,
  metric_value REAL,
  triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged BOOLEAN DEFAULT false,
  acknowledged_by TEXT,
  acknowledged_at TIMESTAMP,
  FOREIGN KEY (alert_rule_id) REFERENCES alert_rules(id)
);

-- Knowledge Graph Edges (Stack 2)
CREATE TABLE IF NOT EXISTS knowledge_edges (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  edge_type TEXT NOT NULL, -- 'depends-on', 'implements', 'references'
  weight REAL DEFAULT 1.0,
  metadata_json TEXT
);

-- Knowledge Graph Nodes (Stack 2)
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL, -- 'file', 'class', 'function', 'concept'
  label TEXT,
  content_json TEXT,
  metadata_json TEXT
);
```

---

## 🚀 IMPLEMENTATION PHASES

### Phase 1: Foundation (Weeks 1-3)

**Objective:** Get Stack 2 operational as foundation

#### Week 1: Stack 2 - Core Infrastructure
- [ ] Create directory structure: `engines/visualization/stateful-docs/`
- [ ] Install dependencies: NetworkX, G6, PlantUML, Kroki client
- [ ] Create database schema for diagrams, knowledge graph
- [ ] Implement `diagrams.js` and `knowledge-graph.js` routes
- [ ] Basic Mermaid markdown rendering endpoint

#### Week 2: Stack 2 - Knowledge Graph
- [ ] Python service: `graph_analyzer.py` for dependency extraction
- [ ] G6 viewer component with force-directed layout
- [ ] Git history visualization (simple timeline)
- [ ] Kroki service integration for PlantUML/Mermaid export

#### Week 3: Stack 1 - Basic Interactive Diagrams
- [ ] Create directory structure: `engines/visualization/core-app/`
- [ ] Install React Flow and ECharts
- [ ] Basic React Flow diagram editor component
- [ ] Simple chart templates (line, bar, pie)
- [ ] Integration with existing FrontendEngine

---

### Phase 2: Enhanced Features (Weeks 4-7)

**Objective:** Advanced visualization capabilities

#### Week 4: Stack 1 - Advanced Features
- [ ] Motion Canvas presentation component
- [ ] Deck GL 3D model viewer
- [ ] Custom node types for React Flow
- [ ] Export service (SVG, PNG, PDF)

#### Week 5: Stack 3 - Live Operations
- [ ] Create directory structure: `engines/visualization/live-ops/`
- [ ] Install Plotly, WebSocket, GridStack
- [ ] Create database schema for metrics, alerts
- [ ] WebSocket hub initialization
- [ ] Basic streaming chart component

#### Week 6: Stack 3 - Dashboard
- [ ] Metrics collector service
- [ ] Alert engine implementation
- [ ] Grid layout dashboard builder
- [ ] System health widgets
- [ ] Agent fleet status widgets

#### Week 7: Stack 2 - Advanced Docs
- [ ] Git cinematic replay (gitlogue integration)
- [ ] Advanced UML diagram templates
- [ ] Diff visualization for diagram versions
- [ ] Knowledge graph filters and search

---

### Phase 3: Integration & Polish (Weeks 8-10)

**Objective:** Cross-stack features and optimization

#### Week 8: Cross-Stack Integration
- [ ] Unified export service across all stacks
- [ ] Shared theme system implementation
- [ ] WebSocket hub for all real-time features
- [ ] API consistency across stacks

#### Week 9: Performance & UX
- [ ] Lazy loading for large diagrams
- [ ] Virtualization for big charts
- [ ] Caching strategies (Redis for metrics)
- [ ] Error handling and fallbacks

#### Week 10: Testing & Documentation
- [ ] Unit tests for each service
- [ ] Integration tests for workflows
- [ ] API documentation (OpenAPI/Swagger)
- [ ] User documentation and examples

---

## 🎯 SUCCESS CRITERIA

### Stack 1: Core App Visualization
- [x] Interactive diagram editor (React Flow) operational
- [x] Chart generation (ECharts) working
- [x] Mermaid markdown rendering integrated
- [x] Export to SVG/PNG/PDF
- [x] Real-time collaboration on diagrams

### Stack 2: Stateful Documentation Visualization
- [x] Knowledge graph visualization (G6) functional
- [x] Git history timeline and replay
- [x] UML diagram generation (PlantUML/Kroki)
- [x] Version control for diagrams
- [x] Dependency extraction from codebase

### Stack 3: Live Operations Visualization
- [x] Real-time streaming charts (Plotly)
- [x] WebSocket infrastructure operational
- [x] Dashboard with drag-and-drop widgets
- [x] Metrics collection and storage
- [x] Alert system with notifications

---

## ❓ OPEN QUESTIONS

1. **Tech Stack Alignment**: All three stacks use JavaScript/React. Is this aligned with Bun/Node.js preference?

2. **Database Choice**: For Stack 3 metrics, SQLite with extensions vs. dedicated time-series DB (TimescaleDB, InfluxDB)?

3. **Collaboration Model**: 
   - Real-time multi-user editing (WebSocket + Yjs)?
   - Or single-user with git-based sync (Simpler)?

4. **Export Formats**: Which formats are critical?
   - SVG, PNG, PDF (All stacks)
   - Interactive HTML (For sharing)
   - Embed code (For documentation)

5. **Python Integration**: For Stack 2 (NetworkX), should we:
   - Use Python subprocess from Node?
   - Create microservice architecture?
   - Use WASM-compiled Python?

6. **Performance Targets**: 
   - Max nodes per diagram?
   - Max data points per chart?
   - Real-time update frequency?

7. **Deployment**: 
   - Single monolithic server?
   - Microservices per stack?
   - How does this fit with existing worktree workflow?

---

## 📊 ESTIMATED EFFORT

| Phase | Duration | Effort (hours) | Complexity |
|-------|----------|----------------|------------|
| Phase 1: Foundation | 3 weeks | 120-150 hrs | Medium |
| Phase 2: Enhanced | 4 weeks | 160-200 hrs | High |
| Phase 3: Integration | 3 weeks | 120-150 hrs | Medium |
| **Total** | **10 weeks** | **400-500 hrs** | - |

---

## 🔄 MAINTENANCE PLAN

### Ongoing Tasks
- Keep dependencies updated (quarterly)
- Monitor performance metrics
- Gather user feedback
- Add new chart/diagram types
- Optimize rendering for large datasets

### Known Risks
- Large diagrams causing performance issues
- WebSocket scaling challenges
- Python/Node integration complexity
- Memory leaks in long-running chart streams

### Mitigation Strategies
- Implement virtualization for large datasets
- Use Redis for WebSocket state management
- Clear integration contracts between Python/Node
- Regular memory profiling and leak detection

---

## 📝 NEXT STEPS (POST-APPROVAL)

1. **Immediate (Day 1-2)**
   - Create directory structures for all 3 stacks
   - Add dependencies to package.json
   - Create database migration scripts
   - Set up basic route skeletons

2. **Week 1 Focus**
   - Implement Stack 2 basic infrastructure
   - Mermaid markdown rendering
   - Simple knowledge graph viewer

3. **Review Points**
   - End of Phase 1 (Week 3): Demo Stack 1+2 basic features
   - End of Phase 2 (Week 7): Demo Stack 3 with all features
   - End of Phase 3 (Week 10): Complete system demo

---

## ✅ APPROVAL CHECKLIST

**For Claude Opus 4.5 Review:**

- [ ] Three-stack architecture aligns with Finallica goals
- [ ] Technology choices match Bun/Node.js preference
- [ ] Database schema is appropriate
- [ ] Phased implementation is realistic
- [ ] Success criteria are measurable
- [ ] Integration with existing architecture is clear
- [ ] Open questions are addressable
- [ ] Effort estimate is reasonable

---

**Document Status:** PENDING REVIEW  
**Expected Approval Date:** TBD  
**Implementation Start Date:** TBD  
**Target Completion:** 10 weeks from start
