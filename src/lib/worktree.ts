/**
 * Extract git branch name from a worktree path.
 *
 * Worktree paths follow the pattern: ~/.jean-claude/worktrees/project-name/folder-name
 * Branch names follow the convention: jean-claude/<folder-name>
 */
export function getBranchFromWorktreePath(worktreePath: string): string {
  const folderName = worktreePath.split('/').pop() || '';
  return `jean-claude/${folderName}`;
}
