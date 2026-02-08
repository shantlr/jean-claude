import { FolderOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';

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
      className="group relative inline-block cursor-help rounded bg-neutral-700 px-1.5 py-0.5 font-mono text-xs text-blue-400"
      title={description}
    >
      {`{${name}}`}
      {description && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-56 -translate-x-1/2 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-normal text-neutral-300 shadow-lg ring-1 ring-neutral-700 group-hover:block">
          <span className="mb-1 block font-medium text-blue-400">{`{${name}}`}</span>
          {description}
          <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
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
    <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-neutral-500">
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
        <h3 className="text-lg font-semibold text-neutral-200">
          {template ? 'Edit MCP Server' : 'Add MCP Server'}
        </h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-auto">
        {/* Preset buttons */}
        {!template && presets && presets.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              Quick setup
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                    presetId === preset.id
                      ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                      : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600'
                  }`}
                >
                  Use {preset.name} Preset
                </button>
              ))}
            </div>
            {/* Preset description */}
            {currentPreset && currentPreset.description && (
              <div className="mt-3 rounded-lg bg-neutral-800/50 text-xs text-neutral-300">
                <MarkdownContent content={currentPreset.description} />
              </div>
            )}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Serena"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Command Template */}
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-400">
            Command Template
          </label>
          <textarea
            value={commandTemplate}
            onChange={(e) => setCommandTemplate(e.target.value)}
            placeholder="e.g., uv run --directory {serenaPath} serena start-mcp-server --project {projectPath}"
            rows={3}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 font-mono text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <AvailableVariablesHint />
        </div>

        {/* User-defined variables */}
        {userDefinedVars.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-400">
              Variables
            </label>
            <div className="space-y-2">
              {userDefinedVars.map((varName) => {
                const presetVar = currentPreset?.variables[varName];
                return (
                  <div key={varName}>
                    <label className="mb-1 block text-xs text-neutral-500">
                      {presetVar?.label ?? varName}
                      {presetVar?.description && (
                        <span className="ml-1 text-neutral-600">
                          — {presetVar.description}
                        </span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={variables[varName] ?? ''}
                        onChange={(e) =>
                          setVariables((prev) => ({
                            ...prev,
                            [varName]: e.target.value,
                          }))
                        }
                        placeholder={presetVar?.placeholder}
                        className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
                      />
                      {presetVar?.inputType === 'folder' && (
                        <button
                          onClick={() => handleBrowseFolder(varName)}
                          className="cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                        >
                          <FolderOpen className="h-4 w-4" />
                        </button>
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
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={installOnCreateWorktree}
              onChange={(e) => setInstallOnCreateWorktree(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-neutral-300">
                Install on worktree creation
              </div>
              <div className="text-xs text-neutral-500">
                Automatically run `claude mcp add` when creating new worktrees
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-4 flex justify-end gap-2 border-t border-neutral-700 pt-4">
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={
            !isValid || createTemplate.isPending || updateTemplate.isPending
          }
          className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createTemplate.isPending || updateTemplate.isPending
            ? 'Saving...'
            : 'Save'}
        </button>
      </div>
    </div>
  );
}
