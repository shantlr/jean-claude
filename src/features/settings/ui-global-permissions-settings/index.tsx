import { Plus, Shield, Trash2 } from 'lucide-react';
import type React from 'react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Select } from '@/common/ui/select';
import {
  useGlobalPermissions,
  useAddGlobalPermissionRule,
  useRemoveGlobalPermissionRule,
} from '@/hooks/use-global-permissions';
import type {
  PermissionAction,
  PermissionScope,
} from '@shared/permission-types';

const TOOL_OPTIONS = [
  { value: 'bash', label: 'Bash', description: 'Shell commands' },
  { value: 'read', label: 'Read', description: 'Read file contents' },
  { value: 'edit', label: 'Edit', description: 'Edit existing files' },
  { value: 'write', label: 'Write', description: 'Create or overwrite files' },
  { value: 'glob', label: 'Glob', description: 'Find files by pattern' },
  { value: 'grep', label: 'Grep', description: 'Search file contents' },
  {
    value: 'webfetch',
    label: 'WebFetch',
    description: 'Fetch URLs',
  },
  {
    value: 'websearch',
    label: 'WebSearch',
    description: 'Web search queries',
  },
  { value: 'task', label: 'Task', description: 'Sub-agent tasks' },
  { value: 'todowrite', label: 'TodoWrite', description: 'Write todo items' },
  { value: 'skill', label: 'Skill', description: 'Execute skills' },
] as const;

const TOOL_GUIDANCE: Record<
  string,
  { placeholder: string; hint: string; examples: string[] }
> = {
  bash: {
    placeholder: 'git status*',
    hint: 'Exact command or prefix with * wildcard. A specific command pattern is required.',
    examples: ['git *', 'npm run build', 'pnpm install*', 'ls -la'],
  },
  read: {
    placeholder: '/path/to/file',
    hint: 'Absolute file path to allow reading.',
    examples: ['src/**', '/etc/hosts', 'package.json'],
  },
  edit: {
    placeholder: '/path/to/file',
    hint: 'Absolute file path to allow editing.',
    examples: ['src/**/*.ts', 'config/*.json'],
  },
  write: {
    placeholder: '/path/to/file',
    hint: 'Absolute file path to allow writing/creating.',
    examples: ['src/**/*.ts', 'dist/**'],
  },
  glob: {
    placeholder: '**/*.ts',
    hint: 'Glob pattern to allow searching.',
    examples: ['**/*.ts', 'src/**'],
  },
  grep: {
    placeholder: 'TODO|FIXME',
    hint: 'Search pattern to allow.',
    examples: ['TODO', 'import.*from'],
  },
  webfetch: {
    placeholder: 'https://api.example.com/*',
    hint: 'URL or URL pattern to allow fetching.',
    examples: ['https://docs.example.com/*', 'https://api.github.com/*'],
  },
  websearch: {
    placeholder: 'react hooks*',
    hint: 'Search query pattern to allow.',
    examples: ['typescript *', 'react *'],
  },
  task: {
    placeholder: '',
    hint: 'Allow or deny all sub-agent task creation. No pattern needed.',
    examples: [],
  },
  todowrite: {
    placeholder: '',
    hint: 'Allow or deny todo write operations. No pattern needed.',
    examples: [],
  },
  skill: {
    placeholder: '',
    hint: 'Allow or deny skill execution. No pattern needed.',
    examples: [],
  },
};

function buildInput(tool: string, pattern: string): Record<string, unknown> {
  if (!pattern) return {};
  switch (tool) {
    case 'bash':
      return { command: pattern };
    case 'read':
    case 'edit':
    case 'write':
      return { filePath: pattern };
    case 'glob':
    case 'grep':
      return { pattern };
    case 'webfetch':
      return { url: pattern };
    case 'websearch':
      return { query: pattern };
    default:
      return {};
  }
}

interface FlatRule {
  tool: string;
  pattern: string | null;
  action: PermissionAction;
  label: string;
}

function flattenPermissions(scope: PermissionScope): FlatRule[] {
  const rules: FlatRule[] = [];
  for (const [tool, config] of Object.entries(scope)) {
    if (typeof config === 'string') {
      rules.push({ tool, pattern: null, action: config, label: tool });
    } else {
      for (const [pattern, action] of Object.entries(config)) {
        rules.push({
          tool,
          pattern,
          action,
          label: `${tool}: ${pattern}`,
        });
      }
    }
  }
  return rules;
}

export function GlobalPermissionsSettings() {
  const { data: permissions, isLoading } = useGlobalPermissions();
  const addRule = useAddGlobalPermissionRule();
  const removeRule = useRemoveGlobalPermissionRule();

  const [tool, setTool] = useState('bash');
  const [pattern, setPattern] = useState('');

  const rules = useMemo(
    () => (permissions ? flattenPermissions(permissions) : []),
    [permissions],
  );

  const [addError, setAddError] = useState<string | null>(null);
  const guidance = TOOL_GUIDANCE[tool];

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setAddError(null);

      // Client-side guard: reject bare bash before sending to IPC
      const trimmed = pattern.trim();
      if (
        tool.toLowerCase() === 'bash' &&
        (!trimmed || trimmed === '*' || trimmed === '**')
      ) {
        setAddError(
          'Bare "bash" without a specific command pattern is not allowed. Please provide a command pattern (e.g. "git status*").',
        );
        return;
      }

      const input = buildInput(tool, trimmed);
      addRule.mutate(
        { toolName: tool, input },
        {
          onSuccess: () => {
            setPattern('');
            setAddError(null);
          },
          onError: (err: Error) => {
            setAddError(err.message);
          },
        },
      );
    },
    [tool, pattern, addRule],
  );

  const handleRemove = useCallback(
    (rule: FlatRule) => {
      removeRule.mutate({
        tool: rule.tool,
        pattern: rule.pattern ?? undefined,
      });
    },
    [removeRule],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-neutral-200">Permissions</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Global permission rules applied to all projects. Project-level rules
          take precedence over global rules.
        </p>
      </div>

      {/* Add Rule Form */}
      <form onSubmit={handleAdd} className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-neutral-300">Add Rule</h3>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">Tool</label>
            <Select
              value={tool}
              options={[...TOOL_OPTIONS]}
              onChange={(v: string) => {
                setTool(v);
                setPattern('');
                setAddError(null);
              }}
              label="Tool"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className="text-xs text-neutral-500">
              Pattern{' '}
              {guidance?.examples.length === 0 ? '(not applicable)' : ''}
            </label>
            <input
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={guidance?.placeholder ?? ''}
              disabled={guidance?.examples.length === 0}
              className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <Button
            type="submit"
            disabled={addRule.isPending}
            className="flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>

        {/* Tool-specific guidance */}
        {guidance && (
          <div className="rounded-md border border-neutral-700/50 bg-neutral-800/50 px-3 py-2">
            <p className="text-xs text-neutral-400">{guidance.hint}</p>
            {guidance.examples.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {guidance.examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPattern(ex)}
                    className="rounded bg-neutral-700/60 px-1.5 py-0.5 text-[11px] text-neutral-300 transition-colors hover:bg-neutral-600 hover:text-neutral-200"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {addError && <p className="text-xs text-red-400">{addError}</p>}
      </form>

      {/* Current Rules */}
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium text-neutral-300">Current Rules</h3>

        {isLoading && <p className="text-sm text-neutral-500">Loading...</p>}

        {!isLoading && rules.length === 0 && (
          <p className="text-sm text-neutral-500">
            No global permission rules configured.
          </p>
        )}

        {rules.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {rules.map((rule) => (
              <div
                key={`${rule.tool}-${rule.pattern ?? '*'}`}
                className="flex items-center gap-2 rounded-md bg-neutral-800 px-3 py-2"
              >
                <Shield className="h-4 w-4 shrink-0 text-green-500" />
                <span className="min-w-0 flex-1 truncate text-sm text-neutral-200">
                  {rule.label}
                </span>
                <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400">
                  {rule.action}
                </span>
                <Button
                  onClick={() => handleRemove(rule)}
                  disabled={removeRule.isPending}
                  className="rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-red-400"
                  aria-label={`Remove ${rule.label}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
