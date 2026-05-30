import { useQuery } from '@tanstack/react-query';
import isEqual from 'lodash-es/isEqual';
import { FolderOpen, ImagePlus, Sparkles, Trash2, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import {
  ListDetailLayout,
  ListGroupHeader,
  ListItemButton,
  ListPane,
} from '@/common/ui/list-detail-layout';
import { Select } from '@/common/ui/select';
import { Textarea } from '@/common/ui/textarea';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
import { findMatchingBackendModelPresetId } from '@/features/agent/ui-backend-preset-selector';
import { AVAILABLE_BACKENDS } from '@/features/agent/ui-backend-selector';
import {
  SLOT_DEFINITIONS,
  SlotDetail,
} from '@/features/common/ui-ai-skill-slot';
import { ProjectColorPicker } from '@/features/project/ui-project-color-picker';
import { ProjectLogo } from '@/features/project/ui-project-logo';
import { ProjectLogoSuggestions } from '@/features/project/ui-project-logo-suggestions';
import { ProjectMcpSettings } from '@/features/project/ui-project-mcp-settings';
import { ProjectPermissionsSettings } from '@/features/project/ui-project-permissions-settings';
import { ProjectPipelineSettings } from '@/features/project/ui-project-pipeline-settings';
import { ProjectSkillsSettings } from '@/features/project/ui-project-skills-settings';
import { ProjectWorktreeSettings } from '@/features/project/ui-project-worktree-settings';
import { RepoLink } from '@/features/project/ui-repo-link';
import { RunCommandsConfig } from '@/features/project/ui-run-commands-config';
import { WorkItemsLink } from '@/features/project/ui-work-items-link';
import { useEnabledBackends } from '@/hooks/use-enabled-backends';
import {
  useProject,
  useProjectBranches,
  useUpdateProject,
  useDeleteProject,
  useDeleteProjectWorktreesFolder,
  useGenerateProjectLogo,
  useRemoveProjectLogo,
  useUploadProjectLogo,
} from '@/hooks/use-projects';
import {
  useBackendModelPresetsSetting,
  useBackendsSetting,
} from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import { useNavigationStore } from '@/stores/navigation';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { ProjectPriority } from '@shared/feed-types';
import type {
  AiSkillSlotConfig,
  AiSkillSlotKey,
  AiSkillSlotsSetting,
  ModelPreference,
} from '@shared/types';

import { FavoriteBranchesInput } from './favorite-branches-input';
import { ProtectedBranchesInput } from './protected-branches-input';

export type ProjectSettingsMenuItem =
  | 'details'
  | 'permissions'
  | 'worktree'
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
  const { data: branchInfos, isLoading: branchesLoading } =
    useProjectBranches(projectId);
  const branches = useMemo(
    () => branchInfos?.map((b) => b.name),
    [branchInfos],
  );
  const { mutateAsync: updateProject } = useUpdateProject();
  const uploadProjectLogo = useUploadProjectLogo();
  const generateProjectLogo = useGenerateProjectLogo();
  const removeProjectLogo = useRemoveProjectLogo();
  const deleteProject = useDeleteProject();
  const deleteWorktreesFolder = useDeleteProjectWorktreesFolder();
  const clearProjectNavHistoryState = useNavigationStore(
    (s) => s.clearProjectNavHistoryState,
  );
  const addToast = useToastStore((s) => s.addToast);
  const addRunningJob = useBackgroundJobsStore((s) => s.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore((s) => s.markJobSucceeded);
  const markJobFailed = useBackgroundJobsStore((s) => s.markJobFailed);
  const panelRef = useRef<HTMLDivElement>(null);
  const { triggerAnimation } = useShrinkToTarget({
    panelRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });
  const { data: detectedLogos = [] } = useQuery({
    queryKey: ['project-logo-suggestions', project?.path],
    queryFn: () => api.projects.detectLogos(project?.path ?? ''),
    enabled: !!project?.path,
  });

  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [color, setColor] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [defaultAgentBackend, setDefaultAgentBackend] =
    useState<AgentBackendType | null>(null);
  const [defaultAgentModelPreference, setDefaultAgentModelPreference] =
    useState<ModelPreference | null>(null);
  const [defaultAgentPresetId, setDefaultAgentPresetId] = useState<
    string | null
  >(null);
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
  const [favoriteBranches, setFavoriteBranches] = useState<string[]>([]);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const initializedProjectIdRef = useRef<string | null>(null);

  const { data: backendsSetting } = useBackendsSetting();
  const { data: backendModelPresets = [] } = useBackendModelPresetsSetting();
  const enabledBackends = useEnabledBackends();

  const projectData = useMemo(() => {
    if (!project) return null;

    return {
      name: project.name,
      path: project.path,
      color: project.color,
      defaultBranch: project.defaultBranch ?? null,
      defaultAgentBackend: project.defaultAgentBackend,
      defaultAgentModelPreference: project.defaultAgentModelPreference,
      prPriority: project.prPriority ?? 'normal',
      workItemPriority: project.workItemPriority ?? 'normal',
      completionContext: project.completionContext ?? null,
      worktreesPath: project.worktreesPath ?? null,
      protectedBranches: project.protectedBranches ?? [],
      favoriteBranches: project.favoriteBranches ?? [],
      aiSkillSlots: project.aiSkillSlots,
    };
  }, [project]);

  const draftData = useMemo(
    () => ({
      name,
      path,
      color,
      defaultBranch: defaultBranch || null,
      defaultAgentBackend,
      defaultAgentModelPreference,
      prPriority,
      workItemPriority,
      completionContext: completionContext || null,
      worktreesPath: worktreesPath || null,
      protectedBranches,
      favoriteBranches,
      aiSkillSlots,
    }),
    [
      aiSkillSlots,
      color,
      completionContext,
      defaultAgentBackend,
      defaultAgentModelPreference,
      defaultBranch,
      favoriteBranches,
      name,
      path,
      prPriority,
      protectedBranches,
      workItemPriority,
      worktreesPath,
    ],
  );

  const hasChanges = projectData ? !isEqual(draftData, projectData) : false;
  const hasChangesRef = useRef(false);
  const savingProjectRef = useRef(false);
  const pendingProjectSaveRef = useRef<typeof draftData | null>(null);

  useEffect(() => {
    hasChangesRef.current = hasChanges;
  }, [hasChanges]);

  // Sync local state when project loads or changes
  useEffect(() => {
    if (project) {
      const isInitialProjectLoad =
        initializedProjectIdRef.current !== project.id;
      if (!isInitialProjectLoad && hasChangesRef.current) return;

      setName(project.name);
      setPath(project.path);
      setColor(project.color);
      setDefaultBranch(project.defaultBranch ?? '');
      setDefaultAgentBackend(project.defaultAgentBackend);
      setDefaultAgentModelPreference(project.defaultAgentModelPreference);
      setDefaultAgentPresetId(
        findMatchingBackendModelPresetId({
          presets: backendModelPresets,
          backend: project.defaultAgentBackend,
          model: project.defaultAgentModelPreference,
        }),
      );
      setPrPriority(project.prPriority ?? 'normal');
      setWorkItemPriority(project.workItemPriority ?? 'normal');
      setCompletionContext(project.completionContext ?? '');
      setWorktreesPath(project.worktreesPath ?? '');
      setProtectedBranches(project.protectedBranches ?? []);
      setFavoriteBranches(project.favoriteBranches ?? []);
      setAiSkillSlots(project.aiSkillSlots);
      initializedProjectIdRef.current = project.id;
    }
  }, [backendModelPresets, project]);

  const saveProjectSettings = useCallback(
    async (data: typeof draftData) => {
      pendingProjectSaveRef.current = data;
      if (savingProjectRef.current) return;

      savingProjectRef.current = true;
      try {
        while (pendingProjectSaveRef.current) {
          const nextData = pendingProjectSaveRef.current;
          pendingProjectSaveRef.current = null;
          await updateProject({
            id: projectId,
            data: nextData,
          });
        }
      } catch (error) {
        addToast({
          message:
            error instanceof Error
              ? error.message
              : 'Failed to save project settings',
          type: 'error',
        });
      } finally {
        savingProjectRef.current = false;
      }
    },
    [addToast, projectId, updateProject],
  );

  useEffect(() => {
    if (!projectData || !hasChanges) return;

    const saveTimeout = window.setTimeout(() => {
      void saveProjectSettings(draftData);
    }, 500);

    return () => window.clearTimeout(saveTimeout);
  }, [draftData, hasChanges, projectData, saveProjectSettings]);

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

  async function handleUploadLogo() {
    const sourcePath = await api.dialog.openImageFile();
    if (!sourcePath) return;
    try {
      await uploadProjectLogo.mutateAsync({ projectId, sourcePath });
    } catch (error) {
      addToast({
        message:
          error instanceof Error ? error.message : 'Failed to upload logo.',
        type: 'error',
      });
    }
  }

  async function handleGenerateLogo() {
    if (!project) return;

    const jobId = addRunningJob({
      type: 'logo-generation',
      title: `Generating logo for ${project.name}`,
      projectId,
      details: {
        projectName: project.name,
      },
    });

    void triggerAnimation();

    void generateProjectLogo
      .mutateAsync(projectId)
      .then(() => {
        markJobSucceeded(jobId, { projectId });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to generate logo. Check AI generation settings.';
        markJobFailed(jobId, message);
        addToast({
          message,
          type: 'error',
        });
      });
  }

  async function handleSelectLogoSuggestion(sourcePath: string) {
    try {
      await uploadProjectLogo.mutateAsync({ projectId, sourcePath });
    } catch (error) {
      addToast({
        message: error instanceof Error ? error.message : 'Failed to use logo.',
        type: 'error',
      });
    }
  }
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
            <ProjectColorPicker value={color} onChange={setColor} />
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Logo
            </label>
            <div className="border-glass-border bg-glass-light flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
              <ProjectLogo project={{ ...project, color }} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-ink-1 text-sm font-medium">
                  {project.logoPath
                    ? project.logoSource === 'generated'
                      ? 'Generated logo'
                      : 'Uploaded logo'
                    : 'No logo set'}
                </p>
                <p className="text-ink-3 mt-1 text-xs">
                  Logos are stored in Jean-Claude app data and shown anywhere
                  projects are listed.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleUploadLogo}
                  disabled={uploadProjectLogo.isPending}
                  icon={<ImagePlus />}
                >
                  Upload
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateLogo}
                  disabled={generateProjectLogo.isPending}
                  icon={<Sparkles />}
                >
                  {generateProjectLogo.isPending ? 'Generating...' : 'Generate'}
                </Button>
                {project.logoPath && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => removeProjectLogo.mutate(projectId)}
                    disabled={removeProjectLogo.isPending}
                    icon={<X />}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
            {detectedLogos.length > 0 && (
              <div className="mt-3">
                <p className="text-ink-3 mb-2 text-xs">
                  Suggestions found in this project folder
                </p>
                <ProjectLogoSuggestions
                  logos={detectedLogos}
                  selectedPath={project.logoPath}
                  onSelect={handleSelectLogoSuggestion}
                />
              </div>
            )}
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

          <FavoriteBranchesInput
            branches={branches ?? []}
            branchesLoading={branchesLoading}
            favoriteBranches={favoriteBranches}
            onChange={setFavoriteBranches}
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
              Default coding agent
            </label>
            <Select
              value={defaultAgentBackend === null ? 'global' : 'project'}
              options={[
                {
                  value: 'global',
                  label: `Use global default${backendsSetting?.defaultBackend ? ` (${AVAILABLE_BACKENDS.find((b) => b.value === backendsSetting.defaultBackend)?.label ?? backendsSetting.defaultBackend})` : ''}`,
                },
                { value: 'project', label: 'Use project default' },
              ]}
              onChange={(value) => {
                if (value === 'global') {
                  setDefaultAgentBackend(null);
                  setDefaultAgentModelPreference(null);
                  setDefaultAgentPresetId(null);
                  return;
                }

                setDefaultAgentBackend(
                  defaultAgentBackend ??
                    enabledBackends[0]?.value ??
                    'claude-code',
                );
                setDefaultAgentModelPreference(
                  defaultAgentModelPreference ?? 'default',
                );
              }}
              className="w-full justify-between"
            />
            {defaultAgentBackend !== null && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <BackendModelPresetPicker
                  backend={defaultAgentBackend}
                  model={defaultAgentModelPreference ?? 'default'}
                  selectedPresetId={defaultAgentPresetId}
                  enabledBackends={enabledBackends.map((b) => b.value)}
                  className="w-full justify-between sm:w-auto"
                  modelClassName="w-full justify-between sm:w-auto"
                  onChange={(selection) => {
                    setDefaultAgentBackend(selection.backend);
                    setDefaultAgentModelPreference(selection.model);
                    setDefaultAgentPresetId(selection.presetId);
                  }}
                />
              </div>
            )}
            <p className="text-ink-3 mt-1 text-xs">
              Used to prefill backend and model for new tasks in this project.
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
    case 'worktree':
      content = <ProjectWorktreeSettings projectPath={project.path} />;
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

  const fillHeight = menuItem === 'skills' || menuItem === 'ai-generation';

  return (
    <div
      ref={panelRef}
      className={
        fillHeight ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'space-y-6'
      }
    >
      {content}
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
  const [selectedSlotKey, setSelectedSlotKey] = useState<AiSkillSlotKey>(
    SLOT_DEFINITIONS[0].key,
  );

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

  const selectedSlot = SLOT_DEFINITIONS.find(
    (slot) => slot.key === selectedSlotKey,
  );

  return (
    <ListDetailLayout
      list={
        <ProjectAiGenerationRail
          slots={aiSkillSlots ?? {}}
          selectedSlotKey={selectedSlotKey}
          onSelect={setSelectedSlotKey}
        />
      }
      detail={
        selectedSlot ? (
          <SlotDetail
            key={selectedSlot.key}
            label={selectedSlot.label}
            description={selectedSlot.description}
            config={aiSkillSlots?.[selectedSlot.key] ?? null}
            enabledBackends={enabledBackends}
            projectPath={projectPath}
            fallbackBackend={enabledBackends[0]?.value ?? 'claude-code'}
            fallbackModel="default"
            emptySummary="Using global default"
            emptyBadgeLabel="Global default"
            toggleLabel="Project override"
            toggleDescription="Turn off to inherit the global AI generation setting for this slot."
            onUpdate={(config) => handleSlotUpdate(selectedSlot.key, config)}
          />
        ) : null
      }
    />
  );
}

function ProjectAiGenerationRail({
  slots,
  selectedSlotKey,
  onSelect,
}: {
  slots: Partial<Record<AiSkillSlotKey, AiSkillSlotConfig>>;
  selectedSlotKey: AiSkillSlotKey;
  onSelect: (slotKey: AiSkillSlotKey) => void;
}) {
  const [width, setWidth] = useState(280);

  return (
    <ListPane
      width={width}
      minWidth={220}
      maxWidth={420}
      onWidthChange={setWidth}
      title="AI Generation"
      count={SLOT_DEFINITIONS.length}
      headerSupplement={
        <p className="text-[12px] leading-relaxed text-white/45">
          Override AI generation by project. Empty slots inherit global
          settings.
        </p>
      }
    >
      <ListGroupHeader label={`Overrides (${SLOT_DEFINITIONS.length})`} />
      {SLOT_DEFINITIONS.map((slot) => (
        <ListItemButton
          key={slot.key}
          label={slot.label}
          isActive={selectedSlotKey === slot.key}
          isDimmed={!slots[slot.key]}
          size="compact"
          onClick={() => onSelect(slot.key)}
          renderIcon={({ isActive, isDimmed }) => (
            <Sparkles
              size={14}
              className="shrink-0"
              style={{
                color: isDimmed
                  ? 'oklch(0.4 0.01 280)'
                  : isActive
                    ? 'oklch(0.78 0.18 295)'
                    : 'oklch(0.78 0.16 295)',
                opacity: isDimmed ? 0.6 : 1,
              }}
            />
          )}
        />
      ))}
    </ListPane>
  );
}
