// src/features/settings/ui-mcp-servers-settings/mcp-template-list.tsx
import { Trash2, Server } from 'lucide-react';

import type { McpServerTemplate } from '../../../../shared/mcp-types';

export function McpTemplateList({
  templates,
  selectedId,
  onSelect,
  onDelete,
}: {
  templates: McpServerTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (templates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-500">
        No MCP servers configured yet.
        <br />
        Click "Add" to create one.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {templates.map((template) => (
        <div
          key={template.id}
          onClick={() => onSelect(template.id)}
          className={`group flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
            selectedId === template.id
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-neutral-700 bg-neutral-800 hover:border-neutral-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5 text-neutral-400" />
            <div>
              <div className="font-medium text-neutral-200">
                {template.name}
              </div>
              {template.installOnCreateWorktree && (
                <div className="flex gap-2 text-xs">
                  <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-blue-400">
                    Install per worktree
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(template.id);
            }}
            className="cursor-pointer rounded p-1 text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-700 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
