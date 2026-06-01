import {
  resolveSnippetTemplate,
  type SnippetVariableContext,
} from '@/lib/resolve-snippet-template';

export function resolveMessageInputText(
  text: string,
  snippetVariableContext?: SnippetVariableContext,
): string {
  const trimmed = text.trim();
  if (!trimmed.includes('{{')) return trimmed;
  const context = snippetVariableContext ?? {};
  const result = resolveSnippetTemplate(trimmed, context);
  return result.output;
}
