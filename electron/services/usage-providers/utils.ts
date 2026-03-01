/**
 * Formats the time remaining until a given date as a human-readable string.
 * Used by usage providers to display reset countdowns.
 */
export function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) return 'now';

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
  if (totalHours > 0) {
    return minutes > 0 ? `${totalHours}h ${minutes}m` : `${totalHours}h`;
  }
  return `${minutes}m`;
}
