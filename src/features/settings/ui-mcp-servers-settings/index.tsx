// src/features/settings/ui-mcp-servers-settings/index.tsx
import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  useMcpTemplates,
  useDeleteMcpTemplate,
} from '@/hooks/use-mcp-templates';

import { McpTemplateForm } from './mcp-template-form';
import { McpTemplateList } from './mcp-template-list';

export function McpServersSettings() {
  const { data: templates, isLoading } = useMcpTemplates();
  const deleteTemplate = useDeleteMcpTemplate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const selectedTemplate = templates?.find((t) => t.id === selectedId);

  const handleCreate = () => {
    setSelectedId(null);
    setIsCreating(true);
  };

  const handleEdit = (id: string) => {
    setIsCreating(false);
    setSelectedId(id);
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate.mutateAsync(id);
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const handleClose = () => {
    setSelectedId(null);
    setIsCreating(false);
  };

  const handleSaved = () => {
    setSelectedId(null);
    setIsCreating(false);
  };

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  return (
    <div className="flex h-full gap-6">
      {/* Left: List */}
      <div className="w-80 flex-shrink-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200">
            MCP Servers
          </h2>
          <button
            onClick={handleCreate}
            className="flex cursor-pointer items-center gap-1 rounded-lg bg-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
        <p className="mb-4 text-sm text-neutral-500">
          Configure MCP servers to auto-install when creating worktrees.
        </p>
        <McpTemplateList
          templates={templates ?? []}
          selectedId={selectedId}
          onSelect={handleEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Right: Form pane */}
      {(isCreating || selectedTemplate) && (
        <div className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800/50 p-6">
          <McpTemplateForm
            template={selectedTemplate}
            onClose={handleClose}
            onSaved={handleSaved}
          />
        </div>
      )}
    </div>
  );
}
