# Unified MCP Servers Design

## Problem

The current MCP Templates feature manages templates for auto-installing MCP servers on worktree creation, but it's separate from Claude's actual MCP configuration. Users need to see both:

1. **MCP Templates** (in Jean-Claude's DB) — what will be installed on new worktrees
2. **Active MCP Servers** (in `~/.claude.json`) — what Claude Code is currently using

## Solution Overview

A unified view in Project Details that merges templates with Claude's active MCP config, showing a single list with two independent toggles:

- **Active toggle**: Add/remove from Claude's current config
- **Install on worktree toggle**: Auto-install when creating worktrees (templates only)

## Two Views for MCP Management

### Settings → MCP Servers (global, unchanged)

- Create, edit, delete MCP templates
- Set defaults: `enabledByDefault`, `installOnCreateWorktree`
- Preset buttons (e.g., Serena) to pre-fill templates

### Project Details → MCP Servers (per-project, modified)

- Unified list merging templates + active MCP servers
- Single merged row when template name matches active server name
- Two toggles per row (when applicable)
- Read-only rows for active servers without templates

## Unified List Row States

| State | Source | Badges | Active Toggle | Worktree Toggle |
|-------|--------|--------|---------------|-----------------|
| Template only (inactive) | DB only | `Template` | OFF → turns ON | Shown |
| Template + Active | DB + Claude config | `Template` `Active` | ON | Shown |
| Active only (no template) | Claude config only | `Active` | ON → turns OFF | Hidden |

### Row Display

```
┌──────────────────────────────────────────────────────────────────────┐
│ Serena                                      [Template] [Active]      │
│ uv run --directory /path/to/serena serena start-mcp-server ...       │
│                                                                      │
│                          [Active: ON]    [Install on worktree: ON]   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ filesystem                                             [Active]      │
│ npx @anthropic/mcp-server-filesystem /path                           │
│                                                                      │
│                          [Active: ON]                                │
└──────────────────────────────────────────────────────────────────────┘
```

## Toggle Behaviors

### Active Toggle

- **OFF → ON**: Runs `claude mcp add <name> --scope local -- <command>` in the project directory
  - For templates: uses the template's command with variables substituted
  - For active-only servers: N/A (already active)
- **ON → OFF**: Runs `claude mcp remove <name>` in the project directory

### Install on Worktree Toggle (templates only)

- Controls the `ProjectMcpOverride.enabled` value (existing functionality)
- When ON: template auto-installs when creating worktrees for this project
- When OFF: template skipped for this project's worktrees

### Edge Case: Template + Active with Different Commands

If a template exists for "serena" but the active Claude config has a different command (e.g., user manually modified it), we show the active command in the row but the template's command is used for the worktree toggle behavior.

## Reading Claude's MCP Config

MCP servers are stored in `~/.claude.json` under `projects[projectPath].mcpServers`:

```json
{
  "projects": {
    "/Users/plin/work/myproject": {
      "mcpServers": {
        "serena": {
          "type": "stdio",
          "command": "uv",
          "args": ["run", "--directory", "/path/to/serena", "serena", "start-mcp-server", "--context", "claude-code", "--project", "/Users/plin/work/myproject"],
          "env": {}
        }
      }
    }
  }
}
```

## Data Model

### New Types (shared/mcp-types.ts)

```typescript
interface ClaudeMcpServer {
  name: string;
  command: string;      // Full command string (command + args joined)
  rawCommand: string;   // Original command
  args: string[];
  env?: Record<string, string>;
  type: 'stdio' | 'sse' | 'http';
}

interface UnifiedMcpServer {
  name: string;
  command: string;           // From active config if exists, otherwise from template
  template: McpServerTemplate | null;  // Null if active-only
  isActive: boolean;         // True if in Claude's config
  installOnWorktree: boolean; // From template + project override (false if no template)
}
```

## Implementation

### Service Changes (electron/services/mcp-template-service.ts)

```typescript
// Read MCP servers from ~/.claude.json for a specific project path
function getClaudeMcpServers(projectPath: string): ClaudeMcpServer[]

// Merge templates + active servers into unified list
function getUnifiedMcpServers(projectId: string, projectPath: string): UnifiedMcpServer[]

// Add MCP server to Claude's config
function activateMcpServer(projectPath: string, name: string, command: string): Promise<void>

// Remove MCP server from Claude's config
function deactivateMcpServer(projectPath: string, name: string): Promise<void>
```

### Files to Modify

1. **`electron/services/mcp-template-service.ts`**
   - Add `getClaudeMcpServers(projectPath)`
   - Add `getUnifiedMcpServers(projectId, projectPath)`
   - Add `activateMcpServer(projectPath, name, command)`
   - Add `deactivateMcpServer(projectPath, name)`

2. **`shared/mcp-types.ts`**
   - Add `ClaudeMcpServer` interface
   - Add `UnifiedMcpServer` interface

3. **`electron/ipc/handlers.ts`**
   - Add handlers for unified list and activate/deactivate

4. **`electron/preload.ts` + `src/lib/api.ts`**
   - Expose new IPC methods

5. **`src/hooks/use-mcp-templates.ts`**
   - Add `useUnifiedMcpServers(projectId, projectPath)` hook
   - Add `useActivateMcpServer()` and `useDeactivateMcpServer()` mutations

6. **`src/features/project/ui-project-mcp-settings/index.tsx`**
   - Refactor to use unified list
   - Add dual toggles (Active + Install on worktree)
   - Show badges for Template/Active
   - Rename section from "MCP Server Templates" to "MCP Servers"
