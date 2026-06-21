import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useCallback } from 'react';


interface FileExplorerState {
  selectedFilePath: string | null;
  expandedDirs: string[]; // serialisable (Set not JSON-safe)
}

const defaultState: FileExplorerState = {
  selectedFilePath: null,
  expandedDirs: [],
};

interface ComposerFileExplorerState {
  /** Per-project file explorer state */
  projects: Record<string, FileExplorerState>;

  setSelectedFile: (projectId: string, filePath: string | null) => void;
  toggleExpandedDir: (projectId: string, dirPath: string) => void;
  clearProject: (projectId: string) => void;
}

const useStore = create<ComposerFileExplorerState>()(
  persist(
    (set) => ({
      projects: {},

      setSelectedFile: (projectId, filePath) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...(state.projects[projectId] ?? defaultState),
              selectedFilePath: filePath,
            },
          },
        })),

      toggleExpandedDir: (projectId, dirPath) =>
        set((state) => {
          const prev = state.projects[projectId] ?? defaultState;
          const dirs = new Set(prev.expandedDirs);
          if (dirs.has(dirPath)) {
            dirs.delete(dirPath);
          } else {
            dirs.add(dirPath);
          }
          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...prev,
                expandedDirs: [...dirs],
              },
            },
          };
        }),

      clearProject: (projectId) =>
        set((state) => {
          const { [projectId]: _, ...rest } = state.projects;
          return { projects: rest };
        }),
    }),
    {
      name: 'composer-file-explorer',
    },
  ),
);

export function useComposerFileExplorerState(projectId: string) {
  const projectState = useStore(
    (state) => state.projects[projectId] ?? defaultState,
  );
  const setSelectedFileAction = useStore((state) => state.setSelectedFile);
  const toggleExpandedDirAction = useStore((state) => state.toggleExpandedDir);

  const selectedFilePath = projectState.selectedFilePath;

  // Convert stored array to Set for FileTree compatibility
  const expandedDirs = projectState.expandedDirs;

  const selectFile = useCallback(
    (filePath: string | null) => setSelectedFileAction(projectId, filePath),
    [projectId, setSelectedFileAction],
  );

  const toggleDir = useCallback(
    (dirPath: string) => toggleExpandedDirAction(projectId, dirPath),
    [projectId, toggleExpandedDirAction],
  );

  return { selectedFilePath, expandedDirs, selectFile, toggleDir };
}
