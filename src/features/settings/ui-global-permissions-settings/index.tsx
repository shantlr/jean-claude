import clsx from 'clsx';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Select } from '@/common/ui/select';
import {
  useGlobalPermissions,
  useAddGlobalPermissionRule,
  useRemoveGlobalPermissionRule,
  useEditGlobalPermissionRule,
} from '@/hooks/use-global-permissions';
import type {
  PermissionAction,
  PermissionScope,
} from '@shared/permission-types';

const TOOL_OPTIONS = [
  { value: 'bash', label: 'Bash', description: 'Shell commands' },
  { value: 'read', label: 'Read', description: 'Read file contents' },
  { value: 'edit', label: 'Edit', description: 'Edit existing files' },
  {
    value: 'write',
    label: 'Write',
    description: 'Create or overwrite files',
  },
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
  {
    value: 'todowrite',
    label: 'TodoWrite',
    description: 'Write todo items',
  },
  { value: 'skill', label: 'Skill', description: 'Execute skills' },
] as const;

const ACTION_OPTIONS = [
  { value: 'allow' as const, label: 'Allow' },
  { value: 'ask' as const, label: 'Ask' },
  { value: 'deny' as const, label: 'Deny' },
];

const TOOL_META: Record<string, { label: string; description: string }> =
  Object.fromEntries(
    TOOL_OPTIONS.map((t) => [
      t.value,
      { label: t.label, description: t.description },
    ]),
  );

/** Tools that don't use patterns (scalar action only) */
const PATTERNLESS_TOOLS = new Set(['task', 'todowrite', 'skill']);

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
}

interface ToolGroup {
  tool: string;
  label: string;
  description: string;
  rules: FlatRule[];
}

function groupPermissions(scope: PermissionScope): ToolGroup[] {
  const groups: Map<string, FlatRule[]> = new Map();

  for (const [tool, config] of Object.entries(scope)) {
    if (!groups.has(tool)) groups.set(tool, []);
    const bucket = groups.get(tool)!;

    if (typeof config === 'string') {
      bucket.push({ tool, pattern: null, action: config });
    } else {
      for (const [pattern, action] of Object.entries(config)) {
        bucket.push({ tool, pattern, action });
      }
    }
  }

  return Array.from(groups.entries()).map(([tool, rules]) => ({
    tool,
    label: TOOL_META[tool]?.label ?? tool,
    description: TOOL_META[tool]?.description ?? '',
    rules,
  }));
}

const ACTION_STYLES: Record<
  PermissionAction,
  { bg: string; text: string; dot: string }
> = {
  allow: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    dot: 'bg-green-400',
  },
  deny: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  ask: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
  },
};

function ActionBadge({ action }: { action: PermissionAction }) {
  const style = ACTION_STYLES[action];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
        style.bg,
        style.text,
      )}
    >
      <span className={clsx('h-1.5 w-1.5 rounded-full', style.dot)} />
      {action}
    </span>
  );
}

function RuleRow({
  rule,
  isLast,
  onRemove,
  onEdit,
  isBusy,
}: {
  rule: FlatRule;
  isLast: boolean;
  onRemove: () => void;
  onEdit: (update: {
    pattern: string | null;
    action: PermissionAction;
  }) => void;
  isBusy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editPattern, setEditPattern] = useState(rule.pattern ?? '');
  const [editAction, setEditAction] = useState<PermissionAction>(rule.action);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasPattern = !PATTERNLESS_TOOLS.has(rule.tool);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    setEditPattern(rule.pattern ?? '');
    setEditAction(rule.action);
    setEditing(true);
  }, [rule.pattern, rule.action]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
  }, []);

  const commitEdit = useCallback(() => {
    const trimmed = editPattern.trim();
    const newPattern = hasPattern ? trimmed || null : null;
    // Only commit if something actually changed
    if (newPattern !== rule.pattern || editAction !== rule.action) {
      onEdit({ pattern: newPattern, action: editAction });
    }
    setEditing(false);
  }, [editPattern, editAction, hasPattern, rule.pattern, rule.action, onEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit],
  );

  if (editing) {
    return (
      <div
        className={clsx(
          'bg-neutral-750/50 flex items-center gap-2 px-3 py-2',
          !isLast && 'border-b border-neutral-700/20',
        )}
      >
        {/* Editable pattern */}
        {hasPattern ? (
          <input
            ref={inputRef}
            type="text"
            value={editPattern}
            onChange={(e) => setEditPattern(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={TOOL_GUIDANCE[rule.tool]?.placeholder ?? ''}
            className="min-w-0 flex-1 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 outline-none focus:border-blue-500"
          />
        ) : (
          <span className="min-w-0 flex-1 text-xs text-neutral-500 italic">
            All operations
          </span>
        )}

        {/* Action selector */}
        <Select
          value={editAction}
          options={ACTION_OPTIONS}
          onChange={(v: string) => setEditAction(v as PermissionAction)}
          label="Action"
        />

        {/* Save / Cancel */}
        <Button
          onClick={commitEdit}
          disabled={isBusy}
          className="rounded p-1 text-green-500 transition-colors hover:bg-neutral-700 hover:text-green-400"
          aria-label="Save changes"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          onClick={cancelEdit}
          className="rounded p-1 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-neutral-300"
          aria-label="Cancel editing"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'group flex items-center gap-3 px-3 py-2 transition-colors hover:bg-neutral-700/20',
        !isLast && 'border-b border-neutral-700/20',
      )}
    >
      {/* Pattern or "All" */}
      <code className="min-w-0 flex-1 truncate text-xs text-neutral-300">
        {rule.pattern ?? (
          <span className="text-neutral-500 italic">All operations</span>
        )}
      </code>

      <ActionBadge action={rule.action} />

      {/* Edit button — visible on hover */}
      <Button
        onClick={startEdit}
        disabled={isBusy}
        className="rounded p-1 text-neutral-600 opacity-0 transition-all group-hover:opacity-100 hover:bg-neutral-700 hover:text-blue-400"
        aria-label={`Edit ${rule.pattern ?? 'all'} rule`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Button
        onClick={onRemove}
        disabled={isBusy}
        className="rounded p-1 text-neutral-600 opacity-0 transition-all group-hover:opacity-100 hover:bg-neutral-700 hover:text-red-400"
        aria-label={`Remove ${rule.pattern ?? 'all'} rule`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ToolGroupCard({
  group,
  onRemove,
  onEdit,
  isBusy,
}: {
  group: ToolGroup;
  onRemove: (rule: FlatRule) => void;
  onEdit: (
    rule: FlatRule,
    update: { pattern: string | null; action: PermissionAction },
  ) => void;
  isBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="overflow-hidden rounded-lg border border-neutral-700/50 bg-neutral-800/40">
      {/* Group header */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-neutral-700/30"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        )}
        <Terminal className="h-4 w-4 shrink-0 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-200">
          {group.label}
        </span>
        <span className="text-xs text-neutral-500">{group.description}</span>
        <span className="ml-auto rounded-full bg-neutral-700/60 px-1.5 py-0.5 text-[10px] text-neutral-400 tabular-nums">
          {group.rules.length}
        </span>
      </button>

      {/* Rules list */}
      {expanded && (
        <div className="border-t border-neutral-700/30">
          {group.rules.map((rule, i) => (
            <RuleRow
              key={`${rule.tool}-${rule.pattern ?? '*'}`}
              rule={rule}
              isLast={i === group.rules.length - 1}
              onRemove={() => onRemove(rule)}
              onEdit={(update) => onEdit(rule, update)}
              isBusy={isBusy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GlobalPermissionsSettings() {
  const { data: permissions, isLoading } = useGlobalPermissions();
  const addRule = useAddGlobalPermissionRule();
  const removeRule = useRemoveGlobalPermissionRule();
  const editRule = useEditGlobalPermissionRule();

  const [tool, setTool] = useState('bash');
  const [pattern, setPattern] = useState('');
  const [action, setAction] = useState<PermissionAction>('allow');
  const [addError, setAddError] = useState<string | null>(null);

  const groups = useMemo(
    () => (permissions ? groupPermissions(permissions) : []),
    [permissions],
  );

  const totalRules = useMemo(
    () => groups.reduce((sum, g) => sum + g.rules.length, 0),
    [groups],
  );

  const guidance = TOOL_GUIDANCE[tool];

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setAddError(null);

      const trimmed = pattern.trim();
      if (
        tool.toLowerCase() === 'bash' &&
        action === 'allow' &&
        (!trimmed || trimmed === '*' || trimmed === '**')
      ) {
        setAddError(
          'Bare "bash" without a specific command pattern is not allowed. Please provide a command pattern (e.g. "git status*").',
        );
        return;
      }

      const input = buildInput(tool, trimmed);
      addRule.mutate(
        { toolName: tool, input, action },
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
    [tool, pattern, action, addRule],
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

  const handleEdit = useCallback(
    (
      rule: FlatRule,
      update: { pattern: string | null; action: PermissionAction },
    ) => {
      editRule.mutate(
        {
          tool: rule.tool,
          oldPattern: rule.pattern ?? undefined,
          newPattern: update.pattern ?? undefined,
          action: update.action,
        },
        {
          onError: (err: Error) => {
            setAddError(err.message);
          },
        },
      );
    },
    [editRule],
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
      <form
        onSubmit={handleAdd}
        className="rounded-lg border border-neutral-700/50 bg-neutral-800/30 p-4"
      >
        <h3 className="mb-3 text-sm font-medium text-neutral-300">Add Rule</h3>
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

          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">Action</label>
            <Select
              value={action}
              options={ACTION_OPTIONS}
              onChange={(v: string) => setAction(v as PermissionAction)}
              label="Action"
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
          <div className="mt-3 rounded-md border border-neutral-700/50 bg-neutral-800/50 px-3 py-2">
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

        {addError && <p className="mt-2 text-xs text-red-400">{addError}</p>}
      </form>

      {/* Current Rules — grouped by tool */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-neutral-300">
            Current Rules
          </h3>
          {totalRules > 0 && (
            <span className="text-xs text-neutral-500">
              {totalRules} rule{totalRules !== 1 ? 's' : ''} across{' '}
              {groups.length} tool{groups.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {isLoading && <p className="text-sm text-neutral-500">Loading...</p>}

        {!isLoading && groups.length === 0 && (
          <div className="rounded-lg border border-dashed border-neutral-700/50 px-4 py-8 text-center">
            <p className="text-sm text-neutral-500">
              No global permission rules configured.
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              Add a rule above to control tool access across all projects.
            </p>
          </div>
        )}

        {groups.length > 0 && (
          <div className="flex flex-col gap-2">
            {groups.map((group) => (
              <ToolGroupCard
                key={group.tool}
                group={group}
                onRemove={handleRemove}
                onEdit={handleEdit}
                isBusy={
                  addRule.isPending ||
                  removeRule.isPending ||
                  editRule.isPending
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
