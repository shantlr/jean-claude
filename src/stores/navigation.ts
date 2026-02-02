import { useCallback } from 'react';
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
      type: 'settings';
    };

interface DiffViewState {
  isOpen: boolean;
  selectedFilePath: string | null;
}

interface TaskState {
  rightPane: RightPane | null;
  diffView: DiffViewState;
}

const defaultDiffViewState: DiffViewState = {
  isOpen: false,
  selectedFilePath: null,
};

const defaultTaskState: TaskState = {
  rightPane: null,
  diffView: defaultDiffViewState,
};

// Constants for diff file tree width
const DEFAULT_DIFF_FILE_TREE_WIDTH = 224; // w-56 equivalent
const MIN_DIFF_FILE_TREE_WIDTH = 150;

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

  // App-level: project filter for session list ('all' or specific projectId)
  projectFilter: string | 'all';

  // Per-project: last viewed task
  lastTaskByProject: Record<string, string>; // projectId -> taskId

  // Per-task: state including right pane
  taskState: Record<string, TaskState>; // taskId -> state

  // Actions
  setLastLocation: (location: LastLocation) => void;
  setDiffFileTreeWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
  setProjectFilter: (filter: string | 'all') => void;
  setLastTaskForProject: (projectId: string, taskId: string) => void;
  setTaskRightPane: (taskId: string, pane: RightPane | null) => void;
  setDiffViewOpen: (taskId: string, isOpen: boolean) => void;
  setDiffViewSelectedFile: (taskId: string, filePath: string | null) => void;
  clearProjectNavHistoryState: (projectId: string) => void;
  clearTaskNavHistoryState: (taskId: string) => void;
}

const useStore = create<NavigationState>()(
  persist(
    (set) => ({
      lastLocation: { type: 'none' } as LastLocation,
      diffFileTreeWidth: DEFAULT_DIFF_FILE_TREE_WIDTH,
      sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
      projectFilter: 'all' as string | 'all',
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

      setProjectFilter: (filter) => set({ projectFilter: filter }),

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

      setDiffViewOpen: (taskId, isOpen) =>
        set((state) => ({
          taskState: {
            ...state.taskState,
            [taskId]: {
              ...defaultTaskState,
              ...state.taskState[taskId],
              diffView: {
                ...(state.taskState[taskId]?.diffView ?? defaultDiffViewState),
                isOpen,
                // Reset selected file when closing
                selectedFilePath: isOpen
                  ? (state.taskState[taskId]?.diffView?.selectedFilePath ??
                    null)
                  : null,
              },
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
    { name: 'navigation' },
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

// Hook for project filter
export function useProjectFilter() {
  const projectFilter = useStore((state) => state.projectFilter);
  const setProjectFilter = useStore((state) => state.setProjectFilter);
  return { projectFilter, setProjectFilter };
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
  const taskState = useStore(
    (state) => state.taskState[taskId] ?? defaultTaskState,
  );
  const setTaskRightPaneAction = useStore((state) => state.setTaskRightPane);

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

  const closeRightPane = useCallback(
    () => setTaskRightPaneAction(taskId, null),
    [taskId, setTaskRightPaneAction],
  );

  return {
    taskState,
    rightPane: taskState.rightPane,
    setRightPane,
    openFilePreview,
    openSettings,
    closeRightPane,
  };
}

// Hook for diff view state
export function useDiffViewState(taskId: string) {
  const diffView = useStore(
    (state) => state.taskState[taskId]?.diffView ?? defaultDiffViewState,
  );
  const setDiffViewOpenAction = useStore((state) => state.setDiffViewOpen);
  const setDiffViewSelectedFileAction = useStore(
    (state) => state.setDiffViewSelectedFile,
  );

  const toggleDiffView = useCallback(
    () => setDiffViewOpenAction(taskId, !diffView.isOpen),
    [taskId, diffView.isOpen, setDiffViewOpenAction],
  );

  const openDiffView = useCallback(
    () => setDiffViewOpenAction(taskId, true),
    [taskId, setDiffViewOpenAction],
  );

  const closeDiffView = useCallback(
    () => setDiffViewOpenAction(taskId, false),
    [taskId, setDiffViewOpenAction],
  );

  const selectFile = useCallback(
    (filePath: string | null) =>
      setDiffViewSelectedFileAction(taskId, filePath),
    [taskId, setDiffViewSelectedFileAction],
  );

  return {
    isOpen: diffView.isOpen,
    selectedFilePath: diffView.selectedFilePath,
    toggleDiffView,
    openDiffView,
    closeDiffView,
    selectFile,
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
