// electron/services/mcp-template-service.ts
import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

import type {
  ClaudeMcpServer,
  McpPreset,
  McpServerTemplate,
  McpVariableContext,
  UnifiedMcpServer,
} from '../../shared/mcp-types';
import { McpTemplateRepository } from '../database/repositories/mcp-templates';
import { ProjectMcpOverrideRepository } from '../database/repositories/project-mcp-overrides';
import { dbg } from '../lib/debug';

const execAsync = promisify(exec);

// Built-in presets
export const MCP_PRESETS: McpPreset[] = [
  {
    id: 'serena',
    name: 'Serena',
    description: `A powerful coding agent toolkit providing semantic retrieval and editing capabilities.

**Features:**
- Symbol-level code comprehension
- Multi-language support (TypeScript, JavaScript, Python, Java, C#, and more)
- Advanced project analysis

**Installation:**
\`\`\`bash
git clone https://github.com/oraios/serena
\`\`\`

[View installation guide →](https://oraios.github.io/serena/02-usage/020_running.html)`,
    commandTemplate:
      'uv run --directory {serenaPath} serena start-mcp-server --context claude-code --project {projectPath}',
    variables: {
      serenaPath: {
        label: 'Serena Installation Path',
        description: 'The folder where Serena is installed',
        inputType: 'folder',
        placeholder: '/path/to/serena',
      },
    },
    installOnCreateWorktree: true,
  },
];

// Auto-provided variable names (reserved, cannot be user-defined)
const AUTO_PROVIDED_VARIABLES = [
  'projectPath',
  'projectName',
  'branchName',
  'mainRepoPath',
];

const CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');

/**
 * Extracts variable names from a command template.
 * Variables are in the format {variableName}.
 */
export function extractVariables(commandTemplate: string): string[] {
  const matches = commandTemplate.match(/\{([^}]+)\}/g) || [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Gets user-defined variables (excludes auto-provided ones).
 */
export function getUserDefinedVariables(commandTemplate: string): string[] {
  return extractVariables(commandTemplate).filter(
    (v) => !AUTO_PROVIDED_VARIABLES.includes(v),
  );
}

/**
 * Substitutes variables in a command template.
 */
export function substituteVariables(
  commandTemplate: string,
  userVariables: Record<string, string>,
  context: McpVariableContext,
): string {
  let result = commandTemplate;

  // Substitute auto-provided variables
  result = result.replace(/\{projectPath\}/g, context.projectPath);
  result = result.replace(/\{projectName\}/g, context.projectName);
  result = result.replace(/\{branchName\}/g, context.branchName);
  result = result.replace(/\{mainRepoPath\}/g, context.mainRepoPath);

  // Substitute user-defined variables
  for (const [key, value] of Object.entries(userVariables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }

  return result;
}

/**
 * Parses a command template into name and args for `claude mcp add`.
 * The command template format is: "command arg1 arg2 ..."
 * Returns: { name, command, args }
 */
function parseCommandTemplate(commandTemplate: string): {
  command: string;
  args: string[];
} {
  // Split by spaces, respecting quoted strings
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (const char of commandTemplate) {
    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
    } else if (char === ' ' && !inQuote) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  if (current) {
    parts.push(current);
  }

  return {
    command: parts[0] || '',
    args: parts.slice(1),
  };
}

/**
 * Gets templates enabled for worktree installation for a specific project.
 * Considers installOnCreateWorktree and project overrides.
 */
export async function getEnabledTemplatesForProject(
  projectId: string,
): Promise<McpServerTemplate[]> {
  const allTemplates = await McpTemplateRepository.findAll();
  const overrides =
    await ProjectMcpOverrideRepository.findByProjectId(projectId);

  const overrideMap = new Map(
    overrides.map((o) => [o.mcpTemplateId, o.enabled]),
  );

  return allTemplates.filter((template) => {
    // Skip templates that don't support worktree installation
    if (!template.installOnCreateWorktree) return false;

    const override = overrideMap.get(template.id);
    // If there's an override, use it; otherwise default to enabled
    return override !== undefined ? override : true;
  });
}

/**
 * Installs MCP servers for a worktree.
 * Runs `claude mcp add` for each enabled template with installOnCreateWorktree: true.
 * Errors are logged but don't throw (MCP setup failure shouldn't block worktree creation).
 */
export async function installMcpForWorktree(params: {
  worktreePath: string;
  projectId: string;
  projectName: string;
  branchName: string;
  mainRepoPath: string;
}): Promise<void> {
  const { worktreePath, projectId, projectName, branchName, mainRepoPath } =
    params;

  dbg.mcp('installMcpForWorktree: %o', params);

  const templates = await getEnabledTemplatesForProject(projectId);
  const installTemplates = templates.filter((t) => t.installOnCreateWorktree);

  if (installTemplates.length === 0) {
    dbg.mcp('No MCP templates to install for worktree');
    return;
  }

  const context: McpVariableContext = {
    projectPath: worktreePath,
    projectName,
    branchName,
    mainRepoPath,
  };

  for (const template of installTemplates) {
    try {
      const substitutedCommand = substituteVariables(
        template.commandTemplate,
        template.variables,
        context,
      );

      const { command, args } = parseCommandTemplate(substitutedCommand);

      // Build the claude mcp add command
      // Format: claude mcp add <name> -- <command> <args...>
      const mcpName = template.name.toLowerCase().replace(/\s+/g, '-');
      const claudeCmd = `claude mcp add ${mcpName} --scope local -- ${command} ${args.join(' ')}`;

      dbg.mcp('Running: %s (cwd: %s)', claudeCmd, worktreePath);

      await execAsync(claudeCmd, {
        cwd: worktreePath,
        encoding: 'utf-8',
        timeout: 30000, // 30 second timeout
      });

      dbg.mcp('Successfully installed MCP server: %s', template.name);
    } catch (error) {
      // Log but don't throw - MCP setup failure shouldn't block worktree creation
      dbg.mcp('Failed to install MCP server %s: %O', template.name, error);
    }
  }
}

/**
 * Reads MCP servers from ~/.claude.json for a specific project path.
 */
export function getClaudeMcpServers(projectPath: string): ClaudeMcpServer[] {
  try {
    if (!fs.existsSync(CLAUDE_CONFIG_PATH)) {
      dbg.mcp('Claude config not found at %s', CLAUDE_CONFIG_PATH);
      return [];
    }

    const content = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf-8');
    const config = JSON.parse(content);

    // Claude stores per-project config under projects[projectPath]
    const projectConfig = config.projects?.[projectPath];
    if (!projectConfig?.mcpServers) {
      dbg.mcp('No MCP servers found for project %s', projectPath);
      return [];
    }

    const mcpServers = projectConfig.mcpServers;
    const servers: ClaudeMcpServer[] = [];

    for (const [name, server] of Object.entries(mcpServers)) {
      const s = server as {
        type?: string;
        command?: string;
        args?: string[];
        env?: Record<string, string>;
      };

      const args = s.args || [];
      const fullCommand = s.command
        ? [s.command, ...args].join(' ')
        : args.join(' ');

      servers.push({
        name,
        type: (s.type as 'stdio' | 'sse' | 'http') || 'stdio',
        command: fullCommand,
        rawCommand: s.command || '',
        args,
        env: s.env,
      });
    }

    dbg.mcp('Found %d MCP servers for project %s', servers.length, projectPath);
    return servers;
  } catch (error) {
    dbg.mcp('Error reading Claude config: %O', error);
    return [];
  }
}

/**
 * Gets a unified list of MCP servers for a project.
 * Merges templates from DB with active servers from Claude's config.
 */
export async function getUnifiedMcpServers(
  projectId: string,
  projectPath: string,
): Promise<UnifiedMcpServer[]> {
  // Get all templates and overrides
  const allTemplates = await McpTemplateRepository.findAll();
  const overrides =
    await ProjectMcpOverrideRepository.findByProjectId(projectId);
  const overrideMap = new Map(
    overrides.map((o) => [o.mcpTemplateId, o.enabled]),
  );

  // Get active MCP servers from Claude's config
  const activeServers = getClaudeMcpServers(projectPath);
  const activeServerMap = new Map(
    activeServers.map((s) => [s.name.toLowerCase(), s]),
  );

  const result: UnifiedMcpServer[] = [];
  const processedNames = new Set<string>();

  // Process templates first
  for (const template of allTemplates) {
    const normalizedName = template.name.toLowerCase().replace(/\s+/g, '-');
    const activeServer = activeServerMap.get(normalizedName);
    const override = overrideMap.get(template.id);

    // installOnWorktree: if template supports it, use override or default to true
    const installOnWorktree = template.installOnCreateWorktree
      ? override !== undefined
        ? override
        : true
      : false;

    result.push({
      name: template.name,
      command: activeServer?.command || template.commandTemplate,
      template,
      isActive: !!activeServer,
      installOnWorktree,
    });

    processedNames.add(normalizedName);
  }

  // Add active-only servers (no matching template)
  for (const server of activeServers) {
    const normalizedName = server.name.toLowerCase();
    if (!processedNames.has(normalizedName)) {
      result.push({
        name: server.name,
        command: server.command,
        template: null,
        isActive: true,
        installOnWorktree: false,
      });
    }
  }

  return result;
}

/**
 * Activates an MCP server by running `claude mcp add`.
 */
export async function activateMcpServer(
  projectPath: string,
  name: string,
  command: string,
): Promise<void> {
  const mcpName = name.toLowerCase().replace(/\s+/g, '-');
  const claudeCmd = `claude mcp add ${mcpName} --scope local -- ${command}`;

  dbg.mcp('Activating MCP server: %s (cwd: %s)', claudeCmd, projectPath);

  await execAsync(claudeCmd, {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: 30000,
  });

  dbg.mcp('Successfully activated MCP server: %s', name);
}

/**
 * Deactivates an MCP server by running `claude mcp remove`.
 */
export async function deactivateMcpServer(
  projectPath: string,
  name: string,
): Promise<void> {
  const mcpName = name.toLowerCase().replace(/\s+/g, '-');
  const claudeCmd = `claude mcp remove ${mcpName}`;

  dbg.mcp('Deactivating MCP server: %s (cwd: %s)', claudeCmd, projectPath);

  await execAsync(claudeCmd, {
    cwd: projectPath,
    encoding: 'utf-8',
    timeout: 30000,
  });

  dbg.mcp('Successfully deactivated MCP server: %s', name);
}
