import isEqual from 'lodash-es/isEqual';
import { ChevronDown, ChevronRight, FolderOpen, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';

import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import { Textarea } from '@/common/ui/textarea';
import {
  AVAILABLE_BACKENDS,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { SLOT_DEFINITIONS } from '@/features/common/ui-ai-skill-slot';
import { ProjectMcpSettings } from '@/features/project/ui-project-mcp-settings';
import { ProjectPermissionsSettings } from '@/features/project/ui-project-permissions-settings';
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

import { ProtectedBranchesInput } from './protected-branches-input';

export type ProjectSettingsMenuItem =
  | 'details'
  | 'permissions'
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
  const [prPriority, setPrPriority] = useState<ProjectPriority>('normal');
  const [workItemPriority, setWorkItemPriority] =
    useState<ProjectPriority>('normal');
  const [aiSkillSlots, setAiSkillSlots] = useState<AiSkillSlotsSetting | null>(
    null,
  );
  const [protectedBranches, setProtectedBranches] = useState<string[]>([]);
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
      setPrPriority(project.prPriority ?? 'normal');
      setWorkItemPriority(project.workItemPriority ?? 'normal');
      setCompletionContext(project.completionContext ?? '');
      setWorktreesPath(project.worktreesPath ?? '');
      setProtectedBranches(project.protectedBranches ?? []);
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
      <div className="text-ink-3 flex h-full items-center justify-center">
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
        prPriority,
        workItemPriority,
        completionContext: completionContext || null,
        worktreesPath: worktreesPath || null,
        protectedBranches,
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
    prPriority !== (project.prPriority ?? 'normal') ||
    workItemPriority !== (project.workItemPriority ?? 'normal') ||
    completionContext !== (project.completionContext ?? '') ||
    worktreesPath !== (project.worktreesPath ?? '') ||
    !isEqual(protectedBranches, project.protectedBranches ?? []) ||
    !isEqual(aiSkillSlots, project.aiSkillSlots ?? null);

  let content: ReactElement;

  switch (menuItem) {
    case 'details':
      content = (
        <div className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="text-ink-1 mb-1 block text-sm font-medium"
            >
              Name
            </label>
            <Input
              id="name"
              size="md"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Path
            </label>
            <div className="flex gap-2">
              <Input
                size="md"
                value={path}
                readOnly
                className="text-ink-2 min-w-0 flex-1 cursor-default"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={handlePickFolder}
                icon={<FolderOpen />}
                className="shrink-0"
              >
                Browse
              </Button>
            </div>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Type
            </label>
            <span className="bg-glass-medium inline-block rounded-md px-2 py-1 text-sm">
              {project.type === 'local' ? 'Local folder' : 'Git provider'}
            </span>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
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
                      ? 'ring-offset-bg-0 ring-2 ring-white ring-offset-2'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
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
            <p className="text-ink-3 mt-1 text-xs">
              The branch that worktrees will merge into
            </p>
          </div>

          <ProtectedBranchesInput
            branches={branches ?? []}
            branchesLoading={branchesLoading}
            protectedBranches={protectedBranches}
            onChange={setProtectedBranches}
          />

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Worktrees folder
            </label>
            <div className="flex gap-2">
              <Input
                size="md"
                value={worktreesPath}
                onChange={(e) => setWorktreesPath(e.target.value)}
                placeholder="Auto-created on first use"
                className="min-w-0 flex-1"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={async () => {
                  const selected = await api.dialog.openDirectory();
                  if (selected) setWorktreesPath(selected);
                }}
                icon={<FolderOpen />}
                className="shrink-0"
              >
                Browse
              </Button>
              {project.worktreesPath && (
                <Button
                  variant="danger"
                  size="md"
                  onClick={() => deleteWorktreesFolder.mutate(projectId)}
                  disabled={deleteWorktreesFolder.isPending}
                  icon={<Trash2 />}
                  className="shrink-0"
                >
                  Delete
                </Button>
              )}
            </div>
            <p className="text-ink-3 mt-1 text-xs">
              Where worktrees for this project are stored
            </p>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
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
            <p className="text-ink-3 mt-1 text-xs">
              The agent backend used for new tasks in this project
            </p>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              PR feed priority
            </label>
            <Select
              value={prPriority}
              options={[
                { value: 'high', label: 'High' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
              onChange={(value) => setPrPriority(value as ProjectPriority)}
              className="w-full justify-between"
            />
            <p className="text-ink-3 mt-1 text-xs">
              Priority for pull requests from this project in the feed
            </p>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Work item feed priority
            </label>
            <Select
              value={workItemPriority}
              options={[
                { value: 'high', label: 'High' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
              onChange={(value) =>
                setWorkItemPriority(value as ProjectPriority)
              }
              className="w-full justify-between"
            />
            <p className="text-ink-3 mt-1 text-xs">
              Priority for work items from this project in the feed
            </p>
          </div>
        </div>
      );
      break;
    case 'permissions':
      content = <ProjectPermissionsSettings projectPath={project.path} />;
      break;
    case 'autocomplete':
      content = (
        <div className="space-y-3">
          <h2 className="text-ink-1 text-lg font-semibold">
            Autocomplete Context
          </h2>
          <p className="text-ink-3 text-xs">
            Provides context to the autocomplete model when completing prompts
            in this project. Describe what the project is about and include
            example prompts.
          </p>
          <Textarea
            size="md"
            value={completionContext}
            onChange={(e) => setCompletionContext(e.target.value)}
            placeholder={`Project: An e-commerce platform for artisan goods\n\nExample prompts:\n- add filtering by price range to the product catalog\n- fix the checkout flow when cart has mixed shipping`}
            rows={8}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerateContext}
              disabled={isGeneratingContext}
              loading={isGeneratingContext}
            >
              {isGeneratingContext
                ? 'Generating...'
                : 'Generate from task history'}
            </Button>
          </div>
        </div>
      );
      break;
    case 'integrations':
      content = (
        <div className="space-y-4">
          <h2 className="text-ink-1 text-lg font-semibold">Integrations</h2>
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
          <h2 className="text-status-fail mb-4 text-lg font-semibold">
            Danger Zone
          </h2>
          {showDeleteConfirm ? (
            <div className="border-status-fail bg-status-fail/50 rounded-lg border p-4">
              <p className="text-ink-1 mb-4 text-sm">
                Are you sure you want to delete this project? This action cannot
                be undone.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="md"
                  onClick={handleDelete}
                  disabled={deleteProject.isPending}
                  loading={deleteProject.isPending}
                >
                  {deleteProject.isPending ? 'Deleting...' : 'Delete Project'}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="danger"
              size="md"
              onClick={() => setShowDeleteConfirm(true)}
              icon={<Trash2 />}
            >
              Delete Project
            </Button>
          )}
        </div>
      );
      break;
    default:
      assertNever(menuItem);
  }

  const fillHeight = menuItem === 'skills';

  return (
    <div className={fillHeight ? 'flex min-h-0 flex-1 flex-col' : 'space-y-6'}>
      {fillHeight ? (
        content
      ) : (
        <>
          {content}
          {hasChanges && (
            <Button
              variant="primary"
              size="md"
              onClick={handleSave}
              disabled={updateProject.isPending}
              loading={updateProject.isPending}
              className="w-full"
            >
              {updateProject.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          )}
        </>
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
      <h2 className="text-ink-1 text-lg font-semibold">AI Generation</h2>
      <p className="text-ink-3 mt-1 text-sm">
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
    <div className="border-glass-border bg-bg-1/50 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => config !== null && setExpanded(!expanded)}
          className="flex cursor-pointer items-center gap-2 text-left"
        >
          {config !== null && expanded ? (
            <ChevronDown className="text-ink-2 h-4 w-4" />
          ) : (
            <ChevronRight className="text-ink-2 h-4 w-4" />
          )}
          <div>
            <span className="text-ink-1 text-sm font-medium">{label}</span>
            <p className="text-ink-3 text-xs">{description}</p>
          </div>
        </button>
        {config === null ? (
          <button
            type="button"
            onClick={handleConfigure}
            className="border-glass-border text-ink-1 hover:bg-glass-medium cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors"
          >
            Configure override
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRemove}
            className="text-status-fail border-status-fail/50 hover:bg-status-fail/50 flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors"
          >
            <Trash2 className="h-3 w-3" />
            Remove override
          </button>
        )}
      </div>

      {config === null && (
        <p className="text-ink-3 mt-2 text-xs italic">Using global default</p>
      )}

      {config !== null && expanded && (
        <div className="border-glass-border mt-3 space-y-3 border-t pt-3">
          <div>
            <label className="text-ink-2 mb-1 block text-xs font-medium">
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
            <label className="text-ink-2 mb-1 block text-xs font-medium">
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
            <label className="text-ink-2 mb-1 block text-xs font-medium">
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
            <p className="text-ink-4 mt-1 text-xs">
              Override the prompt used for generation
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
