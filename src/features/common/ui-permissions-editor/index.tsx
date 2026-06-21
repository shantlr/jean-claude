import {
  Check,
  ChevronDown,
  ChevronRight,
  File,
  FilePenLine,
  Globe,
  Plus,
  Search,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type React from 'react';


import type {
  PermissionAction,
  PermissionScope,
} from '@shared/permission-types';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';



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

const ACTION_ORDER = ACTION_OPTIONS.map((option) => option.value);

function nextAction(action: PermissionAction): PermissionAction {
  return ACTION_ORDER[(ACTION_ORDER.indexOf(action) + 1) % ACTION_ORDER.length];
}

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

const TOOL_SAMPLE_VALUES: Record<string, string[]> = {
  bash: [
    'git status',
    'git status --short',
    'git diff src/app.ts',
    'echo "hello world"',
    'echo arg1 arg2 arg3',
    'pnpm install',
    'pnpm lint --fix',
    'npm run build',
    'rm -rf node_modules',
  ],
  read: [
    'package.json',
    'src/app.ts',
    'src/components/button.tsx',
    'src/.env',
    '/etc/hosts',
    'README.md',
  ],
  edit: [
    'src/app.ts',
    'src/components/button.tsx',
    'config/app.json',
    'package.json',
    'README.md',
  ],
  write: [
    'src/app.ts',
    'dist/index.js',
    'config/app.json',
    'tmp/output.txt',
    'README.md',
  ],
  glob: ['**/*.ts', 'src/**/*.tsx', 'src/**', '*.json', 'README.md'],
  grep: ['TODO', 'TODO|FIXME', 'import React from', 'function handleSave'],
  webfetch: [
    'https://docs.example.com/api',
    'https://api.github.com/repos',
    'https://example.com/login',
  ],
  websearch: ['react hooks', 'typescript generics', 'electron permissions'],
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
      rules: [...rules].sort((a, b) =>
        (a.pattern ?? '').localeCompare(b.pattern ?? ''),
      ),
    }));
}

function globLikeMatches(
  pattern: string,
  value: string,
  isBash: boolean,
): boolean {
  if (pattern === '*') return true;
  const regex = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*+/g, (stars) => (isBash || stars.length > 1 ? '.*' : '[^/]*'))
    .replace(/\?/g, isBash ? '.' : '[^/]')
    .replace(/(\.\*)+/g, '.*');
  return new RegExp(`^${regex}$`).test(value);
}

function materializePattern(tool: string, pattern: string): string {
  const fill = tool === 'bash' ? 'hello' : 'example';
  return pattern
    .replace(/\*+/g, fill)
    .replace(/\?/g, 'x')
    .replace(/\{subpath\}/g, 'src/app.ts');
}

function getLiteralPrefix(pattern: string): string {
  const wildcardIndex = pattern.search(/[?*{]/);
  return wildcardIndex === -1 ? pattern : pattern.slice(0, wildcardIndex);
}

function getBashCommand(value: string): string {
  return value.trim().split(/\s+/)[0] || 'command';
}

function buildNearMatchCandidates(tool: string, pattern: string): string[] {
  const prefix = getLiteralPrefix(pattern);
  if (tool !== 'bash') {
    return [
      materializePattern(tool, pattern),
      `${prefix}example`,
      `${prefix}sample`,
    ];
  }

  const command = getBashCommand(prefix);
  if (prefix.endsWith(' ')) {
    return [
      `${prefix}hello`,
      `${prefix}"hello world"`,
      `${prefix}arg1 arg2 arg3`,
      `${prefix}src/app.ts`,
      command === 'cd' ? `${prefix}..` : `${prefix}--help`,
    ];
  }

  return [
    materializePattern(tool, pattern),
    `${prefix} --help`,
    `${prefix} "hello world"`,
    `${prefix} arg1 arg2 arg3`,
    `${prefix} src/app.ts`,
  ];
}

function buildNearMissCandidates(tool: string, pattern: string): string[] {
  const prefix = getLiteralPrefix(pattern);
  if (tool !== 'bash') {
    return [
      prefix || 'unmatched-example',
      `not-${materializePattern(tool, pattern)}`,
      `${prefix}other/example`,
    ];
  }

  const command = getBashCommand(prefix);
  if (prefix.endsWith(' ')) {
    const bareCommand = prefix.trim();
    return [bareCommand, `${bareCommand}foo`, `${command}-other hello`];
  }

  const stem = prefix.trim();
  return [command, `${stem}x`, `${command} other`];
}

function buildPatternExamples(tool: string, pattern: string) {
  const trimmed = pattern.trim();
  if (!trimmed || PATTERNLESS_TOOLS.has(tool)) {
    return { matches: [], misses: [] };
  }

  const isBash = tool === 'bash';
  const generated = materializePattern(tool, trimmed);
  const samples =
    TOOL_SAMPLE_VALUES[tool] ?? TOOL_GUIDANCE[tool]?.examples ?? [];
  const hasWildcard = /[*?{]/.test(trimmed);
  const candidates = Array.from(
    new Set([
      ...buildNearMatchCandidates(tool, trimmed),
      generated,
      ...(hasWildcard ? [] : [trimmed]),
      ...samples,
      ...(TOOL_GUIDANCE[tool]?.examples ?? []),
    ]),
  );
  const matches = candidates
    .filter((candidate) => globLikeMatches(trimmed, candidate, isBash))
    .slice(0, 4);

  const missCandidates = Array.from(
    new Set([
      ...buildNearMissCandidates(tool, trimmed),
      ...samples,
      `not-${generated}`,
      `${generated}-extra`,
      isBash ? 'rm -rf node_modules' : 'unmatched-example',
    ]),
  );
  const misses = missCandidates
    .filter((candidate) => !globLikeMatches(trimmed, candidate, isBash))
    .slice(0, 4);

  return { matches, misses };
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

const ACTION_GLOW: Record<PermissionAction, string> = {
  allow: 'rgba(84, 211, 151, 0.65)',
  ask: 'rgba(236, 177, 74, 0.65)',
  deny: 'rgba(243, 103, 79, 0.65)',
};

const ACTION_CHIP_CLASSES: Record<PermissionAction, string> = {
  allow:
    'border-emerald-400/30 bg-emerald-400/12 shadow-[inset_0_0_0_1px_rgba(84,211,151,0.08),0_0_18px_-10px_rgba(84,211,151,0.9)]',
  ask: 'border-amber-400/35 bg-amber-400/12 shadow-[inset_0_0_0_1px_rgba(236,177,74,0.08),0_0_18px_-10px_rgba(236,177,74,0.9)]',
  deny: 'border-red-400/35 bg-red-400/12 shadow-[inset_0_0_0_1px_rgba(243,103,79,0.08),0_0_18px_-10px_rgba(243,103,79,0.9)]',
};

function getActionStyle(action: PermissionAction) {
  return ACTION_STYLES[action] ?? FALLBACK_STYLE;
}

function ActionDot({
  action,
  size = 'sm',
  glow = false,
}: {
  action: PermissionAction;
  size?: 'xs' | 'sm';
  glow?: boolean;
}) {
  const style = getActionStyle(action);
  return (
    <span
      className={clsx(
        'shrink-0 rounded-full',
        size === 'xs' ? 'h-1.5 w-1.5' : 'h-[9px] w-[9px]',
        style.dot,
      )}
      style={glow ? { boxShadow: `0 0 6px ${ACTION_GLOW[action]}` } : undefined}
    />
  );
}

function ActionSegment({
  value,
  onChange,
}: {
  value: PermissionAction;
  onChange: (action: PermissionAction) => void;
}) {
  return (
    <div className="border-glass-border/60 bg-bg-1/60 inline-flex rounded-lg border p-0.5">
      {ACTION_OPTIONS.map((option) => {
        const selected = value === option.value;
        const style = getActionStyle(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={selected}
            className={clsx(
              'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              selected
                ? clsx('bg-bg-3 text-ink-1 shadow-sm', style.text)
                : 'text-ink-3 hover:text-ink-1',
            )}
          >
            <ActionDot action={option.value} />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DistributionBar({ rules }: { rules: FlatRule[] }) {
  const counts = useMemo(
    () =>
      rules.reduce<Record<PermissionAction, number>>(
        (acc, rule) => {
          acc[rule.action] += 1;
          return acc;
        },
        { allow: 0, ask: 0, deny: 0 },
      ),
    [rules],
  );
  const total = rules.length || 1;

  return (
    <span className="bg-glass-medium/40 inline-flex h-1 w-14 overflow-hidden rounded-full">
      {ACTION_OPTIONS.map((option) => {
        const width = (counts[option.value] / total) * 100;
        return width > 0 ? (
          <span
            key={option.value}
            className={getActionStyle(option.value).dot}
            style={{ width: `${width}%` }}
          />
        ) : null;
      })}
    </span>
  );
}

function ToolIcon({ tool }: { tool: string }) {
  const className = 'text-ink-3 h-3.5 w-3.5 shrink-0';
  switch (tool) {
    case 'read':
      return <File className={className} />;
    case 'edit':
    case 'write':
      return <FilePenLine className={className} />;
    case 'webfetch':
    case 'websearch':
      return <Globe className={className} />;
    default:
      return <Terminal className={className} />;
  }
}

function PatternMatchPreview({
  tool,
  pattern,
  compact = false,
}: {
  tool: string;
  pattern: string;
  compact?: boolean;
}) {
  const { matches, misses } = useMemo(
    () => buildPatternExamples(tool, pattern),
    [tool, pattern],
  );

  if (matches.length === 0 && misses.length === 0) return null;

  return (
    <div
      className={clsx(
        'text-[11px]',
        compact
          ? 'bg-bg-3/95 absolute top-full left-0 z-30 mt-1 w-max max-w-[min(520px,calc(100vw-2rem))] rounded-lg border border-white/10 p-2 shadow-xl'
          : 'border-glass-border/50 bg-bg-1/35 mt-2 rounded-lg border p-2',
      )}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="min-w-0">
          <div className="text-status-done mb-1 font-medium">Matches</div>
          <div className="flex flex-wrap gap-1">
            {matches.length > 0 ? (
              matches.map((example) => (
                <span
                  key={example}
                  className="bg-status-done/10 text-status-done rounded px-1.5 py-0.5 font-mono"
                >
                  {example}
                </span>
              ))
            ) : (
              <span className="text-ink-4">No sample matches</span>
            )}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-status-fail mb-1 font-medium">Misses</div>
          <div className="flex flex-wrap gap-1">
            {misses.length > 0 ? (
              misses.map((example) => (
                <span
                  key={example}
                  className="bg-status-fail/10 text-status-fail rounded px-1.5 py-0.5 font-mono"
                >
                  {example}
                </span>
              ))
            ) : (
              <span className="text-ink-4">Nothing, matches all samples</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineRuleEditor({
  tool,
  initialPattern = '',
  initialAction = 'allow',
  onCommit,
  onCancel,
  isBusy,
}: {
  tool: string;
  initialPattern?: string;
  initialAction?: PermissionAction;
  onCommit: (pattern: string | null, action: PermissionAction) => void;
  onCancel: () => void;
  isBusy: boolean;
}) {
  const [editPattern, setEditPattern] = useState(initialPattern);
  const [editAction, setEditAction] = useState<PermissionAction>(initialAction);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasPattern = !PATTERNLESS_TOOLS.has(tool);

  useRegisterKeyboardBindings('permissions-inline-rule-editor', {
    escape: () => {
      onCancel();
      return true;
    },
  });

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onCancel();
    };

    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [onCancel]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const commitEdit = useCallback(() => {
    const trimmed = editPattern.trim();
    onCommit(hasPattern ? trimmed || null : null, editAction);
  }, [editPattern, editAction, hasPattern, onCommit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commitEdit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    },
    [commitEdit, onCancel],
  );

  return (
    <span className="relative inline-flex">
      <span
        className={clsx(
          'inline-flex items-center gap-0.5 rounded-lg border py-0.5 pr-1 pl-0.5 font-mono text-[12.5px] leading-[1.3]',
          ACTION_CHIP_CLASSES[editAction],
        )}
      >
        <button
          type="button"
          onClick={() => setEditAction(nextAction(editAction))}
          className="inline-flex h-4 w-4 items-center justify-center rounded-md transition-transform hover:scale-110"
          title="Change action"
        >
          <ActionDot action={editAction} glow />
        </button>
        {hasPattern ? (
          <input
            ref={inputRef}
            type="text"
            value={editPattern}
            onChange={(e) => setEditPattern(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onCancel}
            placeholder={TOOL_GUIDANCE[tool]?.placeholder ?? 'pattern'}
            className="text-ink-1 placeholder:text-ink-4 w-36 bg-transparent px-0.5 font-mono outline-none"
          />
        ) : (
          <span className="text-ink-2 px-1 text-xs italic">All operations</span>
        )}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commitEdit}
          disabled={isBusy}
          className="rounded px-1 font-mono text-[10px] font-semibold opacity-80 transition-colors hover:bg-black/20 disabled:opacity-50"
          aria-label="Save permission rule"
        >
          ↵
        </button>
        <Button
          type="button"
          variant="unstyled"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancel}
          className="text-ink-3 hover:text-ink-1 hover:bg-glass-medium rounded p-1"
          aria-label="Cancel permission rule"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </span>
      {hasPattern && (
        <PatternMatchPreview tool={tool} pattern={editPattern} compact />
      )}
    </span>
  );
}

function RuleActionMenu({
  rule,
  onAction,
  onRemove,
  onClose,
  isBusy,
}: {
  rule: FlatRule;
  onAction: (action: PermissionAction) => void;
  onRemove: () => void;
  onClose: () => void;
  isBusy: boolean;
}) {
  return (
    <div className="bg-bg-3 absolute top-full left-0 z-20 mt-1 min-w-[210px] rounded-[10px] border border-white/10 p-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7),0_0_0_1px_rgba(0,0,0,0.4)]">
      <div className="text-ink-4 px-2 pt-1 pb-0.5 text-[9.5px] font-semibold tracking-[0.07em] uppercase">
        Action
      </div>
      {ACTION_OPTIONS.map((option) => {
        const selected = rule.action === option.value;
        const style = getActionStyle(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              onAction(option.value);
              onClose();
            }}
            disabled={isBusy}
            className="hover:bg-bg-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors disabled:opacity-50"
          >
            <ActionDot action={option.value} glow />
            <span className="min-w-0 flex-1 whitespace-nowrap">
              <span className="text-ink-1">
                {option.label}
                <span className="text-ink-4 text-[11px] font-normal">
                  {' · '}
                  {option.value === 'allow'
                    ? 'Run without asking'
                    : option.value === 'ask'
                      ? 'Confirm each time'
                      : 'Always block'}
                </span>
              </span>
            </span>
            <Check
              className={clsx(
                'h-3.5 w-3.5',
                selected ? style.text : 'text-transparent',
              )}
            />
          </button>
        );
      })}
      <div className="bg-glass-border/60 mx-1 my-1 h-px" />
      <button
        type="button"
        onClick={() => {
          onRemove();
          onClose();
        }}
        disabled={isBusy}
        className="text-status-fail hover:bg-status-fail/10 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs font-medium transition-colors disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete rule
      </button>
    </div>
  );
}

function RuleChip({
  rule,
  isMenuOpen,
  onOpenMenu,
  onCloseMenu,
  onRemove,
  onEdit,
  isBusy,
}: {
  rule: FlatRule;
  isMenuOpen: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onRemove: () => void;
  onEdit: (update: {
    pattern: string | null;
    action: PermissionAction;
  }) => void;
  isBusy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const style = getActionStyle(rule.action);
  const displayPattern = rule.pattern ?? '*';

  if (editing) {
    return (
      <InlineRuleEditor
        tool={rule.tool}
        initialPattern={displayPattern}
        initialAction={rule.action}
        onCommit={(pattern, action) => {
          onEdit({
            pattern: rule.pattern === null && pattern === '*' ? null : pattern,
            action,
          });
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
        isBusy={isBusy}
      />
    );
  }

  return (
    <span className="relative inline-flex">
      {isMenuOpen && (
        <button
          className="fixed inset-0 z-10 cursor-default"
          onClick={onCloseMenu}
        />
      )}
      <span
        className={clsx(
          'inline-flex items-center gap-0.5 rounded-lg border py-0.5 pr-1 pl-0.5 font-mono text-[12.5px] leading-[1.3] transition-[filter,box-shadow,background] select-none hover:brightness-110',
          ACTION_CHIP_CLASSES[rule.action],
          isMenuOpen && 'ring-acc/20 shadow-lg ring-2',
        )}
      >
        <button
          type="button"
          onClick={onOpenMenu}
          disabled={isBusy}
          className={clsx(
            'inline-flex items-center gap-0.5 rounded-md py-0.5 pr-1 pl-1 transition-colors hover:bg-black/20 disabled:opacity-50 [&[aria-expanded=true]_.permission-chip-caret]:rotate-180 [&[aria-expanded=true]_.permission-chip-caret]:opacity-100',
            style.text,
          )}
          title={`${rule.action} options`}
          aria-label={`Open options for ${displayPattern}`}
          aria-expanded={isMenuOpen}
        >
          <ActionDot action={rule.action} glow />
          <ChevronDown className="permission-chip-caret h-[9px] w-[9px] opacity-60 transition-[transform,opacity]" />
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={isBusy}
          className="text-ink-1 cursor-text rounded-[5px] px-0.5 py-0 text-left whitespace-nowrap transition-colors hover:bg-white/5 disabled:opacity-50"
          title="Click to edit pattern"
        >
          {displayPattern}
        </button>
      </span>
      {isMenuOpen && (
        <RuleActionMenu
          rule={rule}
          onAction={(action) => onEdit({ pattern: rule.pattern, action })}
          onRemove={onRemove}
          onClose={onCloseMenu}
          isBusy={isBusy}
        />
      )}
    </span>
  );
}

function ToolGroupCard({
  group,
  shownRules,
  hiddenCount,
  adding,
  onAddStart,
  onAddCommit,
  onAddCancel,
  openMenuKey,
  setOpenMenuKey,
  onRemove,
  onEdit,
  isBusy,
}: {
  group: ToolGroup;
  shownRules: FlatRule[];
  hiddenCount: number;
  adding: boolean;
  onAddStart: () => void;
  onAddCommit: (pattern: string | null, action: PermissionAction) => void;
  onAddCancel: () => void;
  openMenuKey: string | null;
  setOpenMenuKey: (key: string | null) => void;
  onRemove: (rule: FlatRule) => void;
  onEdit: (
    rule: FlatRule,
    update: { pattern: string | null; action: PermissionAction },
  ) => void;
  isBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="px-1 py-3">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="hover:bg-glass-medium/20 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors"
      >
        {expanded ? (
          <ChevronDown className="text-ink-3 h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="text-ink-3 h-4 w-4 shrink-0" />
        )}
        <ToolIcon tool={group.tool} />
        <span className="text-ink-1 text-sm font-semibold">{group.label}</span>
        <span className="text-ink-4 text-xs">{group.description}</span>
        <DistributionBar rules={group.rules} />
        <span className="bg-glass-medium/45 text-ink-2 ml-auto rounded-full px-2 py-0.5 text-[11px] tabular-nums">
          {group.rules.length}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-wrap gap-x-2 gap-y-2 pt-3 pb-2 pl-10">
          {shownRules.map((rule) => {
            const menuKey = `${rule.tool}:${rule.pattern ?? '__all__'}`;
            return (
              <RuleChip
                key={menuKey}
                rule={rule}
                isMenuOpen={openMenuKey === menuKey}
                onOpenMenu={() => setOpenMenuKey(menuKey)}
                onCloseMenu={() => setOpenMenuKey(null)}
                onRemove={() => onRemove(rule)}
                onEdit={(update) => onEdit(rule, update)}
                isBusy={isBusy}
              />
            );
          })}
          {adding ? (
            <InlineRuleEditor
              tool={group.tool}
              onCommit={onAddCommit}
              onCancel={onAddCancel}
              isBusy={isBusy}
            />
          ) : (
            <button
              type="button"
              onClick={onAddStart}
              disabled={isBusy}
              className="border-glass-border/70 text-ink-3 hover:text-acc-ink hover:border-acc/60 hover:bg-acc/10 inline-flex items-center gap-1 rounded-lg border border-dashed py-0.5 pr-2 pl-1.5 font-mono text-[12.5px] leading-[1.3] font-medium transition-colors disabled:opacity-50"
            >
              <Plus className="h-3 w-3" />
              add
            </button>
          )}
          {hiddenCount > 0 && (
            <span className="text-ink-4 self-center text-[11px]">
              +{hiddenCount} hidden
            </span>
          )}
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
  title: _title,
  description: _description,
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
  const [addOpen, setAddOpen] = useState(false);
  const [addingTool, setAddingTool] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<PermissionAction | 'all'>(
    'all',
  );
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);

  const groups = useMemo(
    () => (permissions ? groupPermissions(permissions) : []),
    [permissions],
  );

  const totalRules = useMemo(
    () => groups.reduce((sum, g) => sum + g.rules.length, 0),
    [groups],
  );

  const actionCounts = useMemo(
    () =>
      groups
        .flatMap((group) => group.rules)
        .reduce<Record<PermissionAction, number>>(
          (acc, rule) => {
            acc[rule.action] += 1;
            return acc;
          },
          { allow: 0, ask: 0, deny: 0 },
        ),
    [groups],
  );

  const guidance = TOOL_GUIDANCE[tool];

  const commitAddRule = useCallback(
    async (params: {
      toolName: string;
      pattern: string | null;
      action: PermissionAction;
    }) => {
      setAddError(null);

      const trimmed = params.pattern?.trim() ?? '';
      if (
        params.toolName.toLowerCase() === 'bash' &&
        params.action === 'allow' &&
        (!trimmed || trimmed === '*' || trimmed === '**')
      ) {
        setAddError(
          'Bare "bash" without a specific command pattern is not allowed. Please provide a command pattern (e.g. "git status*").',
        );
        return;
      }

      try {
        await onAdd({
          toolName: params.toolName,
          input: buildInput(params.toolName, trimmed),
          action: params.action,
        });
        setPattern('');
        setAddError(null);
        setAddOpen(false);
        setAddingTool(null);
      } catch (err) {
        setAddError(err instanceof Error ? err.message : String(err));
      }
    },
    [onAdd],
  );

  const handleAdd = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      void commitAddRule({ toolName: tool, pattern, action });
    },
    [tool, pattern, action, commitAddRule],
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

  const visibleGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groups
      .map((group) => {
        const shownRules = group.rules.filter((rule) => {
          const patternText = rule.pattern ?? 'all operations';
          return (
            (actionFilter === 'all' || rule.action === actionFilter) &&
            (!query ||
              group.label.toLowerCase().includes(query) ||
              patternText.toLowerCase().includes(query))
          );
        });
        return {
          group,
          shownRules,
          hiddenCount: group.rules.length - shownRules.length,
        };
      })
      .filter(
        ({ shownRules }) =>
          shownRules.length > 0 || (!query && actionFilter === 'all'),
      );
  }, [groups, search, actionFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1" />
          {totalRules > 0 && (
            <div className="hidden items-center gap-3 sm:flex">
              {ACTION_OPTIONS.map((option) => (
                <span
                  key={option.value}
                  className="text-ink-3 inline-flex items-center gap-1.5 text-xs"
                >
                  <ActionDot action={option.value} />
                  <span className="text-ink-1 font-semibold tabular-nums">
                    {actionCounts[option.value]}
                  </span>
                  {option.label.toLowerCase()}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter rules... git, rm, *.env"
            icon={<Search />}
            size="sm"
            className="min-w-0 flex-1"
          />
          <div className="border-glass-border/60 bg-bg-1/60 inline-flex w-fit rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setActionFilter('all')}
              aria-pressed={actionFilter === 'all'}
              className={clsx(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                actionFilter === 'all'
                  ? 'bg-bg-3 text-ink-1 shadow-sm'
                  : 'text-ink-3 hover:text-ink-1',
              )}
            >
              All
            </button>
            {ACTION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setActionFilter(option.value)}
                aria-pressed={actionFilter === option.value}
                className={clsx(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                  actionFilter === option.value
                    ? clsx(
                        'bg-bg-3 shadow-sm',
                        getActionStyle(option.value).text,
                      )
                    : 'text-ink-3 hover:text-ink-1',
                )}
              >
                <ActionDot action={option.value} />
                {option.label}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Plus />}
            onClick={() => setAddOpen((open) => !open)}
            disabled={isBusy}
            className="w-fit whitespace-nowrap"
          >
            Add rule
          </Button>
        </div>

        {addOpen && (
          <form
            onSubmit={handleAdd}
            className="border-glass-border/60 bg-bg-1/50 mt-3 flex flex-col gap-2 rounded-xl border p-3 lg:flex-row lg:items-end"
          >
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
              <PatternMatchPreview tool={tool} pattern={pattern} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-ink-3 text-xs">Action</label>
              <ActionSegment value={action} onChange={setAction} />
            </div>
            <Button type="submit" disabled={isBusy} variant="primary" size="sm">
              Add
            </Button>
          </form>
        )}

        {guidance && addOpen && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-ink-4 text-xs">{guidance.hint}</span>
            {guidance.examples.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setPattern(ex)}
                className="bg-glass-medium/60 text-ink-1 hover:bg-bg-3 rounded px-1.5 py-0.5 font-mono text-[11px] transition-colors"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {addError && (
          <p className="text-status-fail mt-2 text-xs">{addError}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {isLoading && <p className="text-ink-3 px-2 text-sm">Loading...</p>}

        {!isLoading && groups.length === 0 && (
          <div className="border-glass-border/50 rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-ink-3 text-sm">{emptyTitle}</p>
            <p className="text-ink-4 mt-1 text-xs">{emptyDescription}</p>
          </div>
        )}

        {!isLoading && groups.length > 0 && visibleGroups.length === 0 && (
          <div className="border-glass-border/50 rounded-xl border border-dashed px-4 py-8 text-center">
            <p className="text-ink-3 text-sm">No rules match this filter.</p>
          </div>
        )}

        {!isLoading &&
          visibleGroups.map(({ group, shownRules, hiddenCount }) => (
            <ToolGroupCard
              key={group.tool}
              group={group}
              shownRules={shownRules}
              hiddenCount={hiddenCount}
              adding={addingTool === group.tool}
              onAddStart={() => {
                setAddingTool(group.tool);
                setOpenMenuKey(null);
              }}
              onAddCommit={(newPattern, newAction) => {
                void commitAddRule({
                  toolName: group.tool,
                  pattern: newPattern,
                  action: newAction,
                });
              }}
              onAddCancel={() => setAddingTool(null)}
              openMenuKey={openMenuKey}
              setOpenMenuKey={setOpenMenuKey}
              onRemove={handleRemove}
              onEdit={handleEdit}
              isBusy={isBusy}
            />
          ))}
      </div>
    </div>
  );
}
