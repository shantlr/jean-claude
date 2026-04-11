import { useNavigate, useParams, useRouterState } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Discriminated union for right pane types
export type RightPane =
  | {
      type: 'filePreview';
      filePath: string;
      lineStart?: number;
      lineEnd?: number;
    }
  | {
      type: 'toolDiffPreview';
      filePath: string;
      oldString: string;
      newString: string;
    }
  | {
      type: 'settings';
    }
  | {
      type: 'debugMessages';
      scrollToEntryId?: string;
    }
  | {
      type: 'fileExplorer';
    }
  | {
      type: 'commandLogs';
      selectedCommandId: string | null;
    };

interface DiffViewState {
  selectedFilePath: string | null;
}

interface FileExplorerState {
  selectedFilePath: string | null;
  expandedDirs: Set<string>;
}

type TaskViewMode = 'diff' | 'pr' | undefined;

interface TaskState {
  rightPane: RightPane | null;
  activeView: TaskViewMode;
  diffView: DiffViewState;
  fileExplorer?: FileExplorerState;
  activeStepId: string | null;
}

const defaultDiffViewState: DiffViewState = {
  selectedFilePath: null,
};

const defaultFileExplorerState: FileExplorerState = {
  selectedFilePath: null,
  expandedDirs: new Set<string>(),
};

const defaultTaskState: TaskState = {
  rightPane: null,
  activeView: undefined,
  diffView: defaultDiffViewState,
  fileExplorer: defaultFileExplorerState,
  activeStepId: null,
};

// Constants for diff file tree width
const DEFAULT_DIFF_FILE_TREE_WIDTH = 224; // w-56 equivalent
const MIN_DIFF_FILE_TREE_WIDTH = 150;

// Constants for debug messages pane width (side-by-side raw vs normalized)
const DEFAULT_DEBUG_MESSAGES_PANE_WIDTH = 700;
const MIN_DEBUG_MESSAGES_PANE_WIDTH = 500;
const MAX_DEBUG_MESSAGES_PANE_WIDTH = 1400;

// Constants for file explorer tree width
const DEFAULT_FILE_EXPLORER_TREE_WIDTH = 224;
const MIN_FILE_EXPLORER_TREE_WIDTH = 150;

// Constants for file explorer pane width
const DEFAULT_FILE_EXPLORER_PANE_WIDTH = 300;
const MIN_FILE_EXPLORER_PANE_WIDTH = 250;

// Constants for run command logs pane width
const DEFAULT_COMMAND_LOGS_PANE_WIDTH = 520;
const MIN_COMMAND_LOGS_PANE_WIDTH = 320;
const MAX_COMMAND_LOGS_PANE_WIDTH = 1200;

// Constants for tool diff preview pane width
const DEFAULT_TOOL_DIFF_PREVIEW_PANE_WIDTH = 520;
const MIN_TOOL_DIFF_PREVIEW_PANE_WIDTH = 360;
const MAX_TOOL_DIFF_PREVIEW_PANE_WIDTH = 1400;

// Constants for sidebar width
const DEFAULT_SIDEBAR_WIDTH = 256; // w-64 equivalent
const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 400;

// Discriminated union for last location
export type LastLocation =
  | { type: 'project'; projectId: string; taskId: string | null }
  | { type: 'none' };

interface NavigationState {
  // App-level: last visited location (project or All Tasks)
  lastLocation: LastLocation;

  // App-level: diff file tree width (global setting)
  diffFileTreeWidth: number;

  // App-level: sidebar width (global setting)
  sidebarWidth: number;

  // App-level: debug messages pane width (global setting)
  debugMessagesPaneWidth: number;

  // App-level: file explorer tree width (global setting)
  fileExplorerTreeWidth: number;

  // App-level: file explorer pane width (global setting)
  fileExplorerPaneWidth: number;

  // App-level: run command logs pane width (global setting)
  commandLogsPaneWidth: number;

  // App-level: tool diff preview pane width (global setting)
  toolDiffPreviewPaneWidth: number;

  // App-level: sidebar content tab ('tasks' or 'prs')
  sidebarTab: 'tasks' | 'prs';

  // Per-project: last viewed task
  lastTaskByProject: Record<string, string>; // projectId -> taskId

  // Per-task: state including right pane
  taskState: Record<string, TaskState>; // taskId -> state

  // Actions
  setLastLocation: (location: LastLocation) => void;
  setDiffFileTreeWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
  setDebugMessagesPaneWidth: (width: number) => void;
  setFileExplorerTreeWidth: (width: number) => void;
  setFileExplorerPaneWidth: (width: number) => void;
  setCommandLogsPaneWidth: (width: number) => void;
  setToolDiffPreviewPaneWidth: (width: number) => void;
  setSidebarTab: (tab: 'tasks' | 'prs') => void;
  setLastTaskForProject: (projectId: string, taskId: string) => void;
  setTaskRightPane: (taskId: string, pane: RightPane | null) => void;
  setTaskViewMode: (taskId: string, mode: TaskViewMode) => void;
  setDiffViewSelectedFile: (taskId: string, filePath: string | null) => void;
  setFileExplorerSelectedFile: (
    taskId: string,
    filePath: string | null,
  ) => void;
  toggleFileExplorerExpandedDir: (taskId: string, dirPath: string) => void;
  setActiveStepId: (taskId: string, stepId: string | null) => void;
  clearProjectNavHistoryState: (projectId: string) => void;
  clearTaskNavHistoryState: (taskId: string) => void;
}

const useStore = create<NavigationState>()(
  persist(
    (set) => ({
      lastLocation: { type: 'none' } as LastLocation,
      diffFileTreeWidth: DEFAULT_DIFF_FILE_TREE_WIDTH,
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      debugMessagesPaneWidth: DEFAULT_DEBUG_MESSAGES_PANE_WIDTH,
      fileExplorerTreeWidth: DEFAULT_FILE_EXPLORER_TREE_WIDTH,
      fileExplorerPaneWidth: DEFAULT_FILE_EXPLORER_PANE_WIDTH,
      commandLogsPaneWidth: DEFAULT_COMMAND_LOGS_PANE_WIDTH,
      toolDiffPreviewPaneWidth: DEFAULT_TOOL_DIFF_PREVIEW_PANE_WIDTH,
      sidebarTab: 'tasks' as 'tasks' | 'prs',
      lastTaskByProject: {},
      taskState: {},

      setLastLocation: (location) => set({ lastLocation: location }),

      setDiffFileTreeWidth: (width) =>
        set({ diffFileTreeWidth: Math.max(MIN_DIFF_FILE_TREE_WIDTH, width) }),

      setSidebarWidth: (width) =>
        set({
          sidebarWidth: Math.min(
            Math.max(MIN_SIDEBAR_WIDTH, width),
            MAX_SIDEBAR_WIDTH,
          ),
        }),

      setDebugMessagesPaneWidth: (width) =>
        set({
          debugMessagesPaneWidth: Math.min(
            Math.max(MIN_DEBUG_MESSAGES_PANE_WIDTH, width),
            MAX_DEBUG_MESSAGES_PANE_WIDTH,
          ),
        }),

      setFileExplorerTreeWidth: (width) =>
        set({
          fileExplorerTreeWidth: Math.max(MIN_FILE_EXPLORER_TREE_WIDTH, width),
        }),

      setFileExplorerPaneWidth: (width) =>
        set({
          fileExplorerPaneWidth: Math.max(MIN_FILE_EXPLORER_PANE_WIDTH, width),
        }),

      setCommandLogsPaneWidth: (width) =>
        set({
          commandLogsPaneWidth: Math.min(
            Math.max(MIN_COMMAND_LOGS_PANE_WIDTH, width),
            MAX_COMMAND_LOGS_PANE_WIDTH,
          ),
        }),

      setToolDiffPreviewPaneWidth: (width) =>
        set({
          toolDiffPreviewPaneWidth: Math.min(
            Math.max(MIN_TOOL_DIFF_PREVIEW_PANE_WIDTH, width),
            MAX_TOOL_DIFF_PREVIEW_PANE_WIDTH,
          ),
        }),

      setSidebarTab: (tab) => set({ sidebarTab: tab }),

      setLastTaskForProject: (projectId, taskId) =>
        set((state) => ({
          lastTaskByProject: {
            ...state.lastTaskByProject,
            [projectId]: taskId,
          },
        })),

      setTaskRightPane: (taskId, pane) =>
        set((state) => ({
          taskState: {
            ...state.taskState,
            [taskId]: {
              ...defaultTaskState,
              ...state.taskState[taskId],
              rightPane: pane,
            },
          },
        })),

      setTaskViewMode: (taskId, mode) =>
        set((state) => ({
          taskState: {
            ...state.taskState,
            [taskId]: {
              ...defaultTaskState,
              ...state.taskState[taskId],
              activeView: mode,
            },
          },
        })),

      setDiffViewSelectedFile: (taskId, filePath) =>
        set((state) => ({
          taskState: {
            ...state.taskState,
            [taskId]: {
              ...defaultTaskState,
              ...state.taskState[taskId],
              diffView: {
                ...(state.taskState[taskId]?.diffView ?? defaultDiffViewState),
                selectedFilePath: filePath,
              },
            },
          },
        })),

      setFileExplorerSelectedFile: (taskId, filePath) =>
        set((state) => ({
          taskState: {
            ...state.taskState,
            [taskId]: {
              ...defaultTaskState,
              ...state.taskState[taskId],
              fileExplorer: {
                ...(state.taskState[taskId]?.fileExplorer ??
                  defaultFileExplorerState),
                selectedFilePath: filePath,
              },
            },
          },
        })),

      toggleFileExplorerExpandedDir: (taskId, dirPath) =>
        set((state) => {
          const taskState = state.taskState[taskId] ?? defaultTaskState;
          const fileExplorerState =
            taskState.fileExplorer ?? defaultFileExplorerState;
          const nextExpandedDirs = new Set(fileExplorerState.expandedDirs);

          if (nextExpandedDirs.has(dirPath)) {
            nextExpandedDirs.delete(dirPath);
          } else {
            nextExpandedDirs.add(dirPath);
          }

          return {
            taskState: {
              ...state.taskState,
              [taskId]: {
                ...defaultTaskState,
                ...state.taskState[taskId],
                fileExplorer: {
                  ...fileExplorerState,
                  expandedDirs: nextExpandedDirs,
                },
              },
            },
          };
        }),

      setActiveStepId: (taskId, stepId) =>
        set((state) => ({
          taskState: {
            ...state.taskState,
            [taskId]: {
              ...defaultTaskState,
              ...state.taskState[taskId],
              activeStepId: stepId,
            },
          },
        })),

      clearProjectNavHistoryState: (projectId) =>
        set((state) => {
          const { [projectId]: _, ...restTasks } = state.lastTaskByProject;
          const newLastLocation =
            state.lastLocation.type === 'project' &&
            state.lastLocation.projectId === projectId
              ? ({ type: 'none' } as LastLocation)
              : state.lastLocation;
          return {
            lastTaskByProject: restTasks,
            lastLocation: newLastLocation,
          };
        }),

      clearTaskNavHistoryState: (taskId) =>
        set((state) => {
          const { [taskId]: _, ...restTaskState } = state.taskState;

          // Also remove from lastTaskByProject if this task was the last viewed
          const newLastTaskByProject = { ...state.lastTaskByProject };
          for (const [projectId, storedTaskId] of Object.entries(
            newLastTaskByProject,
          )) {
            if (storedTaskId === taskId) {
              delete newLastTaskByProject[projectId];
            }
          }

          // Clear taskId from lastLocation if this was the last visited task
          let newLastLocation = state.lastLocation;
          if (state.lastLocation.type === 'project') {
            if (state.lastLocation.taskId === taskId) {
              newLastLocation = {
                type: 'project',
                projectId: state.lastLocation.projectId,
                taskId: null,
              };
            }
          }

          return {
            taskState: restTaskState,
            lastTaskByProject: newLastTaskByProject,
            lastLocation: newLastLocation,
          };
        }),
    }),
    {
      name: 'navigation',
      partialize: (state) => ({
        ...state,
        taskState: Object.fromEntries(
          Object.entries(state.taskState).map(([taskId, taskState]) => [
            taskId,
            {
              rightPane: taskState.rightPane,
              activeView: taskState.activeView,
              diffView: taskState.diffView,
            },
          ]),
        ),
      }),
    },
  ),
);

// Direct store access for non-React contexts (e.g., beforeLoad)
export const useNavigationStore = useStore;

// Hook for app-level last location
export function useLastLocation() {
  const lastLocation = useStore((state) => state.lastLocation);
  const setLastLocation = useStore((state) => state.setLastLocation);
  return { lastLocation, setLastLocation };
}

// Hook for current route-visible project
export function useCurrentVisibleProject() {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const projectId = (() => {
    const segments = pathname.split('/').filter(Boolean);
    if (segments[0] !== 'projects') {
      return 'all' as const;
    }

    const routeProjectId = segments[1];
    if (!routeProjectId || routeProjectId === 'new') {
      return 'all' as const;
    }

    return decodeURIComponent(routeProjectId);
  })();

  const moveToProject = useCallback(
    (nextProjectId: string | 'all') => {
      if (nextProjectId === projectId) {
        return;
      }

      if (nextProjectId === 'all') {
        const taskId = params.taskId;
        if (typeof taskId === 'string') {
          navigate({ to: '/all/$taskId', params: { taskId } });
          return;
        }

        const projectId = params.projectId;
        const prId = params.prId;
        if (typeof projectId === 'string' && typeof prId === 'string') {
          navigate({
            to: '/all/prs/$projectId/$prId',
            params: { projectId, prId },
          });
          return;
        }

        if (typeof projectId === 'string' && pathname.includes('/prs')) {
          navigate({
            to: '/all/prs/$projectId',
            params: { projectId },
          });
        }

        return;
      }

      navigate({
        to: '/projects/$projectId',
        params: { projectId: nextProjectId },
      });
    },
    [
      navigate,
      params.prId,
      params.projectId,
      params.taskId,
      pathname,
      projectId,
    ],
  );

  return { projectId, moveToProject };
}

// Hook for sidebar tab
export function useSidebarTab() {
  const sidebarTab = useStore((state) => state.sidebarTab);
  const setSidebarTab = useStore((state) => state.setSidebarTab);
  return { sidebarTab, setSidebarTab };
}

// Hook for per-project last task
export function useLastTaskForProject(projectId: string) {
  const lastTaskId = useStore(
    (state) => state.lastTaskByProject[projectId] ?? null,
  );
  const setLastTaskForProjectAction = useStore(
    (state) => state.setLastTaskForProject,
  );
  const clearTaskNavHistoryStateAction = useStore(
    (state) => state.clearTaskNavHistoryState,
  );

  const setLastTaskForProject = useCallback(
    (taskId: string) => setLastTaskForProjectAction(projectId, taskId),
    [projectId, setLastTaskForProjectAction],
  );

  const clearTaskNavHistoryState = useCallback(
    (taskId: string) => clearTaskNavHistoryStateAction(taskId),
    [clearTaskNavHistoryStateAction],
  );

  return { lastTaskId, setLastTaskForProject, clearTaskNavHistoryState };
}

// Hook for per-task state
export function useTaskState(taskId: string) {
  const storedTaskState = useStore((state) => {
    return state.taskState[taskId];
  });
  const taskState = useMemo(
    () => ({
      ...defaultTaskState,
      ...storedTaskState,
      diffView: storedTaskState?.diffView ?? defaultDiffViewState,
    }),
    [storedTaskState],
  );
  const setTaskRightPaneAction = useStore((state) => state.setTaskRightPane);
  const setActiveStepIdAction = useStore((state) => state.setActiveStepId);

  const setRightPane = useCallback(
    (pane: RightPane | null) => setTaskRightPaneAction(taskId, pane),
    [taskId, setTaskRightPaneAction],
  );

  const openFilePreview = useCallback(
    (filePath: string, lineStart?: number, lineEnd?: number) =>
      setTaskRightPaneAction(taskId, {
        type: 'filePreview',
        filePath,
        lineStart,
        lineEnd,
      }),
    [taskId, setTaskRightPaneAction],
  );

  const openSettings = useCallback(
    () => setTaskRightPaneAction(taskId, { type: 'settings' }),
    [taskId, setTaskRightPaneAction],
  );

  const openToolDiffPreview = useCallback(
    ({
      filePath,
      oldString,
      newString,
    }: {
      filePath: string;
      oldString: string;
      newString: string;
    }) =>
      setTaskRightPaneAction(taskId, {
        type: 'toolDiffPreview',
        filePath,
        oldString,
        newString,
      }),
    [taskId, setTaskRightPaneAction],
  );

  const openDebugMessages = useCallback(
    (scrollToEntryId?: string) =>
      setTaskRightPaneAction(taskId, {
        type: 'debugMessages',
        scrollToEntryId,
      }),
    [taskId, setTaskRightPaneAction],
  );

  const openFileExplorer = useCallback(
    () =>
      setTaskRightPaneAction(taskId, {
        type: 'fileExplorer',
      }),
    [taskId, setTaskRightPaneAction],
  );

  const openCommandLogs = useCallback(
    (selectedCommandId: string | null = null) =>
      setTaskRightPaneAction(taskId, {
        type: 'commandLogs',
        selectedCommandId,
      }),
    [taskId, setTaskRightPaneAction],
  );

  const selectCommandLogsTab = useCallback(
    (commandId: string | null) => {
      setTaskRightPaneAction(taskId, {
        type: 'commandLogs',
        selectedCommandId: commandId,
      });
    },
    [taskId, setTaskRightPaneAction],
  );

  const closeRightPane = useCallback(
    () => setTaskRightPaneAction(taskId, null),
    [taskId, setTaskRightPaneAction],
  );
  const toggleRightPane = useCallback(() => {
    if (taskState.rightPane) {
      closeRightPane();
    } else {
      openSettings();
    }
  }, [taskState.rightPane, closeRightPane, openSettings]);

  const setActiveStepId = useCallback(
    (stepId: string | null) => setActiveStepIdAction(taskId, stepId),
    [taskId, setActiveStepIdAction],
  );

  return {
    taskState,
    rightPane: taskState.rightPane,
    activeStepId: taskState.activeStepId,
    setRightPane,
    setActiveStepId,
    openFilePreview,
    openToolDiffPreview,
    openSettings,
    openDebugMessages,
    openFileExplorer,
    openCommandLogs,
    selectCommandLogsTab,
    closeRightPane,
    toggleRightPane,
  };
}

export function useTaskFileExplorerState(taskId: string) {
  const fileExplorerState = useStore(
    (state) =>
      state.taskState[taskId]?.fileExplorer ?? defaultFileExplorerState,
  );
  const setFileExplorerSelectedFileAction = useStore(
    (state) => state.setFileExplorerSelectedFile,
  );
  const toggleFileExplorerExpandedDirAction = useStore(
    (state) => state.toggleFileExplorerExpandedDir,
  );

  const selectFile = useCallback(
    (filePath: string | null) =>
      setFileExplorerSelectedFileAction(taskId, filePath),
    [taskId, setFileExplorerSelectedFileAction],
  );

  const toggleDir = useCallback(
    (dirPath: string) => toggleFileExplorerExpandedDirAction(taskId, dirPath),
    [taskId, toggleFileExplorerExpandedDirAction],
  );

  return {
    selectedFilePath: fileExplorerState.selectedFilePath,
    expandedDirs: fileExplorerState.expandedDirs,
    selectFile,
    toggleDir,
  };
}

// Hook for diff view state
export function useDiffViewState(taskId: string) {
  const taskState = useStore(
    (state) => state.taskState[taskId] ?? defaultTaskState,
  );
  const setTaskViewModeAction = useStore((state) => state.setTaskViewMode);
  const setDiffViewSelectedFileAction = useStore(
    (state) => state.setDiffViewSelectedFile,
  );

  const toggleDiffView = useCallback(
    () =>
      setTaskViewModeAction(
        taskId,
        taskState.activeView === 'diff' ? undefined : 'diff',
      ),
    [taskId, taskState.activeView, setTaskViewModeAction],
  );

  const openDiffView = useCallback(
    () => setTaskViewModeAction(taskId, 'diff'),
    [taskId, setTaskViewModeAction],
  );

  const closeDiffView = useCallback(
    () => setTaskViewModeAction(taskId, undefined),
    [taskId, setTaskViewModeAction],
  );

  const selectFile = useCallback(
    (filePath: string | null) =>
      setDiffViewSelectedFileAction(taskId, filePath),
    [taskId, setDiffViewSelectedFileAction],
  );

  return {
    isOpen: taskState.activeView === 'diff',
    selectedFilePath: taskState.diffView.selectedFilePath,
    toggleDiffView,
    openDiffView,
    closeDiffView,
    selectFile,
  };
}

// Hook for PR view state
export function usePrViewState(taskId: string) {
  const activeView = useStore(
    (state) => state.taskState[taskId]?.activeView ?? undefined,
  );
  const setTaskViewModeAction = useStore((state) => state.setTaskViewMode);

  const togglePrView = useCallback(
    () => setTaskViewModeAction(taskId, activeView === 'pr' ? undefined : 'pr'),
    [taskId, activeView, setTaskViewModeAction],
  );

  const openPrView = useCallback(
    () => setTaskViewModeAction(taskId, 'pr'),
    [taskId, setTaskViewModeAction],
  );

  const closePrView = useCallback(
    () => setTaskViewModeAction(taskId, undefined),
    [taskId, setTaskViewModeAction],
  );

  return {
    isOpen: activeView === 'pr',
    togglePrView,
    openPrView,
    closePrView,
  };
}

// Hook for diff file tree width
export function useDiffFileTreeWidth() {
  const width = useStore((state) => state.diffFileTreeWidth);
  const setWidth = useStore((state) => state.setDiffFileTreeWidth);
  return { width, setWidth, minWidth: MIN_DIFF_FILE_TREE_WIDTH };
}

// Hook for sidebar width
export function useSidebarWidth() {
  const width = useStore((state) => state.sidebarWidth);
  const setWidth = useStore((state) => state.setSidebarWidth);
  return {
    width,
    setWidth,
    minWidth: MIN_SIDEBAR_WIDTH,
    maxWidth: MAX_SIDEBAR_WIDTH,
  };
}

// Hook for debug messages pane width
export function useDebugMessagesPaneWidth() {
  const width = useStore((state) => state.debugMessagesPaneWidth);
  const setWidth = useStore((state) => state.setDebugMessagesPaneWidth);
  return {
    width,
    setWidth,
    minWidth: MIN_DEBUG_MESSAGES_PANE_WIDTH,
    maxWidth: MAX_DEBUG_MESSAGES_PANE_WIDTH,
  };
}

// Hook for file explorer tree width
export function useFileExplorerTreeWidth() {
  const width = useStore((state) => state.fileExplorerTreeWidth);
  const setWidth = useStore((state) => state.setFileExplorerTreeWidth);
  return { width, setWidth };
}

// Hook for file explorer pane width
export function useFileExplorerPaneWidth() {
  const width = useStore((state) => state.fileExplorerPaneWidth);
  const setWidth = useStore((state) => state.setFileExplorerPaneWidth);
  return { width, setWidth };
}

// Hook for run command logs pane width
export function useCommandLogsPaneWidth() {
  const width = useStore((state) => state.commandLogsPaneWidth);
  const setWidth = useStore((state) => state.setCommandLogsPaneWidth);
  return {
    width,
    setWidth,
    minWidth: MIN_COMMAND_LOGS_PANE_WIDTH,
    maxWidth: MAX_COMMAND_LOGS_PANE_WIDTH,
  };
}

// Hook for tool diff preview pane width
export function useToolDiffPreviewPaneWidth() {
  const width = useStore((state) => state.toolDiffPreviewPaneWidth);
  const setWidth = useStore((state) => state.setToolDiffPreviewPaneWidth);
  return {
    width,
    setWidth,
    minWidth: MIN_TOOL_DIFF_PREVIEW_PANE_WIDTH,
    maxWidth: MAX_TOOL_DIFF_PREVIEW_PANE_WIDTH,
  };
}
