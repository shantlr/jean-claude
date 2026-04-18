import { ExternalLink, GitBranch, Trash2 } from 'lucide-react';

import { Dropdown, DropdownItem } from '@/common/ui/dropdown';

export function WorktreeBranchMenu({
  branchName,
  onOpenInEditor,
  onDeleteWorktree,
}: {
  branchName: string;
  onOpenInEditor: () => void;
  onDeleteWorktree: () => void;
}) {
  return (
    <Dropdown
      trigger={
        <button
          className="text-ink-3 hover:text-ink-1 flex max-w-48 min-w-0 items-center gap-1.5 text-sm transition-colors"
          title="Worktree branch actions"
        >
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{branchName}</span>
        </button>
      }
    >
      <DropdownItem icon={<ExternalLink />} onClick={onOpenInEditor}>
        Open in Editor
      </DropdownItem>
      <DropdownItem
        icon={<Trash2 />}
        variant="danger"
        onClick={onDeleteWorktree}
      >
        Delete Worktree
      </DropdownItem>
    </Dropdown>
  );
}
