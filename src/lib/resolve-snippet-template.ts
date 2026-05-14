import Handlebars from 'handlebars';

import type { PromptSnippet } from '@shared/types';

export type SnippetVariableContext = {
  task?: {
    worktreePath?: string | null;
    name?: string | null;
    note?: string | null;
    sourceBranch?: string | null;
    branchName?: string | null;
  };
  project?: {
    name?: string | null;
    path?: string | null;
  };
  workItems?: Array<{
    id: string | number;
    title?: string;
    description?: string;
    comments?: Array<{
      author?: string;
      date?: string;
      body?: string;
    }>;
    testCases?: Array<{
      id: string | number;
      title: string;
      steps?: Array<{
        action: string;
        expectedResult: string;
      }>;
    }>;
  }>;
};

// Register custom helpers
Handlebars.registerHelper(
  'ifPresent',
  function (this: unknown, value: unknown, options: Handlebars.HelperOptions) {
    return value ? options.fn(this) : options.inverse(this);
  },
);

Handlebars.registerHelper(
  'any',
  function (
    array: Array<Record<string, unknown>> | undefined,
    property: string,
  ) {
    if (!Array.isArray(array)) return false;
    return array.some(
      (item) =>
        item[property] !== undefined &&
        item[property] !== null &&
        (!Array.isArray(item[property]) ||
          (item[property] as unknown[]).length > 0),
    );
  },
);

export type SnippetResolveResult =
  | { ok: true; output: string }
  | { ok: false; output: string; error: string };

export function resolveSnippetTemplate(
  template: string,
  context: SnippetVariableContext,
): SnippetResolveResult {
  try {
    const compiled = Handlebars.compile(template, { noEscape: true });
    return { ok: true, output: compiled(context) };
  } catch (e) {
    const error =
      e instanceof Error ? e.message : 'Template compilation failed';
    return { ok: false, output: template, error };
  }
}

export function resolvePromptSnippet(
  snippet: PromptSnippet,
  context: SnippetVariableContext,
): SnippetResolveResult {
  return resolveSnippetTemplate(snippet.template, context);
}
