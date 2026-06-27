import {
  Brain,
  Check,
  CircleAlert,
  ExternalLink,
  FolderOpen,
  GitBranch,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { startTransition, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';


import {
  api,
  type DesktopNotificationStatus,
  type NonExistentClaudeProject,
} from '@/lib/api';
import {
  AVAILABLE_BACKENDS,
  getModelsForBackend,
  getModelThinkingCapabilities,
} from '@/features/agent/ui-backend-selector';
import {
  type CalendarNotificationsSetting,
  DEFAULT_CALENDAR_NOTIFICATION_LEAD_TIME_MINUTES,
  DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_BACKEND,
  DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_INTERVAL_MINUTES,
  DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_MODEL,
  DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_THINKING_EFFORT,
  DEFAULT_TASK_NOTIFICATION_MODES,
  type ModelPreference,
  PREFERENCE_MEMORY_CONSOLIDATION_BACKENDS,
  PRESET_EDITORS,
  type RawMessageCleanupSetting,
  type TaskNotificationEvent,
  type TaskNotificationMode,
  type ThinkingEffort,
} from '@shared/types';
import {
  getEditorLabel,
  useAppearanceSetting,
  useAvailableEditors,
  useBackendDefaultModelsSetting,
  useBackendsSetting,
  useCalendarNotificationsSetting,
  useEditorAutomationSetting,
  useEditorSetting,
  usePreferenceMemorySetting,
  usePromptPrefaceSetting,
  useRawMessageCleanupSetting,
  useSetting,
  useSummaryModelsSetting,
  useTaskEventNotificationsSetting,
  useThinkingSettingsSetting,
  useUpdateAppearanceSetting,
  useUpdateBackendDefaultModelsSetting,
  useUpdateBackendsSetting,
  useUpdateCalendarNotificationsSetting,
  useUpdateEditorAutomationSetting,
  useUpdateEditorSetting,
  useUpdatePreferenceMemorySetting,
  useUpdatePromptPrefaceSetting,
  useUpdateRawMessageCleanupSetting,
  useUpdateSetting,
  useUpdateSummaryModelsSetting,
  useUpdateTaskEventNotificationsSetting,
  useUpdateThinkingSettingsSetting,
  useUpdateUsageDisplaySetting,
  useUsageDisplaySetting,
} from '@/hooks/use-settings';
import {
  getThinkingEffortOptions,
  normalizeThinkingEffortForModel,
} from '@shared/thinking-settings';
import { USAGE_PROVIDERS, type UsageProviderType } from '@shared/usage-types';
import {
  useCleanupClaudeProjects,
  useScanNonExistentProjects,
} from '@/hooks/use-claude-projects-cleanup';
import type { AgentBackendType } from '@shared/agent-backend-types';
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Input } from '@/common/ui/input';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { PromptPrefaceList } from '@/features/settings/ui-prompt-preface-list';
import { Select } from '@/common/ui/select';
import { Switch } from '@/common/ui/switch';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useDeleteWorkActivity } from '@/hooks/use-work-activity';
import { useToastStore } from '@/stores/toasts';



const MEETING_JOIN_TARGET_OPTIONS = [
  { value: 'web', label: 'Web browser' },
  { value: 'app', label: 'Teams app' },
];

function getUtcDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

const TASK_NOTIFICATION_OPTIONS: Array<{
  event: TaskNotificationEvent;
  label: string;
  description: string;
}> = [
  {
    event: 'completed',
    label: 'Task done',
    description: 'Notify when a task finishes successfully.',
  },
  {
    event: 'permission-required',
    label: 'Waiting for permission',
    description: 'Notify when an agent pauses for tool approval.',
  },
  {
    event: 'question',
    label: 'Waiting for answers',
    description: 'Notify when an agent asks you a question.',
  },
  {
    event: 'errored',
    label: 'Task error',
    description: 'Notify when a task stops because of an error.',
  },
];

const TASK_NOTIFICATION_MODES: Array<{
  value: TaskNotificationMode;
  label: string;
  description: string;
}> = [
  {
    value: 'always',
    label: 'Always',
    description: 'Show task notifications even while app window is focused.',
  },
  {
    value: 'background',
    label: 'When not focused',
    description: 'Only show task notifications when app window is not focused.',
  },
  {
    value: 'disabled',
    label: 'Disabled',
    description: 'Never show desktop notifications for task events.',
  },
];

export function AppearanceSettings() {
  const { data: appearanceSetting } = useAppearanceSetting();
  const updateAppearance = useUpdateAppearanceSetting();
  const reduceMotion = appearanceSetting?.reduceMotion ?? true;

  return (
    <div className="space-y-4">
      <div className="border-line-soft bg-bg-0 rounded-lg border px-4 py-3">
        <Checkbox
          checked={reduceMotion}
          onChange={(checked) =>
            updateAppearance.mutate({ reduceMotion: checked })
          }
          label="Reduce motion"
          description="Use static running and unread indicators instead of animated effects. Helps reduce Electron Helper (GPU) CPU usage."
        />
      </div>
    </div>
  );
}

export function EditorSettings() {
  const { data: editorSetting, isLoading } = useEditorSetting();
  const { data: editorAutomationSetting } = useEditorAutomationSetting();
  const { data: availableEditors } = useAvailableEditors();
  const updateEditor = useUpdateEditorSetting();
  const updateEditorAutomation = useUpdateEditorAutomationSetting();
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

  const closeWindowsOnTaskCompletion =
    editorAutomationSetting?.closeWindowsOnTaskCompletion ?? false;

  if (isLoading) {
    return <p className="text-ink-3">Loading...</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
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

      <div className="mt-4">
        <Button onClick={handleBrowseApp} icon={<FolderOpen />}>
          Browse for application...
        </Button>
      </div>

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

      <div className="border-line-soft mt-6 border-t pt-6">
        <h3 className="text-ink-1 text-sm font-semibold">Task cleanup</h3>
        <Checkbox
          className="mt-3"
          checked={closeWindowsOnTaskCompletion}
          onChange={(checked) =>
            updateEditorAutomation.mutate({
              closeWindowsOnTaskCompletion: checked,
            })
          }
          label="Close editor windows when completing or deleting tasks"
          description="Uses the selected editor and closes matching worktree windows when possible. macOS only."
        />
      </div>
    </div>
  );
}

export function PromptPrefaceSettings() {
  const { data: setting, isLoading } = usePromptPrefaceSetting();
  const updateSetting = useUpdatePromptPrefaceSetting();

  if (isLoading || !setting) {
    return <p className="text-ink-3">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-ink-3 text-sm">
        Enabled entries are concatenated in list order.
      </p>
      <PromptPrefaceList
        entries={setting}
        onChange={(entries) => updateSetting.mutate(entries)}
      />
    </div>
  );
}

export function NotificationsSettings() {
  return (
    <div className="space-y-8">
      <TaskNotificationSettings />
    </div>
  );
}

export { CalendarNotificationSettings as CalendarSettings };

export function MaintenanceSettings() {
  return (
    <div className="space-y-8">
      <RawMessageCleanupSettings />
      <div className="border-line-soft border-t" />
      <ClaudeProjectsCleanup />
      <GlobalGitignoreSetup />
    </div>
  );
}

function BetaBadge() {
  return (
    <span className="border-acc/35 bg-acc/10 text-acc-ink inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
      Beta
    </span>
  );
}

export function PreferenceMemorySettings() {
  const { data: preferenceMemorySetting } = usePreferenceMemorySetting();
  const updatePreferenceMemory = useUpdatePreferenceMemorySetting();
  const setting = preferenceMemorySetting ?? {
    enabled: false,
    consolidationEnabled: false,
    consolidationIntervalMinutes:
      DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_INTERVAL_MINUTES,
    consolidationBackend: DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_BACKEND,
    consolidationModel: DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_MODEL,
    consolidationThinkingEffort:
      DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_THINKING_EFFORT,
  };
  const { data: dynamicModels } = useBackendModels(
    setting.consolidationBackend,
  );
  const thinkingCapabilities = getModelThinkingCapabilities(
    setting.consolidationModel,
    dynamicModels,
  );
  const thinkingOptions = getThinkingEffortOptions({
    backend: setting.consolidationBackend,
    model: setting.consolidationModel,
    capabilities: thinkingCapabilities,
  });
  const normalizedThinkingEffort = normalizeThinkingEffortForModel({
    backend: setting.consolidationBackend,
    model: setting.consolidationModel,
    effort: setting.consolidationThinkingEffort,
    capabilities: thinkingCapabilities,
  });

  const updateSetting = (next: typeof setting) => {
    updatePreferenceMemory.mutate(next);
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="bg-acc/15 text-acc-ink mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Brain className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-ink-1 text-lg font-semibold">Agent Memory</h2>
            <BetaBadge />
          </div>
          <p className="text-ink-3 mt-1 text-sm">
            Capture review and PR comments as local evidence, then periodically
            consolidate them into reusable coding preferences.
          </p>
        </div>
      </div>

      <div className="border-glass-border bg-bg-1 mt-4 rounded-lg border px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-ink-1 text-sm font-medium">
              Capture preference evidence
            </div>
            <p className="text-ink-3 mt-1 text-xs">
              When enabled, Jean-Claude writes review/PR comments, selected
              code, task context, and bounded file snapshots to daily files in{' '}
              <span className="font-mono">
                .jean-claude/memory/user-reviews/
              </span>{' '}
              in each project.
            </p>
          </div>
          <Switch
            checked={setting.enabled}
            onChange={(nextEnabled) =>
              updateSetting({
                ...setting,
                enabled: nextEnabled,
              })
            }
            label="Capture preference evidence"
          />
        </div>
      </div>

      <div className="border-glass-border bg-bg-1 mt-4 rounded-lg border px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-ink-1 text-sm font-medium">
              Consolidate preferences
            </div>
            <p className="text-ink-3 mt-1 text-xs">
              When enabled, Jean-Claude regularly processes new review evidence
              from byte offsets tracked in{' '}
              <span className="font-mono">
                .jean-claude/memory/user-reviews-state.json
              </span>{' '}
              and updates{' '}
              <span className="font-mono">
                .jean-claude/memory/user-preferences.md
              </span>
              .
            </p>
          </div>
          <Switch
            checked={setting.consolidationEnabled}
            onChange={(consolidationEnabled) =>
              updateSetting({
                ...setting,
                consolidationEnabled,
              })
            }
            label="Consolidate preferences"
          />
        </div>
        <div className="mt-4 max-w-xs">
          <label className="text-ink-2 block text-xs font-medium">
            Interval (minutes)
          </label>
          <Input
            type="number"
            min={15}
            value={setting.consolidationIntervalMinutes}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (!Number.isFinite(nextValue)) return;
              updateSetting({
                ...setting,
                consolidationIntervalMinutes: Math.max(15, nextValue),
              });
            }}
            className="mt-2"
          />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Select
            value={setting.consolidationBackend}
            options={AVAILABLE_BACKENDS.filter((backend) =>
              PREFERENCE_MEMORY_CONSOLIDATION_BACKENDS.includes(
                backend.value as (typeof PREFERENCE_MEMORY_CONSOLIDATION_BACKENDS)[number],
              ),
            ).map((backend) => ({
              value: backend.value,
              label: backend.label,
              description: backend.description,
              badge: backend.badge,
            }))}
            onChange={(backendValue) => {
              const consolidationBackend = backendValue as AgentBackendType;
              const consolidationModel =
                consolidationBackend === 'claude-code'
                  ? DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_MODEL
                  : 'default';
              updateSetting({
                ...setting,
                consolidationBackend,
                consolidationModel,
                consolidationThinkingEffort:
                  DEFAULT_PREFERENCE_MEMORY_CONSOLIDATION_THINKING_EFFORT,
              });
            }}
            label="Backend"
          />
          <ModelSelector
            value={setting.consolidationModel}
            models={getModelsForBackend(
              setting.consolidationBackend,
              dynamicModels,
            )}
            onChange={(consolidationModel) => {
              const nextCapabilities = getModelThinkingCapabilities(
                consolidationModel,
                dynamicModels,
              );
              updateSetting({
                ...setting,
                consolidationModel,
                consolidationThinkingEffort: normalizeThinkingEffortForModel({
                  backend: setting.consolidationBackend,
                  model: consolidationModel,
                  effort: setting.consolidationThinkingEffort,
                  capabilities: nextCapabilities,
                }),
              });
            }}
          />
          <ThinkingSelector
            value={normalizedThinkingEffort}
            options={thinkingOptions}
            onChange={(consolidationThinkingEffort) =>
              updateSetting({
                ...setting,
                consolidationThinkingEffort: normalizeThinkingEffortForModel({
                  backend: setting.consolidationBackend,
                  model: setting.consolidationModel,
                  effort: consolidationThinkingEffort,
                  capabilities: thinkingCapabilities,
                }),
              })
            }
            disabled={thinkingOptions.length <= 1}
          />
        </div>
      </div>

      <div className="border-glass-border bg-bg-1 mt-4 rounded-lg border px-4 py-3">
        <div className="text-ink-1 text-sm font-medium">How it works</div>
        <ol className="text-ink-3 mt-2 list-decimal space-y-1 pl-4 text-xs">
          <li>Enable capture here.</li>
          <li>Leave task review comments or PR file comments.</li>
          <li>
            Jean-Claude appends evidence to daily JSONL files under{' '}
            <span className="font-mono">.jean-claude/memory/user-reviews/</span>
            .
          </li>
          <li>
            If consolidation is enabled, Jean-Claude runs the{' '}
            <span className="font-mono">user-preference-memory</span> skill to
            update{' '}
            <span className="font-mono">
              .jean-claude/memory/user-preferences.md
            </span>
            .
          </li>
          <li>Future agents can read that markdown memory before working.</li>
        </ol>
      </div>

      <div className="border-glass-border bg-bg-1 mt-4 rounded-lg border px-4 py-3">
        <div className="text-ink-1 text-sm font-medium">Evidence retention</div>
        <p className="text-ink-3 mt-1 text-xs">
          Evidence is kept indefinitely in project JSONL files until you delete
          it. Jean-Claude does not prune or upload it. Evidence can include
          comments, selected code, task context, and bounded file excerpts
          around commented lines.
        </p>
      </div>
    </div>
  );
}

function RawMessageCleanupSettings() {
  const { data: rawMessageCleanupSetting } = useRawMessageCleanupSetting();
  const updateRawMessageCleanup = useUpdateRawMessageCleanupSetting();

  const settings: RawMessageCleanupSetting = rawMessageCleanupSetting ?? {
    enabled: true,
    retentionHours: 24,
  };
  const [retentionInput, setRetentionInput] = useState(
    String(settings.retentionHours),
  );

  useEffect(() => {
    startTransition(() => setRetentionInput(String(settings.retentionHours)));
  }, [settings.retentionHours]);

  const updateSetting = (next: RawMessageCleanupSetting) => {
    updateRawMessageCleanup.mutate(next);
  };

  const commitRetention = () => {
    const parsed = Number.parseInt(retentionInput, 10);
    const retentionHours = Number.isFinite(parsed)
      ? Math.max(parsed, 1)
      : settings.retentionHours;
    setRetentionInput(String(retentionHours));
    if (retentionHours !== settings.retentionHours) {
      updateSetting({ ...settings, retentionHours });
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        <div className="bg-acc/15 text-acc-ink mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Trash2 className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-ink-1 text-lg font-semibold">
            Raw Message Cleanup
          </h2>
          <p className="text-ink-3 mt-1 text-sm">
            Save disk space by deleting raw agent messages after normalized
            messages are safely retained.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="border-glass-border bg-bg-1 rounded-lg border px-4 py-3">
          <Checkbox
            checked={settings.enabled}
            onChange={(enabled) => updateSetting({ ...settings, enabled })}
            label="Clean up completed task raw messages"
            description="Normalized messages stay available in task timelines. Raw debug payloads are removed after retention period."
          />
        </div>

        <div className="border-glass-border bg-bg-1 rounded-lg border px-4 py-3">
          <label className="text-ink-2 block text-sm font-medium">
            Keep raw messages after completion
          </label>
          <p className="text-ink-3 mt-1 text-xs">
            Cleanup only touches completed tasks older than this duration.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Input
              type="number"
              min={1}
              step={1}
              value={retentionInput}
              onChange={(e) => setRetentionInput(e.target.value)}
              onBlur={commitRetention}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitRetention();
                }
              }}
              disabled={!settings.enabled}
              className="w-28"
            />
            <span className="text-ink-3 text-sm">hours</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WorkActivitySettings() {
  const addToast = useToastStore((state) => state.addToast);
  const { data: workActivitySetting } = useSetting('workActivity');
  const updateSetting = useUpdateSetting<'workActivity'>();
  const deleteWorkActivity = useDeleteWorkActivity();
  const [deleteBeforeDate, setDeleteBeforeDate] = useState('');
  const todayUtcDate = getUtcDateInputValue(new Date());

  function toggleLogging(checked: boolean) {
    updateSetting.mutate(
      {
        key: 'workActivity',
        value: { enabled: checked },
      },
      {
        onError: () => {
          addToast({
            type: 'error',
            message: 'Failed to update activity logging',
          });
        },
      },
    );
  }

  function deleteBefore() {
    if (!deleteBeforeDate) return;
    if (deleteBeforeDate > todayUtcDate) {
      addToast({
        type: 'error',
        message: 'Delete date cannot be in the future',
      });
      return;
    }

    if (
      !window.confirm(
        `Delete work activity before ${deleteBeforeDate}? This cannot be undone.`,
      )
    ) {
      return;
    }

    deleteWorkActivity.mutate(
      { before: new Date(`${deleteBeforeDate}T00:00:00.000Z`).toISOString() },
      {
        onSuccess: () => {
          addToast({ type: 'success', message: 'Work activity deleted' });
        },
        onError: () => {
          addToast({
            type: 'error',
            message: 'Failed to delete work activity',
          });
        },
      },
    );
  }

  function deleteAll() {
    if (!window.confirm('Delete all work activity? This cannot be undone.')) {
      return;
    }

    deleteWorkActivity.mutate(undefined, {
      onSuccess: () => {
        addToast({ type: 'success', message: 'All work activity deleted' });
      },
      onError: () => {
        addToast({ type: 'error', message: 'Failed to delete work activity' });
      },
    });
  }

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Work Activity</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Control automatic activity logging and manage stored activity data.
      </p>

      <div className="mt-4 space-y-4">
        <Checkbox
          checked={workActivitySetting?.enabled ?? true}
          onChange={toggleLogging}
          disabled={updateSetting.isPending}
          label="Log work activity"
          description="Track task prompts, PR comments, and approvals for weekly summaries."
        />

        <div className="border-glass-border bg-bg-1/50 rounded-lg border p-4">
          <h3 className="text-ink-1 text-sm font-medium">Retention</h3>
          <p className="text-ink-3 mt-1 text-sm">
            Delete old activity entries or clear all stored activity.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-ink-2 mb-1 block text-xs font-medium">
                Delete before date
              </span>
              <Input
                type="date"
                value={deleteBeforeDate}
                max={todayUtcDate}
                onChange={(event) =>
                  setDeleteBeforeDate(event.currentTarget.value)
                }
                className="w-44"
              />
            </label>
            <Button
              variant="secondary"
              onClick={deleteBefore}
              disabled={!deleteBeforeDate || deleteWorkActivity.isPending}
            >
              Delete Before Date
            </Button>
            <Button
              variant="secondary"
              onClick={deleteAll}
              disabled={deleteWorkActivity.isPending}
            >
              Delete All
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GeneralSettings() {
  return (
    <div>
      <EditorSettings />
      <div className="border-line-soft my-8 border-t" />
      <NotificationsSettings />
      <div className="border-line-soft my-8 border-t" />
      <UsageDisplaySettings />
      <div className="border-line-soft my-8 border-t" />
      <WorkActivitySettings />
      <div className="border-line-soft my-8 border-t" />
      <MaintenanceSettings />
    </div>
  );
}

export function BackendsSettings() {
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
              className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${
                enabled
                  ? 'border-glass-border bg-bg-1'
                  : 'border-line-soft bg-bg-0'
              }`}
            >
              <Checkbox
                checked={enabled}
                onChange={() => handleToggle(backend.value)}
                disabled={enabled && enabledBackends.length <= 1}
                label={
                  <span className="flex items-center gap-2">
                    <span>{backend.label}</span>
                    {backend.badge && (
                      <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-px text-[9px] font-semibold tracking-wide text-amber-300 uppercase">
                        {backend.badge}
                      </span>
                    )}
                  </span>
                }
                description={backend.description}
              />

              {enabled && (
                <div className="flex items-center gap-2">
                  <BackendThinkingSettings backend={backend.value} />
                  <Button
                    onClick={() => handleSetDefault(backend.value)}
                    variant={dflt ? 'primary' : 'ghost'}
                    size="sm"
                    icon={<Star className={dflt ? 'fill-acc-ink' : ''} />}
                  >
                    {dflt ? 'Default' : 'Set as default'}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BackendThinkingSettings({ backend }: { backend: AgentBackendType }) {
  const { data: backendDefaultModelsSetting } =
    useBackendDefaultModelsSetting();
  const updateBackendDefaultModels = useUpdateBackendDefaultModelsSetting();
  const { data: thinkingSettings } = useThinkingSettingsSetting();
  const updateThinkingSettings = useUpdateThinkingSettingsSetting();
  const { data: dynamicModels } = useBackendModels(backend);
  const model =
    thinkingSettings?.selectedModels?.[backend] ??
    backendDefaultModelsSetting?.models[backend] ??
    'default';

  const capabilities = getModelThinkingCapabilities(model, dynamicModels);
  const thinkingOptions = getThinkingEffortOptions({
    backend,
    model,
    capabilities,
  });
  const backendEfforts = thinkingSettings?.efforts[backend] ?? {
    default: 'default',
  };
  const value = normalizeThinkingEffortForModel({
    backend,
    model,
    effort: backendEfforts[model] ?? backendEfforts.default,
    capabilities,
  });

  const handleModelChange = (nextModel: ModelPreference) => {
    const nextCapabilities = getModelThinkingCapabilities(
      nextModel,
      dynamicModels,
    );
    updateThinkingSettings.mutate({
      efforts: {
        'claude-code': {
          ...(thinkingSettings?.efforts['claude-code'] ?? {
            default: 'default',
          }),
        },
        opencode: {
          ...(thinkingSettings?.efforts.opencode ?? { default: 'default' }),
        },
        codex: {
          ...(thinkingSettings?.efforts.codex ?? { default: 'default' }),
        },
      },
      selectedModels: {
        'claude-code':
          thinkingSettings?.selectedModels?.['claude-code'] ??
          backendDefaultModelsSetting?.models['claude-code'] ??
          'default',
        opencode:
          thinkingSettings?.selectedModels?.opencode ??
          backendDefaultModelsSetting?.models.opencode ??
          'default',
        codex:
          thinkingSettings?.selectedModels?.codex ??
          backendDefaultModelsSetting?.models.codex ??
          'default',
        [backend]: nextModel,
      },
    });
    updateBackendDefaultModels.mutate({
      models: {
        'claude-code':
          backendDefaultModelsSetting?.models['claude-code'] ?? 'default',
        opencode: backendDefaultModelsSetting?.models.opencode ?? 'default',
        codex: backendDefaultModelsSetting?.models.codex ?? 'default',
        [backend]: nextModel,
      },
    });

    const normalizedEffort = normalizeThinkingEffortForModel({
      backend,
      model: nextModel,
      effort: backendEfforts[nextModel] ?? backendEfforts.default,
      capabilities: nextCapabilities,
    });

    if (
      backendEfforts[nextModel] &&
      backendEfforts[nextModel] !== normalizedEffort
    ) {
      setThinkingEffort(nextModel, normalizedEffort);
    }
  };

  const setThinkingEffort = (
    targetModel: ModelPreference,
    effort: ThinkingEffort,
  ) => {
    const normalizedEffort = normalizeThinkingEffortForModel({
      backend,
      model: targetModel,
      effort,
      capabilities: getModelThinkingCapabilities(targetModel, dynamicModels),
    });
    updateThinkingSettings.mutate({
      efforts: {
        'claude-code': {
          ...(thinkingSettings?.efforts['claude-code'] ?? {
            default: 'default',
          }),
        },
        opencode: {
          ...(thinkingSettings?.efforts.opencode ?? { default: 'default' }),
        },
        codex: {
          ...(thinkingSettings?.efforts.codex ?? { default: 'default' }),
        },
        [backend]: {
          ...backendEfforts,
          [targetModel]: normalizedEffort,
        },
      },
      selectedModels: {
        'claude-code':
          thinkingSettings?.selectedModels?.['claude-code'] ??
          backendDefaultModelsSetting?.models['claude-code'] ??
          'default',
        opencode:
          thinkingSettings?.selectedModels?.opencode ??
          backendDefaultModelsSetting?.models.opencode ??
          'default',
        codex:
          thinkingSettings?.selectedModels?.codex ??
          backendDefaultModelsSetting?.models.codex ??
          'default',
        [backend]: targetModel,
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <ModelSelector
        value={model}
        onChange={handleModelChange}
        models={getModelsForBackend(backend, dynamicModels)}
      />
      <ThinkingSelector
        value={value}
        options={thinkingOptions}
        onChange={(effort) => setThinkingEffort(model, effort)}
        disabled={thinkingOptions.length <= 1}
      />
    </div>
  );
}

function CalendarNotificationSettings() {
  const { data: calendarNotificationsSetting } =
    useCalendarNotificationsSetting();
  const updateCalendarNotifications = useUpdateCalendarNotificationsSetting();

  const settings: CalendarNotificationsSetting =
    calendarNotificationsSetting ?? {
      enabled: false,
      leadTimeMinutes: DEFAULT_CALENDAR_NOTIFICATION_LEAD_TIME_MINUTES,
      showStartWindow: false,
      meetingJoinTarget: 'web',
    };
  const isSupported = api.platform === 'darwin';
  const [leadTimeInput, setLeadTimeInput] = useState(
    String(settings.leadTimeMinutes),
  );

  useEffect(() => {
    startTransition(() => setLeadTimeInput(String(settings.leadTimeMinutes)));
  }, [settings.leadTimeMinutes]);

  const updateSetting = (next: CalendarNotificationsSetting) => {
    updateCalendarNotifications.mutate(next);
  };

  const commitLeadTime = () => {
    const parsed = Number.parseInt(leadTimeInput, 10);
    const leadTimeMinutes = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 1), 60)
      : settings.leadTimeMinutes;
    setLeadTimeInput(String(leadTimeMinutes));
    if (leadTimeMinutes !== settings.leadTimeMinutes) {
      updateSetting({ ...settings, leadTimeMinutes });
    }
  };

  return (
    <div>
      <div className="space-y-3">
        <div className="border-glass-border bg-bg-1 rounded-lg border px-4 py-3">
          <Checkbox
            checked={settings.enabled}
            onChange={() =>
              updateSetting({ ...settings, enabled: !settings.enabled })
            }
            disabled={!isSupported}
            label="Enable calendar meeting reminders"
            description={
              !isSupported
                ? 'Calendar reminders are currently supported on macOS only.'
                : 'Jean-Claude reads your macOS Calendar events and shows a reminder shortly before a meeting begins.'
            }
          />
        </div>

        <div className="border-glass-border bg-bg-1 rounded-lg border px-4 py-3">
          <Checkbox
            checked={settings.showStartWindow}
            onChange={() =>
              updateSetting({
                ...settings,
                showStartWindow: !settings.showStartWindow,
              })
            }
            disabled={!settings.enabled || !isSupported}
            label="Show a window when meetings start"
            description="Display an always-on-top meeting window at the scheduled start time, with a quick join action when available."
          />
        </div>

        <div className="border-glass-border bg-bg-1 rounded-lg border px-4 py-3">
          <label className="text-ink-1 mb-1 block text-sm font-medium">
            Open Teams meetings in
          </label>
          <Select
            value={settings.meetingJoinTarget}
            options={MEETING_JOIN_TARGET_OPTIONS}
            onChange={(meetingJoinTarget) =>
              updateSetting({
                ...settings,
                meetingJoinTarget:
                  meetingJoinTarget as CalendarNotificationsSetting['meetingJoinTarget'],
              })
            }
            disabled={!settings.enabled || !isSupported}
            className="w-full justify-between sm:w-56"
          />
          <p className="text-ink-3 mt-2 text-xs">
            Teams app uses msteams:// deep links when meeting links support it.
          </p>
        </div>

        {!isSupported ? (
          <div className="border-line-soft bg-bg-0 rounded-lg border px-4 py-3 text-sm">
            <div className="text-ink-1 flex items-center gap-2 font-medium">
              <CircleAlert className="h-4 w-4" />
              Calendar reminders are macOS-only for now
            </div>
            <p className="text-ink-3 mt-1">
              This feature reads your local macOS Calendar data, so it is
              unavailable on this platform.
            </p>
          </div>
        ) : (
          <div className="border-status-warn/40 bg-status-warn/8 rounded-lg border px-4 py-3 text-sm">
            <div className="text-ink-1 flex items-center gap-2 font-medium">
              <CircleAlert className="text-status-warn h-4 w-4" />
              Sync your Outlook calendar into macOS Calendar
            </div>
            <p className="text-ink-2 mt-1">
              Jean-Claude now reads meetings from the macOS Calendar app. If
              your work meetings only appear in Outlook, add the same Microsoft
              account to Calendar so macOS can sync those events locally.
            </p>
            <ol className="text-ink-2 mt-2 list-decimal space-y-1 pl-5">
              <li>Open the macOS Calendar app.</li>
              <li>
                Open <code>Calendar &gt; Settings &gt; Accounts</code>.
              </li>
              <li>
                Choose <code>Add Account...</code> and select{' '}
                <code>Microsoft Exchange</code>.
              </li>
              <li>
                Sign in with the same Microsoft account you use in Outlook.
              </li>
              <li>
                Make sure Calendar sync is enabled, then wait for meetings to
                appear.
              </li>
            </ol>
            <p className="text-ink-3 mt-2">
              The first fetch may take a moment if macOS prompts Jean-Claude for
              Calendar access. Approve that prompt, then reopen the meetings
              dropdown.
            </p>
          </div>
        )}

        <div className="border-glass-border bg-bg-1 rounded-lg border px-4 py-3">
          <label className="text-ink-2 block text-sm font-medium">
            Reminder lead time
          </label>
          <p className="text-ink-3 mt-1 text-xs">
            How many minutes before a meeting Jean-Claude should notify you.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={60}
              step={1}
              value={leadTimeInput}
              onChange={(e) => setLeadTimeInput(e.target.value)}
              onBlur={commitLeadTime}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  commitLeadTime();
                }
              }}
              disabled={!settings.enabled || !isSupported}
              className="w-28"
            />
            <span className="text-ink-3 text-sm">minutes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskNotificationSettings() {
  const { data: taskNotificationsSetting } = useTaskEventNotificationsSetting();
  const updateTaskNotifications = useUpdateTaskEventNotificationsSetting();
  const [desktopStatus, setDesktopStatus] =
    useState<DesktopNotificationStatus | null>(null);
  const [isCheckingDesktopStatus, setIsCheckingDesktopStatus] = useState(false);

  const modes =
    taskNotificationsSetting?.modes ?? DEFAULT_TASK_NOTIFICATION_MODES;

  const checkDesktopStatus = async () => {
    setIsCheckingDesktopStatus(true);
    try {
      setDesktopStatus(await api.notifications.getDesktopStatus());
    } finally {
      setIsCheckingDesktopStatus(false);
    }
  };

  useEffect(() => {
    startTransition(() => checkDesktopStatus());

    window.addEventListener('focus', checkDesktopStatus);
    return () => window.removeEventListener('focus', checkDesktopStatus);
  }, []);

  const handleModeChange = ({
    event,
    mode,
  }: {
    event: TaskNotificationEvent;
    mode: TaskNotificationMode;
  }) => {
    updateTaskNotifications.mutate({
      modes: {
        ...modes,
        [event]: mode,
      },
    });
  };

  const handleOpenSystemSettings = async () => {
    await api.notifications.openSystemSettings();
  };

  const showDesktopWarning =
    desktopStatus &&
    (!desktopStatus.supported || desktopStatus.permission !== 'granted');
  const desktopWarningTitle = !desktopStatus?.supported
    ? 'Desktop notifications are unsupported'
    : desktopStatus.permission === 'denied'
      ? 'Desktop notifications are blocked'
      : 'Desktop notifications are not allowed yet';

  return (
    <div>
      <div className="space-y-3">
        {showDesktopWarning ? (
          <div className="border-status-err/50 bg-status-err/8 rounded-lg border px-4 py-3 text-sm">
            <div className="text-ink-1 flex items-center gap-2 font-medium">
              <CircleAlert className="text-status-err h-4 w-4" />
              {desktopWarningTitle}
            </div>
            <p className="text-ink-2 mt-1">
              Jean-Claude cannot show desktop notifications right now. Allow
              notifications for Jean-Claude in your system settings, then check
              again.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {desktopStatus.canOpenSettings ? (
                <Button
                  onClick={handleOpenSystemSettings}
                  size="sm"
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                >
                  Open System Settings
                </Button>
              ) : null}
              <Button
                onClick={checkDesktopStatus}
                size="sm"
                variant="ghost"
                disabled={isCheckingDesktopStatus}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Check again
              </Button>
            </div>
          </div>
        ) : null}

        {TASK_NOTIFICATION_OPTIONS.map((option) => {
          const selectedMode = modes[option.event];

          return (
            <div
              key={option.event}
              className="border-glass-border bg-bg-1 rounded-lg border px-4 py-3"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 lg:max-w-[260px]">
                  <div className="text-ink-1 text-sm font-medium">
                    {option.label}
                  </div>
                  <div className="text-ink-3 mt-1 text-xs">
                    {option.description}
                  </div>
                </div>

                <div
                  className="flex flex-wrap gap-2 lg:justify-end"
                  role="radiogroup"
                  aria-label={`${option.label} notification mode`}
                >
                  {TASK_NOTIFICATION_MODES.map((modeOption) => {
                    const isSelected = selectedMode === modeOption.value;

                    return (
                      <label
                        key={modeOption.value}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                          isSelected
                            ? 'border-acc bg-acc/12 text-acc-ink'
                            : 'border-line-soft bg-bg-0 text-ink-2 hover:bg-glass-medium'
                        }`}
                        title={modeOption.description}
                      >
                        <input
                          type="radio"
                          name={`task-notification-mode-${option.event}`}
                          value={modeOption.value}
                          checked={isSelected}
                          onChange={() =>
                            handleModeChange({
                              event: option.event,
                              mode: modeOption.value,
                            })
                          }
                          className="border-glass-border bg-glass-medium text-acc focus:ring-acc/30 h-3.5 w-3.5"
                        />
                        <span className="font-medium">{modeOption.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function UsageDisplaySettings() {
  const queryClient = useQueryClient();
  const { data: usageDisplaySetting } = useUsageDisplaySetting();
  const updateUsageDisplay = useUpdateUsageDisplaySetting();
  const enabledProviders = usageDisplaySetting?.enabledProviders ?? [];
  const [copilotToken, setCopilotToken] = useState('');
  const [copilotDeviceCode, setCopilotDeviceCode] = useState<string | null>(
    null,
  );
  const [copilotLoginStatus, setCopilotLoginStatus] = useState<string | null>(
    null,
  );
  const hasStoredCopilotToken = usageDisplaySetting?.copilotToken === 'stored';

  useEffect(() => {
    startTransition(() => setCopilotToken(
      usageDisplaySetting?.copilotToken === 'stored'
        ? ''
        : (usageDisplaySetting?.copilotToken ?? ''),
    ));
  }, [usageDisplaySetting?.copilotToken]);

  const isEnabled = (id: UsageProviderType) => enabledProviders.includes(id);

  const handleToggle = (id: UsageProviderType) => {
    const next = isEnabled(id)
      ? enabledProviders.filter((p) => p !== id)
      : [...enabledProviders, id];
    updateUsageDisplay.mutate({
      ...(usageDisplaySetting ?? { enabledProviders: [] }),
      enabledProviders: next,
    });
  };

  const saveCopilotToken = () => {
    if (!copilotToken.trim()) return;
    updateUsageDisplay.mutate({
      ...(usageDisplaySetting ?? { enabledProviders: [] }),
      copilotToken: copilotToken.trim(),
    });
  };

  const clearCopilotToken = () => {
    setCopilotToken('');
    setCopilotDeviceCode(null);
    setCopilotLoginStatus('Signed out.');
    updateUsageDisplay.mutate({
      ...(usageDisplaySetting ?? { enabledProviders: [] }),
      copilotToken: '',
    });
  };

  const startCopilotLogin = async () => {
    try {
      setCopilotLoginStatus('Opening GitHub sign-in...');
      const deviceCode = await api.copilotAuth.requestDeviceCode();
      setCopilotDeviceCode(deviceCode.userCode);
      setCopilotLoginStatus('Waiting for GitHub authorization...');
      await api.copilotAuth.completeDeviceLogin(deviceCode);
      setCopilotToken('');
      setCopilotDeviceCode(null);
      setCopilotLoginStatus('Signed in.');
      await queryClient.invalidateQueries({
        queryKey: ['settings', 'usageDisplay'],
      });
      await queryClient.invalidateQueries({ queryKey: ['backend-usage'] });
    } catch (error) {
      setCopilotDeviceCode(null);
      setCopilotLoginStatus(
        error instanceof Error ? error.message : 'GitHub sign-in failed.',
      );
    }
  };

  return (
    <div>
      <div className="space-y-2">
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

      <div className="mt-4">
        <label className="text-ink-2 block text-sm font-medium">
          GitHub Copilot token
        </label>
        <div className="mt-2 flex gap-2">
          <Input
            type="password"
            value={copilotToken}
            onChange={(e) => setCopilotToken(e.target.value)}
            onBlur={saveCopilotToken}
            onKeyDown={(e) => e.key === 'Enter' && saveCopilotToken()}
            placeholder={
              hasStoredCopilotToken
                ? 'Stored token preserved unless replaced'
                : 'Token used for Copilot usage API'
            }
          />
          {hasStoredCopilotToken && (
            <Button
              onMouseDown={(event) => event.preventDefault()}
              onClick={clearCopilotToken}
              variant="ghost"
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-ink-3 mt-1 text-xs">
          Used only when Copilot usage display is enabled.
        </p>
        <div className="mt-2 flex items-center gap-2">
          <Button
            onClick={
              hasStoredCopilotToken ? clearCopilotToken : startCopilotLogin
            }
            onMouseDown={
              hasStoredCopilotToken
                ? (event) => event.preventDefault()
                : undefined
            }
            variant={hasStoredCopilotToken ? 'ghost' : 'secondary'}
          >
            {hasStoredCopilotToken ? 'Sign out' : 'Sign in with GitHub'}
          </Button>
          {hasStoredCopilotToken && (
            <span className="text-status-done flex items-center gap-1 text-xs">
              <Check className="h-3 w-3" /> Signed in
            </span>
          )}
          {copilotDeviceCode && (
            <span className="text-ink-2 text-xs">
              Enter code{' '}
              <code className="bg-bg-2 rounded px-1 py-0.5">
                {copilotDeviceCode}
              </code>
            </span>
          )}
        </div>
        {copilotLoginStatus && (
          <p className="text-ink-3 mt-1 text-xs">{copilotLoginStatus}</p>
        )}
        <p className="text-ink-3 mt-2 text-xs">
          Sign in with GitHub is preferred. Manual tokens are only a fallback
          and must belong to a GitHub account with Copilot access.
        </p>
      </div>
    </div>
  );
}

export function SummaryModelsSettings() {
  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Summary Models</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Model used for <code>{'{{summary(step.<id>)}}'}</code> template
        functions, including Continue steps. Summaries are generated from saved
        normalized messages without forking the original session.
      </p>

      <div className="mt-4 space-y-3">
        <SummaryModelSettings backend="claude-code" compact />
        <SummaryModelSettings backend="opencode" compact />
      </div>
    </div>
  );
}

const SUMMARY_MODEL_BACKENDS: Record<
  AgentBackendType,
  { label: string; description: string; defaultModel: string }
> = {
  'claude-code': {
    label: 'Claude Code',
    description: 'Recommended: Haiku',
    defaultModel: 'haiku',
  },
  opencode: {
    label: 'OpenCode',
    description: 'Use a lightweight provider/model when available',
    defaultModel: 'default',
  },
  codex: {
    label: 'Codex',
    description: 'Use default Codex model when available',
    defaultModel: 'default',
  },
};

export function SummaryModelSettings({
  backend,
  compact = false,
}: {
  backend: AgentBackendType;
  compact?: boolean;
}) {
  const { data: summaryModelsSetting } = useSummaryModelsSetting();
  const updateSummaryModels = useUpdateSummaryModelsSetting();
  const { data: dynamicModels } = useBackendModels(backend);
  const details = SUMMARY_MODEL_BACKENDS[backend];

  const models = summaryModelsSetting?.models ?? {
    'claude-code': SUMMARY_MODEL_BACKENDS['claude-code'].defaultModel,
    opencode: SUMMARY_MODEL_BACKENDS.opencode.defaultModel,
    codex: SUMMARY_MODEL_BACKENDS.codex.defaultModel,
  };

  const setModel = (model: string) => {
    updateSummaryModels.mutate({
      models: {
        ...models,
        [backend]: model,
      },
    });
  };

  return (
    <div className="border-glass-border bg-bg-1 rounded-lg border px-4 py-3">
      {!compact && (
        <div className="mb-4">
          <h2 className="text-ink-1 text-lg font-semibold">
            {details.label} Summary Model
          </h2>
          <p className="text-ink-3 mt-1 text-sm">
            Model used for <code>{'{{summary(step.<id>)}}'}</code> template
            functions when generating summaries with {details.label}.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-ink-1 text-sm font-medium">{details.label}</div>
          <div className="text-ink-3 text-xs">{details.description}</div>
        </div>
        <ModelSelector
          value={models[backend]}
          onChange={setModel}
          models={getModelsForBackend(backend, dynamicModels)}
        />
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

function GlobalGitignoreSetup() {
  const [status, setStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSetup = async () => {
    setIsPending(true);
    setStatus(null);
    try {
      const result = await api.shell.setupGlobalGitignore();
      setStatus({
        type: 'success',
        text: `Global gitignore updated: ${result.path}`,
      });
    } catch (err) {
      setStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update gitignore',
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Global Gitignore</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Add Jean-Claude managed files to your global gitignore so they are never
        accidentally committed.
      </p>
      <p className="text-ink-4 mt-1 font-mono text-xs">
        **/.jean-claude/settings.local.json
        <br />
        **/.jean-claude/ignore
        <br />
        **/.jean-claude/tmp/
      </p>

      <div className="mt-4">
        <Button
          onClick={handleSetup}
          disabled={isPending}
          loading={isPending}
          icon={<GitBranch />}
        >
          Setup Global Gitignore
        </Button>
      </div>

      {status && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 ${
            status.type === 'success'
              ? 'text-status-done border-status-done bg-status-done/30'
              : 'text-status-fail border-status-fail bg-status-fail/30'
          }`}
        >
          <span className="text-sm">{status.text}</span>
        </div>
      )}
    </div>
  );
}
