import { diffLines } from 'diff';

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
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
