import {
  Shield,
  X,
  Check,
  ShieldCheck,
  MessageSquare,
  Send,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import type { PermissionResponse } from '@shared/agent-types';
import type { NormalizedPermissionRequest } from '@shared/normalized-message-v2';
import type { InteractionMode } from '@shared/types';

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
        <pre
          className="rounded bg-neutral-800 px-2 py-1 text-sm break-all whitespace-pre-wrap text-neutral-200"
          title={String(input.command || '')}
        >
          {String(input.command || '')}
        </pre>
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
        <pre className="rounded bg-neutral-800 p-2 text-xs break-all whitespace-pre-wrap text-neutral-400">
          {JSON.stringify(input, null, 2)}
        </pre>
      );
  }
}

function ExitPlanModeDisplay({
  input,
}: {
  input: {
    plan?: string;
    allowedPrompts?: Array<{ tool: string; prompt: string }>;
  };
}) {
  const { plan, allowedPrompts } = input;

  return (
    <div className="space-y-3">
      {plan && (
        <div className="rounded border border-neutral-700 bg-neutral-800/50 p-3 text-xs">
          <MarkdownContent content={plan} />
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
  request: NormalizedPermissionRequest & { taskId: string };
  onRespond: (
    requestId: string,
    response: PermissionResponse,
  ) => void | Promise<void>;
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
  const [isOtherOpen, setIsOtherOpen] = useState(false);
  const [otherMessage, setOtherMessage] = useState('');

  const input = request.input;
  const isExitPlanMode = request.toolName === 'ExitPlanMode';
  const sessionAllowButton = request.sessionAllowButton;

  const handleAllow = () => {
    if (sessionAllowButton?.setModeOnAllow) {
      onSetMode?.(sessionAllowButton.setModeOnAllow);
    }
    return onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: input,
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
      onAllowForSession?.(request.toolName, input);
    }
  };

  const handleAllowForSession = () => {
    if (sessionAllowButton?.setModeOnAllow) {
      onSetMode?.(sessionAllowButton.setModeOnAllow);
    }
    allowForSession();
    return onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: input,
      allowMode: 'session',
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
      onAllowForProject?.(request.toolName, input);
    }
    return onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: input,
      allowMode: 'project',
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
      onAllowForProjectWorktrees?.(request.toolName, input);
    }
    return onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: input,
      allowMode: 'worktree',
    });
  };

  const handleDeny = () => {
    return onRespond(request.requestId, {
      behavior: 'deny',
      message: 'User denied this action',
    });
  };

  const handleOtherSubmit = () => {
    if (!otherMessage.trim()) return;
    const response = onRespond(request.requestId, {
      behavior: 'deny',
      message: otherMessage.trim(),
    });
    setIsOtherOpen(false);
    setOtherMessage('');
    return response;
  };

  const handleOtherCancel = () => {
    setIsOtherOpen(false);
    setOtherMessage('');
  };

  return (
    <div className="border border-yellow-700/50 bg-yellow-900/20 px-4 py-3">
      <div className="flex flex-col gap-3">
        {/* Header + Content */}
        <div className="flex items-start gap-3">
          <Shield
            className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="mb-1 text-xs font-medium text-yellow-400">
              Permission Required: {request.toolName}
            </div>
            {isExitPlanMode ? (
              <ExitPlanModeDisplay input={input} />
            ) : (
              <ToolInputDisplay
                toolName={request.toolName}
                input={input}
                worktreePath={worktreePath}
              />
            )}
          </div>
        </div>

        {/* Footer actions */}
        {isOtherOpen ? (
          <div className="space-y-2">
            <textarea
              value={otherMessage}
              onChange={(e) => setOtherMessage(e.target.value)}
              placeholder="Tell Claude what to do instead..."
              className="w-full resize-none rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-yellow-500 focus:ring-2 focus:ring-yellow-500/50 focus:outline-none"
              rows={3}
              autoFocus
              autoComplete="off"
              aria-label="Instructions for Claude"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  handleOtherCancel();
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleOtherSubmit();
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                onClick={handleOtherCancel}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-400 hover:text-neutral-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleOtherSubmit}
                disabled={!otherMessage.trim()}
                className="flex items-center gap-1.5 rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                Deny with message
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              onClick={() => setIsOtherOpen(true)}
              className="flex items-center gap-1.5 rounded-md bg-neutral-700/60 px-3 py-1.5 text-sm font-medium text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              Other
            </Button>
            <Button
              onClick={handleDeny}
              className="flex items-center gap-1.5 rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
            >
              <X className="h-4 w-4" aria-hidden />
              Deny
            </Button>
            <div className="flex-1" />
            <Button
              onClick={handleAllow}
              className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
            >
              <Check className="h-4 w-4" aria-hidden />
              Allow
            </Button>
            {sessionAllowButton && (
              <Button
                onClick={handleAllowForSession}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                {sessionAllowButton.label}
              </Button>
            )}
            {sessionAllowButton && (
              <Button
                onClick={handleAllowForProject}
                className="flex items-center gap-1.5 rounded-md bg-purple-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-purple-500"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Allow for Project
              </Button>
            )}
            {sessionAllowButton && worktreePath && (
              <Button
                onClick={handleAllowForProjectWorktrees}
                className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Allow for Project Worktrees
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
