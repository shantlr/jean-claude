// shared/mcp-types.ts

export interface McpServerTemplate {
  id: string;
  name: string;
  commandTemplate: string;
  variables: Record<string, string>;
  installOnCreateWorktree: boolean;
  presetId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NewMcpServerTemplate {
  id?: string;
  name: string;
  commandTemplate: string;
  variables: Record<string, string>;
  installOnCreateWorktree: boolean;
  presetId?: string | null;
  createdAt?: string;
  updatedAt: string;
}

export interface UpdateMcpServerTemplate {
  name?: string;
  commandTemplate?: string;
  variables?: Record<string, string>;
  installOnCreateWorktree?: boolean;
  presetId?: string | null;
  updatedAt?: string;
}

export interface ProjectMcpOverride {
  projectId: string;
  mcpTemplateId: string;
  enabled: boolean;
}

export interface NewProjectMcpOverride {
  projectId: string;
  mcpTemplateId: string;
  enabled: boolean;
}

// Preset definition (hardcoded in code, used to pre-fill forms)
export interface McpPresetVariable {
  label: string;
  description?: string;
  inputType: 'folder' | 'file' | 'text';
  placeholder?: string;
}

export interface McpPreset {
  id: string;
  name: string;
  description: string;
  commandTemplate: string;
  variables: Record<string, McpPresetVariable>;
  installOnCreateWorktree: boolean;
}

// Auto-provided variables context for substitution
export interface McpVariableContext {
  projectPath: string;
  projectName: string;
  branchName: string;
  mainRepoPath: string;
}

// MCP server from Claude's config (~/.claude.json)
export interface ClaudeMcpServer {
  name: string;
  type: 'stdio' | 'sse' | 'http';
  command: string; // Full command string (command + args joined)
  rawCommand: string; // Original command (first part)
  args: string[];
  env?: Record<string, string>;
}

// Unified view combining templates and active servers
export interface UnifiedMcpServer {
  name: string;
  command: string; // From active config if exists, otherwise from template
  template: McpServerTemplate | null; // Null if active-only
  isActive: boolean; // True if in Claude's config
  installOnWorktree: boolean; // From template + project override (false if no template)
}
