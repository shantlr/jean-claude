import { diffLines } from 'diff';

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface SideBySideRow {
  left: DiffLine | null; // null = gap (addition on right)
  right: DiffLine | null; // null = gap (deletion on left)
}

/**
 * Compute a line-by-line diff between two strings.
 * Returns structured diff lines with type and line numbers.
 */
export function computeDiff(oldStr: string, newStr: string): DiffLine[] {
  const changes = diffLines(oldStr, newStr);
  const lines: DiffLine[] = [];
  let oldLineNum = 1;
  let newLineNum = 1;

  for (const change of changes) {
    // Split into individual lines
    const changeLines = change.value.split('\n');

    // diffLines includes trailing newline in the value, which creates an empty string
    // after split. Remove it unless the entire change is just a newline.
    if (changeLines.length > 1 && changeLines[changeLines.length - 1] === '') {
      changeLines.pop();
    }

    for (const line of changeLines) {
      if (change.added) {
        lines.push({
          type: 'addition',
          content: line,
          newLineNumber: newLineNum++,
        });
      } else if (change.removed) {
        lines.push({
          type: 'deletion',
          content: line,
          oldLineNumber: oldLineNum++,
        });
      } else {
        lines.push({
          type: 'context',
          content: line,
          oldLineNumber: oldLineNum++,
          newLineNumber: newLineNum++,
        });
      }
    }
  }

  return lines;
}

/**
 * Convert flat diff lines into aligned side-by-side rows.
 * Context lines appear on both sides. Deletions appear on left with gap on right.
 * Additions appear on right with gap on left.
 */
export function computeSideBySideDiff(
  oldStr: string,
  newStr: string,
): SideBySideRow[] {
  const lines = computeDiff(oldStr, newStr);
  const rows: SideBySideRow[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.type === 'context') {
      // Context lines appear on both sides
      rows.push({ left: line, right: line });
      i++;
    } else if (line.type === 'deletion') {
      // Collect consecutive deletions
      const deletions: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'deletion') {
        deletions.push(lines[i]);
        i++;
      }

      // Collect consecutive additions that follow
      const additions: DiffLine[] = [];
      while (i < lines.length && lines[i].type === 'addition') {
        additions.push(lines[i]);
        i++;
      }

      // Pair them up, filling gaps as needed
      const maxLen = Math.max(deletions.length, additions.length);
      for (let j = 0; j < maxLen; j++) {
        rows.push({
          left: deletions[j] ?? null,
          right: additions[j] ?? null,
        });
      }
    } else if (line.type === 'addition') {
      // Addition without preceding deletion
      rows.push({ left: null, right: line });
      i++;
    }
  }

  return rows;
}
