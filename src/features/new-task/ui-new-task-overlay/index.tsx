import { useRouter } from '@tanstack/react-router';
import clsx from 'clsx';
import Fuse from 'fuse.js';
import { ChevronRight } from 'lucide-react';
import React, {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useCommands } from '@/common/hooks/use-commands';
import { Kbd } from '@/common/ui/kbd';
import {
  getModelLabel,
  getModelPreferencesForBackend,
  useBackendSelector,
} from '@/features/agent/ui-backend-selector';
import { useBackendModels } from '@/hooks/use-backend-models';
import { useProjects, useProjectBranches } from '@/hooks/use-projects';
import { useBackendsSetting } from '@/hooks/use-settings';
import { useCreateTaskWithWorktree } from '@/hooks/use-tasks';
import { useWorkItems } from '@/hooks/use-work-items';
import type { AzureDevOpsWorkItem } from '@/lib/api';
import { useNewTaskDraft, type InputMode } from '@/stores/new-task-draft';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { Project } from '@shared/types';

import {
  PromptComposer,
  generateInitialTemplate,
  expandTemplate,
} from '../ui-prompt-composer';
import { WorkItemDetails } from '../ui-work-item-details';
import { WorkItemList } from '../ui-work-item-list';

// Status priority for sorting (lower = higher priority)
const STATUS_PRIORITY: Record<string, number> = {
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

function getStatusPriority(status: string): number {
  return STATUS_PRIORITY[status] ?? 3;
}

const INTERACTION_MODES = ['ask', 'auto', 'plan'] as const;

// Check if project has work items linked
function projectHasWorkItems(project: Project | null): boolean {
  if (!project) return false;
  return !!(
    project.workItemProviderId &&
    project.workItemProjectId &&
    project.workItemProjectName
  );
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
  const router = useRouter();
  const {
    selectedProjectId,
    draft,
    setSelectedProjectId,
    updateDraft,
    clearDraft,
  } = useNewTaskDraft();

  const { data: projects = [] } = useProjects();
  const createTaskMutation = useCreateTaskWithWorktree();

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [highlightedWorkItemId, setHighlightedWorkItemId] = useState<
    string | null
  >(null);

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

  // Fetch work items for the selected project (used for navigation)
  const { data: workItems = [] } = useWorkItems({
    providerId: selectedProject?.workItemProviderId ?? '',
    projectId: selectedProject?.workItemProjectId ?? '',
    projectName: selectedProject?.workItemProjectName ?? '',
    filters: { excludeWorkItemTypes: ['Test Suite', 'Epic', 'Feature'] },
  });

  // Fetch branches for the selected project
  const { data: branches = [] } = useProjectBranches(selectedProjectId);

  // Sync source branch with project default branch when project changes
  useEffect(() => {
    const defaultBranch = selectedProject?.defaultBranch ?? null;
    updateDraft({ sourceBranch: defaultBranch });
  }, [selectedProjectId, selectedProject?.defaultBranch, updateDraft]);

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

  // Filter and sort work items based on current filter text
  const filteredWorkItems = useMemo(() => {
    const filter = draft?.workItemsFilter ?? '';
    if (!filter.trim()) {
      // Sort by status priority when not searching
      return [...workItems].sort(
        (a, b) =>
          getStatusPriority(a.fields.state) - getStatusPriority(b.fields.state),
      );
    }
    // Preserve fuzzy search relevance order when searching
    return fuse.search(filter).map((r) => r.item);
  }, [workItems, draft?.workItemsFilter, fuse]);

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
    // Prevent double-submission
    if (createTaskMutation.isPending) return false;

    // In search mode compose step, need the expanded prompt
    if (inputMode === 'search' && searchStep === 'compose') {
      const expanded = expandTemplate(promptTemplate, selectedWorkItems);
      return !!expanded.trim() && !!selectedProjectId;
    }

    // In prompt mode, need text and a project
    if (inputMode === 'prompt') {
      return !!draft.prompt.trim() && !!selectedProjectId;
    }

    return false;
  }, [
    draft,
    inputMode,
    searchStep,
    promptTemplate,
    selectedWorkItems,
    selectedProjectId,
    createTaskMutation.isPending,
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
  const toggleWorktree = useCallback(() => {
    updateDraft({ createWorktree: !draft?.createWorktree });
  }, [draft?.createWorktree, updateDraft]);

  // Toggle interaction mode (ask → auto → plan → ask)
  const toggleInteractionMode = useCallback(() => {
    const current = draft?.interactionMode ?? 'ask';
    const currentIndex = INTERACTION_MODES.indexOf(current);
    const nextIndex = (currentIndex + 1) % INTERACTION_MODES.length;
    updateDraft({ interactionMode: INTERACTION_MODES[nextIndex] });
  }, [draft?.interactionMode, updateDraft]);

  // Toggle model preference, constrained to models valid for the current backend
  const currentBackend = draft?.agentBackend ?? 'claude-code';
  const { data: dynamicModels } = useBackendModels(currentBackend);
  const backendModels = useMemo(
    () => getModelPreferencesForBackend(currentBackend, dynamicModels),
    [currentBackend, dynamicModels],
  );

  // Resolve the display label for the current model preference
  const modelDisplayLabel = getModelLabel(
    draft?.modelPreference ?? 'default',
    currentBackend,
    dynamicModels,
  );

  const toggleModelPreference = useCallback(() => {
    const current = draft?.modelPreference ?? 'default';
    const currentIndex = backendModels.indexOf(current);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + 1) % backendModels.length;
    updateDraft({ modelPreference: backendModels[nextIndex] });
  }, [draft?.modelPreference, backendModels, updateDraft]);

  // Enabled backends from settings
  const { data: backendsSetting } = useBackendsSetting();

  // Handle backend change — always reset model to default since model lists differ per backend
  const handleBackendChange = useCallback(
    (backend: AgentBackendType) => {
      updateDraft({ agentBackend: backend, modelPreference: 'default' });
    },
    [updateDraft],
  );

  // Backend selector hook — owns enabled list, label, and toggle cycling
  const backendInfo = useBackendSelector({
    value: currentBackend,
    onChange: handleBackendChange,
  });

  // Sync draft backend with project→global default when project changes
  useEffect(() => {
    if (!backendsSetting) return;
    const resolved =
      selectedProject?.defaultAgentBackend ?? backendsSetting.defaultBackend;
    if (backendsSetting.enabledBackends.includes(resolved)) {
      updateDraft({ agentBackend: resolved, modelPreference: 'default' });
    }
  }, [selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally sync only on project change

  // Sync draft backend with settings: reset to default if not in enabled list
  useEffect(() => {
    if (!backendsSetting) return;
    const draftBackend = draft?.agentBackend ?? 'claude-code';
    if (!backendsSetting.enabledBackends.includes(draftBackend)) {
      const resolved =
        selectedProject?.defaultAgentBackend ?? backendsSetting.defaultBackend;
      updateDraft({
        agentBackend: resolved,
        modelPreference: 'default',
      });
    }
  }, [
    backendsSetting,
    draft?.agentBackend,
    selectedProject?.defaultAgentBackend,
    updateDraft,
  ]);

  // Navigate work items with arrow keys
  // Uses DOM querySelector to match the visual order displayed in WorkItemList
  const navigateWorkItems = useCallback(
    (direction: 'up' | 'down' | 'first' | 'last') => {
      // Find all work item elements in the DOM (in visual order)
      const listEl = document.querySelector('[data-work-item-list]');
      if (!listEl) return;

      const items = Array.from(
        listEl.querySelectorAll<HTMLElement>('[data-work-item-id]'),
      );
      if (items.length === 0) return;

      // Find current highlight index
      const currentIndex = highlightedWorkItemId
        ? items.findIndex(
            (el) => el.dataset.workItemId === highlightedWorkItemId,
          )
        : -1;

      let newIndex: number;
      if (direction === 'first') {
        newIndex = 0;
      } else if (direction === 'last') {
        newIndex = items.length - 1;
      } else if (currentIndex === -1) {
        // No current highlight, start at first/last
        newIndex = direction === 'down' ? 0 : items.length - 1;
      } else {
        // Move up/down with wrapping
        newIndex =
          direction === 'down'
            ? (currentIndex + 1) % items.length
            : (currentIndex - 1 + items.length) % items.length;
      }

      const newId = items[newIndex].dataset.workItemId;
      if (newId) {
        setHighlightedWorkItemId(newId);
      }
    },
    [highlightedWorkItemId],
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
    const workItem = filteredWorkItems.find(
      (wi) => wi.id.toString() === highlightedWorkItemId,
    );
    if (workItem?.url) {
      window.open(workItem.url, '_blank');
    }
  }, [filteredWorkItems, highlightedWorkItemId]);

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
        workItemIds = draft.workItemIds;
        workItemUrls = selectedWorkItems.map((wi) => wi.url);
      } else {
        finalPrompt = draft.prompt;
      }

      // Build task data
      const task = await createTaskMutation.mutateAsync({
        projectId: selectedProjectId,
        prompt: finalPrompt,
        interactionMode: draft.interactionMode,
        modelPreference: draft.modelPreference,
        agentBackend: draft.agentBackend,
        useWorktree: draft.createWorktree,
        sourceBranch: draft.sourceBranch,
        workItemIds,
        workItemUrls,
        updatedAt: new Date().toISOString(),
        autoStart: true,
      });

      // Clear draft on success
      clearDraft();
      onClose();

      // Navigate to the new task
      router.navigate({
        to: '/projects/$projectId/tasks/$taskId',
        params: {
          projectId: task.projectId,
          taskId: task.id,
        },
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
    createTaskMutation,
    clearDraft,
    onClose,
    router,
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

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
      label: 'Toggle Interaction Mode',
      shortcut: 'cmd+i',
      handler: () => {
        toggleInteractionMode();
      },
    },
    {
      label: 'Toggle Model',
      shortcut: 'cmd+l',
      handler: () => {
        toggleModelPreference();
      },
    },
    {
      label: 'Toggle Agent Backend',
      shortcut: 'cmd+j',
      handler: () => {
        backendInfo.toggle();
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
      shortcut: ['tab', 'cmd+right'],
      handler: () => {
        navigateTab('next');
      },
    },
    {
      label: 'Navigate to Previous Project Tab',
      shortcut: ['shift+tab', 'cmd+left'],
      handler: () => {
        navigateTab('prev');
      },
    },
    inputMode === 'search' &&
      searchStep === 'select' && {
        label: 'Navigate Work Items Up',
        shortcut: 'up',
        handler: () => {
          navigateWorkItems('up');
        },
      },
    inputMode === 'search' &&
      searchStep === 'select' && {
        label: 'Navigate Work Items Down',
        shortcut: 'down',
        handler: () => {
          navigateWorkItems('down');
        },
      },
    inputMode === 'search' &&
      searchStep === 'select' && {
        label: 'Navigate to First Work Item',
        shortcut: 'cmd+up',
        handler: () => {
          navigateWorkItems('first');
        },
      },
    inputMode === 'search' &&
      searchStep === 'select' && {
        label: 'Navigate to Last Work Item',
        shortcut: 'cmd+down',
        handler: () => {
          navigateWorkItems('last');
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
        shortcut: 'cmd+o',
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

  // Show search input only in select step
  const showSearchInput = inputMode === 'search' && searchStep === 'select';
  const showPromptInput = inputMode === 'prompt';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={handleOverlayClick}
    >
      <div
        className="flex max-h-[80svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),0_0_100px_-20px_rgba(0,0,0,0.6)]"
        onClick={handleModalClick}
      >
        {/* Search/Prompt input - only show in select or prompt mode */}
        {(showSearchInput || showPromptInput) && (
          <div className="flex shrink-0 items-start border-b border-neutral-700 px-4 py-3">
            <div className="flex flex-1 flex-col">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={getPlaceholder(inputMode)}
                disabled={createTaskMutation.isPending}
                className="placeholder:text-muted-foreground field-sizing-content max-h-[40svh] min-h-[60px] flex-1 resize-none bg-transparent text-sm outline-none disabled:opacity-50"
              />
            </div>
          </div>
        )}

        {/* Project tabs - only show in select or prompt mode */}
        {(showSearchInput || showPromptInput) && (
          <div className="border-border flex shrink-0 items-center gap-1 overflow-x-auto border-b border-neutral-700 px-4 py-2">
            {/* All tab */}
            <button
              onClick={() => setSelectedProjectId(null)}
              disabled={createTaskMutation.isPending}
              className={clsx(
                'shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
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
                disabled={createTaskMutation.isPending}
                className={clsx(
                  'flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50',
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
            <button
              onClick={toggleInteractionMode}
              disabled={createTaskMutation.isPending}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
            >
              <span className="capitalize">
                {draft?.interactionMode ?? 'ask'}
              </span>
              <Kbd shortcut="cmd+i" />
            </button>

            {/* Model selector */}
            <button
              onClick={toggleModelPreference}
              disabled={createTaskMutation.isPending}
              className="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
            >
              <span>{modelDisplayLabel}</span>
              <Kbd shortcut="cmd+l" />
            </button>

            {/* Agent backend toggle — only show when multiple backends enabled */}
            {backendInfo.visible && (
              <button
                onClick={backendInfo.toggle}
                disabled={createTaskMutation.isPending}
                className="flex items-center gap-2 rounded px-2 py-1 text-sm text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
              >
                <span>{backendInfo.label}</span>
                <Kbd shortcut="cmd+j" />
              </button>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft?.createWorktree ?? false}
                onChange={toggleWorktree}
                disabled={createTaskMutation.isPending}
                className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 disabled:opacity-50"
              />
              <span className="text-neutral-300">Worktree</span>
              <Kbd shortcut="cmd+b" />
            </label>

            {/* Source branch selector - only show when project is selected */}
            {!!draft?.createWorktree &&
              selectedProjectId &&
              branches.length > 0 && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-400">from</span>
                  <select
                    value={draft?.sourceBranch ?? ''}
                    onChange={(e) =>
                      updateDraft({ sourceBranch: e.target.value })
                    }
                    disabled={createTaskMutation.isPending}
                    className="max-w-[25%] min-w-[180px] rounded border border-neutral-600 bg-neutral-700 px-2 py-1 text-sm text-neutral-300 outline-none focus:border-neutral-500 disabled:opacity-50"
                  >
                    {branches.map((branch) => (
                      <option key={branch} value={branch}>
                        {branch}
                      </option>
                    ))}
                  </select>
                </div>
              )}
          </div>

          <div className="flex items-center gap-3 text-xs whitespace-nowrap text-neutral-500">
            {createTaskMutation.isPending ? (
              <span className="flex items-center gap-2 text-neutral-300">
                <svg
                  className="h-4 w-4 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating task...
              </span>
            ) : createTaskMutation.isError ? (
              <span className="flex items-center gap-2 text-red-400">
                <svg
                  className="h-4 w-4"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                {createTaskMutation.error instanceof Error
                  ? createTaskMutation.error.message
                  : 'Failed to create task'}
              </span>
            ) : (
              <>
                {showSearchInput && (
                  <span className="flex items-center gap-1">
                    <Kbd shortcut="tab" /> project
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
              </>
            )}
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
  onWorkItemToggle: (workItem: AzureDevOpsWorkItem) => void;
  onWorkItemHighlight: (workItem: AzureDevOpsWorkItem) => void;
  onAdvanceToCompose: () => void;
  canAdvance: boolean;
}) {
  const hasWorkItems = projectHasWorkItems(project);

  // Fetch work items for the selected project
  const { data: workItems = [], isLoading } = useWorkItems({
    providerId: project?.workItemProviderId ?? '',
    projectId: project?.workItemProjectId ?? '',
    projectName: project?.workItemProjectName ?? '',
    filters: { excludeWorkItemTypes: ['Test Suite', 'Epic', 'Feature'] },
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
          getStatusPriority(a.fields.state) - getStatusPriority(b.fields.state),
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
    <div className="flex h-full w-full gap-2 overflow-hidden">
      {/* Work items list */}
      <div className="flex w-full flex-col overflow-hidden">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-400 uppercase">
            Work Items ({filteredWorkItems.length})
            {selectedWorkItemIds.length > 0 && (
              <span className="ml-2 text-blue-400">
                {selectedWorkItemIds.length} selected
              </span>
            )}
          </span>
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
        <div className="overflow-y-auto">
          <WorkItemList
            workItems={filteredWorkItems}
            highlightedWorkItemId={highlightedWorkItemId}
            selectedWorkItemIds={selectedWorkItemIds}
            providerId={project?.workItemProviderId ?? undefined}
            onToggleSelect={onWorkItemToggle}
            onHighlight={onWorkItemHighlight}
          />
        </div>
      </div>

      {/* Work item details */}
      <div className="w-full overflow-y-auto rounded border border-neutral-700 p-2">
        <WorkItemDetails
          workItem={highlightedWorkItem ?? null}
          providerId={project?.workItemProviderId ?? undefined}
        />
      </div>
    </div>
  );
}
