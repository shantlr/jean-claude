import { ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';

import { useProjectBranches, useUpdateProject } from '@/hooks/use-projects';

interface ProjectSettingsProps {
  projectId: string;
  defaultBranch: string | null;
}

export function ProjectSettings({
  projectId,
  defaultBranch,
}: ProjectSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState(defaultBranch ?? '');

  const { data: branches, isLoading } = useProjectBranches(
    isOpen ? projectId : null
  );
  const updateProject = useUpdateProject();

  // Initialize selected branch when branches load
  useEffect(() => {
    if (branches && branches.length > 0 && !selectedBranch) {
      const initial =
        defaultBranch ??
        (branches.includes('main')
          ? 'main'
          : branches.includes('master')
            ? 'master'
            : branches[0]);
      setSelectedBranch(initial);
    }
  }, [branches, defaultBranch, selectedBranch]);

  const handleBranchChange = (branch: string) => {
    setSelectedBranch(branch);
    updateProject.mutate({
      id: projectId,
      data: { defaultBranch: branch, updatedAt: new Date().toISOString() },
    });
  };

  return (
    <div className="border-t border-neutral-700">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300"
      >
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Settings className="h-4 w-4" />
        Settings
      </button>

      {isOpen && (
        <div className="px-4 pb-3">
          <label className="mb-1.5 block text-xs font-medium text-neutral-500">
            Default merge branch
          </label>
          <select
            value={selectedBranch}
            onChange={(e) => handleBranchChange(e.target.value)}
            disabled={isLoading || !branches?.length}
            className="w-full rounded-md border border-neutral-600 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none disabled:opacity-50"
          >
            {isLoading ? (
              <option>Loading...</option>
            ) : branches?.length === 0 ? (
              <option>No branches found</option>
            ) : (
              branches?.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))
            )}
          </select>
        </div>
      )}
    </div>
  );
}
