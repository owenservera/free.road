# Visualization System Quick Reference

**Full Plan:** See [VISUALIZATION-IMPLEMENTATION-PLAN.md](./VISUALIZATION-IMPLEMENTATION-PLAN.md)

---

## 🎯 THREE STACKS AT A GLANCE

### Stack 1: Core App Visualization
- **Purpose:** Interactive architecture & blueprints
- **Key Tools:** React Flow, ECharts, Deck.GL, Mermaid, Motion Canvas
- **Primary Use:** System editors, workflow builders, real-time collaboration

### Stack 2: Stateful Documentation Visualization  
- **Purpose:** Version-controlled knowledge graphs
- **Key Tools:** NetworkX, G6, PlantUML, Kroki, Gitlogue
- **Primary Use:** ADRs, knowledge graphs, versioned diagrams, dependency maps

### Stack 3: Live Operations Visualization
- **Purpose:** Real-time monitoring & metrics
- **Key Tools:** Plotly, WebSocket, GridStack, SQLite
- **Primary Use:** System health, agent status, performance analytics

---

## 📦 KEY DEPENDENCIES TO INSTALL

```bash
# Core app (Stack 1)
bun add reactflow echarts deck.gl @motion-canvas/core @motion-canvas/2d

# Documentation (Stack 2)
bun add @antv/g6 mermaid kroki-client simple-git
bun add --dev networkx

# Live ops (Stack 3)
bun add plotly.js ws gridstack
bun add sharp puppeteer express-ws
```

---

## 🗂️ DIRECTORY STRUCTURE

```
engines/visualization/
├── core-app/           # Stack 1
├── stateful-docs/      # Stack 2
├── live-ops/           # Stack 3
└── shared/             # Shared services
```

---

## 🗄️ DATABASE TABLES

- `diagrams` - Store diagram configurations
- `diagram_versions` - Version history (Stack 2)
- `metrics` - Time-series data (Stack 3)
- `metrics_rollup` - Aggregated metrics
- `alert_rules` - Alerting configuration (Stack 3)
- `alert_history` - Alert log
- `knowledge_edges` - Graph relationships (Stack 2)
- `knowledge_nodes` - Graph nodes (Stack 2)

---

## 🚀 QUICK START (After Approval)

```bash
# 1. Create directory structures
mkdir -p engines/visualization/{core-app,stateful-docs,live-ops,shared}

# 2. Install dependencies
bun add reactflow echarts @antv/g6 plotly.js ws

# 3. Create database migration
# See: VISUALIZATION-IMPLEMENTATION-PLAN.md#-database-schema-additions

# 4. Start implementation Phase 1
# Week 1: Stack 2 core infrastructure
# Week 2: Stack 2 knowledge graph
# Week 3: Stack 1 basic diagrams
```

---

## ⏱️ TIMELINE

| Week | Phase | Focus |
|------|-------|--------|
| 1-3 | Phase 1: Foundation | Stack 2 (docs) + Stack 1 (basic) |
| 4-7 | Phase 2: Enhanced | Stack 1 (advanced) + Stack 3 (ops) |
| 8-10 | Phase 3: Integration | Cross-stack + polish + testing |

**Total:** 10 weeks (400-500 hours)

---

## ❓ DECISION POINTS

Before starting, confirm:
1. ✅ Tech stack aligned with Bun/Node.js?
2. ✅ SQLite ok for metrics, or need TimescaleDB?
3. ✅ Real-time collaboration (WebSocket) or git-based?
4. ✅ Which export formats critical?
5. ✅ Python integration method (subprocess/microservice/WASM)?

---

## 📊 SUCCESS METRICS

### By End of Phase 1 (Week 3)
- [x] Mermaid diagrams render
- [x] Basic knowledge graph viewable
- [x] React Flow editor working
- [x] ECharts generating charts

### By End of Phase 2 (Week 7)
- [x] All 3 stacks operational
- [x] Real-time streaming charts
- [x] Dashboard widgets functional
- [x] Git history visualization

### By End of Phase 3 (Week 10)
- [x] Full integration tested
- [x] Performance optimized
- [x] Documentation complete
- [x] Ready for production

---

**Ready for Opus 4.5 review!** 🚦
