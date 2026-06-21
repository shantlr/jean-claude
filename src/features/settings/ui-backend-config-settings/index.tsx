import { FileJson, RotateCcw, Save } from 'lucide-react';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';


import {
  ListDetailLayout,
  ListGroupHeader,
  ListItemButton,
  ListPane,
} from '@/common/ui/list-detail-layout';
import { useSetting, useUpdateSetting } from '@/hooks/use-settings';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import type { OpenCodeProcessMode } from '@shared/types';
import { Select } from '@/common/ui/select';
import { Switch } from '@/common/ui/switch';
import { Textarea } from '@/common/ui/textarea';
import { useToastStore } from '@/stores/toasts';



type ConfigObject = Record<string, unknown>;

type FieldOption = {
  value: string;
  label: string;
  description?: string;
  raw?: unknown;
};

type ConfigField = {
  path: string;
  label: string;
  description: string;
  group: string;
  kind:
    | 'string'
    | 'multiline'
    | 'number'
    | 'boolean'
    | 'select'
    | 'array'
    | 'json';
  placeholder?: string;
  options?: FieldOption[];
};

type ConfigBackendType = AgentBackendType;

const BACKEND_META: Record<
  ConfigBackendType,
  { label: string; summary: string; userPath: string }
> = {
  'claude-code': {
    label: 'Claude Code',
    summary: 'User settings from Claude Code settings.json.',
    userPath: '~/.claude/settings.json',
  },
  opencode: {
    label: 'OpenCode',
    summary: 'User settings from OpenCode opencode.jsonc or opencode.json.',
    userPath: '~/.config/opencode/opencode.jsonc',
  },
  codex: {
    label: 'Codex',
    summary: 'User settings from Codex config.toml.',
    userPath: '~/.codex/config.toml',
  },
};

const OPENCODE_PROCESS_OPTIONS = [
  {
    value: 'standalone',
    label: 'Standalone per task step',
    description: 'Best resource tracking; more process overhead.',
  },
  {
    value: 'shared',
    label: 'Shared app server',
    description: 'Lower overhead; resource usage attributed less precisely.',
  },
] satisfies Array<{
  value: OpenCodeProcessMode;
  label: string;
  description: string;
}>;

const CLAUDE_FIELDS: ConfigField[] = [
  {
    path: 'model',
    label: 'Default model',
    description: 'Overrides Claude Code default model for new sessions.',
    group: 'Models',
    kind: 'string',
    placeholder: 'sonnet, opus, claude-opus-4-1...',
  },
  {
    path: 'availableModels',
    label: 'Available models',
    description: 'Restricts selectable models. One model per line.',
    group: 'Models',
    kind: 'array',
  },
  {
    path: 'modelOverrides',
    label: 'Model overrides',
    description: 'Maps Claude model IDs to provider-specific deployment IDs.',
    group: 'Models',
    kind: 'json',
    placeholder: '{\n  "claude-opus-4-6": "deployment-id"\n}',
  },
  {
    path: 'effortLevel',
    label: 'Effort level',
    description: 'Default reasoning effort used by supported models.',
    group: 'Models',
    kind: 'select',
    options: ['low', 'medium', 'high', 'xhigh', 'max'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'alwaysThinkingEnabled',
    label: 'Always enable thinking',
    description: 'Turns on extended thinking by default for all sessions.',
    group: 'Models',
    kind: 'boolean',
  },
  {
    path: 'permissions.defaultMode',
    label: 'Default permission mode',
    description: 'Claude Code permission mode when a session starts.',
    group: 'Permissions',
    kind: 'select',
    options: [
      'default',
      'acceptEdits',
      'plan',
      'dontAsk',
      'bypassPermissions',
      'auto',
    ].map((value) => ({ value, label: value })),
  },
  {
    path: 'permissions.allow',
    label: 'Allow rules',
    description: 'Claude tool permission rules to always allow. One per line.',
    group: 'Permissions',
    kind: 'array',
  },
  {
    path: 'permissions.ask',
    label: 'Ask rules',
    description: 'Claude tool permission rules that should always ask.',
    group: 'Permissions',
    kind: 'array',
  },
  {
    path: 'permissions.deny',
    label: 'Deny rules',
    description: 'Claude tool permission rules to always deny. One per line.',
    group: 'Permissions',
    kind: 'array',
  },
  {
    path: 'permissions.additionalDirectories',
    label: 'Additional directories',
    description: 'Extra directories Claude may access. One path per line.',
    group: 'Permissions',
    kind: 'array',
  },
  {
    path: 'env',
    label: 'Environment',
    description: 'Environment variables applied to Claude Code sessions.',
    group: 'Runtime',
    kind: 'json',
    placeholder: '{\n  "ANTHROPIC_BASE_URL": "https://..."\n}',
  },
  {
    path: 'apiKeyHelper',
    label: 'API key helper',
    description: 'Shell command that returns an API key or auth token.',
    group: 'Runtime',
    kind: 'string',
  },
  {
    path: 'defaultShell',
    label: 'Default shell',
    description: 'Default shell for interactive shell commands.',
    group: 'Runtime',
    kind: 'select',
    options: ['bash', 'powershell'].map((value) => ({ value, label: value })),
  },
  {
    path: 'cleanupPeriodDays',
    label: 'Cleanup period days',
    description: 'Days to keep sessions, shell snapshots, and backups.',
    group: 'Runtime',
    kind: 'number',
  },
  {
    path: 'autoMemoryEnabled',
    label: 'Auto memory',
    description: 'Allows Claude Code to read and write automatic memory.',
    group: 'Memory',
    kind: 'boolean',
  },
  {
    path: 'autoMemoryDirectory',
    label: 'Auto memory directory',
    description: 'Custom directory for automatic memory storage.',
    group: 'Memory',
    kind: 'string',
  },
  {
    path: 'claudeMdExcludes',
    label: 'CLAUDE.md excludes',
    description: 'Glob patterns for memory files to skip. One per line.',
    group: 'Memory',
    kind: 'array',
  },
  {
    path: 'includeGitInstructions',
    label: 'Git instructions',
    description: 'Includes built-in git commit and PR workflow instructions.',
    group: 'Git',
    kind: 'boolean',
  },
  {
    path: 'attribution',
    label: 'Git/PR attribution',
    description: 'Customize attribution text for commits and PR descriptions.',
    group: 'Git',
    kind: 'json',
    placeholder: '{\n  "commit": "",\n  "pr": ""\n}',
  },
  {
    path: 'respectGitignore',
    label: 'Respect gitignore',
    description: 'Controls whether file suggestions respect .gitignore.',
    group: 'Files',
    kind: 'boolean',
  },
  {
    path: 'enableAllProjectMcpServers',
    label: 'Enable project MCP servers',
    description: 'Automatically approves all MCP servers from .mcp.json files.',
    group: 'MCP',
    kind: 'boolean',
  },
  {
    path: 'enabledMcpjsonServers',
    label: 'Enabled MCP servers',
    description: 'Specific .mcp.json server names to approve. One per line.',
    group: 'MCP',
    kind: 'array',
  },
  {
    path: 'disabledMcpjsonServers',
    label: 'Disabled MCP servers',
    description: 'Specific .mcp.json server names to reject. One per line.',
    group: 'MCP',
    kind: 'array',
  },
  {
    path: 'hooks',
    label: 'Hooks',
    description: 'Claude Code lifecycle hooks keyed by event name.',
    group: 'Hooks',
    kind: 'json',
  },
  {
    path: 'statusLine',
    label: 'Status line',
    description: 'Custom status line configuration.',
    group: 'UI',
    kind: 'json',
  },
  {
    path: 'outputStyle',
    label: 'Output style',
    description: 'Default output style name used for system prompt behavior.',
    group: 'UI',
    kind: 'string',
  },
  {
    path: 'language',
    label: 'Language',
    description: 'Preferred response language for Claude.',
    group: 'UI',
    kind: 'string',
  },
  {
    path: 'autoUpdatesChannel',
    label: 'Auto-update channel',
    description: 'Release channel Claude Code follows for auto updates.',
    group: 'Updates',
    kind: 'select',
    options: ['stable', 'latest'].map((value) => ({ value, label: value })),
  },
];

const OPENCODE_FIELDS: ConfigField[] = [
  {
    path: 'model',
    label: 'Default model',
    description: 'Primary model in provider/model format.',
    group: 'Models',
    kind: 'string',
    placeholder: 'anthropic/claude-sonnet-4-5',
  },
  {
    path: 'small_model',
    label: 'Small model',
    description: 'Cheaper model for lightweight tasks like title generation.',
    group: 'Models',
    kind: 'string',
  },
  {
    path: 'provider',
    label: 'Providers',
    description: 'Provider options, custom providers, and model overrides.',
    group: 'Models',
    kind: 'json',
    placeholder:
      '{\n  "anthropic": {\n    "options": { "timeout": 600000 }\n  }\n}',
  },
  {
    path: 'enabled_providers',
    label: 'Enabled providers',
    description: 'Allowlist of provider IDs. One per line.',
    group: 'Models',
    kind: 'array',
  },
  {
    path: 'disabled_providers',
    label: 'Disabled providers',
    description: 'Provider IDs to prevent loading. One per line.',
    group: 'Models',
    kind: 'array',
  },
  {
    path: 'default_agent',
    label: 'Default agent',
    description: 'Primary agent used when none is specified.',
    group: 'Agents',
    kind: 'string',
    placeholder: 'build',
  },
  {
    path: 'agent',
    label: 'Agents',
    description:
      'Agent definitions, prompts, models, permissions, and options.',
    group: 'Agents',
    kind: 'json',
  },
  {
    path: 'permission',
    label: 'Permissions',
    description: 'Global OpenCode tool permissions. ask, allow, or deny.',
    group: 'Permissions',
    kind: 'json',
    placeholder: '{\n  "edit": "ask",\n  "bash": { "*": "ask" }\n}',
  },
  {
    path: 'tools',
    label: 'Tools',
    description:
      'Legacy tool enablement map. Prefer permissions for new config.',
    group: 'Permissions',
    kind: 'json',
  },
  {
    path: 'mcp',
    label: 'MCP servers',
    description: 'Local and remote MCP server configurations.',
    group: 'Integrations',
    kind: 'json',
  },
  {
    path: 'command',
    label: 'Commands',
    description: 'Reusable command templates available in OpenCode.',
    group: 'Integrations',
    kind: 'json',
  },
  {
    path: 'plugin',
    label: 'Plugins',
    description: 'npm plugin package names or plugin tuples.',
    group: 'Integrations',
    kind: 'json',
    placeholder: '["opencode-helicone-session"]',
  },
  {
    path: 'skills.paths',
    label: 'Skill paths',
    description: 'Additional skill folder paths. One per line.',
    group: 'Integrations',
    kind: 'array',
  },
  {
    path: 'skills.urls',
    label: 'Skill URLs',
    description: 'Remote skill registry URLs. One per line.',
    group: 'Integrations',
    kind: 'array',
  },
  {
    path: 'instructions',
    label: 'Instructions',
    description: 'Instruction files or glob patterns. One per line.',
    group: 'Context',
    kind: 'array',
  },
  {
    path: 'reference',
    label: 'References',
    description: 'Named git or local references usable as @alias.',
    group: 'Context',
    kind: 'json',
  },
  {
    path: 'watcher.ignore',
    label: 'Watcher ignore',
    description: 'Glob patterns excluded from file watching. One per line.',
    group: 'Files',
    kind: 'array',
  },
  {
    path: 'snapshot',
    label: 'Snapshots',
    description: 'Tracks file changes for OpenCode undo/revert.',
    group: 'Files',
    kind: 'boolean',
  },
  {
    path: 'formatter',
    label: 'Formatters',
    description: 'Enable built-in formatters or configure custom formatters.',
    group: 'Files',
    kind: 'json',
    placeholder: 'true',
  },
  {
    path: 'lsp',
    label: 'LSP servers',
    description: 'Enable built-in LSP or configure custom language servers.',
    group: 'Files',
    kind: 'json',
    placeholder: 'true',
  },
  {
    path: 'shell',
    label: 'Shell',
    description: 'Shell used for terminal and bash tool calls.',
    group: 'Runtime',
    kind: 'string',
    placeholder: '/bin/zsh',
  },
  {
    path: 'logLevel',
    label: 'Log level',
    description: 'Runtime log verbosity.',
    group: 'Runtime',
    kind: 'select',
    options: ['DEBUG', 'INFO', 'WARN', 'ERROR'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'server',
    label: 'Server',
    description: 'OpenCode serve/web port, hostname, mDNS, and CORS config.',
    group: 'Runtime',
    kind: 'json',
  },
  {
    path: 'tool_output.max_lines',
    label: 'Tool output max lines',
    description: 'Line threshold before tool output is truncated.',
    group: 'Runtime',
    kind: 'number',
  },
  {
    path: 'tool_output.max_bytes',
    label: 'Tool output max bytes',
    description: 'Byte threshold before tool output is truncated.',
    group: 'Runtime',
    kind: 'number',
  },
  {
    path: 'compaction.auto',
    label: 'Auto compaction',
    description: 'Automatically compacts sessions when context is full.',
    group: 'Compaction',
    kind: 'boolean',
  },
  {
    path: 'compaction.prune',
    label: 'Prune tool output',
    description: 'Removes old tool outputs during compaction.',
    group: 'Compaction',
    kind: 'boolean',
  },
  {
    path: 'compaction.reserved',
    label: 'Reserved tokens',
    description: 'Token buffer kept free for compaction.',
    group: 'Compaction',
    kind: 'number',
  },
  {
    path: 'attachment.image',
    label: 'Image attachments',
    description: 'Image resize and size limit settings.',
    group: 'Attachments',
    kind: 'json',
  },
  {
    path: 'share',
    label: 'Sharing',
    description: 'Controls conversation sharing behavior.',
    group: 'Sharing',
    kind: 'select',
    options: ['manual', 'auto', 'disabled'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'autoupdate',
    label: 'Auto-update',
    description: 'Auto-update behavior. notify shows update notices only.',
    group: 'Updates',
    kind: 'select',
    options: [
      { value: 'true', label: 'true', raw: true },
      { value: 'false', label: 'false', raw: false },
      { value: 'notify', label: 'notify', raw: 'notify' },
    ],
  },
  {
    path: 'username',
    label: 'Username',
    description: 'Custom username shown in conversations.',
    group: 'UI',
    kind: 'string',
  },
  {
    path: 'experimental',
    label: 'Experimental',
    description: 'Unstable OpenCode options that may change.',
    group: 'Advanced',
    kind: 'json',
  },
];

const CODEX_FIELDS: ConfigField[] = [
  {
    path: 'model',
    label: 'Default model',
    description: 'Default Codex model for new sessions.',
    group: 'Models',
    kind: 'string',
    placeholder: 'gpt-5.5',
  },
  {
    path: 'model_provider',
    label: 'Model provider',
    description: 'Provider ID from model_providers. openai by default.',
    group: 'Models',
    kind: 'string',
    placeholder: 'openai',
  },
  {
    path: 'model_context_window',
    label: 'Context window',
    description: 'Available context tokens for active model.',
    group: 'Models',
    kind: 'number',
  },
  {
    path: 'model_auto_compact_token_limit',
    label: 'Auto-compact token limit',
    description: 'Token threshold that triggers automatic history compaction.',
    group: 'Models',
    kind: 'number',
  },
  {
    path: 'model_catalog_json',
    label: 'Model catalog path',
    description: 'Optional JSON model catalog loaded on startup.',
    group: 'Models',
    kind: 'string',
  },
  {
    path: 'model_instructions_file',
    label: 'Instructions file',
    description: 'Replacement instructions file instead of AGENTS.md.',
    group: 'Models',
    kind: 'string',
  },
  {
    path: 'model_reasoning_effort',
    label: 'Reasoning effort',
    description: 'Reasoning effort for supported models.',
    group: 'Models',
    kind: 'select',
    options: ['minimal', 'low', 'medium', 'high', 'xhigh'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'model_reasoning_summary',
    label: 'Reasoning summary',
    description: 'Reasoning summary detail level.',
    group: 'Models',
    kind: 'select',
    options: ['auto', 'concise', 'detailed', 'none'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'model_supports_reasoning_summaries',
    label: 'Reasoning summaries supported',
    description: 'Force Codex to send or skip reasoning summary metadata.',
    group: 'Models',
    kind: 'boolean',
  },
  {
    path: 'model_verbosity',
    label: 'Verbosity',
    description: 'Default GPT-5 verbosity override.',
    group: 'Models',
    kind: 'select',
    options: ['low', 'medium', 'high'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'approval_policy',
    label: 'Approval policy',
    description: 'When Codex pauses for approval before running commands.',
    group: 'Sandbox & Approvals',
    kind: 'select',
    options: ['untrusted', 'on-request', 'never'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'approvals_reviewer',
    label: 'Approvals reviewer',
    description: 'Who reviews approvals when policy allows prompts.',
    group: 'Sandbox & Approvals',
    kind: 'select',
    options: ['user', 'auto_review'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'sandbox_mode',
    label: 'Sandbox mode',
    description: 'Filesystem sandbox level for command execution.',
    group: 'Sandbox & Approvals',
    kind: 'select',
    options: ['read-only', 'workspace-write', 'danger-full-access'].map(
      (value) => ({
        value,
        label: value,
      }),
    ),
  },
  {
    path: 'sandbox_workspace_write',
    label: 'Workspace-write details',
    description:
      'Protected paths and writable-root details for workspace-write.',
    group: 'Sandbox & Approvals',
    kind: 'json',
  },
  {
    path: 'default_permissions',
    label: 'Default permission profile',
    description: 'Built-in or custom permission profile name.',
    group: 'Sandbox & Approvals',
    kind: 'string',
    placeholder: ':workspace',
  },
  {
    path: 'permissions',
    label: 'Permission profiles',
    description: 'Named filesystem and network permission profiles.',
    group: 'Sandbox & Approvals',
    kind: 'json',
  },
  {
    path: 'allow_login_shell',
    label: 'Allow login shell',
    description: 'Whether shell tools may use login-shell semantics.',
    group: 'Runtime',
    kind: 'boolean',
  },
  {
    path: 'background_terminal_max_timeout',
    label: 'Background terminal timeout',
    description: 'Maximum empty poll window in milliseconds.',
    group: 'Runtime',
    kind: 'number',
  },
  {
    path: 'log_dir',
    label: 'Log directory',
    description: 'Directory where Codex writes local logs.',
    group: 'Runtime',
    kind: 'string',
  },
  {
    path: 'shell_environment_policy.include_only',
    label: 'Shell env allowlist',
    description:
      'Only forward these env vars to spawned commands. One per line.',
    group: 'Runtime',
    kind: 'array',
  },
  {
    path: 'shell_environment_policy.exclude',
    label: 'Shell env denylist',
    description: 'Exclude these env vars from spawned commands. One per line.',
    group: 'Runtime',
    kind: 'array',
  },
  {
    path: 'notify',
    label: 'Notification command',
    description: 'Notification command and args. One token per line.',
    group: 'Runtime',
    kind: 'array',
  },
  {
    path: 'web_search',
    label: 'Web search mode',
    description:
      'cached uses search cache, live fetches web, disabled turns tool off.',
    group: 'Tools',
    kind: 'select',
    options: ['cached', 'live', 'disabled'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'features.apps',
    label: 'Apps feature',
    description: 'Enable ChatGPT Apps/connectors support.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.codex_git_commit',
    label: 'Codex git commit',
    description: 'Enable Codex-generated git commits.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.hooks',
    label: 'Hooks feature',
    description: 'Enable lifecycle hooks from hooks.json or inline config.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.memories',
    label: 'Memories feature',
    description: 'Enable memories support.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.multi_agent',
    label: 'Multi-agent feature',
    description: 'Enable subagent collaboration tools.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.personality',
    label: 'Personality feature',
    description: 'Enable personality selection controls.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.shell_snapshot',
    label: 'Shell snapshot feature',
    description: 'Snapshot shell environment to speed repeated commands.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.shell_tool',
    label: 'Shell tool feature',
    description: 'Enable default shell tool.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.unified_exec',
    label: 'Unified exec feature',
    description: 'Use unified PTY-backed exec tool.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.undo',
    label: 'Undo feature',
    description: 'Enable undo support.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.network_proxy.enabled',
    label: 'Network proxy enabled',
    description: 'Enable sandboxed networking.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.network_proxy.proxy_url',
    label: 'Network proxy URL',
    description: 'HTTP listener URL for sandboxed networking proxy.',
    group: 'Features',
    kind: 'string',
    placeholder: 'http://127.0.0.1:3128',
  },
  {
    path: 'features.network_proxy.socks_url',
    label: 'SOCKS URL',
    description: 'SOCKS5 listener URL for sandboxed networking proxy.',
    group: 'Features',
    kind: 'string',
    placeholder: 'http://127.0.0.1:8081',
  },
  {
    path: 'features.network_proxy.allow_local_binding',
    label: 'Allow local binding',
    description: 'Allow broader local/private-network access.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.network_proxy.allow_upstream_proxy',
    label: 'Allow upstream proxy',
    description: 'Allow chaining through upstream proxy from environment.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.network_proxy.enable_socks5',
    label: 'Enable SOCKS5',
    description: 'Expose SOCKS5 support for sandboxed networking.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.network_proxy.enable_socks5_udp',
    label: 'Enable SOCKS5 UDP',
    description: 'Allow UDP over SOCKS5.',
    group: 'Features',
    kind: 'boolean',
  },
  {
    path: 'features.network_proxy.domains',
    label: 'Network proxy domains',
    description: 'Domain allow/deny policy for sandboxed networking.',
    group: 'Features',
    kind: 'json',
  },
  {
    path: 'features.network_proxy.unix_sockets',
    label: 'Network proxy Unix sockets',
    description: 'Unix socket allow/deny policy for sandboxed networking.',
    group: 'Features',
    kind: 'json',
  },
  {
    path: 'history.persistence',
    label: 'History persistence',
    description: 'Whether Codex saves transcripts to history.jsonl.',
    group: 'History',
    kind: 'select',
    options: ['save-all', 'none'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'history.max_bytes',
    label: 'History max bytes',
    description: 'Cap transcript history file size in bytes.',
    group: 'History',
    kind: 'number',
  },
  {
    path: 'memories.use_memories',
    label: 'Use memories',
    description: 'Inject existing memories into future sessions.',
    group: 'Memories',
    kind: 'boolean',
  },
  {
    path: 'memories.generate_memories',
    label: 'Generate memories',
    description: 'Store new threads as memory-generation inputs.',
    group: 'Memories',
    kind: 'boolean',
  },
  {
    path: 'memories.disable_on_external_context',
    label: 'Disable memories on external context',
    description: 'Skip memory generation for threads using MCP or web context.',
    group: 'Memories',
    kind: 'boolean',
  },
  {
    path: 'memories.extract_model',
    label: 'Memory extract model',
    description: 'Optional model override for per-thread memory extraction.',
    group: 'Memories',
    kind: 'string',
  },
  {
    path: 'memories.consolidation_model',
    label: 'Memory consolidation model',
    description: 'Optional model override for global memory consolidation.',
    group: 'Memories',
    kind: 'string',
  },
  {
    path: 'memories.max_rollout_age_days',
    label: 'Memory rollout age days',
    description: 'Maximum age of threads considered for memory generation.',
    group: 'Memories',
    kind: 'number',
  },
  {
    path: 'memories.min_rollout_idle_hours',
    label: 'Memory rollout idle hours',
    description: 'Minimum idle time before a thread is memory-eligible.',
    group: 'Memories',
    kind: 'number',
  },
  {
    path: 'openai_base_url',
    label: 'OpenAI base URL',
    description: 'Base URL override for built-in OpenAI provider.',
    group: 'Providers & Auth',
    kind: 'string',
  },
  {
    path: 'chatgpt_base_url',
    label: 'ChatGPT base URL',
    description: 'Base URL override for ChatGPT login flow.',
    group: 'Providers & Auth',
    kind: 'string',
  },
  {
    path: 'cli_auth_credentials_store',
    label: 'CLI credentials store',
    description: 'Where cached CLI credentials are stored.',
    group: 'Providers & Auth',
    kind: 'select',
    options: ['file', 'keyring', 'auto'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'forced_login_method',
    label: 'Forced login method',
    description: 'Restrict Codex to a specific auth method.',
    group: 'Providers & Auth',
    kind: 'select',
    options: ['chatgpt', 'api'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'forced_chatgpt_workspace_id',
    label: 'Forced ChatGPT workspace ID',
    description: 'Limit ChatGPT logins to specific workspace ID.',
    group: 'Providers & Auth',
    kind: 'string',
  },
  {
    path: 'mcp_oauth_credentials_store',
    label: 'MCP OAuth credentials store',
    description: 'Preferred store for MCP OAuth credentials.',
    group: 'Providers & Auth',
    kind: 'select',
    options: ['auto', 'file', 'keyring'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'mcp_oauth_callback_port',
    label: 'MCP OAuth callback port',
    description: 'Optional fixed callback port for MCP OAuth login.',
    group: 'Providers & Auth',
    kind: 'number',
  },
  {
    path: 'mcp_oauth_callback_url',
    label: 'MCP OAuth callback URL',
    description: 'Optional redirect URI override for MCP OAuth login.',
    group: 'Providers & Auth',
    kind: 'string',
  },
  {
    path: 'model_providers.amazon-bedrock.aws.region',
    label: 'Bedrock region',
    description: 'AWS region used by built-in amazon-bedrock provider.',
    group: 'Providers & Auth',
    kind: 'string',
  },
  {
    path: 'model_providers.amazon-bedrock.aws.profile',
    label: 'Bedrock profile',
    description: 'AWS profile name used by built-in amazon-bedrock provider.',
    group: 'Providers & Auth',
    kind: 'string',
  },
  {
    path: 'model_providers.ollama.base_url',
    label: 'Ollama base URL',
    description: 'Base URL for built-in Ollama provider.',
    group: 'Providers & Auth',
    kind: 'string',
  },
  {
    path: 'model_providers.lmstudio.base_url',
    label: 'LM Studio base URL',
    description: 'Base URL for built-in LM Studio provider.',
    group: 'Providers & Auth',
    kind: 'string',
  },
  {
    path: 'model_providers.openai.request_max_retries',
    label: 'OpenAI max retries',
    description: 'Retry count for HTTP requests to built-in OpenAI provider.',
    group: 'Providers & Auth',
    kind: 'number',
  },
  {
    path: 'model_providers.openai.stream_idle_timeout_ms',
    label: 'OpenAI stream idle timeout',
    description: 'Idle timeout for OpenAI SSE streams in milliseconds.',
    group: 'Providers & Auth',
    kind: 'number',
  },
  {
    path: 'model_providers.openai.stream_max_retries',
    label: 'OpenAI stream retries',
    description: 'Retry count for OpenAI streaming interruptions.',
    group: 'Providers & Auth',
    kind: 'number',
  },
  {
    path: 'mcp_servers',
    label: 'MCP servers',
    description: 'Configured MCP stdio and HTTP servers.',
    group: 'Integrations',
    kind: 'json',
  },
  {
    path: 'apps._default.enabled',
    label: 'Apps default enabled',
    description: 'Default enabled state for all apps unless overridden.',
    group: 'Integrations',
    kind: 'boolean',
  },
  {
    path: 'apps._default.destructive_enabled',
    label: 'Apps default destructive tools',
    description: 'Default allow/deny for app tools with destructive hint.',
    group: 'Integrations',
    kind: 'boolean',
  },
  {
    path: 'apps._default.open_world_enabled',
    label: 'Apps default open-world tools',
    description: 'Default allow/deny for app tools with open-world hint.',
    group: 'Integrations',
    kind: 'boolean',
  },
  {
    path: 'agents.max_threads',
    label: 'Max agent threads',
    description: 'Maximum number of agent threads open concurrently.',
    group: 'Integrations',
    kind: 'number',
  },
  {
    path: 'agents.max_depth',
    label: 'Max agent depth',
    description: 'Maximum nesting depth for spawned agent threads.',
    group: 'Integrations',
    kind: 'number',
  },
  {
    path: 'agents.job_max_runtime_seconds',
    label: 'Agent job max runtime',
    description: 'Default per-worker timeout for spawn_agents_on_csv jobs.',
    group: 'Integrations',
    kind: 'number',
  },
  {
    path: 'hooks',
    label: 'Hooks',
    description: 'Inline lifecycle hook configuration.',
    group: 'Integrations',
    kind: 'json',
  },
  {
    path: 'developer_instructions',
    label: 'Developer instructions',
    description: 'Additional developer instructions injected into sessions.',
    group: 'Prompts',
    kind: 'multiline',
  },
  {
    path: 'compact_prompt',
    label: 'Compact prompt',
    description: 'Inline override for history compaction prompt.',
    group: 'Prompts',
    kind: 'multiline',
  },
  {
    path: 'experimental_compact_prompt_file',
    label: 'Compact prompt file',
    description: 'Load compaction prompt override from a file.',
    group: 'Prompts',
    kind: 'string',
  },
  {
    path: 'file_opener',
    label: 'File opener',
    description: 'URI scheme used to open file citations.',
    group: 'UI',
    kind: 'select',
    options: ['vscode', 'vscode-insiders', 'windsurf', 'cursor', 'none'].map(
      (value) => ({ value, label: value }),
    ),
  },
  {
    path: 'personality',
    label: 'Personality',
    description: 'Default communication style for supported models.',
    group: 'UI',
    kind: 'select',
    options: ['friendly', 'pragmatic', 'none'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'disable_paste_burst',
    label: 'Disable paste burst',
    description: 'Disable burst-paste detection in TUI.',
    group: 'UI',
    kind: 'boolean',
  },
  {
    path: 'hide_agent_reasoning',
    label: 'Hide agent reasoning',
    description: 'Suppress reasoning events in TUI and exec output.',
    group: 'UI',
    kind: 'boolean',
  },
  {
    path: 'check_for_update_on_startup',
    label: 'Check for updates on startup',
    description: 'Whether Codex checks for updates on startup.',
    group: 'Updates',
    kind: 'boolean',
  },
  {
    path: 'feedback.enabled',
    label: 'Feedback enabled',
    description: 'Allow feedback submission via /feedback.',
    group: 'Telemetry',
    kind: 'boolean',
  },
  {
    path: 'analytics.enabled',
    label: 'Analytics enabled',
    description: 'Enable or disable analytics for this machine/profile.',
    group: 'Telemetry',
    kind: 'boolean',
  },
  {
    path: 'otel.environment',
    label: 'OTEL environment',
    description: 'Environment tag applied to emitted OTEL events.',
    group: 'Telemetry',
    kind: 'string',
    placeholder: 'dev',
  },
  {
    path: 'otel.exporter',
    label: 'OTEL exporter',
    description: 'Select OTEL log exporter.',
    group: 'Telemetry',
    kind: 'select',
    options: ['none', 'otlp-http', 'otlp-grpc'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'otel.metrics_exporter',
    label: 'OTEL metrics exporter',
    description: 'Select OTEL metrics exporter.',
    group: 'Telemetry',
    kind: 'select',
    options: ['none', 'statsig', 'otlp-http', 'otlp-grpc'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'otel.trace_exporter',
    label: 'OTEL trace exporter',
    description: 'Select OTEL trace exporter.',
    group: 'Telemetry',
    kind: 'select',
    options: ['none', 'otlp-http', 'otlp-grpc'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'otel.log_user_prompt',
    label: 'OTEL log user prompt',
    description: 'Export raw user prompts with OTEL logs.',
    group: 'Telemetry',
    kind: 'boolean',
  },
  {
    path: 'windows.sandbox',
    label: 'Windows sandbox mode',
    description: 'Native Windows sandbox mode.',
    group: 'Platform',
    kind: 'select',
    options: ['elevated', 'unelevated'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    path: 'tui.keymap.global',
    label: 'TUI global keymap',
    description: 'Global keyboard shortcut overrides.',
    group: 'Platform',
    kind: 'json',
  },
  {
    path: 'tui.keymap.composer',
    label: 'TUI composer keymap',
    description: 'Composer keyboard shortcut overrides.',
    group: 'Platform',
    kind: 'json',
  },
  {
    path: 'tui.keymap.chat',
    label: 'TUI chat keymap',
    description: 'Chat keyboard shortcut overrides.',
    group: 'Platform',
    kind: 'json',
  },
];

function getFields(backend: ConfigBackendType): ConfigField[] {
  if (backend === 'claude-code') return CLAUDE_FIELDS;
  if (backend === 'opencode') return OPENCODE_FIELDS;
  return CODEX_FIELDS;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripJsonComments(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (inString) {
      result += char;
      const wasEscaped = escaped;
      escaped = char === '\\' ? !escaped : false;
      if (char === '"' && !wasEscaped) inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (index < content.length && content[index] !== '\n') index += 1;
      result += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      index += 2;
      while (
        index < content.length &&
        !(content[index] === '*' && content[index + 1] === '/')
      ) {
        result += content[index] === '\n' ? '\n' : ' ';
        index += 1;
      }
      index += 1;
      continue;
    }

    result += char;
  }

  return result;
}

function stripTrailingCommas(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      result += char;
      const wasEscaped = escaped;
      escaped = char === '\\' ? !escaped : false;
      if (char === '"' && !wasEscaped) inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === ',') {
      let nextIndex = index + 1;
      while (/\s/.test(content[nextIndex] ?? '')) nextIndex += 1;
      if (content[nextIndex] === '}' || content[nextIndex] === ']') continue;
    }

    result += char;
  }

  return result;
}

function hasTomlComments(content: string): boolean {
  let inString = false;
  let escaped = false;
  let stringDelimiter: '"' | "'" | null = null;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inString) {
      if (stringDelimiter === '"') {
        const wasEscaped = escaped;
        escaped = char === '\\' ? !escaped : false;
        if (char === '"' && !wasEscaped) {
          inString = false;
          stringDelimiter = null;
        }
        continue;
      }

      if (char === "'") {
        inString = false;
        stringDelimiter = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringDelimiter = char;
      escaped = false;
      continue;
    }

    if (char === '#') return true;
  }

  return false;
}

function parseConfig(
  backend: ConfigBackendType,
  content: string,
): ConfigObject {
  const parsed =
    backend === 'codex'
      ? (parseToml(content) as unknown)
      : (JSON.parse(
          stripTrailingCommas(stripJsonComments(content)),
        ) as unknown);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Config must be an object');
  }
  return parsed as ConfigObject;
}

function serializeConfig(
  backend: ConfigBackendType,
  config: ConfigObject,
): string {
  return backend === 'codex'
    ? `${stringifyToml(config)}\n`
    : `${JSON.stringify(config, null, 2)}\n`;
}

function getPathValue(config: ConfigObject, fieldPath: string): unknown {
  let current: unknown = config;
  for (const segment of fieldPath.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as ConfigObject)[segment];
  }
  return current;
}

function setPathValue(
  config: ConfigObject,
  fieldPath: string,
  value: unknown,
): ConfigObject {
  const segments = fieldPath.split('.');
  const next: ConfigObject = { ...config };
  let current = next;

  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    const nextChild: ConfigObject =
      child && typeof child === 'object' && !Array.isArray(child)
        ? { ...(child as ConfigObject) }
        : {};
    current[segment] = nextChild;
    current = nextChild;
  }

  const last = segments[segments.length - 1];
  if (value === undefined) {
    delete current[last];
  } else {
    current[last] = value;
  }

  return next;
}

function valueToText(value: unknown): string {
  if (value === undefined) return '';
  if (Array.isArray(value)) return value.join('\n');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function groupFields(fields: ConfigField[]): Array<[string, ConfigField[]]> {
  const groups = new Map<string, ConfigField[]>();
  for (const field of fields) {
    groups.set(field.group, [...(groups.get(field.group) ?? []), field]);
  }
  return [...groups.entries()];
}

function FieldCard({
  field,
  value,
  textValue,
  error,
  onTextChange,
  onChange,
  onReset,
}: {
  field: ConfigField;
  value: unknown;
  textValue: string;
  error?: string;
  onTextChange: (value: string) => void;
  onChange: (value: unknown) => void;
  onReset: () => void;
}) {
  const isSet = value !== undefined;

  return (
    <div className="border-line-soft bg-bg-0/45 rounded-lg border px-2.5 py-2">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-ink-1 text-[13px] leading-tight font-medium">
            {field.label}
          </div>
          <div className="text-ink-3/65 mt-0.5 font-mono text-[10px] leading-tight">
            {field.path}
          </div>
        </div>
        <Button
          size="xs"
          variant="ghost"
          icon={<RotateCcw />}
          disabled={!isSet}
          onClick={onReset}
        >
          Default
        </Button>
      </div>

      {field.kind === 'string' && (
        <Input
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          onChange={(event) =>
            onChange(event.target.value.trim() ? event.target.value : undefined)
          }
        />
      )}

      {field.kind === 'multiline' && (
        <Textarea
          value={typeof value === 'string' ? value : ''}
          placeholder={field.placeholder}
          className="min-h-28 font-mono text-[11px] leading-4"
          onChange={(event) =>
            onChange(event.target.value.trim() ? event.target.value : undefined)
          }
        />
      )}

      {field.kind === 'number' && (
        <Input
          type="number"
          value={typeof value === 'number' ? String(value) : ''}
          placeholder={field.placeholder}
          onChange={(event) => {
            const next = event.target.value.trim();
            if (!next) {
              onChange(undefined);
              return;
            }
            const parsed = Number(next);
            onChange(Number.isFinite(parsed) ? parsed : undefined);
          }}
        />
      )}

      {field.kind === 'boolean' && (
        <Switch
          checked={value === true}
          onChange={(checked) => onChange(checked)}
          label={value === undefined ? 'Using backend default' : String(value)}
        />
      )}

      {field.kind === 'select' && field.options && (
        <Select
          value={
            value === undefined
              ? '__default'
              : (field.options.find((option) =>
                  Object.is(option.raw ?? option.value, value),
                )?.value ?? String(value))
          }
          onChange={(selected) => {
            if (selected === '__default') {
              onChange(undefined);
              return;
            }
            const option = field.options?.find(
              (item) => item.value === selected,
            );
            onChange(option ? (option.raw ?? option.value) : selected);
          }}
          options={[
            { value: '__default', label: 'Use backend default' },
            ...field.options,
          ]}
        />
      )}

      {field.kind === 'array' && (
        <Textarea
          value={textValue}
          placeholder="One value per line"
          className="min-h-16 font-mono text-[11px] leading-4"
          onChange={(event) => {
            const text = event.target.value;
            onTextChange(text);
            const rows = text
              .split('\n')
              .map((row) => row.trim())
              .filter(Boolean);
            onChange(rows.length > 0 ? rows : undefined);
          }}
        />
      )}

      {field.kind === 'json' && (
        <Textarea
          value={textValue}
          placeholder={field.placeholder ?? '{ }'}
          error={!!error}
          className="min-h-20 font-mono text-[11px] leading-4"
          onChange={(event) => {
            const text = event.target.value;
            onTextChange(text);
            if (!text.trim()) {
              onChange(undefined);
              return;
            }
            try {
              onChange(JSON.parse(text) as unknown);
            } catch {
              // Keep invalid text visible; save stays disabled via field error.
            }
          }}
        />
      )}

      {error && <div className="mt-1.5 text-[11px] text-red-300">{error}</div>}
    </div>
  );
}

export function OpenCodeProcessModeSettings() {
  const setting = useSetting('opencodeProcess');
  const updateSetting = useUpdateSetting<'opencodeProcess'>();
  const addToast = useToastStore((s) => s.addToast);
  const value = setting.data?.mode ?? 'standalone';

  return (
    <div className="border-line-soft bg-bg-1/60 mt-3 rounded-lg border p-3">
      <div className="text-ink-1 text-xs font-semibold">Process mode</div>
      <p className="text-ink-3 mt-1 text-[11px]">
        Applies to new OpenCode steps. Standalone enables per-step resource
        usage tracking. Shared reduces OpenCode server overhead, but shared
        server usage may appear under multiple OpenCode steps. Steps with
        runtime MCP servers still use standalone.
      </p>
      <div className="mt-2 max-w-sm">
        <Select
          value={value}
          disabled={setting.isLoading || updateSetting.isPending}
          onChange={(mode) =>
            updateSetting.mutate(
              {
                key: 'opencodeProcess',
                value: { mode: mode as OpenCodeProcessMode },
              },
              {
                onError: (error) => {
                  addToast({ message: formatError(error), type: 'error' });
                },
              },
            )
          }
          options={OPENCODE_PROCESS_OPTIONS}
        />
      </div>
    </div>
  );
}

function StructuredBackendConfigSettings({
  backend,
}: {
  backend: ConfigBackendType;
}) {
  const [config, setConfig] = useState<ConfigObject | null>(null);
  const [baselineConfig, setBaselineConfig] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const appliedDataRef = useRef<string | null>(null);
  const [railWidth, setRailWidth] = useState(230);
  const [selectedFieldPath, setSelectedFieldPath] = useState<string | null>(
    null,
  );
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const fields = useMemo(() => getFields(backend), [backend]);
  const visibleFields = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return fields;

    return fields.filter((field) =>
      [field.label, field.path, field.description, field.group]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );
  }, [fields, searchQuery]);
  const groups = useMemo(() => groupFields(visibleFields), [visibleFields]);
  const meta = BACKEND_META[backend];

  const query = useQuery({
    queryKey: ['backendConfig', backend],
    queryFn: () => api.backendConfig.getUserConfig(backend),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });
  const hasUnsafeCodexComments =
    backend === 'codex' &&
    !!query.data?.exists &&
    hasTomlComments(query.data.content);

  const saveConfig = useMutation({
    mutationFn: () =>
      api.backendConfig.setUserConfig(
        backend,
        serializeConfig(backend, config ?? {}),
      ),
    onSuccess: (savedConfig) => {
      queryClient.setQueryData(['backendConfig', backend], savedConfig);
      addToast({ message: `${meta.label} config saved`, type: 'success' });
    },
    onError: (error) => {
      addToast({ message: formatError(error), type: 'error' });
    },
  });

  useEffect(() => {
    if (!query.data) return;
    const dataKey = `${backend}:${query.data.path}:${query.data.content}`;
    if (appliedDataRef.current === dataKey) return;

    try {
      const parsed = parseConfig(backend, query.data.content);
      const serialized = serializeConfig(backend, parsed);
      const currentSerialized = config ? serializeConfig(backend, config) : '';
      const hasLocalEdits =
        !!baselineConfig && currentSerialized !== baselineConfig;
      if (hasLocalEdits && currentSerialized !== serialized) return;

      appliedDataRef.current = dataKey;
      startTransition(() => setConfig(parsed));
      startTransition(() => setBaselineConfig(serialized));
      startTransition(() => setLoadError(null));
      startTransition(() => setTextValues(
        Object.fromEntries(
          getFields(backend)
            .filter((field) => field.kind === 'array' || field.kind === 'json')
            .map((field) => [
              field.path,
              valueToText(getPathValue(parsed, field.path)),
            ]),
        ),
      ));
    } catch (error) {
      appliedDataRef.current = dataKey;
      startTransition(() => setConfig(null));
      startTransition(() => setBaselineConfig(''));
      startTransition(() => setLoadError(formatError(error)));
    }
  }, [backend, baselineConfig, config, query.data]);

  useEffect(() => {
    startTransition(() => setSelectedFieldPath((current) => {
      if (current && visibleFields.some((field) => field.path === current)) {
        return current;
      }
      return visibleFields[0]?.path ?? null;
    }));
  }, [visibleFields]);

  const fieldErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.kind !== 'json') continue;
      const text = textValues[field.path] ?? '';
      if (!text.trim()) continue;
      try {
        JSON.parse(text);
      } catch (error) {
        errors[field.path] = formatError(error);
      }
    }
    for (const field of fields) {
      if (field.kind !== 'number' || !config) continue;
      const value = getPathValue(config, field.path);
      if (typeof value === 'number' && !Number.isFinite(value)) {
        errors[field.path] = 'Value must be a finite number';
      }
    }
    return errors;
  }, [config, fields, textValues]);

  const serializedConfig = config ? serializeConfig(backend, config) : '';
  const hasChanges = !!query.data && serializedConfig !== baselineConfig;
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  const updateField = (field: ConfigField, value: unknown) => {
    setConfig((current) => {
      if (!current) return current;
      return setPathValue(current, field.path, value);
    });
  };

  const selectedField =
    visibleFields.find((field) => field.path === selectedFieldPath) ??
    visibleFields[0];

  return (
    <ListDetailLayout
      list={
        <ListPane
          width={railWidth}
          minWidth={190}
          maxWidth={320}
          onWidthChange={setRailWidth}
          count={visibleFields.length}
          headerContent={
            <div className="space-y-2">
              <div className="text-ink-1 text-sm font-semibold">
                {meta.label}
              </div>
              <Input
                value={searchQuery}
                placeholder="Search settings"
                size="sm"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
          }
          contentClassName="pb-2"
        >
          {visibleFields.length === 0 && (
            <div className="text-ink-3 px-3 py-2 text-xs">
              No matching settings.
            </div>
          )}
          {groups.map(([group, groupFields]) => (
            <div key={group}>
              <ListGroupHeader
                label={group}
                accent={group === groups[0]?.[0]}
              />
              {groupFields.map((field) => (
                <ListItemButton
                  key={field.path}
                  label={field.label}
                  size="compact"
                  isActive={selectedFieldPath === field.path}
                  onClick={() => setSelectedFieldPath(field.path)}
                />
              ))}
            </div>
          ))}
        </ListPane>
      }
      detail={
        <div className="bg-bg-0/20 flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="border-line-soft flex shrink-0 flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-ink-1 text-base font-semibold">
                  {selectedField?.label ?? 'Settings'}
                </h2>
                {backend === 'codex' && (
                  <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-px text-[9px] font-semibold tracking-wide text-amber-300 uppercase">
                    Beta
                  </span>
                )}
              </div>
              {selectedField && (
                <p className="text-ink-3 mt-0.5 text-xs">
                  {selectedField.description}
                </p>
              )}
              <div className="text-ink-3 mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                <span className="flex min-w-0 items-center gap-1">
                  <FileJson size={13} />
                  <span className="truncate">
                    {query.data?.path ?? meta.userPath}
                  </span>
                </span>
                <span>Reference: {query.data?.schemaUrl}</span>
              </div>
              {query.data && !query.data.exists && (
                <div className="mt-0.5 text-[11px] text-amber-300">
                  File does not exist yet. Saving will create it.
                </div>
              )}
              {hasUnsafeCodexComments && (
                <div className="mt-1 text-[11px] text-amber-300">
                  Structured Codex editor cannot safely preserve existing TOML
                  comments yet. Save disabled for this file.
                </div>
              )}
              {loadError && (
                <div className="mt-1.5 text-[11px] text-red-300">
                  {loadError}
                </div>
              )}
            </div>
            <Button
              icon={<Save />}
              disabled={
                !hasChanges ||
                !config ||
                hasFieldErrors ||
                hasUnsafeCodexComments ||
                query.isLoading ||
                saveConfig.isPending
              }
              loading={saveConfig.isPending}
              onClick={() => saveConfig.mutate()}
            >
              Save
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {config && selectedField && (
              <div className="max-w-3xl">
                <FieldCard
                  field={selectedField}
                  value={getPathValue(config, selectedField.path)}
                  textValue={textValues[selectedField.path] ?? ''}
                  error={fieldErrors[selectedField.path]}
                  onTextChange={(value) =>
                    setTextValues((current) => ({
                      ...current,
                      [selectedField.path]: value,
                    }))
                  }
                  onChange={(value) => updateField(selectedField, value)}
                  onReset={() => {
                    updateField(selectedField, undefined);
                    setTextValues((current) => ({
                      ...current,
                      [selectedField.path]: '',
                    }));
                  }}
                />
              </div>
            )}
          </div>
        </div>
      }
    />
  );
}

export function BackendConfigSettings({
  backend,
}: {
  backend: ConfigBackendType;
}) {
  return <StructuredBackendConfigSettings backend={backend} />;
}
