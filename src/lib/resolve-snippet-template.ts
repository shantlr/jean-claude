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

type TemplateNode =
  | { type: 'text'; value: string }
  | { type: 'value'; expression: string }
  | {
      type: 'block';
      helper: 'each' | 'if' | 'ifPresent';
      expression: string;
      children: TemplateNode[];
    };

function isPresent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return (
    value !== undefined && value !== null && value !== false && value !== ''
  );
}

function resolvePath({
  expression,
  root,
  current,
}: {
  expression: string;
  root: unknown;
  current: unknown;
}): unknown {
  const path = expression.trim();
  if (!path) return '';
  if (path === 'this') return current;

  const read = (source: unknown, parts: string[]) => {
    let value = source;
    for (const part of parts) {
      if (value === undefined || value === null || typeof value !== 'object') {
        return undefined;
      }
      value = (value as Record<string, unknown>)[part];
    }
    return value;
  };

  if (path.startsWith('this.')) {
    return read(current, path.slice(5).split('.'));
  }

  const parts = path.split('.');
  const currentValue = read(current, parts);
  return currentValue === undefined ? read(root, parts) : currentValue;
}

function resolveExpression({
  expression,
  root,
  current,
}: {
  expression: string;
  root: unknown;
  current: unknown;
}): unknown {
  const trimmed = expression.trim();
  const anyMatch = /^\(any\s+([^\s]+)\s+["']([^"']+)["']\)$/.exec(trimmed);
  if (anyMatch) {
    const array = resolvePath({ expression: anyMatch[1], root, current });
    if (!Array.isArray(array)) return false;
    return array.some((item) =>
      isPresent((item as Record<string, unknown>)[anyMatch[2]]),
    );
  }
  return resolvePath({ expression: trimmed, root, current });
}

function parseTemplate(template: string): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: Array<{ helper: string; children: TemplateNode[] }> = [
    { helper: 'root', children: root },
  ];
  const tokenPattern = /{{\s*([^}]+?)\s*}}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      stack[stack.length - 1].children.push({
        type: 'text',
        value: template.slice(lastIndex, match.index),
      });
    }

    const expression = match[1].trim();
    const blockMatch = /^#(each|if|ifPresent)\s+(.+)$/.exec(expression);
    const closeMatch = /^\/(each|if|ifPresent)$/.exec(expression);
    if (blockMatch) {
      const node: TemplateNode = {
        type: 'block',
        helper: blockMatch[1] as 'each' | 'if' | 'ifPresent',
        expression: blockMatch[2],
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      stack.push({ helper: blockMatch[1], children: node.children });
    } else if (closeMatch) {
      if (
        stack.length > 1 &&
        stack[stack.length - 1].helper === closeMatch[1]
      ) {
        stack.pop();
      }
    } else {
      stack[stack.length - 1].children.push({ type: 'value', expression });
    }

    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < template.length) {
    stack[stack.length - 1].children.push({
      type: 'text',
      value: template.slice(lastIndex),
    });
  }

  return root;
}

function renderNodes({
  nodes,
  root,
  current,
}: {
  nodes: TemplateNode[];
  root: unknown;
  current: unknown;
}): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.value;
      if (node.type === 'value') {
        const value = resolveExpression({
          expression: node.expression,
          root,
          current,
        });
        return value === undefined || value === null ? '' : String(value);
      }

      const value = resolveExpression({
        expression: node.expression,
        root,
        current,
      });
      if (node.helper === 'each') {
        if (!Array.isArray(value)) return '';
        return value
          .map((item) =>
            renderNodes({ nodes: node.children, root, current: item }),
          )
          .join('');
      }
      if (!isPresent(value)) return '';
      return renderNodes({ nodes: node.children, root, current });
    })
    .join('');
}

function renderTemplateSafely(
  template: string,
  context: SnippetVariableContext,
): string {
  return renderNodes({
    nodes: parseTemplate(template),
    root: context,
    current: context,
  });
}

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
    try {
      return { ok: true, output: renderTemplateSafely(template, context) };
    } catch {
      return { ok: false, output: template, error };
    }
  }
}

export function resolvePromptSnippet(
  snippet: PromptSnippet,
  context: SnippetVariableContext,
): SnippetResolveResult {
  return resolveSnippetTemplate(snippet.template, context);
}
