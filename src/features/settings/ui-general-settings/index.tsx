import {
  Check,
  FolderOpen,
  GitBranch,
  Bell,
  CircleAlert,
  ExternalLink,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import { Textarea } from '@/common/ui/textarea';
import {
  AVAILABLE_BACKENDS,
  getModelThinkingCapabilities,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import {
  useScanNonExistentProjects,
  useCleanupClaudeProjects,
} from '@/hooks/use-claude-projects-cleanup';
import {
  getEditorLabel,
  useBackendsSetting,
  useCalendarNotificationsSetting,
  useEditorAutomationSetting,
  useEditorSetting,
  useTaskEventNotificationsSetting,
  useSummaryModelsSetting,
  useThinkingSettingsSetting,
  useUpdateBackendsSetting,
  useUpdateCalendarNotificationsSetting,
  useUpdateEditorAutomationSetting,
  useUpdateEditorSetting,
  useUpdateTaskEventNotificationsSetting,
  useUpdateSummaryModelsSetting,
  useUpdateThinkingSettingsSetting,
  useAvailableEditors,
  useUsageDisplaySetting,
  useUpdateUsageDisplaySetting,
  usePromptPrefaceSetting,
  useUpdatePromptPrefaceSetting,
} from '@/hooks/use-settings';
import {
  api,
  type DesktopNotificationStatus,
  type NonExistentClaudeProject,
} from '@/lib/api';
import type { AgentBackendType } from '@shared/agent-backend-types';
import {
  getThinkingEffortOptions,
  normalizeThinkingEffortForModel,
} from '@shared/thinking-settings';
import {
  DEFAULT_CALENDAR_NOTIFICATION_LEAD_TIME_MINUTES,
  DEFAULT_TASK_NOTIFICATION_MODES,
  PRESET_EDITORS,
  type ModelPreference,
  type ThinkingEffort,
  type CalendarNotificationsSetting,
  type TaskNotificationEvent,
  type TaskNotificationMode,
} from '@shared/types';
import { USAGE_PROVIDERS, type UsageProviderType } from '@shared/usage-types';

const PROMPT_PREFACE_PLACEMENT_OPTIONS = [
  { value: 'before', label: 'Before user prompt' },
  { value: 'after', label: 'After user prompt' },
];

const PROMPT_PREFACE_FREQUENCY_OPTIONS = [
  { value: 'initial', label: 'Initial prompt only' },
  { value: 'each', label: 'Each prompt' },
];

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
      <h2 className="text-ink-1 text-lg font-semibold">Editor</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Choose which editor to open projects in
      </p>

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
  const [draftText, setDraftText] = useState('');

  useEffect(() => {
    if (setting) {
      setDraftText(setting.text);
    }
  }, [setting]);

  if (isLoading || !setting) {
    return <p className="text-ink-3">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-ink-1 text-lg font-semibold">Prompt Preface</h2>
        <p className="text-ink-3 mt-1 text-sm">
          Add reusable instructions to prompts before they are sent to coding
          agents.
        </p>
      </div>

      <Textarea
        size="md"
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        onBlur={() => updateSetting.mutate({ ...setting, text: draftText })}
        placeholder="Example: Keep responses concise and prioritize minimal code changes."
        rows={8}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-ink-1 mb-1 block text-sm font-medium">
            Placement
          </label>
          <Select
            value={setting.placement}
            options={PROMPT_PREFACE_PLACEMENT_OPTIONS}
            onChange={(placement) =>
              updateSetting.mutate({
                ...setting,
                text: draftText,
                placement: placement as typeof setting.placement,
              })
            }
            className="w-full justify-between"
          />
        </div>

        <div>
          <label className="text-ink-1 mb-1 block text-sm font-medium">
            Frequency
          </label>
          <Select
            value={setting.frequency}
            options={PROMPT_PREFACE_FREQUENCY_OPTIONS}
            onChange={(frequency) =>
              updateSetting.mutate({
                ...setting,
                text: draftText,
                frequency: frequency as typeof setting.frequency,
              })
            }
            className="w-full justify-between"
          />
        </div>
      </div>
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
      <ClaudeProjectsCleanup />
      <GlobalGitignoreSetup />
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
                label={backend.label}
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
  const { data: thinkingSettings } = useThinkingSettingsSetting();
  const updateThinkingSettings = useUpdateThinkingSettingsSetting();
  const { data: dynamicModels } = useBackendModels(backend);
  const [model, setModel] = useState<ModelPreference>('default');

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
    setModel(nextModel);

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
        [backend]: {
          ...backendEfforts,
          [targetModel]: normalizedEffort,
        },
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
    };
  const isSupported = api.platform === 'darwin';
  const [leadTimeInput, setLeadTimeInput] = useState(
    String(settings.leadTimeMinutes),
  );

  useEffect(() => {
    setLeadTimeInput(String(settings.leadTimeMinutes));
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
      <div className="flex items-start gap-3">
        <div className="bg-acc/15 text-acc-ink mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-ink-1 text-lg font-semibold">
            Calendar Notifications
          </h2>
          <p className="text-ink-3 mt-1 text-sm">
            Notify before meetings start using your macOS Calendar data.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
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
    checkDesktopStatus();

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
      <div className="flex items-start gap-3">
        <div className="bg-acc/15 text-acc-ink mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
          <Bell className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-ink-1 text-lg font-semibold">
            Task Notifications
          </h2>
          <p className="text-ink-3 mt-1 text-sm">
            Choose delivery mode for each kind of task notification.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
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
