function getErrorText(error: unknown): string {
  if (error instanceof Error) {
    const extra = [
      'stderr' in error && typeof error.stderr === 'string' ? error.stderr : '',
      'stdout' in error && typeof error.stdout === 'string' ? error.stdout : '',
    ]
      .filter(Boolean)
      .join('\n');

    return [error.message, extra].filter(Boolean).join('\n');
  }

  return String(error);
}

export function formatCreateWorktreeError(error: unknown): string {
  const errorText = getErrorText(error);
  const checkedOutMatch = errorText.match(
    /['"]([^'"]+)['"] is already checked out at ['"]([^'"]+)['"]/,
  );

  if (checkedOutMatch) {
    const [, branchName, worktreePath] = checkedOutMatch;
    return [
      `Branch "${branchName}" is already checked out in another worktree:`,
      worktreePath,
      '',
      'Choose a different source branch, remove that worktree, or open the existing worktree instead.',
    ].join('\n');
  }

  return `Failed to create git worktree: ${errorText}`;
}
