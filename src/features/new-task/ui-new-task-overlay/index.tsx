import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import Fuse from 'fuse.js';
import { ChevronRight, List, Columns3 } from 'lucide-react';
import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { useShrinkToTarget } from '@/common/hooks/use-shrink-to-target';
import { Kbd } from '@/common/ui/kbd';
import { Select } from '@/common/ui/select';
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
import { useBackendModels } from '@/hooks/use-backend-models';
import { useDeleteProjectTodo } from '@/hooks/use-project-todos';
import { useProjects, useProjectBranches } from '@/hooks/use-projects';
import { useBackendsSetting, useCompletionSetting } from '@/hooks/use-settings';
import { useProjectSkills } from '@/hooks/use-skills';
import { useCreateTaskWithWorktree } from '@/hooks/use-tasks';
import { useWorkItems, useIterations } from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';
import { useBackgroundJobsStore } from '@/stores/background-jobs';
import {
  useNewTaskDraft,
  type InputMode,
  type WorkItemsViewMode,
} from '@/stores/new-task-draft';
import { useUIStore } from '@/stores/ui';
import type {
  AgentBackendType,
  PromptImagePart,
} from '@shared/agent-backend-types';
import {
  normalizeInteractionModeForBackend,
  type Project,
} from '@shared/types';

import {
  PromptComposer,
  generateInitialTemplate,
  expandTemplate,
} from '../ui-prompt-composer';
import { WorkItemBoard } from '../ui-work-item-board';
import { WorkItemDetails } from '../ui-work-item-details';
import { WorkItemList } from '../ui-work-item-list';

// Status urgency for sorting work items in list view (lower = more urgent / actionable)
const STATUS_URGENCY: Record<string, number> = {
  Active: 1,
  'In Progress': 2,
  'In Design': 2.1,
  'To Do': 2.1,
  New: 3,
  Resolved: 4,
  Deployed: 4.5,
  Closed: 5,
  Done: 6,
  Removed: 7,
};

function getStatusUrgency(status: string): number {
  return STATUS_URGENCY[status] ?? 3;
}

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

// Auto-detect input mode based on project selection
function getAutoInputMode(
  selectedProjectId: string | null,
  projects: Project[],
): InputMode {
  // "All" shows search mode
  if (selectedProjectId === null) return 'search';

  const project = projects.find((p) => p.id === selectedProjectId);
  if (!project) return 'prompt';

  // Project with work items linked shows search mode
  if (projectHasWorkItems(project)) return 'search';

  // Project without work items shows prompt mode
  return 'prompt';
}

// Placeholder text based on input mode
function getPlaceholder(mode: InputMode): string {
  return mode === 'search' ? 'Search work items...' : 'Describe your task...';
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
  const [highlightedWorkItemId, setHighlightedWorkItemId] = useState<
    string | null
  >(null);

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

  // All tab options: null (All) + project IDs
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
  const { data: branches = [] } = useProjectBranches(selectedProjectId);

  // Get selected work items objects
  const selectedWorkItems = useMemo(() => {
    const ids = draft?.workItemIds ?? [];
    return workItems.filter((wi) => ids.includes(wi.id.toString()));
  }, [workItems, draft?.workItemIds]);

  // Input mode from draft, constrained by project capabilities
  // - "all" selected: force search mode
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

    // In prompt mode, need text and a project
    if (inputMode === 'prompt') {
      return !!(draft.prompt ?? '').trim() && !!selectedProjectId;
    }

    return false;
  }, [
    draft,
    inputMode,
    searchStep,
    promptTemplate,
    selectedWorkItems,
    selectedProjectId,
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

  // Toggle worktree checkbox
  const currentCreateWorktree = draft?.createWorktree ?? true;
  const toggleWorktree = useCallback(() => {
    updateDraft({ createWorktree: !currentCreateWorktree });
  }, [currentCreateWorktree, updateDraft]);

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

  // Handle work item highlight from mouse
  const handleWorkItemHighlight = useCallback(
    (workItem: AzureDevOpsWorkItem) => {
      setHighlightedWorkItemId(workItem.id.toString());
    },
    [],
  );

  // Advance to compose step
  const advanceToCompose = useCallback(() => {
    if (!canAdvanceToCompose) return;
    const template = generateInitialTemplate(draft?.workItemIds ?? []);
    setPromptTemplate(template);
    updateDraft({ searchStep: 'compose' });
  }, [canAdvanceToCompose, draft?.workItemIds, updateDraft]);

  // Go back to select step
  const backToSelect = useCallback(() => {
    updateDraft({ searchStep: 'select' });
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
        finalPrompt = expandTemplate(promptTemplate, selectedWorkItems);
        workItemIds = draft.workItemIds ?? null;
        workItemUrls = selectedWorkItems.map((wi) => wi.url);
      } else {
        finalPrompt = draft.prompt ?? '';
      }

      const backlogTodoId = draft.backlogTodoId ?? null;
      const draftImages =
        draft.images && draft.images.length > 0 ? draft.images : undefined;

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
            updatedAt: new Date().toISOString(),
            autoStart: true,
          },
        },
      });

      // Animate the overlay shrinking toward the Jobs button, then reset
      // the draft so the overlay shows a fresh state for chaining
      void triggerAnimation();
      clearDraft();

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
    selectedProject?.name,
    currentBackend,
    currentInteractionMode,
    currentModelPreference,
    currentCreateWorktree,
    currentSourceBranch,
    addRunningJob,
    createTaskMutation,
    deleteBacklogTodo,
    clearDraft,
    queryClient,
    markJobSucceeded,
    markJobFailed,
    triggerAnimation,
  ]);

  // Handle Cmd+Enter based on current state
  const handleCmdEnter = useCallback(() => {
    if (inputMode === 'search' && searchStep === 'select') {
      // In select step, advance to compose
      advanceToCompose();
    } else {
      // In compose or prompt mode, start task
      handleStartTask();
    }
  }, [inputMode, searchStep, advanceToCompose, handleStartTask]);

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
  const showPromptInput = inputMode === 'prompt';

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
    {
      label: 'Toggle Worktree',
      shortcut: 'cmd+b',
      handler: () => {
        toggleWorktree();
      },
    },
    {
      label: 'Next / Start Task',
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
    {
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
        className="flex max-h-[80svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),0_0_100px_-20px_rgba(0,0,0,0.6)]"
        onClick={handleModalClick}
      >
        {/* Search/Prompt input - only show in select or prompt mode */}
        {(showSearchInput || showPromptInput) && (
          <div className="flex shrink-0 items-start border-b border-neutral-700 px-4 py-3">
            <div className="flex flex-1 flex-col">
              {showSearchInput ? (
                <textarea
                  ref={searchInputRef}
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={getPlaceholder(inputMode)}
                  className="field-sizing-content max-h-[40svh] min-h-[60px] flex-1 resize-none bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none"
                />
              ) : (
                <PromptTextarea
                  ref={promptInputRef}
                  value={inputValue}
                  onChange={handlePromptChange}
                  onKeyDown={handleKeyDown}
                  placeholder={getPlaceholder(inputMode)}
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
                  className="min-h-[60px] border-transparent bg-transparent px-0 py-0 text-sm text-neutral-200 placeholder-neutral-500 focus:border-transparent focus:ring-0 focus:outline-none"
                />
              )}
            </div>
          </div>
        )}

        {/* Project tabs - only show in select or prompt mode */}
        {(showSearchInput || showPromptInput) && (
          <div className="border-border flex shrink-0 items-center gap-1 overflow-x-auto border-b border-neutral-700 px-4 py-2">
            {/* All tab */}
            <button
              onClick={() => setSelectedProjectId(null)}
              className={clsx(
                'shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors',
                selectedProjectId === null
                  ? 'bg-neutral-700 text-white'
                  : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
              )}
            >
              All
            </button>

            {/* Separator */}
            <div className="h-4 w-px shrink-0 bg-neutral-700" />

            {/* Project tabs */}
            {sortedProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => setSelectedProjectId(project.id)}
                className={clsx(
                  'flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors',
                  selectedProjectId === project.id
                    ? 'bg-neutral-700 text-white'
                    : 'text-neutral-400 hover:bg-neutral-800 hover:text-white',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
                <span className="max-w-20 truncate">{project.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Main content area */}
        {inputMode === 'search' && searchStep === 'select' && (
          <div className="flex h-full w-full grow flex-col overflow-hidden border-b border-neutral-700 p-2">
            <SearchModeContent
              projectId={selectedProjectId}
              project={selectedProject}
              filter={draft?.workItemsFilter ?? ''}
              selectedWorkItemIds={draft?.workItemIds ?? []}
              highlightedWorkItemId={highlightedWorkItemId}
              viewMode={draft?.workItemsViewMode ?? 'board'}
              onViewModeChange={(mode: WorkItemsViewMode) =>
                updateDraft({ workItemsViewMode: mode })
              }
              onWorkItemToggle={handleWorkItemToggle}
              onWorkItemHighlight={handleWorkItemHighlight}
              onAdvanceToCompose={advanceToCompose}
              canAdvance={canAdvanceToCompose}
            />
          </div>
        )}

        {inputMode === 'search' && searchStep === 'compose' && (
          <div className="flex h-full w-full grow flex-col overflow-hidden border-b border-neutral-700 p-4">
            <PromptComposer
              template={promptTemplate}
              workItems={selectedWorkItems}
              onTemplateChange={setPromptTemplate}
              onBack={backToSelect}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex min-h-[50px] shrink-0 items-center justify-between overflow-hidden px-4 py-2">
          <div className="flex items-center gap-4">
            {/* Interaction mode selector */}
            <ModeSelector
              value={currentInteractionMode}
              onChange={(mode) => updateDraft({ interactionMode: mode })}
              backend={currentBackend}
              shortcut="cmd+i"
              side="top"
            />

            {/* Model selector */}
            <ModelSelector
              value={currentModelPreference}
              onChange={(model) => updateDraft({ modelPreference: model })}
              models={getModelsForBackend(currentBackend, dynamicModels)}
              shortcut="cmd+l"
              side="top"
            />

            {/* Agent backend selector — only show when multiple backends enabled */}
            <BackendSelector
              value={currentBackend}
              onChange={handleBackendChange}
              shortcut="cmd+j"
              side="top"
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={currentCreateWorktree}
                onChange={toggleWorktree}
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-700"
              />
              <span className="text-neutral-300">Worktree</span>
              <Kbd shortcut="cmd+b" />
            </label>

            {/* Source branch selector - only show when project is selected */}
            {currentCreateWorktree &&
              selectedProjectId &&
              branches.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-400">from</span>
                  <Select
                    value={currentSourceBranch ?? ''}
                    options={branches.map((branch) => ({
                      value: branch,
                      label: branch,
                    }))}
                    onChange={(branch) => updateDraft({ sourceBranch: branch })}
                    label="Source branch"
                    side="top"
                  />
                </div>
              )}
          </div>

          <div className="flex items-center gap-3 text-xs whitespace-nowrap text-neutral-500">
            {showSearchInput && (
              <span className="flex items-center gap-1">
                <Kbd shortcut="cmd+right" /> project
              </span>
            )}
            {canToggleMode && showSearchInput && (
              <span className="flex items-center gap-1">
                <Kbd shortcut="cmd+m" />{' '}
                {inputMode === 'search' ? 'prompt' : 'search'}
              </span>
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
            {inputMode === 'prompt' && (
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

// Work item search mode content with real work items
function SearchModeContent({
  projectId,
  project,
  filter,
  selectedWorkItemIds,
  highlightedWorkItemId,
  viewMode,
  onViewModeChange,
  onWorkItemToggle,
  onWorkItemHighlight,
  onAdvanceToCompose,
  canAdvance,
}: {
  projectId: string | null;
  project: Project | null;
  filter: string;
  selectedWorkItemIds: string[];
  highlightedWorkItemId: string | null;
  viewMode: WorkItemsViewMode;
  onViewModeChange: (mode: WorkItemsViewMode) => void;
  onWorkItemToggle: (workItem: AzureDevOpsWorkItem) => void;
  onWorkItemHighlight: (workItem: AzureDevOpsWorkItem) => void;
  onAdvanceToCompose: () => void;
  canAdvance: boolean;
}) {
  const hasWorkItems = projectHasWorkItems(project);

  // Fetch iterations for the selected project
  const { data: iterations = [] } = useIterations({
    providerId: project?.workItemProviderId ?? '',
    projectName: project?.workItemProjectName ?? '',
  });

  // Find current iteration for default selection
  const currentIteration = useMemo(
    () => iterations.find((i) => i.isCurrent),
    [iterations],
  );

  // Selected iteration: '__current__' (auto-resolve), '__all__' (no filter), or iteration ID
  const [selectedIterationId, setSelectedIterationId] =
    useState<string>('__current__');

  // Reset iteration selection when project changes
  useEffect(() => {
    setSelectedIterationId('__current__');
  }, [projectId]);

  // Resolve selected iteration to an iteration path for WIQL filtering
  const resolvedIterationPath = useMemo(() => {
    if (selectedIterationId === '__all__') return undefined;
    if (selectedIterationId === '__current__') {
      return iterations.find((i) => i.isCurrent)?.path;
    }
    return iterations.find((i) => i.id === selectedIterationId)?.path;
  }, [selectedIterationId, iterations]);

  // Build iteration dropdown options
  const iterationOptions = useMemo(() => {
    const opts = [
      {
        value: '__current__',
        label: currentIteration
          ? `Current: ${currentIteration.name}`
          : 'Current Iteration',
      },
      { value: '__all__', label: 'All Iterations' },
    ];
    // Add individual iterations (most recent first — reverse since API returns chronological)
    for (const iter of [...iterations].reverse()) {
      if (iter.isCurrent) continue; // already represented by __current__
      opts.push({ value: iter.id, label: iter.name });
    }
    return opts;
  }, [iterations, currentIteration]);

  // Fetch work items for the selected project
  const { data: workItems = [], isLoading } = useWorkItems({
    providerId: project?.workItemProviderId ?? '',
    projectId: project?.workItemProjectId ?? '',
    projectName: project?.workItemProjectName ?? '',
    filters: {
      excludeWorkItemTypes: ['Test Suite', 'Test Case', 'Epic', 'Feature'],
      iterationPath: resolvedIterationPath,
    },
  });

  // Create Fuse instance for fuzzy search
  const fuse = useMemo(
    () =>
      new Fuse(workItems, {
        keys: ['fields.title', 'id'],
        threshold: 0.4,
        ignoreLocation: true,
      }),
    [workItems],
  );

  // Filter and sort work items client-side
  const filteredWorkItems = useMemo(() => {
    if (!filter.trim()) {
      // Sort by status priority when not searching
      return [...workItems].sort(
        (a, b) =>
          getStatusUrgency(a.fields.state) - getStatusUrgency(b.fields.state),
      );
    }
    // Preserve fuzzy search relevance order when searching
    return fuse.search(filter).map((r) => r.item);
  }, [workItems, filter, fuse]);

  // Find the highlighted work item index
  const highlightedIndex = useMemo(() => {
    if (highlightedWorkItemId === null) return -1;
    return filteredWorkItems.findIndex(
      (wi) => wi.id.toString() === highlightedWorkItemId,
    );
  }, [filteredWorkItems, highlightedWorkItemId]);

  // Cached highlighted work item for details panel (updated via transition for performance)
  const [highlightedWorkItem, setHighlightedWorkItem] =
    useState<AzureDevOpsWorkItem | null>(null);

  useEffect(() => {
    startTransition(() => {
      if (
        highlightedIndex >= 0 &&
        highlightedIndex < filteredWorkItems.length
      ) {
        setHighlightedWorkItem(filteredWorkItems[highlightedIndex]);
      } else if (selectedWorkItemIds.length > 0) {
        // Show first selected work item if no highlight
        const firstSelected = workItems.find(
          (wi) => wi.id.toString() === selectedWorkItemIds[0],
        );
        setHighlightedWorkItem(firstSelected ?? null);
      } else {
        setHighlightedWorkItem(null);
      }
    });
  }, [filteredWorkItems, highlightedIndex, selectedWorkItemIds, workItems]);

  // Resizable panel
  const panelWidth = useUIStore((s) => s.workItemsPanelWidth);
  const setPanelWidth = useUIStore((s) => s.setWorkItemsPanelWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = panelWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!containerRef.current) return;
        const containerWidth = containerRef.current.offsetWidth;
        const deltaX = moveEvent.clientX - startX;
        const deltaPct = (deltaX / containerWidth) * 100;
        setPanelWidth(startWidth + deltaPct);
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [panelWidth, setPanelWidth],
  );

  // Show appropriate content based on context
  if (projectId === null) {
    // "All" selected - show placeholder for cross-project work items
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-neutral-400">
          <p className="text-sm">Select a project to search work items</p>
        </div>
      </div>
    );
  }

  if (!hasWorkItems) {
    // Project doesn't have work items linked
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-neutral-400">
          <p className="text-sm">No work items linked to this project.</p>
          <p className="mt-1 text-xs">
            Link Azure DevOps in project settings to see work items.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-neutral-400">Loading work items...</div>
      </div>
    );
  }

  // Two-panel layout for work items
  return (
    <div ref={containerRef} className="flex h-full w-full overflow-hidden">
      {/* Work items list */}
      <div
        className="flex shrink-0 flex-col overflow-hidden"
        style={{ width: `${panelWidth}%` }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-neutral-400 uppercase">
            Work Items ({filteredWorkItems.length})
            {selectedWorkItemIds.length > 0 && (
              <span className="ml-2 text-blue-400">
                {selectedWorkItemIds.length} selected
              </span>
            )}
          </span>

          <div className="flex items-center gap-2">
            {/* Iteration dropdown */}
            {iterations.length > 0 && (
              <Select
                value={selectedIterationId}
                options={iterationOptions}
                onChange={setSelectedIterationId}
                label="Iteration"
                side="bottom"
              />
            )}

            {/* View mode toggle */}
            <div className="flex rounded border border-neutral-600">
              <button
                type="button"
                onClick={() => onViewModeChange('list')}
                className={clsx(
                  'flex items-center px-1.5 py-1',
                  viewMode === 'list'
                    ? 'bg-neutral-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200',
                )}
                title="List view"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('board')}
                className={clsx(
                  'flex items-center px-1.5 py-1',
                  viewMode === 'board'
                    ? 'bg-neutral-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200',
                )}
                title="Board view"
              >
                <Columns3 className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Next button */}
            {canAdvance && (
              <button
                onClick={onAdvanceToCompose}
                className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500"
              >
                Next
                <ChevronRight className="h-3 w-3" />
                <Kbd shortcut="cmd+enter" className="ml-1" />
              </button>
            )}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {viewMode === 'list' ? (
            <WorkItemList
              workItems={filteredWorkItems}
              highlightedWorkItemId={highlightedWorkItemId}
              selectedWorkItemIds={selectedWorkItemIds}
              providerId={project?.workItemProviderId ?? undefined}
              onToggleSelect={onWorkItemToggle}
              onHighlight={onWorkItemHighlight}
            />
          ) : (
            <WorkItemBoard
              workItems={filteredWorkItems}
              highlightedWorkItemId={highlightedWorkItemId}
              selectedWorkItemIds={selectedWorkItemIds}
              providerId={project?.workItemProviderId ?? undefined}
              onToggleSelect={onWorkItemToggle}
              onHighlight={onWorkItemHighlight}
            />
          )}
        </div>
      </div>

      {/* Drag handle */}
      <div
        className="w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-neutral-600 active:bg-neutral-500"
        onMouseDown={handleDragStart}
      />

      {/* Work item details */}
      <div className="flex-1 overflow-y-auto rounded border border-neutral-700 p-2">
        <WorkItemDetails
          workItem={highlightedWorkItem ?? null}
          providerId={project?.workItemProviderId ?? undefined}
        />
      </div>
    </div>
  );
}
