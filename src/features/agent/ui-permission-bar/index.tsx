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
import { Textarea } from '@/common/ui/textarea';
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
          className="bg-bg-1 text-ink-1 rounded px-2 py-1 text-sm break-all whitespace-pre-wrap"
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
            isExternal ? 'text-orange-400' : 'text-ink-1'
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
        <code className="text-ink-1 block truncate text-sm">
          {String(input.pattern || '')}
        </code>
      );

    case 'WebSearch':
      return (
        <span className="text-ink-1 text-sm">{String(input.query || '')}</span>
      );

    case 'WebFetch':
      return (
        <code className="text-ink-1 block truncate text-sm">
          {String(input.url || '')}
        </code>
      );

    // ExitPlanMode is handled specially in PermissionBar component
    case 'ExitPlanMode':
      return null;

    case 'Task':
      return (
        <div className="text-ink-1 text-sm">
          Launch{' '}
          <span className="font-medium text-yellow-400">
            {String(input.subagent_type)}
          </span>{' '}
          agent: {String(input.description || '')}
        </div>
      );

    default:
      return (
        <pre className="bg-bg-1 text-ink-2 rounded p-2 text-xs break-all whitespace-pre-wrap">
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
        <div className="border-glass-border bg-bg-1/50 rounded border p-3 text-xs">
          <MarkdownContent content={plan} />
        </div>
      )}
      {allowedPrompts?.length ? (
        <div>
          <div className="text-ink-2 mb-1 text-xs">Requested permissions:</div>
          <ul className="text-ink-1 list-inside list-disc space-y-0.5 text-sm">
            {allowedPrompts.map((p, i) => (
              <li key={i}>
                <span className="text-yellow-400">{p.tool}</span>: {p.prompt}
              </li>
            ))}
          </ul>
        </div>
      ) : !plan ? (
        <span className="text-ink-2 text-sm">Submit plan for approval</span>
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
  onAllowGlobally,
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
  onAllowGlobally?: (toolName: string, input: Record<string, unknown>) => void;
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

  const handleAllowGlobally = () => {
    if (sessionAllowButton?.setModeOnAllow) {
      onSetMode?.(sessionAllowButton.setModeOnAllow);
    }
    allowForSession();
    if (isExitPlanMode) {
      onAllowGlobally?.('Edit', {});
      onAllowGlobally?.('Write', {});
    } else {
      onAllowGlobally?.(request.toolName, input);
    }
    // Use 'session' allowMode: global persistence is handled separately via
    // the onAllowGlobally IPC call. Sending 'session' avoids the agent backend
    // also writing the rule to a project-scoped file.
    return onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: input,
      allowMode: 'session',
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
            <Textarea
              value={otherMessage}
              onChange={(e) => setOtherMessage(e.target.value)}
              placeholder="Tell Claude what to do instead..."
              size="sm"
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
              <Button onClick={handleOtherCancel} variant="ghost" size="sm">
                Cancel
              </Button>
              <Button
                onClick={handleOtherSubmit}
                disabled={!otherMessage.trim()}
                variant="secondary"
                size="sm"
                icon={<Send />}
              >
                Deny with message
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              onClick={() => setIsOtherOpen(true)}
              variant="ghost"
              size="sm"
              icon={<MessageSquare />}
            >
              Other
            </Button>
            <Button
              onClick={handleDeny}
              variant="secondary"
              size="sm"
              icon={<X />}
            >
              Deny
            </Button>
            <div className="flex-1" />
            <Button
              onClick={handleAllow}
              variant="primary"
              size="sm"
              icon={<Check />}
              className="bg-green-600 hover:bg-green-500"
            >
              Allow
            </Button>
            {sessionAllowButton && (
              <Button
                onClick={handleAllowForSession}
                variant="primary"
                size="sm"
                icon={<ShieldCheck />}
              >
                {sessionAllowButton.label}
              </Button>
            )}
            {sessionAllowButton && (
              <Button
                onClick={handleAllowForProject}
                variant="primary"
                size="sm"
                icon={<ShieldCheck />}
                className="bg-purple-600 hover:bg-purple-500"
              >
                Allow for Project
              </Button>
            )}
            {sessionAllowButton && worktreePath && (
              <Button
                onClick={handleAllowForProjectWorktrees}
                variant="primary"
                size="sm"
                icon={<ShieldCheck />}
                className="bg-amber-600 hover:bg-amber-500"
              >
                Allow for Project Worktrees
              </Button>
            )}
            {sessionAllowButton && onAllowGlobally && (
              <Button
                onClick={handleAllowGlobally}
                variant="primary"
                size="sm"
                icon={<ShieldCheck />}
                className="bg-teal-600 hover:bg-teal-500"
              >
                Allow Globally
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
