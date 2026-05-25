import { diffLines } from 'diff';

export interface DiffLine {
  type: 'context' | 'addition' | 'deletion';
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

export interface ParsedUnifiedPatch {
  oldString: string;
  newString: string;
}

interface ParsedHunk {
  oldStart: number;
  oldLines: string[];
  newLines: string[];
  hasContext: boolean;
  hasAddition: boolean;
  hasDeletion: boolean;
}

function applyHunkToLines(lines: string[], hunk: ParsedHunk): string[] | null {
  const startIndex = Math.max(hunk.oldStart - 1, 0);
  const before = lines.slice(0, startIndex);
  const target = lines.slice(startIndex, startIndex + hunk.oldLines.length);
  if (target.join('\n') !== hunk.oldLines.join('\n')) return null;
  const after = lines.slice(startIndex + hunk.oldLines.length);
  return [...before, ...hunk.newLines, ...after];
}

function reconstructSequentialPatch(
  hunks: ParsedHunk[],
): ParsedUnifiedPatch | null {
  if (hunks.length === 0) return null;

  const firstHunk = hunks[0];
  if (firstHunk.oldStart !== 0 || firstHunk.oldLines.length !== 0) return null;

  let currentLines = firstHunk.newLines;
  for (const hunk of hunks.slice(1)) {
    const nextLines = applyHunkToLines(currentLines, hunk);
    if (!nextLines) return null;
    currentLines = nextLines;
  }

  return {
    oldString: '',
    newString: currentLines.join('\n'),
  };
}

/**
 * Convert unified diff hunks into old/new strings for DiffView.
 * Header lines (Index, ---, +++, diff --git) are ignored; only @@ hunks count.
 */
export function parseUnifiedPatchToStrings(
  patch: string,
): ParsedUnifiedPatch | null {
  const hunkHeaderPattern = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/;
  const hunks: ParsedHunk[] = [];
  let currentHunk: ParsedHunk | null = null;
  let inHunk = false;

  for (const line of patch.split('\n')) {
    const hunkHeaderMatch = line.match(hunkHeaderPattern);
    if (hunkHeaderMatch) {
      currentHunk = {
        oldStart: Number(hunkHeaderMatch[1]),
        oldLines: [],
        newLines: [],
        hasContext: false,
        hasAddition: false,
        hasDeletion: false,
      };
      hunks.push(currentHunk);
      inHunk = true;
      continue;
    }

    if (!inHunk || !currentHunk) continue;

    if (line.startsWith('\\ No newline at end of file')) {
      continue;
    }

    if (line.startsWith('+')) {
      currentHunk.newLines.push(line.slice(1));
      currentHunk.hasAddition = true;
    } else if (line.startsWith('-')) {
      currentHunk.oldLines.push(line.slice(1));
      currentHunk.hasDeletion = true;
    } else if (line.startsWith(' ')) {
      const content = line.slice(1);
      currentHunk.oldLines.push(content);
      currentHunk.newLines.push(content);
      currentHunk.hasContext = true;
    } else if (line === '') {
      inHunk = false;
    } else {
      inHunk = false;
    }
  }

  const meaningfulHunks = hunks.filter(
    (hunk) => hunk.oldLines.length > 0 || hunk.newLines.length > 0,
  );
  const sawDiffLine = meaningfulHunks.length > 0;
  if (!sawDiffLine) return null;

  const sequentialPatch = reconstructSequentialPatch(meaningfulHunks);
  if (sequentialPatch) return sequentialPatch;

  const hasContext = meaningfulHunks.some((hunk) => hunk.hasContext);
  const hasAddition = meaningfulHunks.some((hunk) => hunk.hasAddition);
  const hasDeletion = meaningfulHunks.some((hunk) => hunk.hasDeletion);

  if (!hasContext && hasAddition && hasDeletion) {
    return {
      oldString: meaningfulHunks.flatMap((hunk) => hunk.oldLines).join('\n'),
      newString: meaningfulHunks.flatMap((hunk) => hunk.newLines).join('\n'),
    };
  }

  const oldLines: string[] = [];
  const newLines: string[] = [];
  for (const hunk of meaningfulHunks) {
    if (oldLines.length > 0 && newLines.length > 0) {
      oldLines.push('⋯');
      newLines.push('⋯');
    }
    oldLines.push(...hunk.oldLines);
    newLines.push(...hunk.newLines);
  }

  return {
    oldString: oldLines.join('\n'),
    newString: newLines.join('\n'),
  };
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

export interface CurrentStateLine {
  content: string;
  lineNumber: number;
  isChanged: boolean;
}

/**
 * Compute lines for the "current state" view.
 * Shows only the new file content, marking which lines were changed (added/modified).
 */
export function computeCurrentStateLines(
  oldStr: string,
  newStr: string,
): CurrentStateLine[] {
  const diffLines = computeDiff(oldStr, newStr);
  const changedNewLineNumbers = new Set<number>();

  for (const line of diffLines) {
    if (line.type === 'addition' && line.newLineNumber !== undefined) {
      changedNewLineNumbers.add(line.newLineNumber);
    }
  }

  const newLines = newStr.split('\n');
  // Handle trailing empty line from split
  if (
    newLines.length > 1 &&
    newLines[newLines.length - 1] === '' &&
    !newStr.endsWith('\n\n')
  ) {
    newLines.pop();
  }

  return newLines.map((content, i) => ({
    content,
    lineNumber: i + 1,
    isChanged: changedNewLineNumbers.has(i + 1),
  }));
}
