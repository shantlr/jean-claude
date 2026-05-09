import { useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Search } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { BranchSelect } from '@/common/ui/branch-select';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import {
  BackendSelector,
  getModelsForBackend,
} from '@/features/agent/ui-backend-selector';
import { ModeSelector } from '@/features/agent/ui-mode-selector';
import { ModelSelector } from '@/features/agent/ui-model-selector';
import {
  PromptTextarea,
  type PromptTextareaRef,
} from '@/features/common/ui-prompt-textarea';
import { WorkItemPicker } from '@/features/work-item/ui-work-item-picker';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useCreateFeedNote } from '@/hooks/use-feed-notes';
import { useDeleteProjectTodo } from '@/hooks/use-project-todos';
import { useProjects, useProjectBranches } from '@/hooks/use-projects';
import { useBackendsSetting, useCompletionSetting } from '@/hooks/use-settings';
import { useProjectSkills } from '@/hooks/use-skills';
import { useCreateTaskWithWorktree } from '@/hooks/use-tasks';
import { useWorkItems, useWorkItemComments } from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';
import { compressImage } from '@/lib/image-compression';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import {
  useComposerFileCommentCount,
  useComposerFileComments,
  useComposerFileCommentsStore,
  synthesizeFileCommentsPrompt,
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
  PromptImagePart,
} from '@shared/agent-backend-types';
import {
  normalizeInteractionModeForBackend,
  type Project,
} from '@shared/types';

import { ComposerCommentsChip } from '../ui-composer-comments-chip';
import { ComposerFileExplorer } from '../ui-composer-file-explorer';
import {
  PromptComposer,
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
  const {
    selectedProjectId,
    draft,
    setSelectedProjectId,
    updateDraft,
    clearDraft,
  } = useNewTaskDraft();

  const { data: projects = [] } = useProjects();
  const createTaskMutation = useCreateTaskWithWorktree();
  const createNoteMutation = useCreateFeedNote();
  const deleteBacklogTodo = useDeleteProjectTodo();
  const queryClient = useQueryClient();
  const addRunningJob = useBackgroundJobsStore((state) => state.addRunningJob);
  const markJobSucceeded = useBackgroundJobsStore(
    (state) => state.markJobSucceeded,
  );
  const markJobFailed = useBackgroundJobsStore((state) => state.markJobFailed);

  const { data: completionSetting } = useCompletionSetting();

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
  const { data: projectSkills = [] } = useProjectSkills(
    selectedProjectId ?? undefined,
  );
  const isNoteMode = selectedProjectId === null;

  // Fetch work items for the selected project (used for navigation)
  const { data: workItems = [] } = useWorkItems({
    providerId: selectedProject?.workItemProviderId ?? '',
    projectId: selectedProject?.workItemProjectId ?? '',
    projectName: selectedProject?.workItemProjectName ?? '',
    filters: {
      excludeWorkItemTypes: ['Test Suite', 'Test Case', 'Epic', 'Feature'],
    },
  });

  // Fetch branches for the selected project
  const { data: branchInfos = [] } = useProjectBranches(selectedProjectId);
  const branches = useMemo(() => branchInfos.map((b) => b.name), [branchInfos]);

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
  // Check if we can advance to compose step
  const canAdvanceToCompose = useMemo(() => {
    if (inputMode !== 'search') return false;
    if (searchStep !== 'select') return false;
    return (draft?.workItemIds ?? []).length > 0;
  }, [inputMode, searchStep, draft?.workItemIds]);

  // Check if we can start a task
  const canStartTask = useMemo(() => {
    if (!draft) return false;

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
  const currentCreateWorktree = draft?.createWorktree ?? true;
  const currentUpdateWorkItemStatus = draft?.updateWorkItemStatus ?? true;
  const currentShowFileExplorer = draft?.showFileExplorer ?? false;
  const toggleWorktree = useCallback(
    (checked: boolean) => {
      updateDraft({ createWorktree: checked });
    },
    [updateDraft],
  );

  // Enabled backends from settings
  const { data: backendsSetting } = useBackendsSetting();

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
  const currentModelPreference = useMemo(() => {
    const draftModelPreference = draft?.modelPreference ?? 'default';

    return availableModelPreferences.includes(draftModelPreference)
      ? draftModelPreference
      : 'default';
  }, [draft?.modelPreference, availableModelPreferences]);

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

  // Handle backend change — always reset model to default since model lists differ per backend
  const handleBackendChange = useCallback(
    (backend: AgentBackendType) => {
      const normalizedMode = normalizeInteractionModeForBackend({
        backend,
        mode: currentInteractionMode,
      });
      updateDraft({
        agentBackend: backend,
        interactionMode: normalizedMode,
        modelPreference: 'default',
      });
    },
    [currentInteractionMode, updateDraft],
  );

  // Toggle selection of highlighted work item
  const toggleHighlightedWorkItem = useCallback(() => {
    if (!highlightedWorkItemId) return;
    const currentIds = draft?.workItemIds ?? [];
    const newIds = currentIds.includes(highlightedWorkItemId)
      ? currentIds.filter((id) => id !== highlightedWorkItemId)
      : [...currentIds, highlightedWorkItemId];
    updateDraft({ workItemIds: newIds });
  }, [highlightedWorkItemId, draft?.workItemIds, updateDraft]);

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
      const currentIds = draft?.workItemIds ?? [];
      const newIds = currentIds.includes(workItemId)
        ? currentIds.filter((id) => id !== workItemId)
        : [...currentIds, workItemId];
      updateDraft({ workItemIds: newIds });
    },
    [draft?.workItemIds, updateDraft],
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
      const current = draft?.selectedCommentIds ?? [];
      const next = current.includes(commentSelectionId)
        ? current.filter((id) => id !== commentSelectionId)
        : [...current, commentSelectionId];
      updateDraft({ selectedCommentIds: next });
    },
    [draft?.selectedCommentIds, updateDraft],
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
        workItemIds = draft.workItemIds ?? null;
        workItemUrls = selectedWorkItems.map((wi) => wi.url);
      } else {
        finalPrompt = draft.prompt ?? '';
      }

      let draftImages: PromptImagePart[] | undefined =
        draft.images && draft.images.length > 0 ? draft.images : undefined;

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

      const backlogTodoId = draft.backlogTodoId ?? null;

      const jobId = addRunningJob({
        type: 'task-creation',
        title: `Creating task in ${selectedProject?.name ?? 'project'}`,
        projectId: selectedProjectId,
        details: {
          projectName: selectedProject?.name ?? null,
          promptPreview: finalPrompt.slice(0, 120),
          backlogTodoId,
          creationInput: {
            projectId: selectedProjectId,
            prompt: finalPrompt,
            interactionMode: currentInteractionMode,
            agentBackend: currentBackend,
            modelPreference: currentModelPreference,
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
          agentBackend: currentBackend,
          useWorktree: currentCreateWorktree,
          sourceBranch: currentCreateWorktree ? currentSourceBranch : null,
          workItemIds,
          workItemUrls,
          updateWorkItemStatus: currentUpdateWorkItemStatus,
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

          // Clean up backlog todo if this task was converted from one
          if (backlogTodoId) {
            deleteBacklogTodo.mutate(backlogTodoId);
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
    selectedProject?.name,
    selectedProject?.path,
    currentBackend,
    currentInteractionMode,
    currentModelPreference,
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
      updateDraft({
        images: [...(draft?.images ?? []), image],
      });
    },
    [draft?.images, updateDraft],
  );

  const handleImageRemove = useCallback(
    (index: number) => {
      updateDraft({
        images: (draft?.images ?? []).filter((_, i) => i !== index),
      });
    },
    [draft?.images, updateDraft],
  );

  // Get current input value
  const inputValue =
    inputMode === 'search'
      ? (draft?.workItemsFilter ?? '')
      : (draft?.prompt ?? '');

  // Register keyboard shortcuts
  useCommands('new-task-overlay', [
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
    !isNoteMode && {
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
  ]);

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className="flex max-h-[80svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-[14px] border border-white/10"
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
          <div className="flex shrink-0 flex-col px-[18px] py-3.5">
            <div className="flex flex-1 flex-col">
              <PromptTextarea
                ref={promptInputRef}
                value={inputValue}
                onChange={handlePromptChange}
                onKeyDown={handleKeyDown}
                placeholder={getPlaceholder({ mode: inputMode, isNoteMode })}
                skills={projectSkills}
                showCommands={false}
                maxHeight={320}
                projectRoot={selectedProject?.path ?? null}
                enableFilePathAutocomplete
                enableCompletion={completionSetting?.enabled ?? false}
                projectId={selectedProject?.id}
                images={draft?.images}
                onImageAttach={handleImageAttach}
                onImageRemove={handleImageRemove}
                className="text-ink-1 placeholder-ink-3 border-transparent bg-transparent px-0 py-0 text-sm focus:border-transparent focus:ring-0 focus:outline-none"
              />
              {fileCommentCount > 0 && selectedProject && (
                <div className="mt-2">
                  <ComposerCommentsChip
                    projectId={selectedProject.id}
                    projectRoot={selectedProject.path}
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
              comments={workItemComments}
              selectedCommentIds={draft?.selectedCommentIds ?? []}
              onCommentToggle={handleCommentToggle}
              onSelectAllComments={handleSelectAllComments}
              onDeselectAllComments={handleDeselectAllComments}
              isLoadingComments={isLoadingComments}
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
              />
            )}

            {/* Model selector */}
            {!isNoteMode && (
              <ModelSelector
                value={currentModelPreference}
                onChange={(model) => updateDraft({ modelPreference: model })}
                models={getModelsForBackend(currentBackend, dynamicModels)}
                shortcut="cmd+l"
                side="top"
              />
            )}

            {/* Agent backend selector — only show when multiple backends enabled */}
            {!isNoteMode && (
              <BackendSelector
                value={currentBackend}
                onChange={handleBackendChange}
                shortcut="cmd+j"
                side="top"
              />
            )}

            {!isNoteMode && (
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
                  updateDraft({ showFileExplorer: !currentShowFileExplorer })
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

            {/* Source branch selector - only show when project is selected */}
            {!isNoteMode &&
              currentCreateWorktree &&
              selectedProjectId &&
              branches.length > 0 && (
                <div
                  className="inline-flex shrink-0 items-center gap-[5px] rounded-[5px] px-2.5 py-[5px] text-xs"
                  style={{
                    background: 'oklch(1 0 0 / 0.03)',
                    border: '1px solid oklch(1 0 0 / 0.07)',
                  }}
                >
                  <span style={{ color: 'oklch(0.55 0.01 280)' }}>from</span>
                  <BranchSelect
                    branches={branchInfos}
                    favoriteBranches={selectedProject?.favoriteBranches}
                    defaultBranch={selectedProject?.defaultBranch}
                    value={currentSourceBranch ?? undefined}
                    onChange={(branch) => updateDraft({ sourceBranch: branch })}
                    label="Source branch"
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
  );
}

function ProjectGrid({
  sortedProjects,
  selectedProjectId,
  onSelectProject,
}: {
  sortedProjects: Project[];
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
}) {
  const projectGridRef = useRef<HTMLDivElement>(null);

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

  return (
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

      {sortedProjects.map((project) => (
        <button
          key={project.id}
          data-project-tab={project.id}
          onClick={() => onSelectProject(project.id)}
          className="flex min-w-0 items-center gap-[7px] rounded-md px-[11px] py-[5px] text-left text-[12.5px] tracking-tight transition-colors"
          style={
            selectedProjectId === project.id
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
                }
          }
        >
          <span
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{
              backgroundColor: project.color,
              boxShadow:
                selectedProjectId === project.id
                  ? `0 0 6px ${project.color}`
                  : 'none',
            }}
          />
          <span className="truncate">{project.name}</span>
        </button>
      ))}
    </div>
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
