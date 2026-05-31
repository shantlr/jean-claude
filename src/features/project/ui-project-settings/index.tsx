import { useQuery } from '@tanstack/react-query';
import isEqual from 'lodash-es/isEqual';
import {
  Check,
  FolderOpen,
  ImagePlus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { Button } from '@/common/ui/button';
import { ImagePreviewModal } from '@/common/ui/image-preview-modal';
import { Input } from '@/common/ui/input';
import { Kbd } from '@/common/ui/kbd';
import {
  ListDetailLayout,
  ListGroupHeader,
  ListItemButton,
  ListPane,
} from '@/common/ui/list-detail-layout';
import { Modal } from '@/common/ui/modal';
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
  useDeleteGeneratedProjectLogo,
  useGenerateProjectLogo,
  useGeneratedProjectLogos,
  useRegenerateProjectSummary,
  useRemoveProjectLogo,
  useSelectGeneratedProjectLogo,
  useUploadProjectLogo,
} from '@/hooks/use-projects';
import {
  useAiGenerationSetting,
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
  ProjectLogoHistoryItem,
  UpdateProject,
} from '@shared/types';

import { FavoriteBranchesInput } from './favorite-branches-input';
import { ProtectedBranchesInput } from './protected-branches-input';
import { getProjectSettingsSaveData } from './utils-project-settings-save-data';

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
  const selectGeneratedProjectLogo = useSelectGeneratedProjectLogo();
  const deleteGeneratedProjectLogo = useDeleteGeneratedProjectLogo();
  const regenerateProjectSummary = useRegenerateProjectSummary();
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
  const { data: logoPreviewDataUrl } = useQuery({
    queryKey: ['project-logo-preview', project?.logoPath],
    queryFn: () => api.fs.readImageAsDataUrl(project?.logoPath ?? ''),
    enabled: !!project?.logoPath,
    staleTime: Infinity,
  });
  const { data: generatedLogoHistory = [] } =
    useGeneratedProjectLogos(projectId);

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
  const [summary, setSummary] = useState('');
  const [isLogoPromptModalOpen, setIsLogoPromptModalOpen] = useState(false);
  const [logoPromptDraft, setLogoPromptDraft] = useState('');
  const [prPriority, setPrPriority] = useState<ProjectPriority>('normal');
  const [workItemPriority, setWorkItemPriority] =
    useState<ProjectPriority>('normal');
  const [aiSkillSlots, setAiSkillSlots] = useState<AiSkillSlotsSetting | null>(
    null,
  );
  const [protectedBranches, setProtectedBranches] = useState<string[]>([]);
  const [favoriteBranches, setFavoriteBranches] = useState<string[]>([]);
  const [isGeneratingContext, setIsGeneratingContext] = useState(false);
  const [isLogoPreviewOpen, setIsLogoPreviewOpen] = useState(false);
  const initializedProjectIdRef = useRef<string | null>(null);

  const { data: backendsSetting } = useBackendsSetting();
  const { data: aiGenerationSetting } = useAiGenerationSetting();
  const { data: backendModelPresets = [] } = useBackendModelPresetsSetting();
  const enabledBackends = useEnabledBackends();
  const canGenerateLogoWithOpenAi =
    !!aiGenerationSetting?.openAiApiKey &&
    aiGenerationSetting.openAiImageGenerationEnabled === true;

  useRegisterKeyboardBindings(
    'project-logo-prompt-modal',
    {
      'cmd+enter': () => {
        if (generateProjectLogo.isPending || !canGenerateLogoWithOpenAi) {
          return false;
        }
        handleConfirmGenerateLogo();
      },
    },
    { enabled: isLogoPromptModalOpen },
  );

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
      summary: project.summary ?? null,
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
      summary: summary || null,
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
      summary,
      workItemPriority,
      worktreesPath,
    ],
  );

  const hasChanges = projectData ? !isEqual(draftData, projectData) : false;
  const hasChangesRef = useRef(false);
  const savingProjectRef = useRef(false);
  const pendingProjectSaveRef = useRef<{
    data: UpdateProject;
    fieldVersions: Map<keyof UpdateProject, number>;
  } | null>(null);
  const dirtyFieldsRef = useRef(new Set<keyof UpdateProject>());
  const dirtyFieldVersionsRef = useRef(new Map<keyof UpdateProject, number>());

  const markFieldDirty = useCallback((field: keyof UpdateProject) => {
    dirtyFieldsRef.current.add(field);
    dirtyFieldVersionsRef.current.set(
      field,
      (dirtyFieldVersionsRef.current.get(field) ?? 0) + 1,
    );
  }, []);

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
      setSummary(project.summary ?? '');
      dirtyFieldsRef.current.clear();
      dirtyFieldVersionsRef.current.clear();
      setWorktreesPath(project.worktreesPath ?? '');
      setProtectedBranches(project.protectedBranches ?? []);
      setFavoriteBranches(project.favoriteBranches ?? []);
      setAiSkillSlots(project.aiSkillSlots);
      initializedProjectIdRef.current = project.id;
    }
  }, [backendModelPresets, project]);

  const saveProjectSettings = useCallback(
    async (save: {
      data: UpdateProject;
      fieldVersions: Map<keyof UpdateProject, number>;
    }) => {
      pendingProjectSaveRef.current = save;
      if (savingProjectRef.current) return;

      savingProjectRef.current = true;
      try {
        while (pendingProjectSaveRef.current) {
          const nextSave = pendingProjectSaveRef.current;
          pendingProjectSaveRef.current = null;
          await updateProject({
            id: projectId,
            data: nextSave.data,
          });
          const pendingSave = pendingProjectSaveRef.current as
            | typeof nextSave
            | null;
          for (const [field, version] of nextSave.fieldVersions) {
            const currentVersion = dirtyFieldVersionsRef.current.get(field);
            const pendingVersion = pendingSave?.fieldVersions.get(field);
            if (currentVersion === version && pendingVersion === undefined) {
              dirtyFieldsRef.current.delete(field);
              dirtyFieldVersionsRef.current.delete(field);
            }
          }
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
    const saveData = getProjectSettingsSaveData({
      data: draftData,
      dirtyFields: dirtyFieldsRef.current,
    });
    if (Object.keys(saveData).length === 0) return;
    const fieldVersions = new Map<keyof UpdateProject, number>();
    for (const field of Object.keys(saveData) as (keyof UpdateProject)[]) {
      fieldVersions.set(field, dirtyFieldVersionsRef.current.get(field) ?? 0);
    }

    const saveTimeout = window.setTimeout(() => {
      void saveProjectSettings({ data: saveData, fieldVersions });
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
    if (selected) {
      markFieldDirty('path');
      setPath(selected);
    }
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
        markFieldDirty('completionContext');
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

  function handleRegenerateSummary() {
    if (!project) return;

    const jobId = addRunningJob({
      type: 'project-summary-generation',
      title: `Regenerating summary for ${project.name}`,
      projectId,
      details: {
        projectName: project.name,
      },
    });

    void triggerAnimation();

    void regenerateProjectSummary
      .mutateAsync(projectId)
      .then((updatedProject) => {
        setSummary(updatedProject.summary ?? '');
        markJobSucceeded(jobId, { projectId });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to regenerate project summary.';
        markJobFailed(jobId, message);
        addToast({
          message,
          type: 'error',
        });
      });
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

  async function startLogoGeneration(customPrompt: string) {
    if (!project) return;
    const trimmedCustomPrompt = customPrompt.trim();

    const jobId = addRunningJob({
      type: 'logo-generation',
      title: `Generating logo for ${project.name}`,
      projectId,
      details: {
        projectName: project.name,
        customPrompt: trimmedCustomPrompt || null,
      },
    });

    void triggerAnimation();

    void generateProjectLogo
      .mutateAsync({
        projectId,
        customPrompt: trimmedCustomPrompt || undefined,
      })
      .then((updatedProject) => {
        setSummary((current) =>
          current.trim() ? current : (updatedProject.summary ?? ''),
        );
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

  function handleGenerateLogo() {
    setIsLogoPromptModalOpen(true);
  }

  function handleConfirmGenerateLogo() {
    setIsLogoPromptModalOpen(false);
    void startLogoGeneration(logoPromptDraft);
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

  async function handleUseGeneratedLogo(logoId: string) {
    try {
      await selectGeneratedProjectLogo.mutateAsync({ projectId, logoId });
    } catch (error) {
      addToast({
        message: error instanceof Error ? error.message : 'Failed to use logo.',
        type: 'error',
      });
    }
  }

  async function handleDeleteGeneratedLogo(logoId: string) {
    try {
      await deleteGeneratedProjectLogo.mutateAsync({ projectId, logoId });
    } catch (error) {
      addToast({
        message:
          error instanceof Error ? error.message : 'Failed to delete logo.',
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
              onChange={(e) => {
                markFieldDirty('name');
                setName(e.target.value);
              }}
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
            <ProjectColorPicker
              value={color}
              onChange={(value) => {
                markFieldDirty('color');
                setColor(value);
              }}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="text-ink-1 block text-sm font-medium">
                Summary
              </label>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleRegenerateSummary}
                disabled={regenerateProjectSummary.isPending}
                loading={regenerateProjectSummary.isPending}
                icon={<RefreshCw />}
              >
                {regenerateProjectSummary.isPending
                  ? 'Regenerating...'
                  : 'Regenerate'}
              </Button>
            </div>
            <Textarea
              size="md"
              value={summary}
              onChange={(e) => {
                markFieldDirty('summary');
                setSummary(e.target.value);
              }}
              placeholder="Short project summary used as context for generated app icons"
              rows={3}
            />
            <p className="text-ink-3 mt-1 text-xs">
              Used as context for generated project logos. You can edit it
              manually or regenerate it using AI generation settings.
            </p>
          </div>

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Logo
            </label>
            <div className="border-glass-border bg-glass-light flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
              <button
                type="button"
                className="rounded-xl transition-transform hover:scale-105 disabled:hover:scale-100"
                onClick={() => setIsLogoPreviewOpen(true)}
                disabled={!logoPreviewDataUrl}
                aria-label="Preview project logo"
              >
                <ProjectLogo project={{ ...project, color }} size="lg" />
              </button>
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
                  disabled={
                    generateProjectLogo.isPending || !canGenerateLogoWithOpenAi
                  }
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
            {!canGenerateLogoWithOpenAi && (
              <p className="text-ink-3 mt-2 text-xs">
                Enable GPT-image project logos with a saved OpenAI API key in AI
                Generation settings to generate logos.
              </p>
            )}
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
            {generatedLogoHistory.length > 0 && (
              <div className="mt-3">
                <p className="text-ink-3 mb-2 text-xs">
                  Generated logo history
                </p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(88px,1fr))]">
                  {generatedLogoHistory.map((logo) => (
                    <GeneratedLogoHistoryItem
                      key={logo.id}
                      logo={logo}
                      isActive={project.logoPath === logo.path}
                      onUse={handleUseGeneratedLogo}
                      onDelete={handleDeleteGeneratedLogo}
                    />
                  ))}
                </div>
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
              onChange={(value) => {
                markFieldDirty('defaultBranch');
                setDefaultBranch(value);
              }}
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
            onChange={(value) => {
              markFieldDirty('protectedBranches');
              setProtectedBranches(value);
            }}
          />

          <FavoriteBranchesInput
            branches={branches ?? []}
            branchesLoading={branchesLoading}
            favoriteBranches={favoriteBranches}
            onChange={(value) => {
              markFieldDirty('favoriteBranches');
              setFavoriteBranches(value);
            }}
          />

          <div>
            <label className="text-ink-1 mb-1 block text-sm font-medium">
              Worktrees folder
            </label>
            <div className="flex gap-2">
              <Input
                size="md"
                value={worktreesPath}
                onChange={(e) => {
                  markFieldDirty('worktreesPath');
                  setWorktreesPath(e.target.value);
                }}
                placeholder="Auto-created on first use"
                className="min-w-0 flex-1"
              />
              <Button
                variant="secondary"
                size="md"
                onClick={async () => {
                  const selected = await api.dialog.openDirectory();
                  if (selected) {
                    markFieldDirty('worktreesPath');
                    setWorktreesPath(selected);
                  }
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
                markFieldDirty('defaultAgentBackend');
                markFieldDirty('defaultAgentModelPreference');
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
                    markFieldDirty('defaultAgentBackend');
                    markFieldDirty('defaultAgentModelPreference');
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
              onChange={(value) => {
                markFieldDirty('prPriority');
                setPrPriority(value as ProjectPriority);
              }}
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
              onChange={(value) => {
                markFieldDirty('workItemPriority');
                setWorkItemPriority(value as ProjectPriority);
              }}
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
            onChange={(e) => {
              markFieldDirty('completionContext');
              setCompletionContext(e.target.value);
            }}
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
          onUpdate={(value) => {
            markFieldDirty('aiSkillSlots');
            setAiSkillSlots(value);
          }}
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
      <ImagePreviewModal
        isOpen={isLogoPreviewOpen}
        title={`${project.name} logo`}
        imageUrl={logoPreviewDataUrl ?? null}
        onClose={() => setIsLogoPreviewOpen(false)}
      />
      <Modal
        isOpen={isLogoPromptModalOpen}
        onClose={() => setIsLogoPromptModalOpen(false)}
        title="Generate Logo"
      >
        <div className="space-y-4">
          <div>
            <label
              htmlFor="logoCustomPrompt"
              className="text-ink-1 mb-1 block text-sm font-medium"
            >
              Custom prompt
            </label>
            <Textarea
              id="logoCustomPrompt"
              size="md"
              value={logoPromptDraft}
              onChange={(event) => setLogoPromptDraft(event.target.value)}
              placeholder="Optional details like mascot, mood, symbols, or colors"
              rows={4}
              autoFocus
            />
            <p className="text-ink-3 mt-1 text-xs">
              Added to the base image instructions and saved project summary for
              this generation only.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsLogoPromptModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmGenerateLogo}
              disabled={
                generateProjectLogo.isPending || !canGenerateLogoWithOpenAi
              }
              loading={generateProjectLogo.isPending}
              icon={<Sparkles />}
            >
              {generateProjectLogo.isPending ? 'Generating...' : 'Generate'}
              <Kbd shortcut="cmd+enter" />
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function GeneratedLogoHistoryItem({
  logo,
  isActive,
  onUse,
  onDelete,
}: {
  logo: ProjectLogoHistoryItem;
  isActive: boolean;
  onUse: (logoId: string) => void | Promise<void>;
  onDelete: (logoId: string) => void | Promise<void>;
}) {
  const { data: imageUrl } = useQuery({
    queryKey: ['project-logo-history-image', logo.path],
    queryFn: () => api.fs.readImageAsDataUrl(logo.path),
    staleTime: Infinity,
  });

  return (
    <div className="border-glass-border bg-glass-light rounded-lg border p-1.5">
      <button
        type="button"
        className="bg-glass-medium border-glass-border flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border disabled:cursor-default"
        onClick={() => onUse(logo.id)}
        disabled={isActive}
        aria-label="Use generated logo"
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt="Generated logo"
            className="h-full w-full object-cover"
          />
        ) : (
          <Sparkles className="text-ink-3 h-5 w-5" />
        )}
      </button>
      <div className="mt-1.5 flex items-center justify-center gap-1">
        <div className="flex shrink-0 gap-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onUse(logo.id)}
            disabled={isActive}
            icon={<Check />}
            aria-label="Use generated logo"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onDelete(logo.id)}
            icon={<Trash2 />}
            aria-label="Delete generated logo"
          />
        </div>
      </div>
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
