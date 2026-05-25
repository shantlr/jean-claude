export type ChangelogEntryType = 'feature' | 'fix' | 'improvement';

export interface ChangelogEntry {
  type: ChangelogEntryType;
  scope: string;
  bullets: string[];
  commits: string[];
}

export interface ChangelogDay {
  date: string; // YYYY-MM-DD from filename
  label: string; // human-readable, e.g. "May 23, 2025"
  entries: ChangelogEntry[];
}

// Load all changelog markdown files at build time
const changelogFiles = import.meta.glob<string>('../../changelogs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function parseEntryType(tag: string): ChangelogEntryType {
  const normalized = tag.toLowerCase().trim();
  if (
    normalized === 'feature' ||
    normalized === 'fix' ||
    normalized === 'improvement'
  ) {
    return normalized;
  }
  return 'improvement';
}

function normalizeScope(scope: string | undefined): string {
  const trimmed = scope?.trim();
  if (!trimmed) return 'general';
  return trimmed;
}

function parseTopLevelEntry(line: string): {
  type: ChangelogEntryType;
  scope: string;
  inlineBullet: string | null;
} | null {
  const match = line.match(/^-\s+\[(\w+)\](?:\s+\[([^\]]+)\])?\s*(.*)$/);
  if (!match) return null;

  const [, typeTag, scopeTag, rest] = match;
  const inlineBullet = rest.trim();
  return {
    type: parseEntryType(typeTag),
    scope: normalizeScope(scopeTag),
    inlineBullet: inlineBullet.length > 0 ? inlineBullet : null,
  };
}

function parseNestedBullet(line: string): string | null {
  const match = line.match(/^\s+-\s+(.+)$/);
  if (!match) return null;
  return match[1].trim();
}

function parseCommitsBullet(bullet: string): string[] | null {
  const match = bullet.match(/^Commits:\s*(.+)$/i);
  if (!match) return null;

  return match[1]
    .split(',')
    .map((commit) => commit.trim())
    .filter(Boolean);
}

export function parseChangelogFile(content: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let currentEntry: ChangelogEntry | null = null;

  for (const rawLine of content.split('\n')) {
    const topLevelEntry = parseTopLevelEntry(rawLine);
    if (topLevelEntry) {
      currentEntry = {
        type: topLevelEntry.type,
        scope: topLevelEntry.scope,
        bullets: topLevelEntry.inlineBullet ? [topLevelEntry.inlineBullet] : [],
        commits: [],
      };
      entries.push(currentEntry);
      continue;
    }

    const nestedBullet = parseNestedBullet(rawLine);
    if (nestedBullet && currentEntry) {
      const commits = parseCommitsBullet(nestedBullet);
      if (commits) {
        currentEntry.commits = commits;
        continue;
      }

      currentEntry.bullets.push(nestedBullet);
    }
  }

  return entries.filter((entry) => entry.bullets.length > 0);
}

function buildChangelog(): ChangelogDay[] {
  const days: ChangelogDay[] = [];

  for (const [path, content] of Object.entries(changelogFiles)) {
    // Extract date from filename: ../../changelogs/YYYY-MM-DD.md
    const match = path.match(/(\d{4}-\d{2}-\d{2})\.md$/);
    if (!match) continue;

    const date = match[1];
    const entries = parseChangelogFile(content);
    if (entries.length === 0) continue;

    days.push({
      date,
      label: formatDateLabel(date),
      entries,
    });
  }

  // Sort newest first
  days.sort((a, b) => b.date.localeCompare(a.date));
  return days;
}

/** All changelog entries, grouped by day, newest first. */
export const changelog: ChangelogDay[] = buildChangelog();

/** Compute a simple hash of all changelog content for change detection. */
function computeHash(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return hash.toString(36);
}

/** Hash of all changelog file contents. Changes when any file is added/modified. */
export const changelogHash: string = computeHash(
  Object.entries(changelogFiles)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, content]) => content)
    .join('\n---\n'),
);
