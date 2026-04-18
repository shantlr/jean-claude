import { FolderOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { Textarea } from '@/common/ui/textarea';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import {
  useMcpPresets,
  useCreateMcpTemplate,
  useUpdateMcpTemplate,
} from '@/hooks/use-mcp-templates';
import { api } from '@/lib/api';
import type { McpServerTemplate, McpPreset } from '@shared/mcp-types';

// Variable descriptions for tooltips
const VARIABLE_DESCRIPTIONS: Record<string, string> = {
  projectPath:
    'The path to the current project or worktree. For worktree tasks, this is the worktree path.',
  projectName: 'The name of the project as configured in Jean-Claude.',
  branchName:
    'The current git branch name. Empty when not in a worktree context.',
  mainRepoPath:
    'The path to the main repository. Same as projectPath for non-worktree tasks.',
};

// Highlighted variable badge with tooltip
function VariableBadge({ name }: { name: string }) {
  const description = VARIABLE_DESCRIPTIONS[name];
  return (
    <span
      className="group bg-glass-medium text-acc-ink relative inline-block cursor-help rounded px-1.5 py-0.5 font-mono text-xs"
      title={description}
    >
      {`{${name}}`}
      {description && (
        <span className="bg-bg-0 text-ink-1 ring-glass-border pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 -translate-x-1/2 rounded-lg px-3 py-2 text-xs font-normal shadow-lg ring-1 group-hover:block">
          <span className="text-acc-ink mb-1 block font-medium">{`{${name}}`}</span>
          {description}
          <span className="border-t-bg-0 absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent" />
        </span>
      )}
    </span>
  );
}

// Available variables hint with highlighted badges
function AvailableVariablesHint() {
  const variables = [
    'projectPath',
    'projectName',
    'branchName',
    'mainRepoPath',
  ];
  return (
    <p className="text-ink-3 mt-1 flex flex-wrap items-center gap-1 text-xs">
      <span>Available variables:</span>
      {variables.map((v, i) => (
        <span key={v} className="inline-flex items-center">
          <VariableBadge name={v} />
          {i < variables.length - 1 && <span className="ml-1">,</span>}
        </span>
      ))}
    </p>
  );
}

// Extract user-defined variables from command template
function getUserDefinedVariables(commandTemplate: string): string[] {
  const autoProvided = [
    'projectPath',
    'projectName',
    'branchName',
    'mainRepoPath',
  ];
  const matches = commandTemplate.match(/\{([^}]+)\}/g) || [];
  return matches
    .map((m) => m.slice(1, -1))
    .filter((v) => !autoProvided.includes(v));
}

export function McpTemplateForm({
  template,
  onClose,
  onSaved,
}: {
  template?: McpServerTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data: presets } = useMcpPresets();
  const createTemplate = useCreateMcpTemplate();
  const updateTemplate = useUpdateMcpTemplate();

  const [name, setName] = useState('');
  const [commandTemplate, setCommandTemplate] = useState('');
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [installOnCreateWorktree, setInstallOnCreateWorktree] = useState(true);
  const [presetId, setPresetId] = useState<string | null>(null);

  // Initialize from template or reset
  useEffect(() => {
    if (template) {
      setName(template.name);
      setCommandTemplate(template.commandTemplate);
      setVariables(template.variables);
      setInstallOnCreateWorktree(template.installOnCreateWorktree);
      setPresetId(template.presetId);
    } else {
      setName('');
      setCommandTemplate('');
      setVariables({});
      setInstallOnCreateWorktree(true);
      setPresetId(null);
    }
  }, [template]);

  const userDefinedVars = getUserDefinedVariables(commandTemplate);
  const currentPreset = presets?.find((p) => p.id === presetId);

  const handleApplyPreset = (preset: McpPreset) => {
    setName(preset.name);
    setCommandTemplate(preset.commandTemplate);
    setInstallOnCreateWorktree(preset.installOnCreateWorktree);
    setPresetId(preset.id);
    // Initialize variables with empty values
    const newVars: Record<string, string> = {};
    for (const key of Object.keys(preset.variables)) {
      newVars[key] = variables[key] ?? '';
    }
    setVariables(newVars);
  };

  const handleBrowseFolder = async (varName: string) => {
    const path = await api.dialog.openDirectory();
    if (path) {
      setVariables((prev) => ({ ...prev, [varName]: path }));
    }
  };

  const handleSave = async () => {
    const data = {
      name,
      commandTemplate,
      variables,
      installOnCreateWorktree,
      presetId,
      updatedAt: new Date().toISOString(),
    };

    if (template) {
      await updateTemplate.mutateAsync({ id: template.id, data });
    } else {
      await createTemplate.mutateAsync(data);
    }
    onSaved();
  };

  const isValid = name.trim() && commandTemplate.trim();

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-ink-1 text-lg font-semibold">
          {template ? 'Edit MCP Server' : 'Add MCP Server'}
        </h3>
        <IconButton onClick={onClose} icon={<X />} tooltip="Close" size="sm" />
      </div>

      <div className="flex-1 space-y-4 overflow-auto">
        {/* Preset buttons */}
        {!template && presets && presets.length > 0 && (
          <div>
            <label className="text-ink-2 mb-2 block text-sm font-medium">
              Quick setup
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <Button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    presetId === preset.id
                      ? 'border-acc bg-acc/20 text-acc-ink'
                      : 'border-glass-border bg-bg-1 text-ink-1 hover:border-glass-border-strong'
                  }`}
                >
                  Use {preset.name} Preset
                </Button>
              ))}
            </div>
            {/* Preset description */}
            {currentPreset && currentPreset.description && (
              <div className="bg-bg-1/50 text-ink-1 mt-3 rounded-lg text-xs">
                <MarkdownContent content={currentPreset.description} />
              </div>
            )}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="text-ink-2 mb-1 block text-sm font-medium">
            Name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Serena"
          />
        </div>

        {/* Command Template */}
        <div>
          <label className="text-ink-2 mb-1 block text-sm font-medium">
            Command Template
          </label>
          <Textarea
            value={commandTemplate}
            onChange={(e) => setCommandTemplate(e.target.value)}
            placeholder="e.g., uv run --directory {serenaPath} serena start-mcp-server --project {projectPath}"
            rows={3}
            className="font-mono"
          />
          <AvailableVariablesHint />
        </div>

        {/* User-defined variables */}
        {userDefinedVars.length > 0 && (
          <div>
            <label className="text-ink-2 mb-2 block text-sm font-medium">
              Variables
            </label>
            <div className="space-y-2">
              {userDefinedVars.map((varName) => {
                const presetVar = currentPreset?.variables[varName];
                return (
                  <div key={varName}>
                    <label className="text-ink-3 mb-1 block text-xs">
                      {presetVar?.label ?? varName}
                      {presetVar?.description && (
                        <span className="text-ink-4 ml-1">
                          — {presetVar.description}
                        </span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={variables[varName] ?? ''}
                        onChange={(e) =>
                          setVariables((prev) => ({
                            ...prev,
                            [varName]: e.target.value,
                          }))
                        }
                        placeholder={presetVar?.placeholder}
                        className="flex-1"
                      />
                      {presetVar?.inputType === 'folder' && (
                        <IconButton
                          onClick={() => handleBrowseFolder(varName)}
                          icon={<FolderOpen />}
                          tooltip="Browse folder"
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Options */}
        <div className="space-y-3">
          <Checkbox
            checked={installOnCreateWorktree}
            onChange={setInstallOnCreateWorktree}
            label="Install on worktree creation"
            description="Automatically run `claude mcp add` when creating new worktrees"
          />
        </div>
      </div>

      {/* Save button */}
      <div className="border-glass-border mt-4 flex justify-end gap-2 border-t pt-4">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={
            !isValid || createTemplate.isPending || updateTemplate.isPending
          }
          loading={createTemplate.isPending || updateTemplate.isPending}
          variant="primary"
        >
          {createTemplate.isPending || updateTemplate.isPending
            ? 'Saving...'
            : 'Save'}
        </Button>
      </div>
    </div>
  );
}
