import { Check, FolderOpen, Search, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import {
  AVAILABLE_BACKENDS,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import {
  useScanNonExistentProjects,
  useCleanupClaudeProjects,
} from '@/hooks/use-claude-projects-cleanup';
import {
  getEditorLabel,
  useBackendsSetting,
  useEditorSetting,
  useSummaryModelsSetting,
  useUpdateBackendsSetting,
  useUpdateEditorSetting,
  useUpdateSummaryModelsSetting,
  useAvailableEditors,
  useUsageDisplaySetting,
  useUpdateUsageDisplaySetting,
} from '@/hooks/use-settings';
import { api, type NonExistentClaudeProject } from '@/lib/api';
import { useUISetting, useUIStore } from '@/stores/ui';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { PRESET_EDITORS } from '@shared/types';
import { USAGE_PROVIDERS, type UsageProviderType } from '@shared/usage-types';

export function GeneralSettings() {
  const { data: editorSetting, isLoading } = useEditorSetting();
  const { data: availableEditors } = useAvailableEditors();
  const updateEditor = useUpdateEditorSetting();
  const [customCommand, setCustomCommand] = useState('');

  const handleSelectPreset = (id: string) => {
    updateEditor.mutate({ type: 'preset', id });
    setCustomCommand('');
  };

  const handleSetCustomCommand = () => {
    if (customCommand.trim()) {
      updateEditor.mutate({ type: 'command', command: customCommand.trim() });
    }
  };

  const handleBrowseApp = async () => {
    const result = await api.dialog.openApplication();
    if (result) {
      updateEditor.mutate({
        type: 'app',
        path: result.path,
        name: result.name,
      });
      setCustomCommand('');
    }
  };

  const isPresetSelected = (id: string): boolean => {
    return editorSetting?.type === 'preset' && editorSetting.id === id;
  };

  const isEditorAvailable = (id: string): boolean => {
    return availableEditors?.find((e) => e.id === id)?.available ?? false;
  };

  if (isLoading) {
    return <p className="text-ink-3">Loading...</p>;
  }

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Editor</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Choose which editor to open projects in
      </p>

      {/* Preset editors */}
      <div className="mt-4 flex flex-wrap gap-2">
        {PRESET_EDITORS.map((editor) => {
          const available = isEditorAvailable(editor.id);
          const selected = isPresetSelected(editor.id);

          return (
            <Button
              key={editor.id}
              onClick={() => handleSelectPreset(editor.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'border-acc bg-acc/20 text-acc-ink'
                  : available
                    ? 'border-glass-border bg-bg-1 text-ink-1 hover:border-glass-border-strong hover:bg-glass-medium'
                    : 'border-line-soft bg-bg-0 text-ink-4'
              }`}
            >
              {editor.label}
              {available && <Check className="text-status-done h-3 w-3" />}
            </Button>
          );
        })}
      </div>

      {/* Custom command */}
      <div className="mt-6">
        <label className="text-ink-2 block text-sm font-medium">
          Custom command
        </label>
        <div className="mt-2 flex gap-2">
          <Input
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetCustomCommand()}
            placeholder="e.g., vim, emacs, nano"
            className="flex-1"
          />
          <Button
            onClick={handleSetCustomCommand}
            disabled={!customCommand.trim()}
          >
            Set
          </Button>
        </div>
      </div>

      {/* Browse for app */}
      <div className="mt-4">
        <Button onClick={handleBrowseApp} icon={<FolderOpen />}>
          Browse for application...
        </Button>
      </div>

      {/* Current selection */}
      {editorSetting && (
        <div className="border-glass-border bg-bg-1/50 mt-6 rounded-lg border px-4 py-3">
          <span className="text-ink-3 text-sm">Current editor: </span>
          <span className="text-ink-1 text-sm font-medium">
            {getEditorLabel(editorSetting)}
          </span>
          {editorSetting.type === 'app' && (
            <span className="text-ink-3 ml-2 text-xs">
              ({editorSetting.path})
            </span>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="border-line-soft my-8 border-t" />

      {/* Agent Backends */}
      <BackendsSettings />

      {/* Divider */}
      <div className="border-line-soft my-8 border-t" />

      {/* Template summary models */}
      <SummaryModelsSettings />

      {/* Divider */}
      <div className="border-line-soft my-8 border-t" />

      {/* Usage Display */}
      <UsageDisplaySettings />

      {/* Divider */}
      <div className="border-line-soft my-8 border-t" />

      {/* Prompt Navigator */}
      <PromptNavigatorSettings />

      {/* Divider */}
      <div className="border-line-soft my-8 border-t" />

      {/* Claude Projects Cleanup */}
      <ClaudeProjectsCleanup />
    </div>
  );
}

function BackendsSettings() {
  const { data: backendsSetting } = useBackendsSetting();
  const updateBackends = useUpdateBackendsSetting();

  const enabledBackends = backendsSetting?.enabledBackends ?? ['claude-code'];
  const defaultBackend = backendsSetting?.defaultBackend ?? 'claude-code';

  const isEnabled = (id: AgentBackendType) => enabledBackends.includes(id);
  const isDefault = (id: AgentBackendType) => defaultBackend === id;

  const handleToggle = (id: AgentBackendType) => {
    let next: AgentBackendType[];
    if (isEnabled(id)) {
      if (enabledBackends.length <= 1) return;
      next = enabledBackends.filter((b) => b !== id);
    } else {
      next = [...enabledBackends, id];
    }
    const nextDefault = next.includes(defaultBackend)
      ? defaultBackend
      : next[0];
    updateBackends.mutate({
      enabledBackends: next,
      defaultBackend: nextDefault,
    });
  };

  const handleSetDefault = (id: AgentBackendType) => {
    if (!isEnabled(id)) return;
    updateBackends.mutate({ enabledBackends, defaultBackend: id });
  };

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Agent Backends</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Enable or disable agent backends. The default backend is used when
        creating new tasks.
      </p>

      <div className="mt-4 space-y-2">
        {AVAILABLE_BACKENDS.map((backend) => {
          const enabled = isEnabled(backend.value);
          const dflt = isDefault(backend.value);

          return (
            <div
              key={backend.value}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                enabled
                  ? 'border-glass-border bg-bg-1'
                  : 'border-line-soft bg-bg-0'
              }`}
            >
              <Checkbox
                checked={enabled}
                onChange={() => handleToggle(backend.value)}
                disabled={enabled && enabledBackends.length <= 1}
                label={backend.label}
                description={backend.description}
              />

              {enabled && (
                <Button
                  onClick={() => handleSetDefault(backend.value)}
                  variant={dflt ? 'primary' : 'ghost'}
                  size="sm"
                  icon={<Star className={dflt ? 'fill-acc-ink' : ''} />}
                >
                  {dflt ? 'Default' : 'Set as default'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UsageDisplaySettings() {
  const { data: usageDisplaySetting } = useUsageDisplaySetting();
  const updateUsageDisplay = useUpdateUsageDisplaySetting();
  const enabledProviders = usageDisplaySetting?.enabledProviders ?? [];

  const isEnabled = (id: UsageProviderType) => enabledProviders.includes(id);

  const handleToggle = (id: UsageProviderType) => {
    const next = isEnabled(id)
      ? enabledProviders.filter((p) => p !== id)
      : [...enabledProviders, id];
    updateUsageDisplay.mutate({ enabledProviders: next });
  };

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Usage Display</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Show rate limit usage in the header for these providers.
      </p>

      <div className="mt-4 space-y-2">
        {USAGE_PROVIDERS.map((provider) => {
          const enabled = isEnabled(provider.value);

          return (
            <div
              key={provider.value}
              className={`rounded-lg border px-4 py-3 ${
                enabled
                  ? 'border-glass-border bg-bg-1'
                  : 'border-line-soft bg-bg-0'
              }`}
            >
              <Checkbox
                checked={enabled}
                onChange={() => handleToggle(provider.value)}
                label={provider.label}
                description={provider.description}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryModelsSettings() {
  const { data: summaryModelsSetting } = useSummaryModelsSetting();
  const updateSummaryModels = useUpdateSummaryModelsSetting();
  const { data: claudeDynamicModels } = useBackendModels('claude-code');
  const { data: opencodeDynamicModels } = useBackendModels('opencode');

  const models = summaryModelsSetting?.models ?? {
    'claude-code': 'haiku',
    opencode: 'default',
  };

  const setModelForBackend = (backend: AgentBackendType, model: string) => {
    updateSummaryModels.mutate({
      models: {
        ...models,
        [backend]: model,
      },
    });
  };

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Summary Models</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Model used for <code>{'{{summary(step.<id>)}}'}</code> template
        functions. Summary generation runs on a forked session per backend.
      </p>

      <div className="mt-4 space-y-3">
        <div className="border-glass-border bg-bg-1 flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <div className="text-ink-1 text-sm font-medium">Claude Code</div>
            <div className="text-ink-3 text-xs">Recommended: Haiku</div>
          </div>
          <ModelSelector
            value={models['claude-code']}
            onChange={(model) => setModelForBackend('claude-code', model)}
            models={getModelsForBackend('claude-code', claudeDynamicModels)}
          />
        </div>

        <div className="border-glass-border bg-bg-1 flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <div className="text-ink-1 text-sm font-medium">OpenCode</div>
            <div className="text-ink-3 text-xs">
              Use a lightweight provider/model when available
            </div>
          </div>
          <ModelSelector
            value={models.opencode}
            onChange={(model) => setModelForBackend('opencode', model)}
            models={getModelsForBackend('opencode', opencodeDynamicModels)}
          />
        </div>
      </div>
    </div>
  );
}

const MAX_WIDTH_OPTIONS = [
  { value: 30, label: '30%' },
  { value: 40, label: '40%' },
  { value: 50, label: '50%' },
  { value: 60, label: '60%' },
  { value: 70, label: '70%' },
  { value: 80, label: '80%' },
  { value: 100, label: '100% (max 56rem)' },
];

function PromptNavigatorSettings() {
  const defaultCollapsed = useUISetting('promptNavigatorDefaultCollapsed');
  const maxWidth = useUISetting('promptNavigatorMaxWidth');
  const setSetting = useUIStore((s) => s.setSetting);
  const toggleSetting = useUIStore((s) => s.toggleSetting);

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Prompt Navigator</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Configure the prompt navigator shown in message streams.
      </p>

      <div className="mt-4 space-y-4">
        {/* Default collapsed state */}
        <div
          className={`rounded-lg border px-4 py-3 ${
            defaultCollapsed
              ? 'border-glass-border bg-bg-1'
              : 'border-line-soft bg-bg-0'
          }`}
        >
          <Checkbox
            checked={defaultCollapsed}
            onChange={() => toggleSetting('promptNavigatorDefaultCollapsed')}
            label="Start collapsed"
            description="Navigator starts collapsed and can be expanded per session"
          />
        </div>

        {/* Max width */}
        <div className="border-glass-border bg-bg-1 flex items-center justify-between rounded-lg border px-4 py-3">
          <div>
            <div className="text-ink-1 text-sm font-medium">Max width</div>
            <div className="text-ink-3 text-xs">
              Maximum width of the prompt navigator panel
            </div>
          </div>
          <Select
            value={String(maxWidth)}
            options={MAX_WIDTH_OPTIONS.map((opt) => ({
              value: String(opt.value),
              label: opt.label,
            }))}
            onChange={(value) =>
              setSetting('promptNavigatorMaxWidth', Number(value))
            }
          />
        </div>
      </div>
    </div>
  );
}

function ClaudeProjectsCleanup() {
  const [scannedProjects, setScannedProjects] = useState<
    NonExistentClaudeProject[]
  >([]);
  const [contentHash, setContentHash] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [cleanupMessage, setCleanupMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const scanMutation = useScanNonExistentProjects();
  const cleanupMutation = useCleanupClaudeProjects();

  const handleScan = async () => {
    setCleanupMessage(null);
    const result = await scanMutation.mutateAsync();
    setScannedProjects(result.projects);
    setContentHash(result.contentHash);
    // Select all by default
    setSelectedPaths(new Set(result.projects.map((p) => p.path)));
  };

  const handleToggle = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedPaths(new Set(scannedProjects.map((p) => p.path)));
  };

  const handleSelectNone = () => {
    setSelectedPaths(new Set());
  };

  const handleCleanup = async () => {
    if (selectedPaths.size === 0) return;

    const result = await cleanupMutation.mutateAsync({
      paths: Array.from(selectedPaths),
      contentHash,
    });

    if (result.success) {
      setCleanupMessage({
        type: 'success',
        text: `Successfully removed ${result.removedCount} project${result.removedCount === 1 ? '' : 's'}`,
      });
      // Clear the list
      setScannedProjects([]);
      setSelectedPaths(new Set());
      setContentHash('');
    } else {
      setCleanupMessage({
        type: 'error',
        text: result.error ?? 'Failed to cleanup projects',
      });
    }
  };

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">
        Claude Projects Cleanup
      </h2>
      <p className="text-ink-3 mt-1 text-sm">
        Remove Claude project entries for folders that no longer exist on disk.
        This cleans up both ~/.claude.json and ~/.claude/projects/.
      </p>

      {/* Scan button */}
      <div className="mt-4">
        <Button
          onClick={handleScan}
          disabled={scanMutation.isPending}
          loading={scanMutation.isPending}
          icon={<Search />}
        >
          Scan for Non-Existent Projects
        </Button>
      </div>

      {/* Results */}
      {scannedProjects.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-ink-2 text-sm">
              Found {scannedProjects.length} project
              {scannedProjects.length === 1 ? '' : 's'} with non-existent paths
            </span>
            <div className="flex gap-2">
              <Button onClick={handleSelectAll} variant="ghost" size="sm">
                Select all
              </Button>
              <span className="text-ink-4">|</span>
              <Button onClick={handleSelectNone} variant="ghost" size="sm">
                Select none
              </Button>
            </div>
          </div>

          <div className="border-glass-border bg-bg-1/50 max-h-64 overflow-y-auto rounded-lg border">
            {scannedProjects.map((project) => (
              <div
                key={project.path}
                className="border-glass-border hover:bg-glass-medium/50 flex items-center gap-3 border-b px-4 py-2 last:border-b-0"
              >
                <Checkbox
                  checked={selectedPaths.has(project.path)}
                  onChange={() => handleToggle(project.path)}
                />
                <span className="text-ink-1 flex-1 truncate font-mono text-sm">
                  {project.path}
                </span>
                <span className="text-ink-3 text-xs">
                  {project.source === 'both' ? 'json + folder' : project.source}
                </span>
              </div>
            ))}
          </div>

          {/* Cleanup button */}
          <div className="mt-4">
            <Button
              onClick={handleCleanup}
              disabled={selectedPaths.size === 0 || cleanupMutation.isPending}
              loading={cleanupMutation.isPending}
              variant="danger"
              icon={<Trash2 />}
            >
              Remove Selected ({selectedPaths.size})
            </Button>
          </div>
        </div>
      )}

      {/* No results message after scan */}
      {!scanMutation.isPending &&
        scanMutation.isSuccess &&
        scannedProjects.length === 0 && (
          <div className="border-glass-border bg-bg-1/50 mt-4 rounded-lg border px-4 py-3">
            <span className="text-ink-2 text-sm">
              No projects with non-existent paths found. Everything is clean!
            </span>
          </div>
        )}

      {/* Success/Error message */}
      {cleanupMessage && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 ${
            cleanupMessage.type === 'success'
              ? 'text-status-done border-status-done bg-status-done/30'
              : 'text-status-fail border-status-fail bg-status-fail/30'
          }`}
        >
          <span className="text-sm">{cleanupMessage.text}</span>
        </div>
      )}
    </div>
  );
}
