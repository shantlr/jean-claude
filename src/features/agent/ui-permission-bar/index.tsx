import { Shield, X, Check } from 'lucide-react';

import type { AgentPermissionEvent, PermissionResponse } from '../../../../shared/agent-types';

interface PermissionBarProps {
  request: AgentPermissionEvent;
  onRespond: (requestId: string, response: PermissionResponse) => void;
}

function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Bash':
      return String(input.command || '');
    case 'Write':
    case 'Read':
    case 'Edit':
      return String(input.file_path || '');
    case 'Glob':
    case 'Grep':
      return String(input.pattern || '');
    case 'WebSearch':
      return String(input.query || '');
    case 'WebFetch':
      return String(input.url || '');
    default:
      return JSON.stringify(input).slice(0, 100);
  }
}

export function PermissionBar({ request, onRespond }: PermissionBarProps) {
  const handleAllow = () => {
    onRespond(request.requestId, {
      behavior: 'allow',
      updatedInput: request.input,
    });
  };

  const handleDeny = () => {
    onRespond(request.requestId, {
      behavior: 'deny',
      message: 'User denied this action',
    });
  };

  const displayText = formatToolInput(request.toolName, request.input);

  return (
    <div className="flex items-center gap-3 border-t border-yellow-700/50 bg-yellow-900/20 px-4 py-3">
      <Shield className="h-5 w-5 flex-shrink-0 text-yellow-500" />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-xs font-medium text-yellow-400">
          Permission Required: {request.toolName}
        </div>
        <div className="truncate text-sm text-neutral-300">{displayText}</div>
      </div>
      <div className="flex flex-shrink-0 gap-2">
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
