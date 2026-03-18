export function formatDuration(durationMs: number) {
  if (durationMs > 60 * 1000) {
    return `${Math.round(durationMs / 1000 / 60)}min`;
  } else if (durationMs > 1000) {
    return `${Math.round(durationMs / 1000)}s`;
  }

  return `${durationMs}ms`;
}

/**
 * Ensure a date string from SQLite is interpreted as UTC.
 * SQLite's datetime('now') produces strings like "2026-03-18 10:30:00" without
 * a timezone suffix.  new Date() parses those as local time, which skews
 * relative-time calculations by the user's timezone offset.
 */
export function ensureUtc(dateString: string): string {
  return dateString.endsWith('Z') || dateString.includes('+')
    ? dateString
    : dateString + 'Z';
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(ensureUtc(dateString));
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'a few moments ago';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString();
}
