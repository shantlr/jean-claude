import clsx from 'clsx';
import { X, Shield } from 'lucide-react';

import { PROJECT_HEADER_HEIGHT } from '@/layout/ui-project-sidebar';

export function TaskSettingsPane({
  sessionAllowedTools,
  onRemoveTool,
  onClose,
}: {
  sessionAllowedTools: string[];
  onRemoveTool: (toolName: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full w-80 flex-col border-l border-neutral-700 bg-neutral-900">
      {/* Header */}
      <div
        className={clsx(
          'flex items-center shrink-0 justify-between border-b border-neutral-700 px-4 py-3',
        )}
        style={{
          height: PROJECT_HEADER_HEIGHT,
        }}
      >
        <h3 className="text-sm font-medium text-neutral-200">Task Settings</h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1.5 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        <section>
          <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-500">
            Session Allowed Tools
          </h4>
          {sessionAllowedTools.length === 0 ? (
            <p className="text-xs text-neutral-600">
              No tools are currently allowed for this session. Tools will appear
              here when you use &quot;Allow for Session&quot; on a permission
              request.
            </p>
          ) : (
            <div className="space-y-1">
              {sessionAllowedTools.map((tool) => (
                <div
                  key={tool}
                  className="flex items-center justify-between rounded-md bg-neutral-800 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Shield className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                    <span className="truncate text-sm text-neutral-200">
                      {tool}
                    </span>
                  </div>
                  <button
                    onClick={() => onRemoveTool(tool)}
                    className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
                    title={`Remove ${tool}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
