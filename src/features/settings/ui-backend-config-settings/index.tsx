import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileJson, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import {
  ListDetailLayout,
  ListGroupHeader,
  ListItemButton,
  ListPane,
} from '@/common/ui/list-detail-layout';
import { Select } from '@/common/ui/select';
import { Switch } from '@/common/ui/switch';
import { Textarea } from '@/common/ui/textarea';
import { api } from '@/lib/api';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';

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
  kind: 'string' | 'number' | 'boolean' | 'select' | 'array' | 'json';
  placeholder?: string;
  options?: FieldOption[];
};

const BACKEND_META: Record<
  AgentBackendType,
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
};

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

function getFields(backend: AgentBackendType): ConfigField[] {
  return backend === 'claude-code' ? CLAUDE_FIELDS : OPENCODE_FIELDS;
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

function parseConfig(content: string): ConfigObject {
  const parsed = JSON.parse(
    stripTrailingCommas(stripJsonComments(content)),
  ) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Config must be a JSON object');
  }
  return parsed as ConfigObject;
}

function serializeConfig(config: ConfigObject): string {
  return `${JSON.stringify(config, null, 2)}\n`;
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

export function BackendConfigSettings({
  backend,
}: {
  backend: AgentBackendType;
}) {
  const [config, setConfig] = useState<ConfigObject | null>(null);
  const [baselineConfig, setBaselineConfig] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [textValues, setTextValues] = useState<Record<string, string>>({});
  const appliedDataRef = useRef<string | null>(null);
  const [railWidth, setRailWidth] = useState(230);
  const [selectedFieldPath, setSelectedFieldPath] = useState<string | null>(
    null,
  );
  const addToast = useToastStore((s) => s.addToast);
  const queryClient = useQueryClient();
  const fields = useMemo(() => getFields(backend), [backend]);
  const groups = useMemo(() => groupFields(fields), [fields]);
  const meta = BACKEND_META[backend];

  const query = useQuery({
    queryKey: ['backendConfig', backend],
    queryFn: () => api.backendConfig.getUserConfig(backend),
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const saveConfig = useMutation({
    mutationFn: () =>
      api.backendConfig.setUserConfig(backend, serializeConfig(config ?? {})),
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
      const parsed = parseConfig(query.data.content);
      const serialized = serializeConfig(parsed);
      const currentSerialized = config ? serializeConfig(config) : '';
      const hasLocalEdits =
        !!baselineConfig && currentSerialized !== baselineConfig;
      if (hasLocalEdits && currentSerialized !== serialized) return;

      appliedDataRef.current = dataKey;
      setConfig(parsed);
      setBaselineConfig(serialized);
      setLoadError(null);
      setTextValues(
        Object.fromEntries(
          getFields(backend)
            .filter((field) => field.kind === 'array' || field.kind === 'json')
            .map((field) => [
              field.path,
              valueToText(getPathValue(parsed, field.path)),
            ]),
        ),
      );
    } catch (error) {
      appliedDataRef.current = dataKey;
      setConfig(null);
      setBaselineConfig('');
      setLoadError(formatError(error));
    }
  }, [backend, baselineConfig, config, query.data]);

  useEffect(() => {
    setSelectedFieldPath((current) => {
      if (current && fields.some((field) => field.path === current)) {
        return current;
      }
      return fields[0]?.path ?? null;
    });
  }, [fields]);

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

  const serializedConfig = config ? serializeConfig(config) : '';
  const hasChanges = !!query.data && serializedConfig !== baselineConfig;
  const hasFieldErrors = Object.keys(fieldErrors).length > 0;

  const updateField = (field: ConfigField, value: unknown) => {
    setConfig((current) => {
      if (!current) return current;
      return setPathValue(current, field.path, value);
    });
  };

  const selectedField =
    fields.find((field) => field.path === selectedFieldPath) ?? fields[0];

  return (
    <ListDetailLayout
      list={
        <ListPane
          width={railWidth}
          minWidth={190}
          maxWidth={320}
          onWidthChange={setRailWidth}
          count={fields.length}
          headerContent={
            <div className="text-ink-1 text-sm font-semibold">{meta.label}</div>
          }
          contentClassName="pb-2"
        >
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
              <h2 className="text-ink-1 text-base font-semibold">
                {selectedField?.label ?? 'Settings'}
              </h2>
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
                <span>Schema: {query.data?.schemaUrl}</span>
              </div>
              {query.data && !query.data.exists && (
                <div className="mt-0.5 text-[11px] text-amber-300">
                  File does not exist yet. Saving will create it.
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
