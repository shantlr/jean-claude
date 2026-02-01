# MCP Server Templates Design

## Problem

Some MCP servers (like Serena) need per-project/worktree configuration. Currently users must manually run `claude mcp add` for each worktree, which is tedious and easy to forget.

For example, Serena requires:
```bash
claude mcp add serena -- uv run --directory /Users/plin/work/mcp/serena serena start-mcp-server --context claude-code --project "$(pwd)"
```

This command is user-specific (Serena installation path varies) and project-specific (needs the project path).

## Solution Overview

A generic MCP server template system with:

1. **Global templates** — User configures MCP server templates once in Settings → MCP Servers
2. **Per-project opt-out** — Projects can disable specific templates in Project Details
3. **Auto-install on worktree creation** — Templates with `installOnCreateWorktree: true` are automatically configured when creating worktrees
4. **Presets** — Built-in presets (starting with Serena) that pre-fill templates with sensible defaults

## Data Model

### McpServerTemplate (stored in database)

```typescript
interface McpServerTemplate {
  id: string;
  name: string;                      // "Serena"
  commandTemplate: string;           // "uv run --directory {serenaPath} serena start-mcp-server --context claude-code --project {projectPath}"
  variables: Record<string, string>; // { serenaPath: "/Users/plin/work/mcp/serena" }
  enabledByDefault: boolean;         // Auto-enable for all projects
  installOnCreateWorktree: boolean;  // Run `claude mcp add` at worktree creation
  presetId?: string;                 // "serena" — tracks which preset was used
}
```

### ProjectMcpOverride (stored in database)

```typescript
interface ProjectMcpOverride {
  projectId: string;
  mcpTemplateId: string;
  enabled: boolean;  // Override the template's enabledByDefault
}
```

### Auto-provided variables (substituted at runtime)

| Variable | Source |
|----------|--------|
| `{projectPath}` | Worktree path (or project path for non-worktree tasks) |
| `{projectName}` | Project name |
| `{branchName}` | Current branch name |
| `{mainRepoPath}` | Main repository path |

### Preset (hardcoded constant)

```typescript
interface McpPreset {
  id: string;
  name: string;
  description: string;
  commandTemplate: string;
  variables: {
    [key: string]: {
      label: string;
      description?: string;
      inputType: 'folder' | 'file' | 'text';
      placeholder?: string;
    }
  };
  enabledByDefault: boolean;
  installOnCreateWorktree: boolean;
}

const SERENA_PRESET: McpPreset = {
  id: 'serena',
  name: 'Serena',
  description: 'Code intelligence MCP for semantic search',
  commandTemplate: 'uv run --directory {serenaPath} serena start-mcp-server --context claude-code --project {projectPath}',
  variables: {
    serenaPath: {
      label: 'Serena Installation Path',
      description: 'The folder where Serena is installed',
      inputType: 'folder',
    }
  },
  enabledByDefault: true,
  installOnCreateWorktree: true,
};
```

## UI Design

### Settings → MCP Servers (new tab)

**Layout:**
- Left: List of configured MCP server templates
- Right: Form pane (when adding/editing)

**List view:**
- Shows each template: name, enabled by default badge, installOnCreateWorktree badge
- Edit/Delete actions per item
- "Add MCP Server" button at top

**Form pane (Add/Edit):**
- Name (text input)
- Command Template (text area, with hint about available variables)
- Variables section (dynamically rendered based on `{variableName}` patterns in command)
- "Enabled by default" toggle
- "Install on create worktree" toggle
- **"Use Serena Preset" button** — fills form with Serena preset values, shows folder picker for `serenaPath`

### Project Details → MCP Servers section

**Layout:**
- List of MCP templates that are `enabledByDefault: true` or have an override for this project
- Each row: template name, toggle switch (on/off)
- Toggle controls the `ProjectMcpOverride` for this project

## Implementation

### Database

**New tables:**

1. `mcp_templates` — stores user's configured MCP server templates
2. `project_mcp_overrides` — stores per-project enable/disable overrides

**Migration:**

```typescript
// electron/database/migrations/NNN_mcp_templates.ts

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('mcp_templates')
    .addColumn('id', 'text', (col) => col.primaryKey())
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('commandTemplate', 'text', (col) => col.notNull())
    .addColumn('variables', 'text', (col) => col.notNull()) // JSON string
    .addColumn('enabledByDefault', 'integer', (col) => col.notNull().defaultTo(1))
    .addColumn('installOnCreateWorktree', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('presetId', 'text')
    .addColumn('createdAt', 'text', (col) => col.notNull())
    .addColumn('updatedAt', 'text', (col) => col.notNull())
    .execute();

  await db.schema
    .createTable('project_mcp_overrides')
    .addColumn('projectId', 'text', (col) => col.notNull().references('projects.id').onDelete('cascade'))
    .addColumn('mcpTemplateId', 'text', (col) => col.notNull().references('mcp_templates.id').onDelete('cascade'))
    .addColumn('enabled', 'integer', (col) => col.notNull())
    .addPrimaryKeyConstraint('pk_project_mcp', ['projectId', 'mcpTemplateId'])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('project_mcp_overrides').execute();
  await db.schema.dropTable('mcp_templates').execute();
}
```

### Service

**New file: `electron/services/mcp-template-service.ts`**

Key functions:

```typescript
// Get all templates
function getAllTemplates(): Promise<McpServerTemplate[]>

// Get templates enabled for a specific project (considering overrides)
function getEnabledTemplatesForProject(projectId: string): Promise<McpServerTemplate[]>

// Install MCP servers for a worktree
// Runs `claude mcp add` for each enabled template with installOnCreateWorktree: true
// Errors are logged but don't throw (MCP setup failure shouldn't block worktree creation)
async function installMcpForWorktree(params: {
  worktreePath: string;
  projectId: string;
  projectName: string;
  branchName: string;
  mainRepoPath: string;
}): Promise<void>

// Substitute variables in command template
// Replaces {varName} with values from template.variables and auto-provided context
function substituteVariables(
  commandTemplate: string,
  variables: Record<string, string>,
  context: {
    projectPath: string;
    projectName: string;
    branchName: string;
    mainRepoPath: string;
  }
): string
```

### Integration with worktree creation

In `worktree-service.ts`, after worktree is created:

```typescript
// In createWorktree(), after buildWorktreeSettings():

try {
  await installMcpForWorktree({
    worktreePath,
    projectId,
    projectName,
    branchName,
    mainRepoPath: projectPath,
  });
} catch (error) {
  dbg.worktree('Failed to install MCP servers for worktree: %O', error);
  // Don't throw — MCP setup failure shouldn't block worktree creation
}
```

### File structure

```
electron/
  database/
    migrations/
      NNN_mcp_templates.ts
    repositories/
      mcp-templates.ts
      project-mcp-overrides.ts
    schema.ts (update)
  services/
    mcp-template-service.ts

shared/
  mcp-types.ts

src/
  features/
    settings/
      ui-mcp-servers-settings/
        index.tsx
        mcp-template-form.tsx
        mcp-template-list.tsx
        presets.ts
    project/
      ui-project-mcp-settings/
        index.tsx
  hooks/
    use-mcp-templates.ts
  routes/
    settings/
      mcp-servers.tsx
```

## Implementation Phases

### Phase 1: Core infrastructure
1. Add database migration for `mcp_templates` and `project_mcp_overrides`
2. Create repositories for both tables
3. Create `mcp-template-service.ts` with template CRUD and variable substitution
4. Add shared types in `shared/mcp-types.ts`

### Phase 2: Settings UI
1. Add "MCP Servers" tab to settings layout
2. Create `ui-mcp-servers-settings` with list and form pane
3. Implement Serena preset with folder picker
4. Add IPC handlers and React Query hooks

### Phase 3: Worktree integration
1. Integrate `installMcpForWorktree` into `createWorktree()`
2. Parse command template and run `claude mcp add` with substituted values

### Phase 4: Project-level overrides
1. Add MCP Servers section to Project Details
2. Show enabled templates with toggle switches
3. Implement override persistence
