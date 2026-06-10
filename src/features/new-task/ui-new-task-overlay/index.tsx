import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS as DndCSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Eye, Search } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';

import {
  KeyboardLayerProvider,
  useKeyboardLayer,
} from '@/common/context/keyboard-bindings';
import { useCommands } from '@/common/hooks/use-commands';
import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import {
  BranchOrTaskSelect,
  type BranchOrTaskSelection,
} from '@/common/ui/branch-or-task-select';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { BackendModelPresetPicker } from '@/features/agent/ui-backend-model-preset-picker';
import { findMatchingBackendModelPresetId } from '@/features/agent/ui-backend-preset-selector';
import {
  getModelThinkingCapabilities,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { ThinkingSelector } from '@/features/agent/ui-thinking-selector';
import {
  PromptTextarea,
  type PromptTextareaRef,
} from '@/features/common/ui-prompt-textarea';
import { ProjectLogoBackground } from '@/features/project/ui-project-logo';
import { WorkItemPicker } from '@/features/work-item/ui-work-item-picker';
import { useBackendModels } from '@/hooks/use-backend-models';
import {
  useCreateFeedNote,
  useCreateWorkItemVerificationNote,
} from '@/hooks/use-feed-notes';
import { useDeleteProjectTodo } from '@/hooks/use-project-todos';
import {
  useProjects,
  useProjectBranches,
  useProjectFeatureMap,
  useProjectIsGitRepository,
  useReorderProjects,
} from '@/hooks/use-projects';
import {
  useBackendModelPresetsSetting,
  useBackendDefaultModelsSetting,
  useBackendsSetting,
  useCompletionSetting,
  usePromptSnippetsSetting,
  useThinkingSettingsSetting,
} from '@/hooks/use-settings';
import { useProjectSkills } from '@/hooks/use-skills';
import { useCreateTaskWithWorktree, useProjectTasks } from '@/hooks/use-tasks';
import {
  useWorkItems,
  useWorkItemComments,
  useRelatedTestCasesForWorkItems,
} from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';
import { getDefaultModelForBackend } from '@/lib/default-models';
import { feedQueryKeys } from '@/lib/feed-query-keys';
import { buildAttachedFilesXml } from '@/lib/file-attachment-utils';
import { compressImage } from '@/lib/image-compression';
import {
  expandFeatureReferencesInPrompt,
  getReferencedFeatures,
} from '@/lib/prompt-feature-context';
import {
  resolveSnippetTemplate,
  type SnippetVariableContext,
} from '@/lib/resolve-snippet-template';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import {
  useComposerFileCommentCount,
  useComposerFileComments,
  useComposerFileCommentsStore,
  synthesizeFileCommentsPrompt,
  type ComposerFileComment,
} from '@/stores/composer-file-comments';
import {
  useNewTaskDraft,
  useNewTaskDraftStore,
  type InputMode,
  type WorkItemsViewMode,
} from '@/stores/new-task-draft';
import { useUISetting, useUIStore } from '@/stores/ui';
import type {
  AgentBackendType,
  PromptFilePart,
  PromptImagePart,
} from '@shared/agent-backend-types';
import {
  getThinkingEffortOptions,
  normalizeThinkingEffortForModel,
} from '@shared/thinking-settings';
import {
  normalizeInteractionModeForBackend,
  type ThinkingEffort,
  type Project,
  type ProjectFeatureMap,
} from '@shared/types';

import { ComposerFileExplorer } from '../ui-composer-file-explorer';
import {
  PromptComposer,
  buildWorkItemSnippetContext,
  generateInitialTemplate,
  getWorkItemCommentSelectionId,
  expandTemplate,
  extractWorkItemImageUrls,
} from '../ui-prompt-composer';

// Check if project has work items linked
function projectHasWorkItems(project: Project | null): boolean {
  if (!project) return false;
  return !!(
    project.workItemProviderId &&
    project.workItemProjectId &&
    project.workItemProjectName
  );
}

function FinalPromptPreviewButton({
  prompt,
  projectRoot,
  featureMap,
  fileComments,
  files,
}: {
  prompt: string;
  projectRoot: string | null | undefined;
  featureMap: ProjectFeatureMap | null | undefined;
  fileComments: ComposerFileComment[];
  files: PromptFilePart[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  const referencedFeatures = useMemo(
    () => getReferencedFeatures({ text: prompt, featureMap }),
    [prompt, featureMap],
  );

  const fileContextParts = useMemo(
    () => synthesizeFileCommentsPrompt(fileComments, projectRoot ?? undefined),
    [fileComments, projectRoot],
  );

  const fileCommentText = useMemo(() => {
    const textPart = fileContextParts?.find((part) => part.type === 'text');
    return textPart?.type === 'text' ? textPart.text : '';
  }, [fileContextParts]);

  const finalPromptPreview = useMemo(() => {
    let finalPrompt = prompt;
    if (fileCommentText) {
      finalPrompt = finalPrompt.trim()
        ? `${finalPrompt}\n\n${fileCommentText}`
        : fileCommentText;
    }
    finalPrompt = expandFeatureReferencesInPrompt({
      text: finalPrompt,
      featureMap,
    });
    finalPrompt += buildAttachedFilesXml(files);
    return finalPrompt;
  }, [prompt, fileCommentText, featureMap, files]);

  const hasGeneratedContext =
    referencedFeatures.length > 0 ||
    fileComments.length > 0 ||
    files.length > 0;
  if (!hasGeneratedContext) return null;

  return (
    <>
      <button
        type="button"
        className="border-glass-border bg-glass-light text-ink-2 hover:bg-glass-medium hover:text-ink-1 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors"
        onClick={() => setIsOpen(true)}
      >
        <Eye className="h-3 w-3" />
        <span className="text-acc font-mono text-[10px]">Preview</span>
        <span className="text-ink-3 text-[10px]">final prompt</span>
        {referencedFeatures.length > 0 && (
          <span className="bg-acc-soft text-acc rounded px-1.5 py-px font-mono text-[10px]">
            {referencedFeatures.length} feat
          </span>
        )}
        {fileComments.length > 0 && (
          <span className="bg-glass-medium text-ink-3 rounded px-1.5 py-px font-mono text-[10px]">
            {fileComments.length} comments
          </span>
        )}
        {files.length > 0 && (
          <span className="bg-glass-medium text-ink-3 rounded px-1.5 py-px font-mono text-[10px]">
            {files.length} files
          </span>
        )}
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Final prompt preview"
        size="lg"
        contentClassName="min-h-0 overflow-hidden p-0"
      >
        <div className="flex max-h-[70vh] min-h-0 flex-col">
          <div className="border-glass-border text-ink-3 flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 font-mono text-[10px]">
            <span>{finalPromptPreview.length.toLocaleString()} chars</span>
            <span>
              ~{Math.ceil(finalPromptPreview.length / 4).toLocaleString()}{' '}
              tokens
            </span>
            {referencedFeatures.length > 0 && (
              <span>{referencedFeatures.length} feature refs</span>
            )}
            {fileComments.length > 0 && (
              <span>{fileComments.length} comments</span>
            )}
            {files.length > 0 && <span>{files.length} files</span>}
          </div>
          <pre className="text-ink-2 flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {finalPromptPreview}
          </pre>
        </div>
      </Modal>
    </>
  );
}

function resolveDefaultBackend({
  selectedProject,
  backendsSetting,
}: {
  selectedProject: Project | null;
  backendsSetting: {
    enabledBackends: AgentBackendType[];
    defaultBackend: AgentBackendType;
  };
}): AgentBackendType {
  const projectOrGlobalDefault =
    selectedProject?.defaultAgentBackend ?? backendsSetting.defaultBackend;

  if (backendsSetting.enabledBackends.includes(projectOrGlobalDefault)) {
    return projectOrGlobalDefault;
  }

  return backendsSetting.enabledBackends[0] ?? 'claude-code';
}

// Auto-detect input mode based on selection
function getAutoInputMode(
  selectedProjectId: string | null,
  projects: Project[],
): InputMode {
  // Note mode always uses prompt-style input
  if (selectedProjectId === null) return 'prompt';

  const project = projects.find((p) => p.id === selectedProjectId);
  if (!project) return 'prompt';

  // Project with work items linked shows search mode
  if (projectHasWorkItems(project)) return 'search';

  // Project without work items shows prompt mode
  return 'prompt';
}

// Placeholder text based on input mode
function getPlaceholder({
  mode,
  isNoteMode,
}: {
  mode: InputMode;
  isNoteMode: boolean;
}): string {
  if (isNoteMode) return 'Write a note...';
  return mode === 'search' ? 'Search work items...' : 'Describe your task...';
}

function getImageIdentity(image: PromptImagePart): string {
  return `${image.filename ?? ''}:${image.storageData ?? image.data}`;
}

function getProjectGridColumns(): number {
  if (typeof window === 'undefined') return 8;
  if (window.innerWidth >= 1024) return 10;
  if (window.innerWidth >= 640) return 8;
  return 7;
}

export function NewTaskOverlay({
  onClose,
  onDiscardDraft,
}: {
  onClose: () => void;
  onDiscardDraft: () => void;
}) {
  const layer = useKeyboardLayer('overlay', {
    exclusive: true,
    passthrough: ['global-nav'],
  });

  const {
    selectedProjectId,
    draft,
    setSelectedProjectId,
    updateDraft,
    clearDraft,
  } = useNewTaskDraft();

  const { data: projects = [] } = useProjects();
  const reorderProjectsMutation = useReorderProjects();
  const createTaskMutation = useCreateTaskWithWorktree();
  const createNoteMutation = useCreateFeedNote();
  const createVerificationNoteMutation = useCreateWorkItemVerificationNote();
  const deleteBacklogTodo = useDeleteProjectTodo();
  const queryClient = useQueryClient();
  const addRunningJob = useBackgroundJobsStore((state) => state.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore(
    (state) => state.markJobSucceeded,
  );
  const markJobFailed = useBackgroundJobsStore((state) => state.markJobFailed);

  const { data: completionSetting } = useCompletionSetting();
  const { data: promptSnippets = [] } = usePromptSnippetsSetting();

  const searchInputRef = useRef<HTMLTextAreaElement>(null);
  const promptInputRef = useRef<PromptTextareaRef>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const workItemImageFetchSessionRef = useRef(0);
  const [highlightedWorkItemId, setHighlightedWorkItemId] = useState<
    string | null
  >(null);

  // Persisted panel width for work items picker
  const workItemsPanelWidth = useUISetting('workItemsPanelWidth');
  const setUISetting = useUIStore((s) => s.setSetting);
  const handlePanelWidthChange = useCallback(
    (width: number) => setUISetting('workItemsPanelWidth', width),
    [setUISetting],
  );

  const { triggerAnimation } = useShrinkToTarget({
    panelRef,
    targetSelector: '[data-animation-target="jobs-button"]',
  });

  // Prompt template state (not persisted - derived from selections)
  const [promptTemplate, setPromptTemplate] = useState<string>('');

  // Sort projects by sortOrder
  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => a.sortOrder - b.sortOrder),
    [projects],
  );

  // Tab options: null (Note) + project IDs
  const tabOptions = useMemo<(string | null)[]>(
    () => [null, ...sortedProjects.map((p) => p.id)],
    [sortedProjects],
  );

  // Current tab index
  const currentTabIndex = tabOptions.indexOf(selectedProjectId);

  // Selected project object
  const selectedProject = useMemo(
    () =>
      selectedProjectId
        ? (projects.find((p) => p.id === selectedProjectId) ?? null)
        : null,
    [selectedProjectId, projects],
  );
  const snippetVariableContext: SnippetVariableContext = useMemo(
    () => ({
      project: selectedProject
        ? { name: selectedProject.name, path: selectedProject.path }
        : undefined,
    }),
    [selectedProject],
  );
  const { data: projectSkills = [] } = useProjectSkills(
    selectedProjectId ?? undefined,
  );
  const isNoteMode = selectedProjectId === null;
  const { data: selectedProjectFeatureMap = null } =
    useProjectFeatureMap(selectedProjectId);

  // Fetch work items for the selected project (used for navigation)
  const { data: workItems = [] } = useWorkItems({
    providerId: selectedProject?.workItemProviderId ?? '',
    projectId: selectedProject?.workItemProjectId ?? '',
    projectName: selectedProject?.workItemProjectName ?? '',
    filters: {
      excludeWorkItemTypes: ['Test Suite', 'Test Case', 'Epic', 'Feature'],
    },
  });

  const { data: isGitRepository = false, isFetching: isGitRepositoryFetching } =
    useProjectIsGitRepository(selectedProjectId);
  const canCreateWorktree = isGitRepository;

  // Fetch branches for the selected project
  const { data: branchInfos = [], isFetching: branchesFetching } =
    useProjectBranches(canCreateWorktree ? selectedProjectId : null);
  const branches = useMemo(() => branchInfos.map((b) => b.name), [branchInfos]);

  // Fetch active tasks for the selected project (for parent task selection)
  const { data: projectTasks = [] } = useProjectTasks(selectedProjectId ?? '');
  const activeProjectTasks = useMemo(
    () =>
      projectTasks.filter(
        (t) =>
          t.status !== 'completed' && t.status !== 'errored' && t.branchName,
      ),
    [projectTasks],
  );

  // Get selected work items objects
  const selectedWorkItems = useMemo(() => {
    const ids = draft?.workItemIds ?? [];
    return workItems.filter((wi) => ids.includes(wi.id.toString()));
  }, [workItems, draft?.workItemIds]);

  // Fetch comments for selected work items
  const workItemIdNumbers = useMemo(
    () => (draft?.workItemIds ?? []).map(Number).filter((n) => !isNaN(n)),
    [draft?.workItemIds],
  );

  const { data: workItemComments = [], isLoading: isLoadingComments } =
    useWorkItemComments({
      providerId: selectedProject?.workItemProviderId ?? null,
      projectName: selectedProject?.workItemProjectName ?? null,
      workItemIds: workItemIdNumbers,
    });

  // Fetch related test cases for selected work items (used in snippet context)
  const { data: testCasesByWorkItem = {} } = useRelatedTestCasesForWorkItems({
    providerId: selectedProject?.workItemProviderId ?? null,
    projectName: selectedProject?.workItemProjectName ?? null,
    workItemIds: workItemIdNumbers,
  });

  const selectedWorkItemIdsSignature = useMemo(
    () => [...(draft?.workItemIds ?? [])].sort().join(','),
    [draft?.workItemIds],
  );
  const previousSelectedWorkItemIdsSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (previousSelectedWorkItemIdsSignatureRef.current === null) {
      previousSelectedWorkItemIdsSignatureRef.current =
        selectedWorkItemIdsSignature;
      return;
    }

    if (
      previousSelectedWorkItemIdsSignatureRef.current !==
      selectedWorkItemIdsSignature
    ) {
      previousSelectedWorkItemIdsSignatureRef.current =
        selectedWorkItemIdsSignature;
      updateDraft({ selectedCommentIds: undefined });
    }
  }, [selectedWorkItemIdsSignature, updateDraft]);

  // Auto-select all comments when they first load
  useEffect(() => {
    if (
      workItemComments.length > 0 &&
      (draft?.selectedCommentIds === undefined ||
        draft?.selectedCommentIds === null)
    ) {
      updateDraft({
        selectedCommentIds: workItemComments.map(getWorkItemCommentSelectionId),
      });
    }
  }, [workItemComments, draft?.selectedCommentIds, updateDraft]);

  // Input mode from draft, constrained by selection capabilities
  // - note selected: force prompt mode
  // - project without work items: force prompt mode
  // - project with work items: use draft.inputMode
  const canToggleMode =
    selectedProjectId !== null && projectHasWorkItems(selectedProject);
  const inputMode = canToggleMode
    ? (draft?.inputMode ?? 'search')
    : getAutoInputMode(selectedProjectId, projects);

  // Current search step (only relevant in search mode)
  const searchStep = draft?.searchStep ?? 'select';

  // Toggle input mode
  const toggleInputMode = useCallback(() => {
    if (!canToggleMode) return;
    const newMode = inputMode === 'search' ? 'prompt' : 'search';
    updateDraft({ inputMode: newMode });
  }, [inputMode, canToggleMode, updateDraft]);

  // File comments for the selected project
  const fileCommentCount = useComposerFileCommentCount(selectedProjectId ?? '');
  const fileComments = useComposerFileComments(selectedProjectId ?? '');
  const currentCreateWorktree =
    canCreateWorktree && (draft?.createWorktree ?? true);
  const isWorktreeDataFetching =
    isGitRepositoryFetching || (currentCreateWorktree && branchesFetching);

  // Check if we can advance to compose step
  const canAdvanceToCompose = useMemo(() => {
    if (inputMode !== 'search') return false;
    if (searchStep !== 'select') return false;
    return (draft?.workItemIds ?? []).length > 0;
  }, [inputMode, searchStep, draft?.workItemIds]);

  // Check if we can start a task
  const canStartTask = useMemo(() => {
    if (!draft) return false;
    if (selectedProjectId && isWorktreeDataFetching) return false;

    // In search mode compose step, need the expanded prompt
    if (inputMode === 'search' && searchStep === 'compose') {
      const expanded = expandTemplate(promptTemplate, selectedWorkItems);
      return !!expanded.trim() && !!selectedProjectId;
    }

    // In prompt mode, need text (or file comments) and a project
    if (inputMode === 'prompt') {
      const hasPrompt = !!(draft.prompt ?? '').trim();
      const hasFileComments = fileCommentCount > 0;
      return (hasPrompt || hasFileComments) && !!selectedProjectId;
    }

    return false;
  }, [
    draft,
    inputMode,
    searchStep,
    promptTemplate,
    selectedWorkItems,
    selectedProjectId,
    isWorktreeDataFetching,
    fileCommentCount,
  ]);

  // Navigate project tabs
  const navigateTab = useCallback(
    (direction: 'next' | 'prev') => {
      const newIndex =
        direction === 'next'
          ? (currentTabIndex + 1) % tabOptions.length
          : (currentTabIndex - 1 + tabOptions.length) % tabOptions.length;
      setSelectedProjectId(tabOptions[newIndex]);
    },
    [currentTabIndex, tabOptions, setSelectedProjectId],
  );

  const navigateTabRow = useCallback(
    (direction: 'up' | 'down') => {
      if (currentTabIndex < 0) return;

      const columns = getProjectGridColumns();
      const newIndex =
        direction === 'up'
          ? Math.max(0, currentTabIndex - columns)
          : Math.min(tabOptions.length - 1, currentTabIndex + columns);

      setSelectedProjectId(tabOptions[newIndex]);
    },
    [currentTabIndex, tabOptions, setSelectedProjectId],
  );

  // Toggle worktree checkbox
  const currentUpdateWorkItemStatus = draft?.updateWorkItemStatus ?? true;
  const currentShowFileExplorer = draft?.showFileExplorer ?? false;
  const toggleWorktree = useCallback(
    (checked: boolean) => {
      updateDraft({ createWorktree: checked });
    },
    [updateDraft],
  );

  // Handle branch or parent task selection
  const handleBranchOrTaskChange = useCallback(
    (selection: BranchOrTaskSelection) => {
      if (selection.type === 'task') {
        updateDraft({
          parentTaskId: selection.taskId,
          sourceBranch: selection.taskBranch || null,
        });
      } else {
        updateDraft({
          parentTaskId: null,
          sourceBranch: selection.branch,
        });
      }
    },
    [updateDraft],
  );

  // Enabled backends from settings
  const { data: backendsSetting } = useBackendsSetting();
  const { data: backendDefaultModelsSetting } =
    useBackendDefaultModelsSetting();
  const { data: backendModelPresets = [] } = useBackendModelPresetsSetting();
  const { data: thinkingSettings } = useThinkingSettingsSetting();

  const defaultBackend = useMemo(() => {
    if (!backendsSetting) {
      return selectedProject?.defaultAgentBackend ?? 'claude-code';
    }

    return resolveDefaultBackend({
      selectedProject,
      backendsSetting,
    });
  }, [selectedProject, backendsSetting]);

  const currentBackend = useMemo(() => {
    const draftBackend = draft?.agentBackend;

    if (!draftBackend) {
      return defaultBackend;
    }

    if (!backendsSetting) {
      return draftBackend;
    }

    return backendsSetting.enabledBackends.includes(draftBackend)
      ? draftBackend
      : defaultBackend;
  }, [draft?.agentBackend, defaultBackend, backendsSetting]);

  const { data: dynamicModels } = useBackendModels(currentBackend);

  const availableModelPreferences = useMemo(
    () =>
      getModelsForBackend(currentBackend, dynamicModels).map(
        (model) => model.value,
      ),
    [currentBackend, dynamicModels],
  );

  const currentInteractionMode = normalizeInteractionModeForBackend({
    backend: currentBackend,
    mode: draft?.interactionMode ?? 'ask',
  });
  const currentBackendPresetId =
    draft?.shouldAutoSelectBackendModelPreset === false
      ? (draft.backendModelPresetId ?? null)
      : (draft?.backendModelPresetId ??
        findMatchingBackendModelPresetId({
          presets: backendModelPresets,
          backend:
            draft?.agentBackend ??
            selectedProject?.defaultAgentBackend ??
            currentBackend,
          model:
            draft?.modelPreference ??
            ((draft?.agentBackend ??
            selectedProject?.defaultAgentBackend ??
            currentBackend)
              ? getDefaultModelForBackend({
                  backend:
                    draft?.agentBackend ??
                    selectedProject?.defaultAgentBackend ??
                    currentBackend,
                  project: selectedProject,
                  backendDefaultModels: backendDefaultModelsSetting,
                })
              : undefined),
        }));
  const currentBackendModelPreset = currentBackendPresetId
    ? backendModelPresets.find((preset) => preset.id === currentBackendPresetId)
    : null;
  const currentModelPreference = useMemo(() => {
    const draftModelPreference =
      draft?.modelPreference ??
      getDefaultModelForBackend({
        backend: currentBackend,
        project: selectedProject,
        backendDefaultModels: backendDefaultModelsSetting,
      });

    if (currentBackendPresetId) {
      return draftModelPreference;
    }

    return availableModelPreferences.includes(draftModelPreference)
      ? draftModelPreference
      : 'default';
  }, [
    backendDefaultModelsSetting,
    currentBackend,
    currentBackendPresetId,
    draft?.modelPreference,
    availableModelPreferences,
    selectedProject,
  ]);
  const thinkingCapabilities = getModelThinkingCapabilities(
    currentModelPreference,
    dynamicModels,
  );
  const thinkingOptions = getThinkingEffortOptions({
    backend: currentBackend,
    model: currentModelPreference,
    capabilities: thinkingCapabilities,
  });
  const currentThinkingEffort = useMemo<ThinkingEffort>(() => {
    const configuredEffort =
      draft?.thinkingEffort ??
      currentBackendModelPreset?.thinkingEffort ??
      thinkingSettings?.efforts[currentBackend]?.[currentModelPreference] ??
      thinkingSettings?.efforts[currentBackend]?.default ??
      'default';

    return normalizeThinkingEffortForModel({
      backend: currentBackend,
      model: currentModelPreference,
      effort: configuredEffort,
      capabilities: thinkingCapabilities,
    });
  }, [
    draft?.thinkingEffort,
    currentBackendModelPreset?.thinkingEffort,
    thinkingSettings,
    currentBackend,
    currentModelPreference,
    thinkingCapabilities,
  ]);

  const currentSourceBranch = useMemo(() => {
    const draftSourceBranch = draft?.sourceBranch;
    if (draftSourceBranch && branches.includes(draftSourceBranch)) {
      return draftSourceBranch;
    }

    const projectDefaultBranch = selectedProject?.defaultBranch;
    if (projectDefaultBranch && branches.includes(projectDefaultBranch)) {
      return projectDefaultBranch;
    }

    return branches[0] ?? null;
  }, [draft?.sourceBranch, selectedProject?.defaultBranch, branches]);

  // Toggle selection of highlighted work item
  const toggleHighlightedWorkItem = useCallback(() => {
    if (!highlightedWorkItemId) return;
    updateDraft((prev) => {
      const currentIds = prev?.workItemIds ?? [];
      const newIds = currentIds.includes(highlightedWorkItemId)
        ? currentIds.filter((id) => id !== highlightedWorkItemId)
        : [...currentIds, highlightedWorkItemId];
      return { workItemIds: newIds };
    });
  }, [highlightedWorkItemId, updateDraft]);

  // Open highlighted work item in browser
  const openHighlightedWorkItem = useCallback(() => {
    if (!highlightedWorkItemId) return;
    const workItem = workItems.find(
      (wi) => wi.id.toString() === highlightedWorkItemId,
    );
    if (workItem?.url) {
      window.open(workItem.url, '_blank');
    }
  }, [workItems, highlightedWorkItemId]);

  // Handle work item toggle from list click
  const handleWorkItemToggle = useCallback(
    (workItem: AzureDevOpsWorkItem) => {
      const workItemId = workItem.id.toString();
      updateDraft((prev) => {
        const currentIds = prev?.workItemIds ?? [];
        const newIds = currentIds.includes(workItemId)
          ? currentIds.filter((id) => id !== workItemId)
          : [...currentIds, workItemId];
        return { workItemIds: newIds };
      });
    },
    [updateDraft],
  );

  const handleClearSelectedWorkItems = useCallback(() => {
    updateDraft({ workItemIds: [] });
  }, [updateDraft]);

  // Track whether work item images are being fetched
  const [isFetchingWorkItemImages, setIsFetchingWorkItemImages] =
    useState(false);

  // Advance to compose step and extract work item images
  const advanceToCompose = useCallback(async () => {
    if (!canAdvanceToCompose) return;
    const template = generateInitialTemplate(draft?.workItemIds ?? []);
    setPromptTemplate(template);
    updateDraft({ searchStep: 'compose' });

    // Extract and fetch images from work item HTML in background
    const providerId = selectedProject?.workItemProviderId;
    if (!providerId) return;

    const imageUrls = extractWorkItemImageUrls(selectedWorkItems);
    if (imageUrls.length === 0) return;

    // Fetch images in parallel (limit to 5 max, matching the prompt textarea limit)
    const existingImages = draft?.images ?? [];
    const slotsAvailable = 5 - existingImages.length;
    if (slotsAvailable <= 0) return;

    const urlsToFetch = imageUrls.slice(0, slotsAvailable);
    const fetchSessionId = ++workItemImageFetchSessionRef.current;
    const draftKey = selectedProjectId ?? 'all';

    setIsFetchingWorkItemImages(true);
    try {
      const fetchedImages = await Promise.all(
        urlsToFetch.map(async (imageUrl) => {
          if (workItemImageFetchSessionRef.current !== fetchSessionId) {
            return null;
          }

          try {
            const result = await window.api.azureDevOps.fetchImageAsBase64({
              providerId,
              imageUrl,
            });
            if (!result) return null;

            if (workItemImageFetchSessionRef.current !== fetchSessionId) {
              return null;
            }

            // Convert base64 to Blob for compression
            const raw = Uint8Array.from(atob(result.data), (c) =>
              c.charCodeAt(0),
            );
            const blob = new Blob([raw], { type: result.mimeType });

            // Compress using existing image compression utility
            const compressed = await compressImage(blob);

            // Extract filename from URL
            const urlObj = new URL(imageUrl);
            const fileName =
              urlObj.searchParams.get('fileName') ?? 'work-item-image';

            return {
              type: 'image' as const,
              data: compressed.agent.data,
              mimeType: compressed.agent.mimeType,
              filename: fileName,
              storageData: compressed.storage.data,
              storageMimeType: compressed.storage.mimeType,
            };
          } catch (error) {
            console.error('Failed to fetch work item image:', imageUrl, error);
            return null;
          }
        }),
      );

      const validImages: PromptImagePart[] = fetchedImages.filter(
        (img) => img !== null,
      );

      if (validImages.length > 0) {
        if (workItemImageFetchSessionRef.current !== fetchSessionId) {
          return;
        }

        const state = useNewTaskDraftStore.getState();
        const latestDraft = state.drafts[draftKey];

        if (!latestDraft || latestDraft.searchStep !== 'compose') {
          return;
        }

        const latestImages = latestDraft.images ?? [];
        const remainingSlots = 5 - latestImages.length;
        if (remainingSlots <= 0) {
          return;
        }

        const existingImageIds = new Set(latestImages.map(getImageIdentity));
        const imagesToAppend: PromptImagePart[] = [];

        for (const image of validImages) {
          const identity = getImageIdentity(image);
          if (existingImageIds.has(identity)) {
            continue;
          }

          existingImageIds.add(identity);
          imagesToAppend.push(image);

          if (imagesToAppend.length >= remainingSlots) {
            break;
          }
        }

        if (imagesToAppend.length > 0) {
          state.setDraft(draftKey, {
            images: [...latestImages, ...imagesToAppend],
          });
        }
      }
    } finally {
      if (workItemImageFetchSessionRef.current === fetchSessionId) {
        setIsFetchingWorkItemImages(false);
      }
    }
  }, [
    canAdvanceToCompose,
    draft?.workItemIds,
    draft?.images,
    selectedProjectId,
    selectedWorkItems,
    selectedProject?.workItemProviderId,
    updateDraft,
  ]);

  // Go back to select step
  const backToSelect = useCallback(() => {
    workItemImageFetchSessionRef.current += 1;
    setIsFetchingWorkItemImages(false);
    updateDraft({ searchStep: 'select' });
  }, [updateDraft]);

  // Comment selection handlers
  const handleCommentToggle = useCallback(
    (commentSelectionId: string) => {
      updateDraft((prev) => {
        const current = prev?.selectedCommentIds ?? [];
        const next = current.includes(commentSelectionId)
          ? current.filter((id) => id !== commentSelectionId)
          : [...current, commentSelectionId];
        return { selectedCommentIds: next };
      });
    },
    [updateDraft],
  );

  const handleSelectAllComments = useCallback(() => {
    updateDraft({
      selectedCommentIds: workItemComments.map(getWorkItemCommentSelectionId),
    });
  }, [workItemComments, updateDraft]);

  const handleDeselectAllComments = useCallback(() => {
    updateDraft({ selectedCommentIds: [] });
  }, [updateDraft]);

  // Start task handler
  const handleStartTask = useCallback(async () => {
    if (!canStartTask || !draft || !selectedProjectId) return;

    try {
      // Determine the final prompt
      let finalPrompt: string;
      let workItemIds: string[] | null = null;
      let workItemUrls: string[] | null = null;

      if (inputMode === 'search' && searchStep === 'compose') {
        // Expand the template to get the final prompt
        // Use Handlebars if template contains `{{`, otherwise use old {#id} regex
        if (promptTemplate.includes('{{')) {
          const selectedComments = workItemComments.filter((c) =>
            (draft.selectedCommentIds ?? []).includes(
              getWorkItemCommentSelectionId(c),
            ),
          );
          const workItemsContext = buildWorkItemSnippetContext({
            workItems: selectedWorkItems,
            comments: selectedComments,
            testCasesByWorkItem,
          });
          const result = resolveSnippetTemplate(promptTemplate, {
            ...snippetVariableContext,
            workItems: workItemsContext,
          });
          finalPrompt = result.output;
        } else {
          const selectedComments = workItemComments.filter((c) =>
            (draft.selectedCommentIds ?? []).includes(
              getWorkItemCommentSelectionId(c),
            ),
          );
          finalPrompt = expandTemplate(
            promptTemplate,
            selectedWorkItems,
            selectedComments,
          );
        }
        workItemIds = draft.workItemIds ?? null;
        workItemUrls = selectedWorkItems.map((wi) => wi.url);
      } else {
        finalPrompt = draft.prompt ?? '';
      }

      let draftImages: PromptImagePart[] | undefined =
        draft.images && draft.images.length > 0 ? draft.images : undefined;
      const draftFiles = draft?.files ?? [];

      // Append synthesized file comments to prompt
      const fileContextParts = synthesizeFileCommentsPrompt(
        fileComments,
        selectedProject?.path,
      );
      if (fileContextParts) {
        const textPart = fileContextParts.find((p) => p.type === 'text');
        if (textPart && textPart.type === 'text') {
          finalPrompt = finalPrompt.trim()
            ? `${finalPrompt}\n\n${textPart.text}`
            : textPart.text;
        }
        const commentImages = fileContextParts.filter(
          (p): p is PromptImagePart => p.type === 'image',
        );
        if (commentImages.length > 0) {
          draftImages = [...(draftImages ?? []), ...commentImages];
        }
      }

      // Append file attachment references to prompt text
      finalPrompt = expandFeatureReferencesInPrompt({
        text: finalPrompt,
        featureMap: selectedProjectFeatureMap,
      });
      finalPrompt += buildAttachedFilesXml(draftFiles);

      const backlogTodoIds = draft.backlogTodoIds ?? [];

      const jobId = addRunningJob({
        type: 'task-creation',
        title: `Creating task in ${selectedProject?.name ?? 'project'}`,
        projectId: selectedProjectId,
        details: {
          projectName: selectedProject?.name ?? null,
          promptPreview: finalPrompt.slice(0, 120),
          backlogTodoIds,
          creationInput: {
            projectId: selectedProjectId,
            prompt: finalPrompt,
            interactionMode: currentInteractionMode,
            agentBackend: currentBackend,
            modelPreference: currentModelPreference,
            thinkingEffort: currentThinkingEffort,
            useWorktree: currentCreateWorktree,
            sourceBranch: currentCreateWorktree ? currentSourceBranch : null,
            workItemIds,
            workItemUrls,
            updateWorkItemStatus: currentUpdateWorkItemStatus,
            updatedAt: new Date().toISOString(),
            autoStart: true,
          },
        },
      });

      // Animate the overlay shrinking toward the Jobs button, then reset
      // the draft so the overlay shows a fresh state for chaining
      workItemImageFetchSessionRef.current += 1;
      setIsFetchingWorkItemImages(false);
      void triggerAnimation();
      clearDraft();
      // Clear file comments for this project
      if (selectedProjectId) {
        useComposerFileCommentsStore
          .getState()
          .clearComments(selectedProjectId);
      }

      // Refocus the input for the next task
      setTimeout(() => {
        if (inputMode === 'prompt') {
          promptInputRef.current?.focus();
          return;
        }
        searchInputRef.current?.focus();
      }, 50);

      void createTaskMutation
        .mutateAsync({
          projectId: selectedProjectId,
          prompt: finalPrompt,
          images: draftImages,
          interactionMode: currentInteractionMode,
          modelPreference: currentModelPreference,
          thinkingEffort: currentThinkingEffort,
          agentBackend: currentBackend,
          useWorktree: currentCreateWorktree,
          sourceBranch: currentCreateWorktree ? currentSourceBranch : null,
          workItemIds,
          workItemUrls,
          updateWorkItemStatus: currentUpdateWorkItemStatus,
          parentTaskId: draft?.parentTaskId ?? null,
          updatedAt: new Date().toISOString(),
          autoStart: true,
        })
        .then((task) => {
          markJobSucceeded(jobId, {
            taskId: task.id,
            projectId: task.projectId,
          });
          queryClient.invalidateQueries({ queryKey: ['tasks'] });
          queryClient.invalidateQueries({
            queryKey: ['tasks', { projectId: task.projectId }],
          });

          // Clean up backlog todos if this task was converted from them
          for (const id of backlogTodoIds) {
            deleteBacklogTodo.mutate(id, {
              onError: (err) =>
                console.error(`Failed to delete backlog item ${id}:`, err),
            });
          }
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Failed to create task';
          markJobFailed(jobId, message);
        });
    } catch (error) {
      console.error('Failed to create task:', error);
      // Keep overlay open on error (draft preserved)
    }
  }, [
    canStartTask,
    draft,
    selectedProjectId,
    inputMode,
    searchStep,
    promptTemplate,
    selectedWorkItems,
    workItemComments,
    snippetVariableContext,
    testCasesByWorkItem,
    selectedProject?.name,
    selectedProject?.path,
    selectedProjectFeatureMap,
    currentBackend,
    currentInteractionMode,
    currentModelPreference,
    currentThinkingEffort,
    currentCreateWorktree,
    currentUpdateWorkItemStatus,
    currentSourceBranch,
    fileComments,
    addRunningJob,
    createTaskMutation,
    deleteBacklogTodo,
    clearDraft,
    queryClient,
    markJobSucceeded,
    markJobFailed,
    triggerAnimation,
  ]);

  const handleCreateNote = useCallback(async () => {
    const content = (draft?.prompt ?? '').trim();
    if (!content) return;

    try {
      await createNoteMutation.mutateAsync({ content });
      clearDraft();
      setTimeout(() => {
        promptInputRef.current?.focus();
      }, 50);
    } catch (error) {
      console.error('Failed to create note:', error);
    }
  }, [draft?.prompt, createNoteMutation, clearDraft]);

  const handleCreateVerificationNote = useCallback(async () => {
    if (selectedWorkItems.length === 0) return;

    const workItemTitles = selectedWorkItems.map((workItem) =>
      workItem.fields.title.slice(0, 80),
    );
    const creationInput = {
      backend: currentBackend,
      model: currentModelPreference,
      projectAiSkillSlots: selectedProject?.aiSkillSlots ?? null,
      workItems: selectedWorkItems.map((workItem) => ({
        id: workItem.id,
        title: workItem.fields.title,
        workItemType: workItem.fields.workItemType,
        state: workItem.fields.state,
        description: workItem.fields.description,
        reproSteps: workItem.fields.reproSteps,
      })),
      testCasesByWorkItem,
    };
    const jobId = addRunningJob({
      type: 'verification-note',
      title: 'Generating verification note',
      details: {
        workItemCount: selectedWorkItems.length,
        workItemTitles,
      },
    });

    void triggerAnimation();
    clearDraft();
    onClose();

    void createVerificationNoteMutation
      .mutateAsync(creationInput)
      .then((note) => {
        markJobSucceeded(jobId, { noteId: note.id });
        queryClient.invalidateQueries({ queryKey: feedQueryKeys.tasks });
        queryClient.invalidateQueries({ queryKey: feedQueryKeys.workItems });
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to create verification note';
        markJobFailed(jobId, message);
      });
  }, [
    selectedWorkItems,
    testCasesByWorkItem,
    currentBackend,
    currentModelPreference,
    selectedProject?.aiSkillSlots,
    addRunningJob,
    createVerificationNoteMutation,
    clearDraft,
    onClose,
    triggerAnimation,
    markJobSucceeded,
    queryClient,
    markJobFailed,
  ]);

  // Handle Cmd+Enter based on current state
  const handleCmdEnter = useCallback(() => {
    if (isNoteMode) {
      void handleCreateNote();
      return;
    }

    if (inputMode === 'search' && searchStep === 'select') {
      // In select step, advance to compose
      advanceToCompose();
    } else {
      // In compose or prompt mode, start task
      handleStartTask();
    }
  }, [
    isNoteMode,
    inputMode,
    searchStep,
    handleCreateNote,
    advanceToCompose,
    handleStartTask,
  ]);

  // Handle Escape based on current state
  const handleEscape = useCallback(() => {
    if (inputMode === 'search' && searchStep === 'compose') {
      // In compose step, go back to select
      backToSelect();
    } else {
      // Otherwise close overlay
      onClose();
    }
  }, [inputMode, searchStep, backToSelect, onClose]);

  // Show search input only in select step
  const showSearchInput = inputMode === 'search' && searchStep === 'select';
  const showPromptInput = isNoteMode || inputMode === 'prompt';

  // Focus input on mount
  useEffect(() => {
    if (showPromptInput) {
      promptInputRef.current?.focus();
      return;
    }
    searchInputRef.current?.focus();
  }, [showPromptInput]);

  // Handle input change
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      // Clear error when user starts typing
      if (createTaskMutation.isError) {
        createTaskMutation.reset();
      }
      if (inputMode === 'search') {
        updateDraft({ workItemsFilter: e.target.value });
      } else {
        updateDraft({ prompt: e.target.value });
      }
    },
    [inputMode, updateDraft, createTaskMutation],
  );

  const handlePromptChange = useCallback(
    (nextPrompt: string) => {
      if (createTaskMutation.isError) {
        createTaskMutation.reset();
      }
      updateDraft({ prompt: nextPrompt });
    },
    [createTaskMutation, updateDraft],
  );

  const handleImageAttach = useCallback(
    (image: PromptImagePart) => {
      updateDraft((prev) => ({
        images: [...(prev?.images ?? []), image],
      }));
    },
    [updateDraft],
  );

  const handleImageRemove = useCallback(
    (index: number) => {
      updateDraft((prev) => ({
        images: (prev?.images ?? []).filter((_, i) => i !== index),
      }));
    },
    [updateDraft],
  );

  const handleFileAttach = useCallback(
    (file: PromptFilePart) => {
      updateDraft((prev) => ({
        files: [...(prev?.files ?? []), file],
      }));
    },
    [updateDraft],
  );

  const handleFileRemove = useCallback(
    (index: number) => {
      updateDraft((prev) => ({
        files: (prev?.files ?? []).filter((_, i) => i !== index),
      }));
    },
    [updateDraft],
  );

  // Get current input value
  const inputValue =
    inputMode === 'search'
      ? (draft?.workItemsFilter ?? '')
      : (draft?.prompt ?? '');

  // Register keyboard shortcuts
  useCommands(
    'new-task-overlay',
    [
      {
        label: 'Close New Task Overlay',
        shortcut: 'cmd+n',
        handler: () => {
          onClose();
        },
      },
      {
        label: 'Close or Go Back',
        shortcut: 'escape',
        handler: () => {
          handleEscape();
        },
      },
      {
        label: 'Discard Draft and Close',
        shortcut: 'cmd+shift+escape',
        handler: () => {
          onDiscardDraft();
        },
      },
      !isNoteMode &&
        canCreateWorktree && {
          label: 'Toggle Worktree',
          shortcut: 'cmd+b',
          handler: () => {
            toggleWorktree(!currentCreateWorktree);
          },
        },
      !isNoteMode &&
        !!selectedProjectId && {
          label: 'Toggle File Explorer',
          shortcut: 'cmd+e',
          handler: () => {
            updateDraft({ showFileExplorer: !currentShowFileExplorer });
          },
        },
      {
        label: 'Next / Submit',
        shortcut: 'cmd+enter',
        handler: () => {
          handleCmdEnter();
        },
      },
      {
        label: 'Navigate to Next Project Tab',
        shortcut: 'cmd+right',
        handler: () => {
          navigateTab('next');
        },
      },
      {
        label: 'Navigate to Previous Project Tab',
        shortcut: 'cmd+left',
        handler: () => {
          navigateTab('prev');
        },
      },
      {
        label: 'Navigate to Previous Project Grid Item',
        shortcut: 'cmd+up',
        handler: () => {
          navigateTabRow('up');
        },
      },
      {
        label: 'Navigate to Next Project Grid Item',
        shortcut: 'cmd+down',
        handler: () => {
          navigateTabRow('down');
        },
      },
      inputMode === 'search' &&
        searchStep === 'select' && {
          label: 'Toggle Work Item Selection',
          shortcut: 'enter',
          handler: () => {
            toggleHighlightedWorkItem();
          },
        },
      inputMode === 'search' &&
        searchStep === 'select' && {
          label: 'Open Highlighted Work Item in Browser',
          shortcut: 'cmd+shift+o',
          handler: () => {
            openHighlightedWorkItem();
          },
        },
      canToggleMode && {
        label: 'Toggle Input Mode',
        shortcut: 'cmd+m',
        handler: () => {
          toggleInputMode();
        },
      },
    ],
    { layer },
  );

  // Handle clicking outside to close
  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  // Prevent clicks inside the modal from closing
  const handleModalClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  // Prevent Enter in search mode select step (in prompt mode it adds newline)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        e.key === 'Enter' &&
        inputMode === 'search' &&
        searchStep === 'select'
      ) {
        e.preventDefault();
      }
    },
    [inputMode, searchStep],
  );

  return createPortal(
    <KeyboardLayerProvider layer={layer}>
      <FocusLock returnFocus>
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
          onClick={handleOverlayClick}
        >
          <div
            ref={panelRef}
            className="flex max-h-[86svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-[14px] border border-white/10"
            style={{
              background: `
            radial-gradient(ellipse 700px 500px at 10% -10%, oklch(0.55 0.22 295 / 0.32), transparent 55%),
            radial-gradient(ellipse 600px 420px at 110% 110%, oklch(0.55 0.18 205 / 0.25), transparent 55%),
            oklch(0.14 0.015 280 / 0.94)
          `,
              backdropFilter: 'blur(40px) saturate(140%)',
              boxShadow:
                '0 30px 80px oklch(0 0 0 / 0.55), inset 0 0 0 1px oklch(1 0 0 / 0.04)',
            }}
            onClick={handleModalClick}
          >
            {/* Search/Prompt input - only show in select or prompt mode */}
            {showSearchInput && (
              <div
                className="flex shrink-0 items-center gap-2.5 px-[18px] py-3.5"
                style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}
              >
                <Search
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: 'oklch(0.55 0.01 280)' }}
                />
                <textarea
                  ref={searchInputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={getPlaceholder({ mode: inputMode, isNoteMode })}
                  className="text-ink-1 placeholder-ink-3 field-sizing-content max-h-[40svh] min-h-[1lh] flex-1 resize-none bg-transparent text-sm outline-none"
                  style={{
                    caretColor: 'oklch(0.78 0.18 295)',
                    letterSpacing: '-0.005em',
                  }}
                />
              </div>
            )}
            {showPromptInput && (
              <div className="flex shrink-0 flex-col">
                <div className="flex flex-1 flex-col">
                  <PromptTextarea
                    ref={promptInputRef}
                    value={inputValue}
                    onChange={handlePromptChange}
                    onKeyDown={handleKeyDown}
                    placeholder={getPlaceholder({
                      mode: inputMode,
                      isNoteMode,
                    })}
                    skills={projectSkills}
                    showCommands={false}
                    maxHeight={320}
                    projectRoot={selectedProject?.path ?? null}
                    enableFilePathAutocomplete
                    enableCompletion={completionSetting?.enabled ?? false}
                    projectId={selectedProject?.id}
                    featureMap={selectedProjectFeatureMap}
                    images={draft?.images}
                    onImageAttach={handleImageAttach}
                    onImageRemove={handleImageRemove}
                    files={draft?.files}
                    onFileAttach={handleFileAttach}
                    onFileRemove={handleFileRemove}
                    promptSnippets={promptSnippets}
                    snippetVariableContext={snippetVariableContext}
                    containerClassName={`px-[18px] pt-3.5 ${selectedProject ? 'pb-2' : 'pb-3.5'}`}
                    className="text-ink-1 placeholder-ink-3 border-transparent bg-transparent px-0 py-0 text-sm focus:border-transparent focus:ring-0 focus:outline-none"
                  />
                  {!isNoteMode && selectedProject && (
                    <div className="px-[18px] pb-3.5">
                      <FinalPromptPreviewButton
                        prompt={inputValue}
                        projectRoot={selectedProject.path}
                        featureMap={selectedProjectFeatureMap}
                        fileComments={fileComments}
                        files={draft?.files ?? []}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Project grid - only show in select or prompt mode */}
            {(showSearchInput || showPromptInput) && (
              <ProjectGrid
                sortedProjects={sortedProjects}
                selectedProjectId={selectedProjectId}
                onSelectProject={setSelectedProjectId}
                onReorderProjects={(orderedIds) =>
                  reorderProjectsMutation.mutate(orderedIds)
                }
              />
            )}

            {/* File explorer (toggleable in prompt mode) */}
            {currentShowFileExplorer &&
              selectedProject &&
              inputMode === 'prompt' && (
                <div
                  className="flex flex-1 flex-col overflow-hidden"
                  style={{
                    borderTop: '1px solid oklch(1 0 0 / 0.04)',
                    minHeight: 200,
                  }}
                >
                  <ComposerFileExplorer
                    projectId={selectedProject.id}
                    projectRoot={selectedProject.path}
                  />
                </div>
              )}

            {/* Main content area */}
            {inputMode === 'search' && searchStep === 'select' && (
              <div className="flex h-full w-full grow flex-col overflow-hidden p-2">
                <SearchModeContent
                  project={selectedProject}
                  filter={draft?.workItemsFilter ?? ''}
                  selectedWorkItemIds={draft?.workItemIds ?? []}
                  viewMode={draft?.workItemsViewMode ?? 'board'}
                  onViewModeChange={(mode: WorkItemsViewMode) =>
                    updateDraft({ workItemsViewMode: mode })
                  }
                  iterationFilter={
                    draft?.workItemsIterationFilter ?? '__current__'
                  }
                  onIterationFilterChange={(iterationFilter) =>
                    updateDraft({ workItemsIterationFilter: iterationFilter })
                  }
                  onWorkItemToggle={handleWorkItemToggle}
                  onClearSelectedWorkItems={handleClearSelectedWorkItems}
                  onHighlightChange={setHighlightedWorkItemId}
                  panelWidth={workItemsPanelWidth}
                  onPanelWidthChange={handlePanelWidthChange}
                  onAdvanceToCompose={advanceToCompose}
                  canAdvance={canAdvanceToCompose}
                />
              </div>
            )}

            {inputMode === 'search' && searchStep === 'compose' && (
              <div className="flex h-full w-full grow flex-col overflow-hidden">
                <PromptComposer
                  template={promptTemplate}
                  workItems={selectedWorkItems}
                  onTemplateChange={setPromptTemplate}
                  onBack={backToSelect}
                  images={draft?.images}
                  isFetchingImages={isFetchingWorkItemImages}
                  onImageAttach={handleImageAttach}
                  onImageRemove={handleImageRemove}
                  files={draft?.files}
                  onFileAttach={handleFileAttach}
                  onFileRemove={handleFileRemove}
                  projectRoot={selectedProject?.path ?? null}
                  comments={workItemComments}
                  selectedCommentIds={draft?.selectedCommentIds ?? []}
                  onCommentToggle={handleCommentToggle}
                  onSelectAllComments={handleSelectAllComments}
                  onDeselectAllComments={handleDeselectAllComments}
                  isLoadingComments={isLoadingComments}
                  snippets={promptSnippets}
                  snippetVariableContext={snippetVariableContext}
                  testCasesByWorkItem={testCasesByWorkItem}
                  featureMap={selectedProjectFeatureMap}
                />
              </div>
            )}

            {/* Footer */}
            <div
              className="flex min-h-[50px] shrink-0 flex-wrap items-center gap-2 overflow-hidden px-3.5 py-2.5"
              style={{
                borderTop: '1px solid oklch(1 0 0 / 0.06)',
                background: 'oklch(0 0 0 / 0.28)',
              }}
            >
              <div className="flex items-center gap-2">
                {/* Interaction mode selector */}
                {!isNoteMode && (
                  <ModeSelector
                    value={currentInteractionMode}
                    onChange={(mode) => updateDraft({ interactionMode: mode })}
                    backend={currentBackend}
                    shortcut="cmd+i"
                    side="top"
                    layer={layer}
                  />
                )}

                {/* Agent backend selector — only show when multiple backends enabled */}
                {!isNoteMode && (
                  <BackendModelPresetPicker
                    backend={currentBackend}
                    model={currentModelPreference}
                    selectedPresetId={currentBackendPresetId}
                    backendShortcut="cmd+j"
                    modelShortcut="cmd+l"
                    side="top"
                    layer={layer}
                    onChange={(selection) => {
                      const normalizedMode = normalizeInteractionModeForBackend(
                        {
                          backend: selection.backend,
                          mode: currentInteractionMode,
                        },
                      );
                      const nextThinkingCapabilities =
                        getModelThinkingCapabilities(
                          selection.model,
                          dynamicModels,
                        );

                      updateDraft({
                        agentBackend: selection.backend,
                        backendModelPresetId: selection.presetId,
                        shouldAutoSelectBackendModelPreset:
                          selection.presetId !== null,
                        interactionMode: normalizedMode,
                        modelPreference: selection.model,
                        thinkingEffort: normalizeThinkingEffortForModel({
                          backend: selection.backend,
                          model: selection.model,
                          effort:
                            selection.thinkingEffort ??
                            thinkingSettings?.efforts[selection.backend]?.[
                              selection.model
                            ] ??
                            thinkingSettings?.efforts[selection.backend]
                              ?.default ??
                            'default',
                          capabilities: nextThinkingCapabilities,
                        }),
                      });
                    }}
                  />
                )}

                {!isNoteMode && (
                  <ThinkingSelector
                    value={currentThinkingEffort}
                    onChange={(thinkingEffort) =>
                      updateDraft({ thinkingEffort })
                    }
                    options={thinkingOptions}
                    disabled={thinkingOptions.length <= 1}
                    side="top"
                    layer={layer}
                  />
                )}

                {!isNoteMode && canCreateWorktree && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={currentCreateWorktree}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 py-[5px] text-xs font-medium"
                    style={
                      currentCreateWorktree
                        ? {
                            background:
                              'color-mix(in oklch, oklch(0.78 0.18 295) 14%, transparent)',
                            border:
                              '1px solid color-mix(in oklch, oklch(0.78 0.18 295) 30%, transparent)',
                            color: 'oklch(0.78 0.18 295)',
                          }
                        : {
                            background: 'oklch(1 0 0 / 0.03)',
                            border: '1px solid oklch(1 0 0 / 0.07)',
                            color: 'oklch(0.78 0.01 280)',
                          }
                    }
                    onClick={() => toggleWorktree(!currentCreateWorktree)}
                  >
                    <ToolCheckmark checked={currentCreateWorktree} />
                    Worktree
                    <Kbd shortcut="cmd+b" />
                  </button>
                )}

                {!isNoteMode && selectedProjectId && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={currentShowFileExplorer}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 py-[5px] text-xs font-medium"
                    style={
                      currentShowFileExplorer
                        ? {
                            background:
                              'color-mix(in oklch, oklch(0.78 0.18 295) 14%, transparent)',
                            border:
                              '1px solid color-mix(in oklch, oklch(0.78 0.18 295) 30%, transparent)',
                            color: 'oklch(0.78 0.18 295)',
                          }
                        : {
                            background: 'oklch(1 0 0 / 0.03)',
                            border: '1px solid oklch(1 0 0 / 0.07)',
                            color: 'oklch(0.78 0.01 280)',
                          }
                    }
                    onClick={() =>
                      updateDraft({
                        showFileExplorer: !currentShowFileExplorer,
                      })
                    }
                  >
                    <ToolCheckmark checked={currentShowFileExplorer} />
                    Files
                    {fileCommentCount > 0 && (
                      <span
                        className="rounded-full px-1.5 py-px text-[10px] leading-none font-medium"
                        style={{
                          background:
                            'color-mix(in oklch, oklch(0.78 0.18 295) 24%, transparent)',
                        }}
                      >
                        {fileCommentCount}
                      </span>
                    )}
                    <Kbd shortcut="cmd+e" />
                  </button>
                )}

                {!isNoteMode && selectedWorkItems.length > 0 && (
                  <button
                    type="button"
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 py-[5px] text-xs font-medium"
                    style={{
                      background: 'oklch(1 0 0 / 0.03)',
                      border: '1px solid oklch(1 0 0 / 0.07)',
                      color: 'oklch(0.78 0.01 280)',
                    }}
                    onClick={() => void handleCreateVerificationNote()}
                    disabled={createVerificationNoteMutation.isPending}
                  >
                    {createVerificationNoteMutation.isPending
                      ? 'Generating note...'
                      : 'Verification note'}
                  </button>
                )}

                {!isNoteMode && selectedWorkItems.length > 0 && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={currentUpdateWorkItemStatus}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[5px] px-2.5 py-[5px] text-xs font-medium"
                    style={
                      currentUpdateWorkItemStatus
                        ? {
                            background:
                              'color-mix(in oklch, oklch(0.78 0.18 295) 14%, transparent)',
                            border:
                              '1px solid color-mix(in oklch, oklch(0.78 0.18 295) 30%, transparent)',
                            color: 'oklch(0.78 0.18 295)',
                          }
                        : {
                            background: 'oklch(1 0 0 / 0.03)',
                            border: '1px solid oklch(1 0 0 / 0.07)',
                            color: 'oklch(0.78 0.01 280)',
                          }
                    }
                    onClick={() =>
                      updateDraft({
                        updateWorkItemStatus: !currentUpdateWorkItemStatus,
                      })
                    }
                  >
                    <ToolCheckmark checked={currentUpdateWorkItemStatus} />
                    Update work item status
                  </button>
                )}

                {/* Source branch / parent task selector */}
                {!isNoteMode &&
                  currentCreateWorktree &&
                  selectedProjectId &&
                  (branches.length > 0 || activeProjectTasks.length > 0) && (
                    <div
                      className="inline-flex shrink-0 items-center gap-[5px] rounded-[5px] px-2.5 py-[5px] text-xs"
                      style={{
                        background: 'oklch(1 0 0 / 0.03)',
                        border: '1px solid oklch(1 0 0 / 0.07)',
                      }}
                    >
                      <span style={{ color: 'oklch(0.55 0.01 280)' }}>
                        {draft?.parentTaskId ? 'child of' : 'from'}
                      </span>
                      <BranchOrTaskSelect
                        branches={branchInfos}
                        favoriteBranches={selectedProject?.favoriteBranches}
                        defaultBranch={selectedProject?.defaultBranch}
                        activeTasks={activeProjectTasks}
                        value={currentSourceBranch ?? undefined}
                        selectedTaskId={draft?.parentTaskId}
                        onChange={handleBranchOrTaskChange}
                        label="Source branch or parent task"
                        side="top"
                        size="xs"
                      />
                    </div>
                  )}
              </div>

              <div className="flex-1" />

              <div className="text-ink-3 flex items-center gap-3 font-mono text-[10.5px] whitespace-nowrap">
                {!isNoteMode && showSearchInput && (
                  <span className="flex items-center gap-1">
                    <Kbd shortcut="cmd+right" /> project
                  </span>
                )}
                {!isNoteMode && canToggleMode && showSearchInput && (
                  <>
                    <div
                      className="mx-1 h-[18px] w-px"
                      style={{ background: 'oklch(1 0 0 / 0.06)' }}
                    />
                    <span className="flex items-center gap-1">
                      <Kbd shortcut="cmd+m" />{' '}
                      {inputMode === 'search' ? 'prompt' : 'search'}
                    </span>
                  </>
                )}
                {inputMode === 'search' && searchStep === 'select' && (
                  <>
                    <span className="flex items-center gap-1">
                      <Kbd shortcut="up" /> <Kbd shortcut="down" /> navigate
                    </span>
                    <span className="flex items-center gap-1">
                      <Kbd shortcut="enter" /> select
                    </span>
                    {canAdvanceToCompose && (
                      <span className="flex items-center gap-1">
                        <Kbd shortcut="cmd+enter" /> next
                      </span>
                    )}
                  </>
                )}
                {inputMode === 'search' && searchStep === 'compose' && (
                  <>
                    <span className="flex items-center gap-1">
                      <Kbd shortcut="escape" /> back
                    </span>
                    <span className="flex items-center gap-1">
                      <Kbd shortcut="cmd+enter" /> start
                    </span>
                  </>
                )}
                {isNoteMode && (
                  <span className="flex items-center gap-1">
                    <Kbd shortcut="cmd+enter" /> create note
                  </span>
                )}
                {!isNoteMode && inputMode === 'prompt' && (
                  <span className="flex items-center gap-1">
                    <Kbd shortcut="cmd+enter" /> start
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Kbd shortcut="cmd+shift+escape" /> discard
                </span>
              </div>
            </div>
          </div>
        </div>
      </FocusLock>
    </KeyboardLayerProvider>,
    document.body,
  );
}

function ProjectButtonContent({ project }: { project: Project }) {
  return (
    <>
      <ProjectLogoBackground project={project} showColorFallback size="sm" />
      <span className="relative z-10 truncate">{project.name}</span>
    </>
  );
}

function getProjectButtonStyle(project: Project, isSelected: boolean) {
  return isSelected
    ? {
        background: `color-mix(in oklch, ${project.color} 18%, transparent)`,
        border: `1px solid color-mix(in oklch, ${project.color} 45%, transparent)`,
        color: 'oklch(0.99 0 0)',
        fontWeight: 500,
      }
    : {
        background: 'transparent',
        border: '1px solid transparent',
        color: 'oklch(0.78 0.01 280)',
        fontWeight: 400,
      };
}

function SortableProjectButton({
  project,
  isSelected,
  onSelect,
}: {
  project: Project;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  return (
    <button
      ref={setNodeRef}
      data-project-tab={project.id}
      onClick={isDragging ? undefined : onSelect}
      className="relative flex min-w-0 items-center gap-[7px] overflow-hidden rounded-md px-[11px] py-[5px] text-left text-[12.5px] tracking-tight"
      style={{
        ...getProjectButtonStyle(project, isSelected),
        transform: DndCSS.Translate.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 10 : undefined,
        boxShadow: isDragging ? '0 4px 16px oklch(0 0 0 / 0.4)' : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <ProjectButtonContent project={project} />
    </button>
  );
}

function ProjectGrid({
  sortedProjects,
  selectedProjectId,
  onSelectProject,
  onReorderProjects,
}: {
  sortedProjects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
  onReorderProjects: (orderedIds: string[]) => void;
}) {
  const projectGridRef = useRef<HTMLDivElement>(null);

  // Require 8px movement before drag starts so clicks aren't hijacked
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const projectIds = useMemo(
    () => sortedProjects.map((p) => p.id),
    [sortedProjects],
  );

  useEffect(() => {
    const gridContainer = projectGridRef.current;
    if (!gridContainer) return;

    const selectedValue = selectedProjectId ?? 'note';
    const selector = `[data-project-tab="${selectedValue}"]`;
    const selectedCard =
      gridContainer.querySelector<HTMLButtonElement>(selector);
    if (!selectedCard) return;

    selectedCard.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'nearest',
    });
  }, [selectedProjectId, sortedProjects.length]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = projectIds.indexOf(active.id as string);
      const newIndex = projectIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(projectIds, oldIndex, newIndex);
      onReorderProjects(reordered);
    },
    [projectIds, onReorderProjects],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      autoScroll={false}
    >
      <div
        ref={projectGridRef}
        className="grid max-h-[180px] shrink-0 grid-cols-7 gap-1 overflow-y-auto px-3 py-2 sm:grid-cols-8 lg:grid-cols-10"
        style={{
          borderTop: '1px solid oklch(1 0 0 / 0.04)',
          borderBottom: '1px solid oklch(1 0 0 / 0.04)',
          background: 'oklch(0 0 0 / 0.2)',
        }}
      >
        <button
          data-project-tab="note"
          onClick={() => onSelectProject(null)}
          className="flex min-w-0 items-center gap-[7px] rounded-md px-[11px] py-[5px] text-[12.5px] tracking-tight transition-colors"
          style={
            selectedProjectId === null
              ? {
                  background: 'oklch(1 0 0 / 0.08)',
                  border: '1px solid oklch(1 0 0 / 0.14)',
                  color: 'oklch(0.99 0 0)',
                  fontWeight: 500,
                }
              : {
                  background: 'transparent',
                  border: '1px solid transparent',
                  color: 'oklch(0.78 0.01 280)',
                  fontWeight: 400,
                }
          }
        >
          <span
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: 'oklch(0.55 0.01 280)' }}
          />
          <span className="truncate">Note</span>
        </button>

        <SortableContext items={projectIds} strategy={rectSortingStrategy}>
          {sortedProjects.map((project) => (
            <SortableProjectButton
              key={project.id}
              project={project}
              isSelected={selectedProjectId === project.id}
              onSelect={() => onSelectProject(project.id)}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}

/** Themed checkbox matching the aurora-glass toolbar style. */
function ToolCheckmark({ checked }: { checked: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[3px]"
      style={{
        width: 13,
        height: 13,
        background: checked ? 'oklch(0.78 0.18 295)' : 'oklch(1 0 0 / 0.05)',
        border: `1px solid ${checked ? 'oklch(0.78 0.18 295)' : 'oklch(1 0 0 / 0.18)'}`,
      }}
    >
      {checked && (
        <svg
          width={9}
          height={9}
          viewBox="0 0 24 24"
          fill="none"
          stroke="oklch(0.12 0 0)"
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  );
}

// Work item search mode content with real work items
function SearchModeContent({
  project,
  filter,
  selectedWorkItemIds,
  viewMode,
  onViewModeChange,
  iterationFilter,
  onIterationFilterChange,
  onWorkItemToggle,
  onClearSelectedWorkItems,
  onHighlightChange,
  panelWidth,
  onPanelWidthChange,
  onAdvanceToCompose,
  canAdvance,
}: {
  project: Project | null;
  filter: string;
  selectedWorkItemIds: string[];
  viewMode: WorkItemsViewMode;
  onViewModeChange: (mode: WorkItemsViewMode) => void;
  iterationFilter: string;
  onIterationFilterChange: (iterationFilter: string) => void;
  onWorkItemToggle: (workItem: AzureDevOpsWorkItem) => void;
  onClearSelectedWorkItems: () => void;
  onHighlightChange?: (workItemId: string | null) => void;
  panelWidth?: number;
  onPanelWidthChange?: (width: number) => void;
  onAdvanceToCompose: () => void;
  canAdvance: boolean;
}) {
  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-ink-2 text-center">
          <p className="text-sm">Select a project to search work items</p>
        </div>
      </div>
    );
  }

  if (!projectHasWorkItems(project)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-ink-2 text-center">
          <p className="text-sm">No work items linked to this project.</p>
          <p className="mt-1 text-xs">
            Link Azure DevOps in project settings to see work items.
          </p>
        </div>
      </div>
    );
  }

  return (
    <WorkItemPicker
      providerId={project.workItemProviderId!}
      projectId={project.workItemProjectId!}
      projectName={project.workItemProjectName!}
      selectedWorkItemIds={selectedWorkItemIds}
      onToggleSelect={onWorkItemToggle}
      onClearSelection={onClearSelectedWorkItems}
      onHighlightChange={onHighlightChange}
      filter={filter}
      viewMode={viewMode}
      onViewModeChange={onViewModeChange}
      iterationFilter={iterationFilter}
      onIterationFilterChange={onIterationFilterChange}
      panelWidth={panelWidth}
      onPanelWidthChange={onPanelWidthChange}
      headerRight={
        canAdvance ? (
          <Button variant="primary" size="sm" onClick={onAdvanceToCompose}>
            Next
            <ChevronRight className="h-3 w-3" />
            <Kbd shortcut="cmd+enter" className="ml-1" />
          </Button>
        ) : undefined
      }
    />
  );
}
