import { X } from 'lucide-react';
import { useState, useEffect } from 'react';

// Tools that can be pre-configured for session-level allowance
const SESSION_ALLOWABLE_TOOLS = ['Edit', 'Write'] as const;

export function TaskSettingsPane({
  sessionAllowedTools,
  onAddTool,
  onRemoveTool,
  onClose,
}: {
  sessionAllowedTools: string[];
  onAddTool: (toolName: string) => void;
  onRemoveTool: (toolName: string) => void;
  onClose: () => void;
}) {
  const [localAllowed, setLocalAllowed] = useState<Set<string>>(new Set(sessionAllowedTools));

  // Sync local state when props change
  useEffect(() => {
    setLocalAllowed(new Set(sessionAllowedTools));
  }, [sessionAllowedTools]);

  const hasChanges = (() => {
    if (localAllowed.size !== sessionAllowedTools.length) return true;
    for (const tool of sessionAllowedTools) {
      if (!localAllowed.has(tool)) return true;
    }
    return false;
  })();

  const handleToggle = (tool: string) => {
    setLocalAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) {
        next.delete(tool);
      } else {
        next.add(tool);
      }
      return next;
    });
  };

  const handleSubmit = () => {
    // Find tools to add
    for (const tool of localAllowed) {
      if (!sessionAllowedTools.includes(tool)) {
        onAddTool(tool);
      }
    }
    // Find tools to remove
    for (const tool of sessionAllowedTools) {
      if (!localAllowed.has(tool)) {
        onRemoveTool(tool);
      }
    }
  };

  return (
    <div className="flex h-full w-80 flex-col border-l border-neutral-700 bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
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
          <div className="space-y-2">
            {SESSION_ALLOWABLE_TOOLS.map((tool) => (
              <label
                key={tool}
                className="flex cursor-pointer items-center gap-3 rounded-md bg-neutral-800 px-3 py-2.5 hover:bg-neutral-750"
              >
                <input
                  type="checkbox"
                  checked={localAllowed.has(tool)}
                  onChange={() => handleToggle(tool)}
                  className="h-4 w-4 cursor-pointer rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <span className="text-sm text-neutral-200">{tool}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-neutral-600">
            Checked tools will be automatically allowed without prompting.
          </p>
        </section>
      </div>

      {/* Footer with submit button */}
      {hasChanges && (
        <div className="border-t border-neutral-700 px-4 py-3">
          <button
            onClick={handleSubmit}
            className="w-full cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
}
