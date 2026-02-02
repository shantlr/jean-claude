import { MessageCircle } from 'lucide-react';
import { useMemo, useState, useCallback } from 'react';

import type { InlineComment } from '@/features/agent/ui-diff-view';
import type { FileAnnotation } from '@/lib/api';

/**
 * Hook to convert FileAnnotation[] to InlineComment[] format for the DiffView.
 * Filters annotations for the specified file path and creates expandable inline comments.
 */
export function useAnnotationsAsInlineComments({
  annotations,
  filePath,
}: {
  annotations: FileAnnotation[];
  filePath: string;
}): {
  inlineComments: InlineComment[];
  expandedLines: Set<number>;
  toggleLine: (line: number) => void;
  expandAll: () => void;
  collapseAll: () => void;
} {
  const [expandedLines, setExpandedLines] = useState<Set<number>>(new Set());

  // Filter annotations for this file
  const fileAnnotations = useMemo(() => {
    return annotations.filter((a) => a.filePath === filePath);
  }, [annotations, filePath]);

  const toggleLine = useCallback((line: number) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(line)) {
        next.delete(line);
      } else {
        next.add(line);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedLines(new Set(fileAnnotations.map((a) => a.lineNumber)));
  }, [fileAnnotations]);

  const collapseAll = useCallback(() => {
    setExpandedLines(new Set());
  }, []);

  // Convert annotations to InlineComment[] format
  const inlineComments: InlineComment[] = useMemo(() => {
    return fileAnnotations.map((annotation) => ({
      line: annotation.lineNumber,
      content: (
        <AnnotationContent
          annotation={annotation}
          isExpanded={expandedLines.has(annotation.lineNumber)}
          onToggle={() => toggleLine(annotation.lineNumber)}
        />
      ),
    }));
  }, [fileAnnotations, expandedLines, toggleLine]);

  return {
    inlineComments,
    expandedLines,
    toggleLine,
    expandAll,
    collapseAll,
  };
}

/**
 * Component for rendering a single annotation's content.
 * Shows a collapsed state with icon, expands to show full explanation on click.
 */
export function AnnotationContent({
  annotation,
  isExpanded,
  onToggle,
}: {
  annotation: FileAnnotation;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="flex items-center gap-2 text-left text-xs text-amber-400/80 hover:text-amber-300"
      >
        <MessageCircle className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">
          {isExpanded ? 'Hide explanation' : 'Show explanation'}
        </span>
      </button>
      {isExpanded && (
        <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-neutral-300">
          {annotation.explanation}
        </div>
      )}
    </div>
  );
}

/**
 * Simple gutter icon component that shows the annotation indicator.
 * Used to display the icon in the diff gutter.
 */
export function AnnotationGutterIcon({
  hasAnnotation,
  onClick,
}: {
  hasAnnotation: boolean;
  onClick?: () => void;
}) {
  if (!hasAnnotation) return null;

  return (
    <button
      onClick={onClick}
      className="flex h-full w-full items-center justify-center text-amber-400/70 hover:text-amber-300"
      aria-label="Show annotation"
    >
      <MessageCircle className="h-3 w-3" aria-hidden />
    </button>
  );
}

/**
 * Utility to check if a file has any annotations
 */
export function fileHasAnnotations(
  annotations: FileAnnotation[],
  filePath: string,
): boolean {
  return annotations.some((a) => a.filePath === filePath);
}

/**
 * Get annotation for a specific line in a file
 */
export function getAnnotationForLine(
  annotations: FileAnnotation[],
  filePath: string,
  lineNumber: number,
): FileAnnotation | undefined {
  return annotations.find(
    (a) => a.filePath === filePath && a.lineNumber === lineNumber,
  );
}

/**
 * Get a Set of file paths that have at least one annotation
 */
export function getFilesWithAnnotations(
  annotations: FileAnnotation[],
): Set<string> {
  return new Set(annotations.map((a) => a.filePath));
}
