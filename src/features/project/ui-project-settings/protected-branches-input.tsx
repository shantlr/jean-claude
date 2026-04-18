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
      <label className="text-ink-1 mb-1 flex items-center gap-1.5 text-sm font-medium">
        <Shield className="text-status-run h-4 w-4" />
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
      <p className="text-ink-3 mt-1 text-xs">
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
    <span className="border-status-run/50 bg-status-run/10 text-status-run inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs">
      {branch}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hover:bg-status-run/20 cursor-pointer rounded p-0.5 transition-colors"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}
