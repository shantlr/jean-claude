import { query } from '@anthropic-ai/claude-agent-sdk';

import { dbg } from '../lib/debug';

// Schema for structured summary output
const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    whatIDid: {
      type: 'string',
      description: 'A 2-3 sentence summary of what was accomplished',
    },
    keyDecisions: {
      type: 'string',
      description:
        'Markdown bullet points explaining architectural or design choices made',
    },
    annotations: {
      type: 'array',
      description:
        'Annotations for files where the reasoning is NOT obvious from the code. Include examples when helpful. Skip straightforward changes.',
      items: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          lineNumber: { type: 'number' },
          explanation: {
            type: 'string',
            description:
              'Why this change was made (only if non-obvious). Include concrete examples when they help illustrate the point.',
          },
        },
        required: ['filePath', 'lineNumber', 'explanation'],
      },
    },
  },
  required: ['whatIDid', 'keyDecisions', 'annotations'],
} as const;

// Files to ignore in diff summaries (lock files, caches, binaries, etc.)
const IGNORED_PATTERNS = [
  // Lock files
  /^yarn\.lock$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^bun\.lockb$/,
  /^Gemfile\.lock$/,
  /^Cargo\.lock$/,
  /^poetry\.lock$/,
  /^composer\.lock$/,
  // Cache directories
  /^\.yarn\//,
  /^\.pnp\./,
  /^node_modules\//,
  /^\.cache\//,
  // Binary/generated files
  /\.bin$/,
  /\.exe$/,
  /\.dll$/,
  /\.so$/,
  /\.dylib$/,
  /\.wasm$/,
  // Build output
  /^dist\//,
  /^build\//,
  /^out\//,
  // Source maps
  /\.map$/,
];

export interface SummaryContent {
  whatIDid: string;
  keyDecisions: string;
}

export interface FileAnnotation {
  filePath: string;
  lineNumber: number;
  explanation: string;
}

export interface GeneratedSummary {
  summary: SummaryContent;
  annotations: FileAnnotation[];
}

interface DiffFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  diff?: string; // The actual diff content if available
}

/**
 * Checks if a file should be ignored in the summary.
 */
function shouldIgnoreFile(filePath: string): boolean {
  return IGNORED_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Generates a summary of git diff changes using Claude.
 *
 * @param files - Array of changed files with their status and diff content
 * @param taskPrompt - The original task prompt for context
 * @returns Generated summary with "What I Did", "Key Decisions", and annotations
 */
export async function generateSummary(
  files: DiffFile[],
  taskPrompt?: string,
): Promise<GeneratedSummary> {
  // Filter out ignored files
  const relevantFiles = files.filter((f) => !shouldIgnoreFile(f.path));
  const ignoredCount = files.length - relevantFiles.length;

  if (ignoredCount > 0) {
    dbg.agent('Filtered out %d ignored files from summary', ignoredCount);
  }

  // Build the diff content for the prompt
  const diffContent = relevantFiles
    .map((f) => {
      const statusLabel =
        f.status === 'added'
          ? '[NEW FILE]'
          : f.status === 'deleted'
            ? '[DELETED]'
            : '[MODIFIED]';
      return `${statusLabel} ${f.path}${f.diff ? `\n${f.diff}` : ''}`;
    })
    .join('\n\n');

  const prompt = `You are analyzing a git diff to create a summary of code changes.

${taskPrompt ? `## Original Task\n${taskPrompt}\n\n` : ''}## Changed Files
${diffContent}

## Instructions
1. **What I Did**: Write 2-3 sentences summarizing what was accomplished. Focus on the functional changes, not implementation details.

2. **Key Decisions**: List the important architectural or design decisions as markdown bullet points. Explain WHY certain approaches were chosen, trade-offs considered, etc.

3. **Annotations**: Only annotate files where the reasoning is NOT obvious from the code itself. Skip straightforward changes like:
  - Simple bug fixes with obvious causes
  - Renaming or moving files
  - Adding imports
  - Formatting changes
  - Direct implementation of clear requirements

  DO annotate when:
  - A non-obvious approach was chosen
  - There's a subtle reason for the implementation
  - The change has implications that aren't immediately clear
  - A workaround was needed
  - **Specialized syntax requiring domain knowledge**: bash scripts, shell commands, regex patterns, SQL queries, complex git commands, or any code that may be unfamiliar to a general developer

  **Include examples** in annotations when they help illustrate the point. For instance:
  - For regex: explain what it matches with a concrete example (e.g., "Matches filenames like 'pnpm-lock.yaml' or 'yarn.lock'")
  - For bash: explain what the command does (e.g., "\`git rev-parse --verify HEAD\` returns the current commit SHA")
  - For non-obvious patterns: show a before/after or input/output example

Generate the summary now.`;

  dbg.agent('Generating summary for %d files', relevantFiles.length);

  const generator = query({
    prompt,
    options: {
      allowedTools: [],
      permissionMode: 'bypassPermissions',
      model: 'opus',
      outputFormat: {
        type: 'json_schema',
        schema: SUMMARY_SCHEMA,
      },
      persistSession: false,
    },
  });

  for await (const message of generator) {
    const msg = message as {
      type: string;
      structured_output?: {
        whatIDid: string;
        keyDecisions: string;
        annotations: FileAnnotation[];
      };
    };

    if (msg.type === 'result' && msg.structured_output) {
      dbg.agent(
        'Summary generated with %d annotations',
        msg.structured_output.annotations?.length ?? 0,
      );

      return {
        summary: {
          whatIDid: msg.structured_output.whatIDid,
          keyDecisions: msg.structured_output.keyDecisions,
        },
        annotations: msg.structured_output.annotations ?? [],
      };
    }
  }

  // No structured output received - throw error instead of fallback
  throw new Error('Failed to generate summary: no structured output received');
}
