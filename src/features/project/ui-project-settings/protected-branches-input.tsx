import { Shield, X } from 'lucide-react';
import { useMemo } from 'react';

import { Select } from '@/common/ui/select';

export function ProtectedBranchesInput({
  branches,
  branchesLoading,
  protectedBranches,
  onChange,
}: {
  branches: string[];
  branchesLoading: boolean;
  protectedBranches: string[];
  onChange: (branches: string[]) => void;
}) {
  const availableBranches = useMemo(
    () => branches.filter((b) => !protectedBranches.includes(b)),
    [branches, protectedBranches],
  );

  const handleAdd = (branch: string) => {
    if (branch && !protectedBranches.includes(branch)) {
      onChange([...protectedBranches, branch]);
    }
  };

  const handleRemove = (branch: string) => {
    onChange(protectedBranches.filter((b) => b !== branch));
  };

  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-neutral-300">
        <Shield className="h-4 w-4 text-amber-400" />
        Protected branches
      </label>
      {protectedBranches.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {protectedBranches.map((branch) => (
            <ProtectedBranchBadge
              key={branch}
              branch={branch}
              onRemove={() => handleRemove(branch)}
            />
          ))}
        </div>
      )}
      <Select
        value=""
        options={
          branchesLoading
            ? [{ value: '', label: 'Loading...' }]
            : availableBranches.length === 0
              ? [{ value: '', label: 'No branches available' }]
              : [
                  { value: '', label: 'Add a protected branch...' },
                  ...availableBranches.map((b) => ({ value: b, label: b })),
                ]
        }
        onChange={(value) => {
          if (value) handleAdd(value);
        }}
        disabled={branchesLoading || availableBranches.length === 0}
        className="w-full justify-between"
      />
      <p className="mt-1 text-xs text-neutral-500">
        Direct merges into protected branches are blocked
      </p>
    </div>
  );
}

export function ProtectedBranchBadge({
  branch,
  onRemove,
}: {
  branch: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-amber-800/50 bg-amber-950/30 px-2 py-0.5 text-xs text-amber-300">
      {branch}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="cursor-pointer rounded p-0.5 transition-colors hover:bg-amber-800/30"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
