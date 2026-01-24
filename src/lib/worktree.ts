/**
 * Extract git branch name from a worktree path.
 *
 * Worktree paths follow the pattern: ~/.idling/worktrees/project-name/folder-name
 * Branch names follow the convention: idling/<folder-name>
 */
export function getBranchFromWorktreePath(worktreePath: string): string {
  const folderName = worktreePath.split('/').pop() || '';
  return `idling/${folderName}`;
}
