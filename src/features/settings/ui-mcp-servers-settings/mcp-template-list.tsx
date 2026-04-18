import { Trash2, Server } from 'lucide-react';

import { IconButton } from '@/common/ui/icon-button';
import type { McpServerTemplate } from '@shared/mcp-types';

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
      <div className="border-glass-border text-ink-3 rounded-lg border border-dashed p-4 text-center text-sm">
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
              ? 'border-acc bg-acc/10'
              : 'border-glass-border bg-bg-1 hover:border-glass-border-strong'
          }`}
        >
          <div className="flex items-center gap-3">
            <Server className="text-ink-2 h-5 w-5" />
            <div>
              <div className="text-ink-1 font-medium">{template.name}</div>
              {template.installOnCreateWorktree && (
                <div className="flex gap-2 text-xs">
                  <span className="text-acc-ink bg-acc/50 rounded px-1.5 py-0.5">
                    Install per worktree
                  </span>
                </div>
              )}
            </div>
          </div>
          <IconButton
            onClick={(e) => {
              e.stopPropagation();
              onDelete(template.id);
            }}
            icon={<Trash2 />}
            tooltip="Delete"
            size="sm"
            className="opacity-0 transition-opacity group-hover:opacity-100"
          />
        </div>
      ))}
    </div>
  );
}
