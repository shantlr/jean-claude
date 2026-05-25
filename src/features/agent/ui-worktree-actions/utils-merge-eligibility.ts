export function canMergeWorktree({
  isStatusLoading,
  isSelectedBranchProtected,
}: {
  isStatusLoading: boolean;
  isSelectedBranchProtected: boolean;
}) {
  return !isStatusLoading && !isSelectedBranchProtected;
}
