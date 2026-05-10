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
};

const VARIABLE_MAP: Record<
  string,
  (ctx: SnippetVariableContext) => string | null | undefined
> = {
  'task.worktree.path': (ctx) => ctx.task?.worktreePath,
  'task.name': (ctx) => ctx.task?.name,
  'task.note': (ctx) => ctx.task?.note,
  'task.sourceBranch': (ctx) => ctx.task?.sourceBranch,
  'task.branch.name': (ctx) => ctx.task?.branchName,
  'project.name': (ctx) => ctx.project?.name,
  'project.path': (ctx) => ctx.project?.path,
};

export function resolveSnippetTemplate(
  template: string,
  context: SnippetVariableContext,
): string {
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const resolver = VARIABLE_MAP[key];
    if (!resolver) return match;
    const value = resolver(context);
    return value ?? match;
  });
}

export function resolvePromptSnippet(
  snippet: PromptSnippet,
  context: SnippetVariableContext,
): string {
  return resolveSnippetTemplate(snippet.template, context);
}
