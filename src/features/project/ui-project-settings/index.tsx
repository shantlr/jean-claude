import isEqual from 'lodash-es/isEqual';
import { ChevronDown, ChevronRight, FolderOpen, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { Select } from '@/common/ui/select';
import {
  AVAILABLE_BACKENDS,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { SLOT_DEFINITIONS } from '@/features/common/ui-ai-skill-slot';
import { ProjectMcpSettings } from '@/features/project/ui-project-mcp-settings';
import { ProjectPipelineSettings } from '@/features/project/ui-project-pipeline-settings';
import { ProjectSkillsSettings } from '@/features/project/ui-project-skills-settings';
import { RepoLink } from '@/features/project/ui-repo-link';
import { RunCommandsConfig } from '@/features/project/ui-run-commands-config';
import { WorkItemsLink } from '@/features/project/ui-work-items-link';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useEnabledBackends } from '@/hooks/use-enabled-backends';
import { useAllManagedSkills } from '@/hooks/use-managed-skills';
import {
  useProject,
  useProjectBranches,
  useUpdateProject,
  useDeleteProject,
  useDeleteProjectWorktreesFolder,
} from '@/hooks/use-projects';
import { useBackendsSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { PROJECT_COLORS } from '@/lib/colors';
import { useNavigationStore } from '@/stores/navigation';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ProjectPriority } from '@shared/feed-types';
import type { ManagedSkill } from '@shared/skill-types';
import type {
  AiSkillSlotConfig,
  AiSkillSlotKey,
  AiSkillSlotsSetting,
} from '@shared/types';

export type ProjectSettingsMenuItem =
  | 'details'
  | 'autocomplete'
  | 'integrations'
  | 'pipelines'
  | 'run-commands'
  | 'skills'
  | 'mcp-overrides'
  | 'ai-generation'
  | 'danger-zone';

function assertNever(value: never): never {
  throw new Error(`Unhandled project settings menu item: ${String(value)}`);
}

export function ProjectSettings({
  projectId,
  menuItem,
  onProjectDeleted,
}: {
  projectId: string;
  menuItem: ProjectSettingsMenuItem;
  onProjectDeleted: () => void;
}) {
  const { data: project } = useProject(projectId);
  const { data: branches, isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const deleteWorktreesFolder = useDeleteProjectWorktreesFolder();
  const clearProjectNavHistoryState = useNavigationStore(
    (s) => s.clearProjectNavHistoryState,
  );
  const addToast = useToastStore((s) => s.addToast);

  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [color, setColor] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [defaultAgentBackend, setDefaultAgentBackend] =
    useState<AgentBackendType | null>(null);
  const [worktreesPath, setWorktreesPath] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [completionContext, setCompletionContext] = useState('');
  const [priority, setPriority] = useState<ProjectPriority>('normal');
  const [aiSkillSlots, setAiSkillSlots] = useState<AiSkillSlotsSetting | null>(
    null,
  );
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);

  const { data: backendsSetting } = useBackendsSetting();
  const enabledBackends = useEnabledBackends();

  // Sync local state when project loads or changes
  useEffect(() => {
    if (project) {
      setName(project.name);
      setPath(project.path);
      setColor(project.color);
      setDefaultBranch(project.defaultBranch ?? '');
      setDefaultAgentBackend(project.defaultAgentBackend);
      setPriority(project.priority ?? 'normal');
      setCompletionContext(project.completionContext ?? '');
      setWorktreesPath(project.worktreesPath ?? '');
      setAiSkillSlots(project.aiSkillSlots);
    }
  }, [project]);

  // Initialize default branch when branches load
  useEffect(() => {
    if (branches && branches.length > 0 && !defaultBranch) {
      const initial =
        project?.defaultBranch ??
        (branches.includes('main')
          ? 'main'
          : branches.includes('master')
            ? 'master'
            : branches[0]);
      setDefaultBranch(initial);
    }
  }, [branches, project?.defaultBranch, defaultBranch]);

  useEffect(() => {
    if (menuItem !== 'danger-zone' && showDeleteConfirm) {
      setShowDeleteConfirm(false);
    }
  }, [menuItem, showDeleteConfirm]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }

  async function handlePickFolder() {
    const selected = await api.dialog.openDirectory();
    if (selected) setPath(selected);
  }

  async function handleSave() {
    await updateProject.mutateAsync({
      id: projectId,
      data: {
        name,
        path,
        color,
        defaultBranch: defaultBranch || null,
        defaultAgentBackend,
        priority,
        completionContext: completionContext || null,
        worktreesPath: worktreesPath || null,
        aiSkillSlots,
      },
    });
  }

  async function handleDelete() {
    clearProjectNavHistoryState(projectId);
    await deleteProject.mutateAsync(projectId);
    onProjectDeleted();
  }

  async function handleGenerateContext() {
    setIsGeneratingContext(true);
    try {
      const result = await api.completion.generateContext({ projectId });
      if (result) {
        setCompletionContext(result);
      } else {
        addToast({
          message: 'No task history found. Create some tasks first.',
          type: 'error',
        });
      }
    } catch {
      addToast({
        message: 'Failed to generate context. Please try again.',
        type: 'error',
      });
    } finally {
      setIsGeneratingContext(false);
    }
  }

  const hasChanges =
    name !== project.name ||
    path !== project.path ||
    color !== project.color ||
    defaultBranch !== (project.defaultBranch ?? '') ||
    defaultAgentBackend !== project.defaultAgentBackend ||
    priority !== (project.priority ?? 'normal') ||
    completionContext !== (project.completionContext ?? '') ||
    worktreesPath !== (project.worktreesPath ?? '') ||
    !isEqual(aiSkillSlots, project.aiSkillSlots ?? null);

  let content: ReactElement;

  switch (menuItem) {
    case 'details':
      content = (
        <div className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-neutral-300"
            >
              Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Path
            </label>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-800/50 px-3 py-2">
                <span className="truncate text-sm text-neutral-400">
                  {path}
                </span>
              </div>
              <button
                type="button"
                onClick={handlePickFolder}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
              >
                <FolderOpen className="h-4 w-4" />
                Browse
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Type
            </label>
            <span className="inline-block rounded-md bg-neutral-700 px-2 py-1 text-sm">
              {project.type === 'local' ? 'Local folder' : 'Git provider'}
            </span>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 cursor-pointer rounded-lg transition-all ${
                    color === c
                      ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Default merge branch
            </label>
            <Select
              value={
                branchesLoading ? '' : defaultBranch || branches?.[0] || ''
              }
              options={
                branchesLoading
                  ? [{ value: '', label: 'Loading…' }]
                  : branches?.length === 0
                    ? [{ value: '', label: 'No branches found' }]
                    : (branches ?? []).map((branch) => ({
                        value: branch,
                        label: branch,
                      }))
              }
              onChange={setDefaultBranch}
              disabled={branchesLoading || !branches?.length}
              className="w-full justify-between"
            />
            <p className="mt-1 text-xs text-neutral-500">
              The branch that worktrees will merge into
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Worktrees folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={worktreesPath}
                onChange={(e) => setWorktreesPath(e.target.value)}
                placeholder="Auto-created on first use"
                className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={async () => {
                  const selected = await api.dialog.openDirectory();
                  if (selected) setWorktreesPath(selected);
                }}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-700"
              >
                <FolderOpen className="h-4 w-4" />
                Browse
              </button>
              {project.worktreesPath && (
                <button
                  type="button"
                  onClick={() => deleteWorktreesFolder.mutate(projectId)}
                  disabled={deleteWorktreesFolder.isPending}
                  className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-950 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Where worktrees for this project are stored
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Default agent backend
            </label>
            <Select
              value={defaultAgentBackend ?? ''}
              options={[
                {
                  value: '',
                  label: `Use global default${backendsSetting?.defaultBackend ? ` (${AVAILABLE_BACKENDS.find((b) => b.value === backendsSetting.defaultBackend)?.label ?? backendsSetting.defaultBackend})` : ''}`,
                },
                ...enabledBackends.map((b) => ({
                  value: b.value,
                  label: b.label,
                })),
              ]}
              onChange={(value) =>
                setDefaultAgentBackend(
                  value === '' ? null : (value as AgentBackendType),
                )
              }
              className="w-full justify-between"
            />
            <p className="mt-1 text-xs text-neutral-500">
              The agent backend used for new tasks in this project
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-300">
              Feed priority
            </label>
            <Select
              value={priority}
              options={[
                { value: 'high', label: 'High' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
              onChange={(value) => setPriority(value as ProjectPriority)}
              className="w-full justify-between"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Affects how tasks from this project are ranked in the feed
            </p>
          </div>
        </div>
      );
      break;
    case 'autocomplete':
      content = (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-neutral-200">
            Autocomplete Context
          </h2>
          <p className="text-xs text-neutral-500">
            Provides context to the autocomplete model when completing prompts
            in this project. Describe what the project is about and include
            example prompts.
          </p>
          <textarea
            value={completionContext}
            onChange={(e) => setCompletionContext(e.target.value)}
            placeholder={`Project: An e-commerce platform for artisan goods\n\nExample prompts:\n- add filtering by price range to the product catalog\n- fix the checkout flow when cart has mixed shipping`}
            rows={8}
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGenerateContext}
              disabled={isGeneratingContext}
              className="cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300 transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isGeneratingContext
                ? 'Generating...'
                : 'Generate from task history'}
            </button>
          </div>
        </div>
      );
      break;
    case 'integrations':
      content = (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-neutral-200">
            Integrations
          </h2>
          <RepoLink project={project} />
          <WorkItemsLink project={project} />
        </div>
      );
      break;
    case 'pipelines':
      content = <ProjectPipelineSettings projectId={projectId} />;
      break;
    case 'run-commands':
      content = (
        <RunCommandsConfig projectId={projectId} projectPath={project.path} />
      );
      break;
    case 'skills':
      content = <ProjectSkillsSettings projectId={projectId} />;
      break;
    case 'mcp-overrides':
      content = <ProjectMcpSettings projectId={projectId} />;
      break;
    case 'ai-generation':
      content = (
        <ProjectAiGenerationSettings
          aiSkillSlots={aiSkillSlots}
          projectPath={project.path}
          onUpdate={setAiSkillSlots}
        />
      );
      break;
    case 'danger-zone':
      content = (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-red-400">
            Danger Zone
          </h2>
          {showDeleteConfirm ? (
            <div className="rounded-lg border border-red-900 bg-red-950/50 p-4">
              <p className="mb-4 text-sm text-neutral-300">
                Are you sure you want to delete this project? This action cannot
                be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteProject.isPending}
                  className="cursor-pointer rounded-lg bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteProject.isPending ? 'Deleting...' : 'Delete Project'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-colors hover:bg-neutral-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-red-900 bg-red-950/50 px-4 py-2 text-red-400 transition-colors hover:bg-red-950"
            >
              <Trash2 className="h-4 w-4" />
              Delete Project
            </button>
          )}
        </div>
      );
      break;
    default:
      assertNever(menuItem);
  }

  return (
    <div className="space-y-6">
      {content}
      {hasChanges && (
        <button
          type="button"
          onClick={handleSave}
          disabled={updateProject.isPending}
          className="w-full cursor-pointer rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {updateProject.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      )}
    </div>
  );
}

// --- AI Generation Settings (project-level overrides) ---

function ProjectAiGenerationSettings({
  aiSkillSlots,
  projectPath,
  onUpdate,
}: {
  aiSkillSlots: AiSkillSlotsSetting | null;
  projectPath: string;
  onUpdate: (slots: AiSkillSlotsSetting | null) => void;
}) {
  const enabledBackends = useEnabledBackends();
  const { data: allSkills } = useAllManagedSkills(projectPath);

  const handleSlotUpdate = useCallback(
    (slotKey: AiSkillSlotKey, config: AiSkillSlotConfig | null) => {
      const current = aiSkillSlots ?? {};
      if (config === null) {
        const { [slotKey]: _, ...rest } = current;
        const hasKeys = Object.keys(rest).length > 0;
        onUpdate(hasKeys ? rest : null);
      } else {
        onUpdate({ ...current, [slotKey]: config });
      }
    },
    [aiSkillSlots, onUpdate],
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">AI Generation</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Override AI generation settings for this project. Remove a slot to use
        the global default.
      </p>
      <div className="mt-4 space-y-2">
        {SLOT_DEFINITIONS.map((slot) => {
          const config = aiSkillSlots?.[slot.key] ?? null;
          return (
            <ProjectSlotRow
              key={slot.key}
              label={slot.label}
              description={slot.description}
              config={config}
              enabledBackends={enabledBackends}
              allSkills={allSkills ?? []}
              onUpdate={(cfg) => handleSlotUpdate(slot.key, cfg)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ProjectSlotRow({
  label,
  description,
  config,
  enabledBackends,
  allSkills,
  onUpdate,
}: {
  label: string;
  description: string;
  config: AiSkillSlotConfig | null;
  enabledBackends: { value: AgentBackendType; label: string }[];
  allSkills: ManagedSkill[];
  onUpdate: (config: AiSkillSlotConfig | null) => void;
}) {
  const [expanded, setExpanded] = useState(config !== null);

  // Keep expanded state in sync when config is removed externally
  useEffect(() => {
    if (config === null) {
      setExpanded(false);
    }
  }, [config]);

  const selectedBackend =
    config?.backend ?? enabledBackends[0]?.value ?? 'claude-code';
  const { data: dynamicModels } = useBackendModels(selectedBackend);
  const modelOptions = useMemo(
    () => getModelsForBackend(selectedBackend, dynamicModels),
    [selectedBackend, dynamicModels],
  );

  const skillOptions = useMemo(() => {
    return allSkills
      .filter((s) => s.enabledBackends[selectedBackend])
      .map((s) => ({ value: s.name, label: s.name }));
  }, [allSkills, selectedBackend]);

  const handleConfigure = () => {
    const defaultBackend = enabledBackends[0]?.value ?? 'claude-code';
    onUpdate({
      backend: defaultBackend,
      model: 'default',
      skillName: null,
    });
    setExpanded(true);
  };

  const handleRemove = () => {
    onUpdate(null);
    setExpanded(false);
  };

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-800/50 p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => config !== null && setExpanded(!expanded)}
          className="flex cursor-pointer items-center gap-2 text-left"
        >
          {config !== null && expanded ? (
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-neutral-400" />
          )}
          <div>
            <span className="text-sm font-medium text-neutral-200">
              {label}
            </span>
            <p className="text-xs text-neutral-500">{description}</p>
          </div>
        </button>
        {config === null ? (
          <button
            type="button"
            onClick={handleConfigure}
            className="cursor-pointer rounded-md border border-neutral-600 px-2 py-1 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
          >
            Configure override
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRemove}
            className="flex cursor-pointer items-center gap-1 rounded-md border border-red-900/50 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-950/50"
          >
            <Trash2 className="h-3 w-3" />
            Remove override
          </button>
        )}
      </div>

      {config === null && (
        <p className="mt-2 text-xs text-neutral-500 italic">
          Using global default
        </p>
      )}

      {config !== null && expanded && (
        <div className="mt-3 space-y-3 border-t border-neutral-700 pt-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Backend
            </label>
            <Select
              value={config.backend}
              options={enabledBackends.map((b) => ({
                value: b.value,
                label: b.label,
              }))}
              onChange={(value) =>
                onUpdate({
                  ...config,
                  backend: value as AgentBackendType,
                  model: 'default',
                  skillName: null,
                })
              }
              className="w-full justify-between"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Model
            </label>
            <Select
              value={config.model}
              options={modelOptions.map((m) => ({
                value: m.value,
                label: m.label,
              }))}
              onChange={(value) => onUpdate({ ...config, model: value })}
              className="w-full justify-between"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-400">
              Skill (optional)
            </label>
            <Select
              value={config.skillName ?? ''}
              options={[
                { value: '', label: 'Built-in default' },
                ...skillOptions,
              ]}
              onChange={(value) =>
                onUpdate({ ...config, skillName: value || null })
              }
              className="w-full justify-between"
            />
            <p className="mt-1 text-xs text-neutral-600">
              Override the prompt used for generation
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
