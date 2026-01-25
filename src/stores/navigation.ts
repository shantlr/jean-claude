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

interface TaskState {
  rightPane: RightPane | null;
}

const defaultTaskState: TaskState = {
  rightPane: null,
};

interface NavigationState {
  // App-level: last visited location
  lastLocation: { projectId: string | null; taskId: string | null };

  // Per-project: last viewed task
  lastTaskByProject: Record<string, string>; // projectId -> taskId

  // Per-task: state including right pane
  taskState: Record<string, TaskState>; // taskId -> state

  // Actions
  setLastLocation: (projectId: string | null, taskId: string | null) => void;
  setLastTaskForProject: (projectId: string, taskId: string) => void;
  setTaskRightPane: (taskId: string, pane: RightPane | null) => void;
  clearProjectNavHistoryState: (projectId: string) => void;
  clearTaskNavHistoryState: (taskId: string) => void;
}

const useStore = create<NavigationState>()(
  persist(
    (set) => ({
      lastLocation: { projectId: null, taskId: null },
      lastTaskByProject: {},
      taskState: {},

      setLastLocation: (projectId, taskId) =>
        set({ lastLocation: { projectId, taskId } }),

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

      clearProjectNavHistoryState: (projectId) =>
        set((state) => {
          const { [projectId]: _, ...restTasks } = state.lastTaskByProject;
          const newLastLocation =
            state.lastLocation.projectId === projectId
              ? { projectId: null, taskId: null }
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

          // Clear from lastLocation if this was the last visited task
          const newLastLocation =
            state.lastLocation.taskId === taskId
              ? { projectId: state.lastLocation.projectId, taskId: null }
              : state.lastLocation;

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
      setTaskRightPaneAction(taskId, { type: 'filePreview', filePath, lineStart, lineEnd }),
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
