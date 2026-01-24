import { Shield, X, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type {
  AgentPermissionEvent,
  PermissionResponse,
} from '../../../../shared/agent-types';
import { MarkdownContent } from '../ui-markdown-content';

interface PermissionBarProps {
  request: AgentPermissionEvent;
  onRespond: (requestId: string, response: PermissionResponse) => void;
}

function ToolInputDisplay({
  toolName,
  input,
}: {
  toolName: string;
  input: Record<string, unknown>;
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
    case 'Edit':
      return (
        <code className="block truncate text-sm text-neutral-300">
          {String(input.file_path || '')}
        </code>
      );

    case 'Glob':
    case 'Grep':
      return (
        <code className="block truncate text-sm text-neutral-300">
          {String(input.pattern || '')}
        </code>
      );

    case 'WebSearch':
      return <span className="text-sm text-neutral-300">{String(input.query || '')}</span>;

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
          Launch <span className="font-medium text-yellow-400">{String(input.subagent_type)}</span>{' '}
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
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${isPlanCollapsed ? '-rotate-90' : ''}`}
            />
            {isPlanCollapsed ? 'Show plan' : 'Hide plan'}
          </button>
          {!isPlanCollapsed && (
            <div className="max-h-64 overflow-y-auto rounded border border-neutral-700 bg-neutral-800/50 p-3 text-sm">
              <MarkdownContent content={plan} />
            </div>
          )}
        </div>
      )}
      {allowedPrompts?.length ? (
        <div>
          <div className="mb-1 text-xs text-neutral-400">Requested permissions:</div>
          <ul className="list-inside list-disc space-y-0.5 text-sm text-neutral-300">
            {allowedPrompts.map((p, i) => (
              <li key={i}>
                <span className="text-yellow-400">{p.tool}</span>: {p.prompt}
              </li>
            ))}
          </ul>
        </div>
      ) : !plan ? (
        <span className="text-sm text-neutral-400">Submit plan for approval</span>
      ) : null}
    </div>
  );
}

export function PermissionBar({ request, onRespond }: PermissionBarProps) {
  const [instruction, setInstruction] = useState('');

  const handleAllow = () => {
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

  const isExitPlanMode = request.toolName === 'ExitPlanMode';

  return (
    <div className="border-t border-yellow-700/50 bg-yellow-900/20 px-4 py-3">
      <div className="mb-3 flex items-start gap-3">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
        <div className="min-w-0 flex-1">
          <div className="mb-1 text-xs font-medium text-yellow-400">
            Permission Required: {request.toolName}
          </div>
          {isExitPlanMode ? (
            <ExitPlanModeDisplay input={request.input} />
          ) : (
            <ToolInputDisplay toolName={request.toolName} input={request.input} />
          )}
        </div>
      </div>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Optional: Tell Claude what to do instead..."
        className="mb-3 w-full resize-none rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-yellow-500 focus:outline-none"
        rows={2}
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={handleDeny}
          className="flex items-center gap-1.5 rounded-md bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
        >
          <X className="h-4 w-4" />
          Deny
        </button>
        <button
          onClick={handleAllow}
          className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
        >
          <Check className="h-4 w-4" />
          Allow
        </button>
      </div>
    </div>
  );
}
