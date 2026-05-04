export interface FoldRange {
  /** Line number where the fold starts (1-indexed) */
  startLine: number;
  /** Line number where the fold ends (inclusive, 1-indexed) */
  endLine: number;
}
