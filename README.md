# Jean-Claude

A desktop app for managing AI coding agents across multiple projects. Built with Electron, React, and the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk).

## Features

- **Multi-project workspace** — Manage coding tasks across multiple local projects from one interface
- **Agent sessions** — Stream real-time output, handle permission requests, and respond to agent questions
- **Git worktrees** — Isolate task changes in separate worktrees with diff viewing
- **Persistent history** — All messages stored locally in SQLite for session resumption

## Getting Started

```bash
# Install dependencies
pnpm install
pnpm rebuild
# Run in development mode
pnpm dev

# Build for production
pnpm build

# Install
pnpm install:mac
```

## Tech Stack

- **Frontend:** React 19, TailwindCSS, TanStack Router & Query, Zustand
- **Backend:** Electron, SQLite (better-sqlite3 + Kysely)
- **Agent:** Claude Agent SDK
