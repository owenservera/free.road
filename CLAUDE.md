# Finallica Web App - Project Instructions

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
