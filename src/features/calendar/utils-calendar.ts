import type { UpcomingMeeting } from '@shared/calendar-types';

const TEAMS_URL_PATTERN =
  /https?:\/\/(?:[^\s<>()"']+\.)?(?:teams\.microsoft\.com|teams\.live\.com|teams\.cloud\.microsoft)\/[^\s<>()"']+/gi;

export function extractTeamsUrl(meeting: UpcomingMeeting): string | null {
  const haystack = [meeting.url, meeting.location, meeting.notes].join('\n');
  const matches = haystack.matchAll(TEAMS_URL_PATTERN);
  for (const match of matches) {
    const rawUrl = match[0].replaceAll('&amp;', '&').replace(/[.,;:!?]+$/, '');
    try {
      const url = new URL(rawUrl);
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url.toString();
      }
    } catch {
      // skip
    }
  }
  return null;
}

export type MeetingState = 'upcoming' | 'soon' | 'imminent' | 'live' | 'past';

export function getMeetingState(
  meeting: UpcomingMeeting,
  now = Date.now(),
): MeetingState {
  const start = new Date(meeting.startAt).getTime();
  const end = new Date(meeting.endAt).getTime();
  if (end <= now) return 'past';
  if (start <= now) return 'live';
  const mins = (start - now) / 60_000;
  if (mins <= 1) return 'imminent';
  if (mins <= 10) return 'soon';
  return 'upcoming';
}

export function formatTimeHHMM(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatTimeRange(startAt: string, endAt: string): string {
  return `${formatTimeHHMM(startAt)} – ${formatTimeHHMM(endAt)}`;
}

export function minutesBetween(startAt: string, endAt: string): number {
  return Math.round(
    (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000,
  );
}

export function relativeLabel(
  meeting: UpcomingMeeting,
  now = Date.now(),
): string {
  const start = new Date(meeting.startAt).getTime();
  const end = new Date(meeting.endAt).getTime();
  if (end <= now) return 'ended';
  if (start <= now) {
    const left = Math.max(1, Math.round((end - now) / 60_000));
    return `${left}m left`;
  }
  const mins = Math.round((start - now) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins}m`;
  if (mins >= 24 * 60) return `in ${Math.floor(mins / 60 / 24)}d`;
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return mm ? `in ${h}h${String(mm).padStart(2, '0')}` : `in ${h}h`;
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

export function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function formatDayHeader(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function dayBadge(date: Date, now: Date): string {
  if (isSameDay(date, now)) return 'Today';
  const tomorrow = addDays(startOfDay(now), 1);
  if (isSameDay(date, tomorrow)) return 'Tomorrow';
  return formatDayHeader(date);
}

export function groupByDay(
  meetings: UpcomingMeeting[],
): { date: Date; meetings: UpcomingMeeting[] }[] {
  const map = new Map<number, UpcomingMeeting[]>();
  for (const m of meetings) {
    const key = startOfDay(new Date(m.startAt)).getTime();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([k, list]) => ({ date: new Date(k), meetings: list }));
}

export function sortMeetings(
  meetings: UpcomingMeeting[],
  now = Date.now(),
): UpcomingMeeting[] {
  return [...meetings].sort((a, b) => {
    const aStart = new Date(a.startAt).getTime();
    const aEnd = new Date(a.endAt).getTime();
    const bStart = new Date(b.startAt).getTime();
    const bEnd = new Date(b.endAt).getTime();
    const aLive = aStart <= now && aEnd > now;
    const bLive = bStart <= now && bEnd > now;
    if (aLive !== bLive) return aLive ? -1 : 1;
    if (aLive && bLive) return aEnd - bEnd;
    return aStart - bStart;
  });
}

export function computeFreeBlocks(
  meetings: UpcomingMeeting[],
  dayStart: Date,
): { start: Date; end: Date }[] {
  const workStart = new Date(dayStart);
  workStart.setHours(9, 0, 0, 0);
  const workEnd = new Date(dayStart);
  workEnd.setHours(18, 0, 0, 0);

  const active = [...meetings].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  let cursor = workStart;
  const gaps: { start: Date; end: Date }[] = [];

  for (const m of active) {
    const mStart = new Date(m.startAt);
    const mEnd = new Date(m.endAt);
    if (mStart > cursor) {
      gaps.push({ start: new Date(cursor), end: new Date(mStart) });
    }
    if (mEnd > cursor) cursor = mEnd;
  }
  if (cursor < workEnd) {
    gaps.push({ start: new Date(cursor), end: workEnd });
  }

  return gaps
    .filter((g) => g.end.getTime() - g.start.getTime() >= 60 * 60_000)
    .sort(
      (a, b) =>
        b.end.getTime() -
        b.start.getTime() -
        (a.end.getTime() - a.start.getTime()),
    )
    .slice(0, 2);
}

export function layoutColumns(
  meetings: UpcomingMeeting[],
): { meeting: UpcomingMeeting; col: number; totalCols: number }[] {
  const sorted = [...meetings].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  const result: { meeting: UpcomingMeeting; col: number; totalCols: number }[] =
    [];

  const clusters: UpcomingMeeting[][] = [];
  let current: UpcomingMeeting[] = [];
  let currentEnd: number | null = null;

  for (const m of sorted) {
    const mStart = new Date(m.startAt).getTime();
    const mEnd = new Date(m.endAt).getTime();
    if (currentEnd !== null && mStart < currentEnd) {
      current.push(m);
      currentEnd = Math.max(currentEnd, mEnd);
    } else {
      if (current.length) clusters.push(current);
      current = [m];
      currentEnd = mEnd;
    }
  }
  if (current.length) clusters.push(current);

  for (const cl of clusters) {
    const colEnds: number[] = [];
    const clusterResult: {
      meeting: UpcomingMeeting;
      col: number;
      totalCols: number;
    }[] = [];
    for (const m of cl) {
      const mStart = new Date(m.startAt).getTime();
      const mEnd = new Date(m.endAt).getTime();
      let placed = false;
      for (let i = 0; i < colEnds.length; i++) {
        if (colEnds[i] <= mStart) {
          colEnds[i] = mEnd;
          clusterResult.push({ meeting: m, col: i, totalCols: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        colEnds.push(mEnd);
        clusterResult.push({
          meeting: m,
          col: colEnds.length - 1,
          totalCols: 0,
        });
      }
    }
    const totalCols = colEnds.length;
    for (const r of clusterResult) {
      r.totalCols = totalCols;
      result.push(r);
    }
  }

  return result;
}
