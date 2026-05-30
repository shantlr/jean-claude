export type MentionDisplayNames = Record<string, string>;

const AZURE_MENTION_PATTERN =
  /@<([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})>/g;
const MARKDOWN_SPECIAL_CHARS = /([\\`*_{}[\]()#+.!|>-])/g;

export function normalizeMentionId(id: string) {
  return id.toLowerCase();
}

export function replaceAzureDevOpsMentions(
  content: string,
  displayNames?: MentionDisplayNames,
  options: { escapeMarkdown?: boolean; renderMarkdownLinks?: boolean } = {},
) {
  if (!displayNames) return content;

  const escapeMarkdown = options.escapeMarkdown ?? true;

  return content.replace(AZURE_MENTION_PATTERN, (match, id: string) => {
    const displayName = displayNames[normalizeMentionId(id)];
    if (!displayName) return match;

    const mentionText = `@${escapeMarkdown ? escapeMarkdownText(displayName) : displayName}`;
    if (!options.renderMarkdownLinks) return mentionText;

    return `[${mentionText}](azure-devops-mention:${normalizeMentionId(id)})`;
  });
}

function escapeMarkdownText(value: string) {
  return value.replace(MARKDOWN_SPECIAL_CHARS, '\\$1');
}
