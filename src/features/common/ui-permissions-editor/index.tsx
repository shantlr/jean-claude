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
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import type {
  PermissionAction,
  PermissionScope,
} from '@shared/permission-types';

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

export const TOOL_OPTIONS = [
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function buildInput(
  tool: string,
  pattern: string,
): Record<string, unknown> {
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

export interface FlatRule {
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

const VALID_ACTIONS = new Set<string>(['allow', 'ask', 'deny']);

function isValidAction(value: unknown): value is PermissionAction {
  return typeof value === 'string' && VALID_ACTIONS.has(value);
}

function groupPermissions(scope: PermissionScope): ToolGroup[] {
  const groups: Map<string, FlatRule[]> = new Map();

  for (const [tool, config] of Object.entries(scope)) {
    if (!groups.has(tool)) groups.set(tool, []);
    const bucket = groups.get(tool)!;

    if (typeof config === 'string') {
      if (isValidAction(config)) {
        bucket.push({ tool, pattern: null, action: config });
      }
    } else if (
      typeof config === 'object' &&
      config !== null &&
      !Array.isArray(config)
    ) {
      for (const [pattern, action] of Object.entries(config)) {
        if (isValidAction(action)) {
          bucket.push({ tool, pattern, action });
        }
      }
    }
  }

  return Array.from(groups.entries())
    .filter(([, rules]) => rules.length > 0)
    .map(([tool, rules]) => ({
      tool,
      label: TOOL_META[tool]?.label ?? tool,
      description: TOOL_META[tool]?.description ?? '',
      rules,
    }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ACTION_STYLES: Record<
  PermissionAction,
  { bg: string; text: string; dot: string }
> = {
  allow: {
    bg: 'bg-status-done/10',
    text: 'text-status-done',
    dot: 'bg-status-done',
  },
  deny: {
    bg: 'bg-status-fail/10',
    text: 'text-status-fail',
    dot: 'bg-status-fail',
  },
  ask: {
    bg: 'bg-status-run/10',
    text: 'text-status-run',
    dot: 'bg-status-run',
  },
};

const FALLBACK_STYLE = {
  bg: 'bg-bg-2/10',
  text: 'text-ink-2',
  dot: 'bg-bg-2',
};

function ActionBadge({ action }: { action: PermissionAction }) {
  const style = ACTION_STYLES[action] ?? FALLBACK_STYLE;
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
          'bg-bg-1/50 flex items-center gap-2 px-3 py-2',
          !isLast && 'border-glass-border/20 border-b',
        )}
      >
        {hasPattern ? (
          <input
            ref={inputRef}
            type="text"
            value={editPattern}
            onChange={(e) => setEditPattern(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={TOOL_GUIDANCE[rule.tool]?.placeholder ?? ''}
            className="border-glass-border text-ink-1 focus:border-acc bg-bg-1 min-w-0 flex-1 rounded border px-2 py-1 text-xs outline-none"
          />
        ) : (
          <span className="text-ink-3 min-w-0 flex-1 text-xs italic">
            All operations
          </span>
        )}

        <Select
          value={editAction}
          options={ACTION_OPTIONS}
          onChange={(v: string) => setEditAction(v as PermissionAction)}
          label="Action"
        />

        <Button
          onClick={commitEdit}
          disabled={isBusy}
          className="text-status-done hover:text-status-done hover:bg-glass-medium rounded p-1 transition-colors"
          aria-label="Save changes"
        >
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button
          onClick={cancelEdit}
          className="text-ink-3 hover:text-ink-1 hover:bg-glass-medium rounded p-1 transition-colors"
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
        'group hover:bg-glass-medium/20 flex items-center gap-3 px-3 py-2 transition-colors',
        !isLast && 'border-glass-border/20 border-b',
      )}
    >
      <code className="text-ink-1 min-w-0 flex-1 truncate text-xs">
        {rule.pattern ?? (
          <span className="text-ink-3 italic">All operations</span>
        )}
      </code>

      <ActionBadge action={rule.action} />

      <Button
        onClick={startEdit}
        disabled={isBusy}
        className="text-ink-4 hover:text-acc-ink hover:bg-glass-medium rounded p-1 opacity-0 transition-all group-hover:opacity-100"
        aria-label={`Edit ${rule.pattern ?? 'all'} rule`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <Button
        onClick={onRemove}
        disabled={isBusy}
        className="text-ink-4 hover:text-status-fail hover:bg-glass-medium rounded p-1 opacity-0 transition-all group-hover:opacity-100"
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
    <div className="border-glass-border/50 bg-bg-1/40 overflow-hidden rounded-lg border">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="hover:bg-glass-medium/30 flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors"
      >
        {expanded ? (
          <ChevronDown className="text-ink-3 h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-ink-3 h-3.5 w-3.5 shrink-0" />
        )}
        <Terminal className="text-ink-2 h-4 w-4 shrink-0" />
        <span className="text-ink-1 text-sm font-medium">{group.label}</span>
        <span className="text-ink-3 text-xs">{group.description}</span>
        <span className="bg-glass-medium/60 text-ink-2 ml-auto rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
          {group.rules.length}
        </span>
      </button>

      {expanded && (
        <div className="border-glass-border/30 border-t">
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

// ---------------------------------------------------------------------------
// Main PermissionsEditor component
// ---------------------------------------------------------------------------

export function PermissionsEditor({
  permissions,
  isLoading,
  isBusy,
  onAdd,
  onRemove,
  onEdit,
  title,
  description,
  emptyTitle,
  emptyDescription,
}: {
  permissions: PermissionScope | undefined;
  isLoading: boolean;
  isBusy: boolean;
  onAdd: (params: {
    toolName: string;
    input: Record<string, unknown>;
    action: PermissionAction;
  }) => Promise<void>;
  onRemove: (rule: FlatRule) => void;
  onEdit: (
    rule: FlatRule,
    update: { pattern: string | null; action: PermissionAction },
  ) => void;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
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
      onAdd({ toolName: tool, input, action })
        .then(() => {
          setPattern('');
          setAddError(null);
        })
        .catch((err: Error) => {
          setAddError(err.message);
        });
    },
    [tool, pattern, action, onAdd],
  );

  const handleRemove = useCallback(
    (rule: FlatRule) => {
      onRemove(rule);
    },
    [onRemove],
  );

  const handleEdit = useCallback(
    (
      rule: FlatRule,
      update: { pattern: string | null; action: PermissionAction },
    ) => {
      onEdit(rule, update);
    },
    [onEdit],
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-ink-1 text-lg font-semibold">{title}</h2>
        <p className="text-ink-3 mt-1 text-sm">{description}</p>
      </div>

      {/* Add Rule Form */}
      <form
        onSubmit={handleAdd}
        className="border-glass-border/50 bg-bg-1/30 rounded-lg border p-4"
      >
        <h3 className="text-ink-1 mb-3 text-sm font-medium">Add Rule</h3>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-ink-3 text-xs">Tool</label>
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
            <label className="text-ink-3 text-xs">
              Pattern{' '}
              {guidance?.examples.length === 0 ? '(not applicable)' : ''}
            </label>
            <Input
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={guidance?.placeholder ?? ''}
              disabled={guidance?.examples.length === 0}
              size="sm"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-ink-3 text-xs">Action</label>
            <Select
              value={action}
              options={ACTION_OPTIONS}
              onChange={(v: string) => setAction(v as PermissionAction)}
              label="Action"
            />
          </div>

          <Button
            type="submit"
            disabled={isBusy}
            variant="primary"
            size="sm"
            icon={<Plus />}
          >
            Add
          </Button>
        </div>

        {/* Tool-specific guidance */}
        {guidance && (
          <div className="border-glass-border/50 bg-bg-1/50 mt-3 rounded-md border px-3 py-2">
            <p className="text-ink-2 text-xs">{guidance.hint}</p>
            {guidance.examples.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {guidance.examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPattern(ex)}
                    className="bg-glass-medium/60 text-ink-1 hover:bg-bg-3 hover:text-ink-1 rounded px-1.5 py-0.5 text-[11px] transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {addError && (
          <p className="text-status-fail mt-2 text-xs">{addError}</p>
        )}
      </form>

      {/* Current Rules */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h3 className="text-ink-1 text-sm font-medium">Current Rules</h3>
          {totalRules > 0 && (
            <span className="text-ink-3 text-xs">
              {totalRules} rule{totalRules !== 1 ? 's' : ''} across{' '}
              {groups.length} tool{groups.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {isLoading && <p className="text-ink-3 text-sm">Loading...</p>}

        {!isLoading && groups.length === 0 && (
          <div className="border-glass-border/50 rounded-lg border border-dashed px-4 py-8 text-center">
            <p className="text-ink-3 text-sm">{emptyTitle}</p>
            <p className="text-ink-4 mt-1 text-xs">{emptyDescription}</p>
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
                isBusy={isBusy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
