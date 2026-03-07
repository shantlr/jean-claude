/**
 * Shared SKILL.md frontmatter parsing utilities.
 * Used by both skill-management-service and skill-registry-service.
 */

export interface SkillFrontmatter {
  name?: string;
  description?: string;
}

/**
 * Parses YAML frontmatter from a SKILL.md file.
 * Extracts `name` and `description` fields from the `---` delimited block.
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const frontmatter: SkillFrontmatter = {};
  for (const line of match[1].split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === 'name') frontmatter.name = value;
    else if (key === 'description') frontmatter.description = value;
  }

  return frontmatter;
}

/**
 * Extracts the markdown body from a SKILL.md file (everything after the frontmatter block).
 */
export function extractBody(raw: string): string {
  const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n?/);
  if (fmMatch) {
    return raw.slice(fmMatch[0].length).trim();
  }
  return raw.trim();
}

/**
 * Builds a SKILL.md file string from name, description, and content.
 */
export function buildSkillMd({
  name,
  description,
  content,
}: {
  name: string;
  description: string;
  content: string;
}): string {
  const lines = ['---'];
  lines.push(`name: ${name}`);
  if (description) lines.push(`description: ${description}`);
  lines.push('---');
  if (content) {
    lines.push('');
    lines.push(content);
  }
  return lines.join('\n') + '\n';
}
