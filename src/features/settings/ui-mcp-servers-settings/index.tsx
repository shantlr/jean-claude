import { Plus } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
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
    return <p className="text-ink-3">Loading...</p>;
  }

  return (
    <div className="flex h-full gap-6">
      {/* Left: List */}
      <div className="w-80 flex-shrink-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-ink-1 text-lg font-semibold">MCP Servers</h2>
          <Button onClick={handleCreate} size="sm" icon={<Plus />}>
            Add
          </Button>
        </div>
        <p className="text-ink-3 mb-4 text-sm">
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
        <div className="border-glass-border bg-bg-1/50 flex-1 rounded-lg border p-6">
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
