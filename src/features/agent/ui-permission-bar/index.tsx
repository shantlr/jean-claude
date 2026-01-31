import { Shield, X, Check, ChevronDown, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import type {
  AgentPermissionEvent,
  PermissionResponse,
} from '../../../../shared/agent-types';
import type { InteractionMode } from '../../../../shared/types';
import { MarkdownContent } from '../ui-markdown-content';

/**
 * Format a file path relative to the worktree if it's a subpath.
 * Returns { displayPath, isExternal } where isExternal is true if the path is outside the worktree.
 */
function formatPathRelativeToWorktree(
  filePath: string,
  worktreePath?: string | null,
): { displayPath: string; isExternal: boolean } {
  if (!worktreePath) {
    return { displayPath: filePath, isExternal: false };
  }

  // Normalize paths (ensure no trailing slash for comparison)
  const normalizedWorktree = worktreePath.replace(/\/$/, '');
  const normalizedFile = filePath.replace(/\/$/, '');

  if (normalizedFile.startsWith(normalizedWorktree + '/')) {
    const relativePath = normalizedFile.slice(normalizedWorktree.length + 1);
    return { displayPath: `<worktree>/${relativePath}`, isExternal: false };
  }

  if (normalizedFile === normalizedWorktree) {
    return { displayPath: '<worktree>', isExternal: false };
  }

  // Path is external to the worktree
  return { displayPath: filePath, isExternal: true };
}

function ToolInputDisplay({
  toolName,
  input,
  worktreePath,
}: {
  toolName: string;
  input: Record<string, unknown>;
  worktreePath?: string | null;
}) {
  switch (toolName) {
    case 'Bash':
      return (
        <code className="block truncate rounded bg-neutral-800 px-2 py-1 text-sm text-neutral-200">
          {String(input.command || '')}
        </code>
      );

    case 'Write':
    case 'Read':
    case 'Edit': {
      const filePath = String(input.file_path || '');
      const { displayPath, isExternal } = formatPathRelativeToWorktree(
        filePath,
        worktreePath,
      );
      return (
        <code
          className={`block truncate text-sm ${
            isExternal ? 'text-orange-400' : 'text-neutral-300'
          }`}
          title={isExternal ? `External path: ${filePath}` : filePath}
        >
          {displayPath}
        </code>
      );
    }

    case 'Glob':
    case 'Grep':
      return (
        <code className="block truncate text-sm text-neutral-300">
          {String(input.pattern || '')}
        </code>
      );

    case 'WebSearch':
      return (
        <span className="text-sm text-neutral-300">
          {String(input.query || '')}
        </span>
      );

    case 'WebFetch':
      return (
        <code className="block truncate text-sm text-neutral-300">
          {String(input.url || '')}
        </code>
      );

    // ExitPlanMode is handled specially in PermissionBar component
    case 'ExitPlanMode':
      return null;

    case 'Task':
      return (
        <div className="text-sm text-neutral-300">
          Launch{' '}
          <span className="font-medium text-yellow-400">
            {String(input.subagent_type)}
          </span>{' '}
          agent: {String(input.description || '')}
        </div>
      );

    default:
      return (
        <pre className="max-h-32 overflow-auto rounded bg-neutral-800 p-2 text-xs text-neutral-400">
          {JSON.stringify(input, null, 2)}
        </pre>
      );
  }
}

function ExitPlanModeDisplay({ input }: { input: Record<string, unknown> }) {
  const [isPlanCollapsed, setIsPlanCollapsed] = useState(false);

  const plan = input.plan as string | undefined;
  const allowedPrompts = input.allowedPrompts as
    | Array<{ tool: string; prompt: string }>
    | undefined;

  return (
    <div className="space-y-3">
      {plan && (
        <div>
          <button
            onClick={() => setIsPlanCollapsed(!isPlanCollapsed)}
            className="mb-2 flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-300"
            aria-expanded={!isPlanCollapsed}
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isPlanCollapsed ? '-rotate-90' : ''}`}
              aria-hidden
            />
            {isPlanCollapsed ? 'Show plan' : 'Hide plan'}
          </button>
          {!isPlanCollapsed && (
            <div className="max-h-[80vh] overflow-y-auto rounded border border-neutral-700 bg-neutral-800/50 p-3 text-xs">
              <MarkdownContent content={plan} />
            </div>
          )}
        </div>
      )}
      {allowedPrompts?.length ? (
        <div>
          <div className="mb-1 text-xs text-neutral-400">
            Requested permissions:
          </div>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-neutral-300">
            {allowedPrompts.map((p, i) => (
              <li key={i}>
                <span className="text-yellow-400">{p.tool}</span>: {p.prompt}
              </li>
            ))}
          </ul>
        </div>
      ) : !plan ? (
        <span className="text-sm text-neutral-400">
          Submit plan for approval
        </span>
      ) : null}
    </div>
  );
}

export function PermissionBar({
  request,
  onRespond,
  onAllowForSession,
  onAllowForProject,
  onAllowForProjectWorktrees,
  onSetMode,
  worktreePath,
}: {
  request: AgentPermissionEvent;
  onRespond: (requestId: string, response: PermissionResponse) => void;
  onAllowForSession?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onAllowForProject?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onAllowForProjectWorktrees?: (
    toolName: string,
    input: Record<string, unknown>,
  ) => void;
  onSetMode?: (mode: InteractionMode) => void;
  worktreePath?: string | null;
}) {
  const [instruction, setInstruction] = useState('');

  const isExitPlanMode = request.toolName === 'ExitPlanMode';
  const sessionAllowButton = request.sessionAllowButton;

  const handleAllow = () => {
    if (sessionAllowButton?.setModeOnAllow) {
      onSetMode?.(sessionAllowButton.setModeOnAllow);
    }
    onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: request.input,
    });
  };

  // For ExitPlanMode, the session allow is about Edit+Write, not ExitPlanMode itself.
  // For all other tools, we pass the raw toolName+input to the backend.
  const allowForSession = () => {
    if (isExitPlanMode) {
      // ExitPlanMode special case: allow Edit and Write tools
      onAllowForSession?.('Edit', {});
      onAllowForSession?.('Write', {});
    } else {
      onAllowForSession?.(request.toolName, request.input);
    }
  };

  const handleAllowForSession = () => {
    if (sessionAllowButton?.setModeOnAllow) {
      onSetMode?.(sessionAllowButton.setModeOnAllow);
    }
    allowForSession();
    onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: request.input,
    });
  };

  const handleAllowForProject = () => {
    if (sessionAllowButton?.setModeOnAllow) {
      onSetMode?.(sessionAllowButton.setModeOnAllow);
    }
    allowForSession();
    if (isExitPlanMode) {
      onAllowForProject?.('Edit', {});
      onAllowForProject?.('Write', {});
    } else {
      onAllowForProject?.(request.toolName, request.input);
    }
    onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: request.input,
    });
  };

  const handleAllowForProjectWorktrees = () => {
    if (sessionAllowButton?.setModeOnAllow) {
      onSetMode?.(sessionAllowButton.setModeOnAllow);
    }
    allowForSession();
    if (isExitPlanMode) {
      onAllowForProjectWorktrees?.('Edit', {});
      onAllowForProjectWorktrees?.('Write', {});
    } else {
      onAllowForProjectWorktrees?.(request.toolName, request.input);
    }
    onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: request.input,
    });
  };

  const handleDeny = () => {
    onRespond(request.requestId, {
      behavior: 'deny',
      message: instruction.trim() || 'User denied this action',
    });
  };

  console.log('ASKED PERMISSION', request);

  return (
    <div className="border-t border-yellow-700/50 bg-yellow-900/20 px-4 py-3">
      <div className="mb-3 flex items-start gap-3">
        <Shield
          className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-xs font-medium text-yellow-400">
            Permission Required: {request.toolName}
          </div>
          {isExitPlanMode ? (
            <ExitPlanModeDisplay input={request.input} />
          ) : (
            <ToolInputDisplay
              toolName={request.toolName}
              input={request.input}
              worktreePath={worktreePath}
            />
          )}
        </div>
      </div>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Optional: Tell Claude what to do instead..."
        className="mb-3 w-full resize-none rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/50 focus:outline-none"
        rows={2}
        autoComplete="off"
        aria-label="Instructions for Claude"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          onClick={handleDeny}
          className="flex items-center gap-1.5 rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
        >
          <X className="h-4 w-4" aria-hidden />
          Deny
        </button>
        <button
          onClick={handleAllow}
          className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
        >
          <Check className="h-4 w-4" aria-hidden />
          Allow
        </button>
        {sessionAllowButton && (
          <button
            onClick={handleAllowForSession}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {sessionAllowButton.label}
          </button>
        )}
        {sessionAllowButton && (
          <button
            onClick={handleAllowForProject}
            className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Allow for Project
          </button>
        )}
        {sessionAllowButton && worktreePath && (
          <button
            onClick={handleAllowForProjectWorktrees}
            className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Allow for Project Worktrees
          </button>
        )}
      </div>
    </div>
  );
}
