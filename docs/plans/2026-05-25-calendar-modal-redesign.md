# Calendar Modal Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the calendar from a basic dropdown into a full modal with three views (Up Next master-detail, Today timeline, Week grid), a smart header strip with countdown states, and an "ignore meetings" feature.

**Architecture:** Replace the current `NextMeetingButton` dropdown with two components: (1) a smart header strip button with countdown ring and state-reactive styling, and (2) a full-screen overlay modal registered in the overlays store. The modal has three tabs (À venir, Aujourd'hui, Semaine) with shared meeting detail pane. Ignore state is stored in a Zustand store persisted to localStorage. The `UpcomingMeeting` type gets extended with `attendees` and `recurring` fields. All data flows through the existing `api.calendar.listUpcomingMeetings()` IPC channel.

**Tech Stack:** React, Zustand, TanStack React Query, Tailwind CSS (oklch design tokens), Lucide icons, existing Modal/overlay patterns.

---

## Key Design Decisions

### Token Mapping (Design → Codebase)
The design prototype uses CSS custom properties that map to our Tailwind classes:

| Design token | Tailwind class |
|---|---|
| `var(--acc)` | `acc` (oklch 0.72 0.2 295 — violet) |
| `var(--acc-ink)` | `acc-ink` (oklch 0.82 0.17 295) |
| `var(--run)` | `status-run` (oklch 0.78 0.16 75 — amber) |
| `var(--fail)` | `status-fail` (oklch 0.72 0.18 25) |
| `var(--ink-0)` through `var(--ink-4)` | `ink-0` through `ink-4` |
| `var(--bg-0)` through `var(--bg-3)` | `bg-0` through `bg-3` |
| `var(--line-soft)` | `glass-border` |
| `kindColor('work')` hue 295 | `acc` (violet) |
| `kindColor('personal')` hue 155 | `status-done` (green) |
| `kindColor('company')` hue 205 | `status-azure` (azure) |
| `kindColor('optional')` hue 235 | `status-review` (blue) |

### Shortcut
`⌘J` is taken by Activity Center. Use `⌘;` for the calendar modal (mnemonic: semicolon looks like a clock).

### Overlay Pattern
Register `'calendar'` as a new `OverlayType` in the overlays store. Render `CalendarOverlayContainer` in `__root.tsx` alongside the other overlay containers.

### Ignore Persistence
Create a `calendar-ignored-store.ts` Zustand store with `persist` middleware (localStorage). Stores a `Set<string>` of ignored meeting IDs. This is renderer-only; no backend changes needed.

### Data Limitations
The real `UpcomingMeeting` type from macOS Calendar doesn't have `attendees`, `recurring`, `kind`, or `teamsUrl` fields reliably. We:
- Extract Teams URL from `notes`/`location`/`url` (existing logic in `extractTeamsUrl`)
- Skip attendees display (not available from macOS EventKit without extra Swift work)
- Skip `kind` coloring (no calendar-kind mapping exists yet) — use accent color for all
- Skip `recurring` badge (not in the data model)

These can be added incrementally. The UI components should accept optional fields gracefully.

---

### Task 1: Extend Types & Add Calendar Ignored Store

**Files:**
- Modify: `src/stores/overlays.ts` — add `'calendar'` to `OverlayType`
- Create: `src/stores/calendar-ignored.ts` — Zustand store for ignored meeting IDs
- Modify: `shared/calendar-types.ts` — add optional fields to `UpcomingMeeting`

**Step 1: Add `'calendar'` to OverlayType union**

In `src/stores/overlays.ts`, add `'calendar'` to the `OverlayType` union:

```ts
export type OverlayType =
  | 'new-task'
  | 'command-palette'
  | 'project-switcher'
  | 'keyboard-help'
  | 'activity-center'
  | 'settings'
  | 'project-backlog'
  | 'pipelines'
  | 'running-commands'
  | 'calendar';
```

**Step 2: Create `src/stores/calendar-ignored.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CalendarIgnoredState {
  ignoredIds: string[];
  isIgnored: (id: string) => boolean;
  toggleIgnored: (id: string) => void;
  ignoredCount: () => number;
}

export const useCalendarIgnoredStore = create<CalendarIgnoredState>()(
  persist(
    (set, get) => ({
      ignoredIds: [],
      isIgnored: (id: string) => get().ignoredIds.includes(id),
      toggleIgnored: (id: string) =>
        set((state) => ({
          ignoredIds: state.ignoredIds.includes(id)
            ? state.ignoredIds.filter((x) => x !== id)
            : [...state.ignoredIds, id],
        })),
      ignoredCount: () => get().ignoredIds.length,
    }),
    { name: 'jean-claude-calendar-ignored' },
  ),
);
```

**Note on Zustand selector pattern:** Per AGENTS.md, `isIgnored` and `ignoredCount` are getter methods — these are fine to call from event handlers but NOT from render paths. In components, select `ignoredIds` and derive with `useMemo`:

```ts
const ignoredIds = useCalendarIgnoredStore((s) => s.ignoredIds);
const isIgnored = useMemo(() => new Set(ignoredIds), [ignoredIds]);
```

**Step 3: Extend `UpcomingMeeting` type**

In `shared/calendar-types.ts`, add optional fields:

```ts
export interface UpcomingMeeting {
  id: string;
  externalId: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  calendarName: string;
  notes: string;
  url: string;
  /** Attendee initials (optional, not all backends provide this) */
  attendees?: string[];
  /** Whether this is a recurring event */
  recurring?: boolean;
}
```

**Step 4: Commit**

```bash
git add src/stores/overlays.ts src/stores/calendar-ignored.ts shared/calendar-types.ts
git commit -m "feat(calendar): add overlay type, ignored store, and extended meeting type"
```

---

### Task 2: Calendar Utility Helpers

**Files:**
- Create: `src/features/calendar/utils-calendar.ts` — formatting, state computation, Teams URL extraction

**Step 1: Create calendar utility module**

Move and adapt formatting logic from `next-meeting-button.tsx` plus new helpers from the design:

```ts
// src/features/calendar/utils-calendar.ts
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

export function getMeetingState(meeting: UpcomingMeeting, now = Date.now()): MeetingState {
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
  return Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000);
}

export function relativeLabel(meeting: UpcomingMeeting, now = Date.now()): string {
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
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return mm ? `in ${h}h${String(mm).padStart(2, '0')}` : `in ${h}h`;
}

export function isSameDay(a: Date | string, b: Date | string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
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
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function dayBadge(date: Date, now: Date): string {
  if (isSameDay(date, now)) return 'Today';
  const tomorrow = addDays(startOfDay(now), 1);
  if (isSameDay(date, tomorrow)) return 'Tomorrow';
  return formatDayHeader(date);
}

/** Group meetings by day, sorted by date */
export function groupByDay(meetings: UpcomingMeeting[]): { date: Date; meetings: UpcomingMeeting[] }[] {
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

/** Sort meetings: live first (ending soonest), then by start time */
export function sortMeetings(meetings: UpcomingMeeting[], now = Date.now()): UpcomingMeeting[] {
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

/** Compute biggest free blocks ≥ 1h between active meetings in a day */
export function computeFreeBlocks(
  meetings: UpcomingMeeting[],
  dayStart: Date,
): { start: Date; end: Date }[] {
  const workStart = new Date(dayStart);
  workStart.setHours(9, 0, 0, 0);
  const workEnd = new Date(dayStart);
  workEnd.setHours(18, 0, 0, 0);

  const active = meetings
    .filter((m) => !new Date(m.endAt).getTime() || new Date(m.endAt) > workStart)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

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
    .sort((a, b) => (b.end.getTime() - b.start.getTime()) - (a.end.getTime() - a.start.getTime()))
    .slice(0, 2);
}

/** Simple overlap column layout for timeline views */
export function layoutColumns(meetings: UpcomingMeeting[]): { meeting: UpcomingMeeting; col: number; totalCols: number }[] {
  const sorted = [...meetings].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const result: { meeting: UpcomingMeeting; col: number; totalCols: number }[] = [];

  // Build clusters of overlapping events
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
    const clusterResult: { meeting: UpcomingMeeting; col: number; totalCols: number }[] = [];
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
        clusterResult.push({ meeting: m, col: colEnds.length - 1, totalCols: 0 });
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
```

**Step 2: Commit**

```bash
git add src/features/calendar/utils-calendar.ts
git commit -m "feat(calendar): add calendar utility helpers"
```

---

### Task 3: Countdown Ring SVG Component

**Files:**
- Create: `src/features/calendar/ui-countdown-ring/index.tsx`

**Step 1: Create countdown ring component**

This is the circular progress indicator that fills over the last 10 minutes before a meeting starts.

```tsx
export function CountdownRing({
  startAt,
  endAt,
  now = Date.now(),
  size = 28,
  strokeWidth = 2.5,
  className,
  color = 'currentColor',
}: {
  startAt: string;
  endAt: string;
  now?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  color?: string;
}) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const live = now >= start && now < end;

  let pct = 0;
  if (live) {
    pct = 1;
  } else {
    const tenMin = 10 * 60_000;
    const remain = start - now;
    pct = Math.max(0, Math.min(1, (tenMin - remain) / tenMin));
  }

  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      style={{ display: 'block' }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="stroke-bg-3"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 600ms ease' }}
      />
      {live && (
        <circle cx={size / 2} cy={size / 2} r={3} fill={color}>
          <animate
            attributeName="opacity"
            values="1;0.3;1"
            dur="1.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
    </svg>
  );
}
```

**Step 2: Commit**

```bash
git add src/features/calendar/ui-countdown-ring/index.tsx
git commit -m "feat(calendar): add countdown ring SVG component"
```

---

### Task 4: Smart Header Strip Button

**Files:**
- Modify: `src/layout/ui-header/next-meeting-button.tsx` — rewrite to smart strip with countdown

**Step 1: Rewrite `NextMeetingButton` with countdown ring + state-reactive styling**

Replace the entire file. Key behaviors from the design:
- Shows countdown ring filling over last 10 minutes
- Five visual states: upcoming (neutral), soon (accent pulse), imminent (accent bg + "Join" button), live (green bg + "Rejoindre"), none (muted)
- Shows `⌘;` kbd hint
- Click opens the calendar overlay (via overlays store toggle)
- Ignored meetings (from store) are filtered out of "next meeting" computation

The header button no longer manages its own dropdown or meeting list. It only shows the next active meeting and opens the overlay on click.

```tsx
import clsx from 'clsx';
import { Calendar, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { CountdownRing } from '@/features/calendar/ui-countdown-ring';
import {
  extractTeamsUrl,
  formatTimeHHMM,
  getMeetingState,
  relativeLabel,
  sortMeetings,
} from '@/features/calendar/utils-calendar';
import { useCalendarNotificationsSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { useCalendarIgnoredStore } from '@/stores/calendar-ignored';
import { useOverlaysStore } from '@/stores/overlays';
import { useToastStore } from '@/stores/toasts';
import type { UpcomingMeeting } from '@shared/calendar-types';

export function NextMeetingButton() {
  const { data: calendarNotificationsSetting } = useCalendarNotificationsSetting();
  const enabled = calendarNotificationsSetting?.enabled ?? false;
  const canShow = enabled && api.platform === 'darwin';
  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const addToast = useToastStore((s) => s.addToast);
  const toggleOverlay = useOverlaysStore((s) => s.toggle);
  const ignoredIds = useCalendarIgnoredStore((s) => s.ignoredIds);

  // Poll meetings every 60s
  useEffect(() => {
    if (!canShow) {
      setMeetings([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      try {
        const result = await api.calendar.listUpcomingMeetings();
        if (!cancelled) setMeetings(result);
      } catch (error) {
        if (!cancelled) {
          addToast({
            message: error instanceof Error ? error.message : 'Could not load meetings',
            type: 'error',
          });
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [addToast, canShow]);

  // Tick every 30s for countdown updates
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const ignoredSet = useMemo(() => new Set(ignoredIds), [ignoredIds]);

  const activeMeetings = useMemo(
    () => sortMeetings(meetings.filter((m) => !ignoredSet.has(m.id)), Date.now()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meetings, ignoredSet, tick],
  );

  if (!canShow) return null;

  const next = activeMeetings[0] ?? null;
  const now = Date.now();
  const state = next ? getMeetingState(next, now) : 'none';
  const teamsUrl = next ? extractTeamsUrl(next) : null;

  const handleClick = () => toggleOverlay('calendar');
  const handleJoin = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (teamsUrl) window.open(teamsUrl, '_blank');
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={clsx(
        'max-w-[340px] gap-2 rounded-lg border px-2.5',
        state === 'live' && 'border-status-run/40 bg-status-run/8 hover:bg-status-run/12',
        state === 'imminent' && 'border-acc/40 bg-acc/8 hover:bg-acc/12',
        state === 'soon' && 'border-acc/35 bg-acc/8 hover:bg-acc/12',
        state === 'upcoming' && 'border-glass-border bg-glass-subtle hover:bg-glass-light',
        state === 'none' && 'border-glass-border bg-glass-subtle hover:bg-glass-light',
      )}
      title={next ? next.title : 'Upcoming meetings'}
    >
      {next ? (
        <>
          <CountdownRing
            startAt={next.startAt}
            endAt={next.endAt}
            now={now}
            size={18}
            strokeWidth={2}
            color={
              state === 'live'
                ? 'oklch(0.78 0.16 75)'
                : state === 'soon' || state === 'imminent'
                  ? 'oklch(0.72 0.2 295)'
                  : 'oklch(0.52 0.014 275)'
            }
          />
          <span className="text-ink-3 font-mono text-[11px]">
            {formatTimeHHMM(next.startAt)}
          </span>
          <span className="text-ink-1 min-w-0 max-w-[180px] truncate text-xs font-medium">
            {next.title}
          </span>
          {state === 'live' && (
            <span className="text-status-run flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
              <span className="bg-status-run h-1.5 w-1.5 animate-pulse rounded-full" />
              LIVE
            </span>
          )}
          {(state === 'soon' || state === 'upcoming') && (
            <span className={clsx(
              'font-mono text-[11px]',
              state === 'soon' ? 'text-acc-ink font-semibold' : 'text-ink-3',
            )}>
              {relativeLabel(next, now)}
            </span>
          )}
          {state === 'imminent' && teamsUrl && (
            <button
              onClick={handleJoin}
              className="bg-acc text-bg-0 flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
            >
              <Video className="h-3 w-3" />
              Join
            </button>
          )}
          {state === 'live' && teamsUrl && (
            <button
              onClick={handleJoin}
              className="bg-status-run/20 text-status-run flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
            >
              <Video className="h-3 w-3" />
              Join
            </button>
          )}
        </>
      ) : (
        <>
          <Calendar className="text-ink-3 h-3.5 w-3.5" />
          <span className="text-ink-3 text-xs">
            {isLoading ? 'Loading...' : 'No meetings'}
          </span>
        </>
      )}
      <Kbd shortcut="cmd+;" className="ml-0.5" />
    </Button>
  );
}
```

**Step 2: Commit**

```bash
git add src/layout/ui-header/next-meeting-button.tsx
git commit -m "feat(calendar): rewrite header strip with countdown ring and state-reactive styling"
```

---

### Task 5: Calendar Modal Shell & Up Next View

**Files:**
- Create: `src/features/calendar/ui-calendar-overlay/index.tsx` — modal shell + tab navigation + "Up Next" view
- Create: `src/features/calendar/ui-meeting-detail/index.tsx` — shared detail pane (right side)
- Create: `src/features/calendar/ui-meeting-list-item/index.tsx` — meeting card for list views

**Step 1: Create meeting list item component**

Per the design: kind bar on left, title + countdown label, time + location meta, tags (recurring/cancelled/ignored), avatar stack.

```tsx
// src/features/calendar/ui-meeting-list-item/index.tsx
import clsx from 'clsx';
import { MapPin, Repeat, BellOff, Video } from 'lucide-react';

import {
  extractTeamsUrl,
  formatTimeRange,
  getMeetingState,
} from '@/features/calendar/utils-calendar';
import type { UpcomingMeeting } from '@shared/calendar-types';

function CountdownBadge({ meeting, now }: { meeting: UpcomingMeeting; now: number }) {
  // inline import to avoid circular
  const state = getMeetingState(meeting, now);
  const start = new Date(meeting.startAt).getTime();
  const end = new Date(meeting.endAt).getTime();

  if (state === 'live') {
    const left = Math.max(1, Math.round((end - now) / 60_000));
    return (
      <span className="text-status-run flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-wide">
        <span className="bg-status-run h-1.5 w-1.5 animate-pulse rounded-full" />
        LIVE · {left}m
      </span>
    );
  }
  if (state === 'imminent') {
    return (
      <span className="text-acc-ink font-mono text-[11px] font-semibold">NOW</span>
    );
  }
  if (state === 'soon') {
    const mins = Math.ceil((start - now) / 60_000);
    return (
      <span className="text-acc-ink flex items-center gap-1 font-mono text-[11px] font-semibold">
        <span className="bg-acc h-1.5 w-1.5 animate-pulse rounded-full" />
        T−{mins}m
      </span>
    );
  }
  if (state === 'past') {
    return <span className="text-ink-4 font-mono text-[11px]">ended</span>;
  }
  // upcoming
  const mins = Math.round((start - now) / 60_000);
  if (mins < 60) return <span className="text-ink-3 font-mono text-[11px]">{mins}m</span>;
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return <span className="text-ink-3 font-mono text-[11px]">{h}h{String(mm).padStart(2, '0')}</span>;
}

export function MeetingListItem({
  meeting,
  now,
  selected,
  onSelect,
  isIgnored,
}: {
  meeting: UpcomingMeeting;
  now: number;
  selected: boolean;
  onSelect: () => void;
  isIgnored: boolean;
}) {
  const dim = isIgnored;
  const teamsUrl = extractTeamsUrl(meeting);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'flex w-full gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-acc/35 bg-acc/10'
          : 'border-glass-border/70 hover:bg-glass-medium bg-bg-1',
        dim && 'opacity-55',
      )}
    >
      {/* kind bar — accent for all since we don't have kind data */}
      <span className="bg-acc w-[3px] self-stretch rounded-full" style={{ opacity: dim ? 0.35 : 1 }} />

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className={clsx(
            'flex-1 truncate text-[13px] font-medium',
            dim ? 'text-ink-3' : 'text-ink-0',
          )}>
            {meeting.title}
          </span>
          {!isIgnored && <CountdownBadge meeting={meeting} now={now} />}
        </div>

        <div className="text-ink-3 flex items-center gap-2.5 font-mono text-[11px]">
          <span>{formatTimeRange(meeting.startAt, meeting.endAt)}</span>
          {teamsUrl && (
            <span className="flex items-center gap-1">
              <Video className="h-2.5 w-2.5" /> Teams
            </span>
          )}
          {!teamsUrl && meeting.location && (
            <span className="flex max-w-[130px] items-center gap-1 truncate">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {meeting.location.split('+')[0].trim()}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center gap-1.5">
          {meeting.recurring && (
            <span className="text-ink-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide">
              <Repeat className="h-2.5 w-2.5" /> recurring
            </span>
          )}
          {isIgnored && (
            <span className="text-ink-3 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wide">
              <BellOff className="h-2.5 w-2.5" /> ignored
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
```

**Step 2: Create meeting detail pane**

The right panel showing full meeting details, live status bar, notes, and action buttons.

```tsx
// src/features/calendar/ui-meeting-detail/index.tsx
import { Calendar, Clock, ExternalLink, Eye, EyeOff, MapPin, Video } from 'lucide-react';

import { Button } from '@/common/ui/button';
import { CountdownRing } from '@/features/calendar/ui-countdown-ring';
import {
  extractTeamsUrl,
  formatDayHeader,
  formatTimeRange,
  getMeetingState,
  minutesBetween,
} from '@/features/calendar/utils-calendar';
import { api } from '@/lib/api';
import type { UpcomingMeeting } from '@shared/calendar-types';

export function MeetingDetail({
  meeting,
  now,
  isIgnored,
  onToggleIgnore,
}: {
  meeting: UpcomingMeeting | null;
  now: number;
  isIgnored: boolean;
  onToggleIgnore: () => void;
}) {
  if (!meeting) {
    return (
      <div className="text-ink-4 flex h-full items-center justify-center text-sm">
        Select a meeting
      </div>
    );
  }

  const state = getMeetingState(meeting, now);
  const teamsUrl = extractTeamsUrl(meeting);
  const stateLabel = {
    upcoming: 'Upcoming',
    soon: 'Starting soon',
    imminent: 'Imminent',
    live: 'In progress',
    past: 'Ended',
  }[state];

  const openInCalendar = () => {
    void api.calendar.revealMeeting(meeting);
  };

  const openTeams = () => {
    if (teamsUrl) window.open(teamsUrl, '_blank');
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-glass-border border-b px-5 pt-4 pb-3">
        <div className="text-acc-ink mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest">
          <span className="bg-acc h-1.5 w-1.5 rounded-full shadow-[0_0_8px_oklch(0.72_0.2_295/0.6)]" />
          Meeting details
          <div className="flex-1" />
          <span className={state === 'live' ? 'text-status-run' : 'text-acc-ink'}>
            {stateLabel}
          </span>
        </div>
        <h3 className="text-ink-0 text-[22px] leading-tight font-semibold tracking-tight">
          {meeting.title}
        </h3>

        {/* Live status bar */}
        {(state === 'soon' || state === 'imminent' || state === 'live') && !isIgnored && (
          <div className={clsx(
            'mt-3 flex items-center gap-2.5 rounded-md border p-2.5',
            state === 'live'
              ? 'border-status-run/40 bg-status-run/10'
              : 'border-acc/40 bg-acc/10',
          )}>
            <CountdownRing
              startAt={meeting.startAt}
              endAt={meeting.endAt}
              now={now}
              size={26}
              strokeWidth={2.5}
              color={state === 'live' ? 'oklch(0.78 0.16 75)' : 'oklch(0.72 0.2 295)'}
            />
            <div className="min-w-0 flex-1">
              <div className="text-ink-0 text-sm font-medium">
                {state === 'live'
                  ? 'In progress'
                  : `Starts in ${Math.max(1, Math.ceil((new Date(meeting.startAt).getTime() - now) / 60_000))} min`}
              </div>
              <div className="text-ink-3 font-mono text-[11px]">
                {formatTimeRange(meeting.startAt, meeting.endAt)} · {minutesBetween(meeting.startAt, meeting.endAt)}m
              </div>
            </div>
            {teamsUrl && (
              <Button size="sm" variant="primary" icon={<Video />} onClick={openTeams}>
                Join Teams
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Meta row */}
      <div className="text-ink-2 border-glass-border flex flex-wrap items-center gap-3 border-b px-5 py-2.5 text-xs">
        <span className="flex items-center gap-1.5">
          <Calendar className="text-ink-3 h-3 w-3" />
          {formatDayHeader(new Date(meeting.startAt))}
        </span>
        <span className="text-ink-4">·</span>
        <span className="flex items-center gap-1.5 font-mono">
          <Clock className="text-ink-3 h-3 w-3" />
          {formatTimeRange(meeting.startAt, meeting.endAt)}
          <span className="text-ink-4">· {minutesBetween(meeting.startAt, meeting.endAt)}m</span>
        </span>
        {meeting.location && (
          <>
            <span className="text-ink-4">·</span>
            <span className="flex max-w-[220px] items-center gap-1.5 truncate">
              <MapPin className="text-ink-3 h-3 w-3 shrink-0" />
              {meeting.location}
            </span>
          </>
        )}
      </div>

      {/* Notes */}
      <div className="scroll min-h-0 flex-1 overflow-auto px-5 py-3.5">
        {meeting.notes ? (
          <>
            <div className="text-ink-3 mb-1.5 text-[11px] uppercase tracking-widest">Notes</div>
            <pre className="text-ink-1 whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed">
              {meeting.notes}
            </pre>
          </>
        ) : (
          <div className="text-ink-4 text-sm italic">No notes for this meeting.</div>
        )}
      </div>

      {/* Action bar */}
      <div className="border-glass-border flex items-center gap-2 border-t px-5 py-3">
        {teamsUrl && (
          <Button size="sm" variant="primary" icon={<Video />} onClick={openTeams}>
            Open Teams Call
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={<ExternalLink />} onClick={openInCalendar}>
          Open in Calendar
        </Button>
        <div className="flex-1" />
        <button
          onClick={onToggleIgnore}
          className={clsx(
            'border-glass-border flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors',
            isIgnored
              ? 'bg-glass-medium text-ink-2'
              : 'text-ink-3 hover:bg-glass-light',
          )}
        >
          {isIgnored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          {isIgnored ? 'Reactivate' : 'Ignore'}
        </button>
      </div>
    </div>
  );
}
```

**Note:** Add `import clsx from 'clsx';` at top.

**Step 3: Create calendar overlay with Up Next view**

```tsx
// src/features/calendar/ui-calendar-overlay/index.tsx
import clsx from 'clsx';
import { Calendar, Clock, Eye, EyeOff, Search, Zap } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Kbd } from '@/common/ui/kbd';
import { MeetingDetail } from '@/features/calendar/ui-meeting-detail';
import { MeetingListItem } from '@/features/calendar/ui-meeting-list-item';
import {
  dayBadge,
  groupByDay,
  isSameDay,
  sortMeetings,
  startOfDay,
} from '@/features/calendar/utils-calendar';
import { useCalendarNotificationsSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { useCalendarIgnoredStore } from '@/stores/calendar-ignored';
import { useToastStore } from '@/stores/toasts';
import type { UpcomingMeeting } from '@shared/calendar-types';

type CalendarTab = 'next' | 'today' | 'week';

const TABS: { id: CalendarTab; label: string; icon: typeof Zap }[] = [
  { id: 'next', label: 'Up Next', icon: Zap },
  { id: 'today', label: 'Today', icon: Clock },
  { id: 'week', label: 'Week', icon: Calendar },
];

export function CalendarOverlay({ onClose }: { onClose: () => void }) {
  const { data: setting } = useCalendarNotificationsSetting();
  const enabled = setting?.enabled ?? false;
  const canShow = enabled && api.platform === 'darwin';

  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([]);
  const [tab, setTab] = useState<CalendarTab>('next');
  const [search, setSearch] = useState('');
  const [hideIgnored, setHideIgnored] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const addToast = useToastStore((s) => s.addToast);

  const ignoredIds = useCalendarIgnoredStore((s) => s.ignoredIds);
  const toggleIgnored = useCalendarIgnoredStore((s) => s.toggleIgnored);
  const ignoredSet = useMemo(() => new Set(ignoredIds), [ignoredIds]);

  // Escape to close
  useRegisterKeyboardBindings('calendar-overlay', {
    escape: () => { onClose(); return true; },
  });

  // Load meetings
  useEffect(() => {
    if (!canShow) return;
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api.calendar.listUpcomingMeetings();
        if (!cancelled) setMeetings(result);
      } catch (error) {
        if (!cancelled) {
          addToast({
            message: error instanceof Error ? error.message : 'Could not load meetings',
            type: 'error',
          });
        }
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [addToast, canShow]);

  // Tick every 30s
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const now = Date.now();

  const filtered = useMemo(() => {
    let result = meetings;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.location || '').toLowerCase().includes(q),
      );
    }
    if (hideIgnored) {
      result = result.filter((m) => !ignoredSet.has(m.id));
    }
    return sortMeetings(result, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetings, search, hideIgnored, ignoredSet, tick]);

  const ignoredCount = useMemo(
    () => meetings.filter((m) => ignoredSet.has(m.id)).length,
    [meetings, ignoredSet],
  );

  const selected = useMemo(
    () => filtered.find((m) => m.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  // Auto-select first meeting on mount
  useEffect(() => {
    if (!selectedId && filtered.length > 0) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        <div
          className="bg-bg-0/50 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={onClose}
        >
          <div
            className="bg-bg-1 border-glass-border flex h-[min(760px,calc(100vh-60px))] w-[min(1180px,calc(100vw-60px))] flex-col overflow-hidden rounded-xl border shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="border-glass-border flex flex-col gap-3 border-b px-4 pt-3.5 pb-2.5">
              <div className="flex items-center gap-2.5">
                <Calendar className="text-acc-ink h-4 w-4" />
                <span className="text-ink-0 text-sm font-semibold tracking-tight">Calendar</span>
                <span className="text-ink-4 font-mono text-[11px]">macOS Calendar · synced</span>
                <div className="flex-1" />

                {/* Search */}
                <div className="border-glass-border bg-bg-0 flex w-60 items-center gap-1.5 rounded border px-2.5 py-1.5">
                  <Search className="text-ink-3 h-3 w-3" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search meetings…"
                    className="text-ink-1 min-w-0 flex-1 border-none bg-transparent text-xs outline-none placeholder:text-ink-3"
                  />
                  <Kbd shortcut="cmd+f" />
                </div>

                {/* Hide ignored toggle */}
                <button
                  onClick={() => setHideIgnored(!hideIgnored)}
                  className={clsx(
                    'border-glass-border flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
                    hideIgnored ? 'bg-acc/10 text-acc-ink' : 'text-ink-2',
                  )}
                >
                  {hideIgnored ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {hideIgnored ? 'Ignored hidden' : 'All visible'}
                  <span className="text-ink-4 font-mono text-[10px]">{ignoredCount}</span>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={clsx(
                      'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                      tab === t.id
                        ? 'bg-glass-strong text-ink-0'
                        : 'text-ink-2 hover:bg-glass-light hover:text-ink-1',
                    )}
                  >
                    <t.icon className="h-3 w-3" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex min-h-0 flex-1">
              {tab === 'next' && (
                <UpNextView
                  meetings={filtered}
                  now={now}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                  ignoredSet={ignoredSet}
                  onToggleIgnore={toggleIgnored}
                />
              )}
              {tab === 'today' && (
                <TodayPlaceholder meetings={filtered} now={now} />
              )}
              {tab === 'week' && (
                <WeekPlaceholder meetings={filtered} now={now} />
              )}
            </div>

            {/* Status bar */}
            <div className="bg-bg-0 border-glass-border text-ink-4 flex items-center gap-3 border-t px-4 py-2 font-mono text-[11px]">
              <span>⌘; open/close</span>
              <span>·</span>
              <span>↑↓ navigate</span>
              <span>·</span>
              <span>⏎ open Teams</span>
              <span>·</span>
              <span>I ignore</span>
              <div className="flex-1" />
              <span>{meetings.length} events this week</span>
            </div>
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}

/** Up Next view — master-detail, grouped by day */
function UpNextView({
  meetings,
  now,
  selectedId,
  onSelect,
  ignoredSet,
  onToggleIgnore,
}: {
  meetings: UpcomingMeeting[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  ignoredSet: Set<string>;
  onToggleIgnore: (id: string) => void;
}) {
  const todayStart = startOfDay(new Date(now));
  const upcomingMeetings = useMemo(
    () => meetings.filter((m) => new Date(m.endAt).getTime() > todayStart.getTime()),
    [meetings, todayStart],
  );
  const grouped = useMemo(() => groupByDay(upcomingMeetings), [upcomingMeetings]);
  const selected = useMemo(
    () => upcomingMeetings.find((m) => m.id === selectedId) ?? upcomingMeetings[0] ?? null,
    [upcomingMeetings, selectedId],
  );

  return (
    <>
      {/* Left — list */}
      <div className="border-glass-border flex w-[380px] flex-col border-r">
        <div className="px-4 pt-3.5 pb-2.5">
          <div className="text-ink-0 text-[13px] font-semibold">Upcoming meetings</div>
          <div className="text-ink-3 mt-0.5 text-[11px]">
            {upcomingMeetings.length} event{upcomingMeetings.length !== 1 ? 's' : ''} · soonest first
          </div>
        </div>
        <div className="scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-3 pb-3">
          {grouped.map(({ date, meetings: dayMeetings }) => (
            <div key={date.getTime()} className="flex flex-col gap-1.5">
              <div className={clsx(
                'flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide',
                isSameDay(date, new Date(now)) ? 'text-acc-ink' : 'text-ink-3',
              )}>
                {dayBadge(date, new Date(now))}
                <span className={clsx(
                  'h-px flex-1',
                  isSameDay(date, new Date(now)) ? 'bg-acc/30' : 'bg-glass-border',
                )} />
                <span className="text-ink-4 font-mono text-[10px]">{dayMeetings.length}</span>
              </div>
              {dayMeetings.map((m) => (
                <MeetingListItem
                  key={m.id}
                  meeting={m}
                  now={now}
                  selected={selected?.id === m.id}
                  onSelect={() => onSelect(m.id)}
                  isIgnored={ignoredSet.has(m.id)}
                />
              ))}
            </div>
          ))}
          {grouped.length === 0 && (
            <div className="text-ink-4 py-8 text-center text-sm">No upcoming meetings</div>
          )}
        </div>
      </div>

      {/* Right — details */}
      <div className="min-w-0 flex-1">
        <MeetingDetail
          meeting={selected}
          now={now}
          isIgnored={selected ? ignoredSet.has(selected.id) : false}
          onToggleIgnore={() => selected && onToggleIgnore(selected.id)}
        />
      </div>
    </>
  );
}

/** Placeholder for Today view — will be implemented in Task 6 */
function TodayPlaceholder({ meetings, now }: { meetings: UpcomingMeeting[]; now: number }) {
  return (
    <div className="text-ink-4 flex flex-1 items-center justify-center text-sm">
      Today timeline view — coming in Task 6
    </div>
  );
}

/** Placeholder for Week view — will be implemented in Task 7 */
function WeekPlaceholder({ meetings, now }: { meetings: UpcomingMeeting[]; now: number }) {
  return (
    <div className="text-ink-4 flex flex-1 items-center justify-center text-sm">
      Week grid view — coming in Task 7
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/features/calendar/
git commit -m "feat(calendar): add calendar overlay with Up Next master-detail view"
```

---

### Task 6: Wire Overlay Into App Shell

**Files:**
- Modify: `src/routes/__root.tsx` — add `CalendarContainer` overlay + `⌘;` command
- Modify: `src/layout/ui-header/next-meeting-button.tsx` — ensure it opens overlay not dropdown

**Step 1: Add CalendarContainer to `__root.tsx`**

Follow the same pattern as `ActivityCenterContainer`. Add after the existing overlay containers:

```tsx
import { CalendarOverlay } from '@/features/calendar/ui-calendar-overlay';

function CalendarContainer() {
  const layer = useKeyboardLayer('global-nav');
  const isOpen = useOverlaysStore((s) => s.activeOverlay === 'calendar');
  const toggle = useOverlaysStore((s) => s.toggle);
  const close = useOverlaysStore((s) => s.close);

  useCommands(
    'calendar-trigger',
    [
      {
        shortcut: 'cmd+;',
        label: 'Calendar',
        section: 'General',
        handler: () => {
          toggle('calendar');
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;
  return <CalendarOverlay onClose={() => close('calendar')} />;
}
```

Add `<CalendarContainer />` in the `RootLayout` alongside the other overlay containers.

**Step 2: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat(calendar): wire calendar overlay into app shell with ⌘; shortcut"
```

---

### Task 7: Today Timeline View

**Files:**
- Create: `src/features/calendar/ui-today-timeline-view/index.tsx`
- Modify: `src/features/calendar/ui-calendar-overlay/index.tsx` — replace `TodayPlaceholder`

**Step 1: Create Today timeline view**

Vertical hour spine (8:00–20:00), meeting blocks colored by kind, current-time red line, free-time "focus" chips in header. Detail pane on the right.

```tsx
// src/features/calendar/ui-today-timeline-view/index.tsx
import clsx from 'clsx';
import { Zap } from 'lucide-react';
import { useMemo } from 'react';

import { MeetingDetail } from '@/features/calendar/ui-meeting-detail';
import {
  addDays,
  computeFreeBlocks,
  formatDayHeader,
  formatTimeHHMM,
  formatTimeRange,
  isSameDay,
  layoutColumns,
  minutesBetween,
  startOfDay,
} from '@/features/calendar/utils-calendar';
import type { UpcomingMeeting } from '@shared/calendar-types';

const HOUR_START = 8;
const HOUR_END = 20;
const HOURS = HOUR_END - HOUR_START;
const PX_PER_HOUR = 70;
const TOTAL_H = HOURS * PX_PER_HOUR;

function toY(dateStr: string): number {
  const d = new Date(dateStr);
  const mins = (d.getHours() - HOUR_START) * 60 + d.getMinutes();
  return Math.max(0, Math.min(TOTAL_H, (mins / 60) * PX_PER_HOUR));
}

export function TodayTimelineView({
  meetings,
  now,
  selectedId,
  onSelect,
  ignoredSet,
  onToggleIgnore,
}: {
  meetings: UpcomingMeeting[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  ignoredSet: Set<string>;
  onToggleIgnore: (id: string) => void;
}) {
  const todayDate = new Date(now);
  const dayStart = startOfDay(todayDate);
  const dayEnd = addDays(dayStart, 1);

  const dayMeetings = useMemo(
    () =>
      meetings.filter(
        (m) =>
          new Date(m.startAt) >= dayStart &&
          new Date(m.startAt) < dayEnd,
      ),
    [meetings, dayStart, dayEnd],
  );

  const cols = useMemo(() => layoutColumns(dayMeetings), [dayMeetings]);
  const selected = useMemo(
    () => dayMeetings.find((m) => m.id === selectedId) ?? dayMeetings[0] ?? null,
    [dayMeetings, selectedId],
  );

  const freeBlocks = useMemo(
    () => computeFreeBlocks(dayMeetings.filter((m) => !ignoredSet.has(m.id)), dayStart),
    [dayMeetings, ignoredSet, dayStart],
  );

  const totalMins = useMemo(
    () => dayMeetings.reduce((acc, m) => acc + minutesBetween(m.startAt, m.endAt), 0),
    [dayMeetings],
  );

  const currentHour = todayDate.getHours();
  const showTimeLine = isSameDay(todayDate, dayStart) && currentHour >= HOUR_START && currentHour < HOUR_END;

  return (
    <>
      {/* Left — timeline */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Day header */}
        <div className="border-glass-border flex items-center gap-3 border-b px-5 py-3">
          <div>
            <div className="text-ink-0 text-base font-semibold tracking-tight">
              {formatDayHeader(todayDate)}
            </div>
            <div className="text-ink-3 mt-0.5 text-[11px]">
              {dayMeetings.length} meetings · {totalMins}m of meetings
            </div>
          </div>
          <div className="flex-1" />
          {/* Focus chips */}
          {freeBlocks.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-ink-4 text-[10px] font-semibold uppercase tracking-wide">
                focus
              </span>
              {freeBlocks.map((g, i) => (
                <span
                  key={i}
                  className="border-status-done/30 bg-status-done/10 text-status-done flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-medium"
                >
                  <Zap className="h-2.5 w-2.5" />
                  {formatTimeHHMM(g.start.toISOString())}–{formatTimeHHMM(g.end.toISOString())}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="scroll flex-1 overflow-auto py-3.5">
          <div className="relative ml-[60px] mr-5" style={{ height: TOTAL_H }}>
            {/* Hour rules */}
            {Array.from({ length: HOURS + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute flex items-center gap-2.5"
                style={{ top: i * PX_PER_HOUR, left: -50, right: 0 }}
              >
                <span className="text-ink-4 w-10 -translate-y-[7px] text-right font-mono text-[10px]">
                  {String(HOUR_START + i).padStart(2, '0')}:00
                </span>
                <span className="bg-glass-border h-px flex-1 opacity-70" />
              </div>
            ))}

            {/* Meeting blocks */}
            {cols.map(({ meeting: m, col, totalCols }) => {
              const y = toY(m.startAt);
              const h = Math.max(22, toY(m.endAt) - y);
              const isIgnored = ignoredSet.has(m.id);
              const dim = isIgnored;
              const isSelected = selected?.id === m.id;

              return (
                <div
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={clsx(
                    'absolute cursor-default overflow-hidden rounded-md border-l-[3px] transition-colors',
                    dim ? 'border-l-ink-4 bg-bg-1 opacity-55' : 'border-l-acc bg-acc/15',
                    isSelected ? 'ring-acc/30 ring-2' : '',
                    !dim && !isSelected && 'border border-acc/30',
                    dim && !isSelected && 'border-glass-border border',
                  )}
                  style={{
                    top: y,
                    height: h,
                    left: `calc(${(col / totalCols) * 100}% + 2px)`,
                    width: `calc(${100 / totalCols}% - 4px)`,
                  }}
                >
                  <div className="px-2 py-1.5">
                    <div className={clsx(
                      'truncate text-xs font-medium',
                      dim ? 'text-ink-3' : 'text-ink-0',
                    )}>
                      {m.title}
                    </div>
                    {h > 36 && (
                      <div className="text-ink-3 mt-0.5 font-mono text-[10px]">
                        {formatTimeRange(m.startAt, m.endAt)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Current time line */}
            {showTimeLine && (
              <div
                className="pointer-events-none absolute -left-2 right-0 z-10 flex items-center gap-1.5"
                style={{ top: toY(new Date(now).toISOString()) }}
              >
                <span className="bg-status-run h-2.5 w-2.5 rounded-full shadow-[0_0_8px_oklch(0.78_0.16_75)]" />
                <span className="bg-status-run h-[1.5px] flex-1 shadow-[0_0_6px_oklch(0.78_0.16_75/0.6)]" />
                <span className="bg-status-run rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[oklch(0.18_0.05_75)]">
                  {formatTimeHHMM(new Date(now).toISOString())}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right — details */}
      <div className="border-glass-border w-[420px] border-l">
        <MeetingDetail
          meeting={selected}
          now={now}
          isIgnored={selected ? ignoredSet.has(selected.id) : false}
          onToggleIgnore={() => selected && onToggleIgnore(selected.id)}
        />
      </div>
    </>
  );
}
```

**Step 2: Replace TodayPlaceholder in overlay**

In `ui-calendar-overlay/index.tsx`, import `TodayTimelineView` and replace the placeholder:

```tsx
{tab === 'today' && (
  <TodayTimelineView
    meetings={filtered}
    now={now}
    selectedId={selected?.id ?? null}
    onSelect={setSelectedId}
    ignoredSet={ignoredSet}
    onToggleIgnore={toggleIgnored}
  />
)}
```

**Step 3: Commit**

```bash
git add src/features/calendar/
git commit -m "feat(calendar): add Today timeline view with free-time focus chips"
```

---

### Task 8: Week Grid View

**Files:**
- Create: `src/features/calendar/ui-week-view/index.tsx`
- Modify: `src/features/calendar/ui-calendar-overlay/index.tsx` — replace `WeekPlaceholder`

**Step 1: Create Week grid view**

5-day grid (Mon–Fri), today tinted violet, per-day meeting counts in header, current-time line on today column only. Selected meeting summary in a footer strip (not full detail pane — the design shows a compact footer for the week view).

```tsx
// src/features/calendar/ui-week-view/index.tsx
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Eye, EyeOff, ExternalLink, Video } from 'lucide-react';
import { useMemo } from 'react';

import { Button } from '@/common/ui/button';
import { CountdownRing } from '@/features/calendar/ui-countdown-ring';
import {
  addDays,
  extractTeamsUrl,
  formatTimeHHMM,
  formatTimeRange,
  isSameDay,
  layoutColumns,
  minutesBetween,
  startOfDay,
} from '@/features/calendar/utils-calendar';
import { api } from '@/lib/api';
import type { UpcomingMeeting } from '@shared/calendar-types';

const HOUR_START = 8;
const HOUR_END = 19;
const HOURS = HOUR_END - HOUR_START;
const PX_PER_HOUR = 56;
const TOTAL_H = HOURS * PX_PER_HOUR;

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toY(dateStr: string): number {
  const d = new Date(dateStr);
  const mins = (d.getHours() - HOUR_START) * 60 + d.getMinutes();
  return Math.max(0, Math.min(TOTAL_H, (mins / 60) * PX_PER_HOUR));
}

export function WeekView({
  meetings,
  now,
  selectedId,
  onSelect,
  ignoredSet,
  onToggleIgnore,
}: {
  meetings: UpcomingMeeting[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  ignoredSet: Set<string>;
  onToggleIgnore: (id: string) => void;
}) {
  const today = new Date(now);
  const dow = (today.getDay() + 6) % 7; // 0=Mon
  const monday = startOfDay(addDays(today, -dow));
  const days = useMemo(
    () => Array.from({ length: 5 }).map((_, i) => addDays(monday, i)),
    [monday],
  );
  const weekEnd = addDays(days[4], 1);

  const weekMeetings = useMemo(
    () =>
      meetings.filter(
        (m) =>
          new Date(m.startAt) >= monday && new Date(m.startAt) < weekEnd,
      ),
    [meetings, monday, weekEnd],
  );

  const selected = useMemo(
    () => weekMeetings.find((m) => m.id === selectedId) ?? null,
    [weekMeetings, selectedId],
  );

  const teamsUrl = selected ? extractTeamsUrl(selected) : null;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Week header */}
      <div className="border-glass-border grid border-b" style={{ gridTemplateColumns: '52px repeat(5, 1fr)' }}>
        <div className="text-ink-4 flex items-center justify-between px-2 py-2.5 font-mono text-[10px]">
          <ChevronLeft className="h-3 w-3" />
          <ChevronRight className="h-3 w-3" />
        </div>
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          const dayMeetings = weekMeetings.filter((m) => isSameDay(new Date(m.startAt), d));
          const ignoredDay = dayMeetings.filter((m) => ignoredSet.has(m.id)).length;
          const totalMins = dayMeetings.reduce((acc, m) => acc + minutesBetween(m.startAt, m.endAt), 0);

          return (
            <div
              key={i}
              className={clsx(
                'border-glass-border border-l px-3 py-2.5',
                isToday && 'bg-acc/8',
              )}
            >
              <div className="flex items-baseline gap-1.5">
                <span className={clsx(
                  'text-[10px] font-semibold uppercase tracking-wide',
                  isToday ? 'text-acc-ink' : 'text-ink-3',
                )}>
                  {DAYS_SHORT[d.getDay()]}
                </span>
                <span className={clsx(
                  'text-lg font-semibold tracking-tight',
                  isToday ? 'text-ink-0' : 'text-ink-1',
                )}>
                  {d.getDate()}
                </span>
                {isToday && (
                  <span className="bg-acc text-bg-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide">
                    today
                  </span>
                )}
              </div>
              <div className="text-ink-3 mt-1 flex items-center gap-1.5 font-mono text-[10px]">
                <span>{dayMeetings.length} mtg</span>
                {ignoredDay > 0 && (
                  <span className="text-ink-4">· {ignoredDay} ign.</span>
                )}
                <span>· {totalMins}m</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Week grid */}
      <div className="scroll flex-1 overflow-auto">
        <div className="grid" style={{ gridTemplateColumns: '52px repeat(5, 1fr)', minHeight: TOTAL_H }}>
          {/* Hours column */}
          <div className="relative" style={{ height: TOTAL_H }}>
            {Array.from({ length: HOURS + 1 }).map((_, i) => (
              <div
                key={i}
                className="text-ink-4 absolute right-2 font-mono text-[10px]"
                style={{ top: i * PX_PER_HOUR - 6 }}
              >
                {String(HOUR_START + i).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d, di) => {
            const isToday = isSameDay(d, today);
            const dayMeetings = weekMeetings.filter((m) => isSameDay(new Date(m.startAt), d));
            const laid = layoutColumns(dayMeetings);

            return (
              <div
                key={di}
                className={clsx(
                  'border-glass-border relative border-l',
                  isToday && 'bg-acc/4',
                )}
                style={{ height: TOTAL_H }}
              >
                {/* Hour rules */}
                {Array.from({ length: HOURS }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-glass-border absolute left-0 right-0 opacity-50"
                    style={{ top: (i + 1) * PX_PER_HOUR, height: 1 }}
                  />
                ))}

                {/* Meeting blocks */}
                {laid.map(({ meeting: m, col, totalCols }) => {
                  const y = toY(m.startAt);
                  const h = Math.max(20, toY(m.endAt) - y);
                  const isIgnored = ignoredSet.has(m.id);
                  const dim = isIgnored;
                  const isSel = selected?.id === m.id;

                  return (
                    <div
                      key={m.id}
                      onClick={() => onSelect(m.id)}
                      className={clsx(
                        'absolute cursor-default overflow-hidden rounded border-l-[3px] transition-colors',
                        dim ? 'border-l-ink-4 bg-bg-1 opacity-50' : 'border-l-acc bg-acc/12',
                        isSel ? 'ring-acc/35 ring-2' : '',
                        !dim && !isSel && 'border-acc/25 border',
                        dim && !isSel && 'border-glass-border border',
                      )}
                      style={{
                        top: y,
                        height: h,
                        left: `calc(${(col / totalCols) * 100}% + 3px)`,
                        width: `calc(${100 / totalCols}% - 6px)`,
                      }}
                    >
                      <div className="px-1.5 py-1">
                        <div className={clsx(
                          'truncate text-[11px] font-medium leading-tight',
                          dim ? 'text-ink-3' : 'text-ink-0',
                        )}>
                          {m.title}
                        </div>
                        {h > 32 && (
                          <div className="text-ink-3 mt-0.5 font-mono text-[9.5px]">
                            {formatTimeHHMM(m.startAt)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Current time line on today */}
                {isToday && today.getHours() >= HOUR_START && today.getHours() < HOUR_END && (
                  <div
                    className="pointer-events-none absolute -left-1 right-0 z-10 flex items-center gap-1"
                    style={{ top: toY(new Date(now).toISOString()) }}
                  >
                    <span className="bg-status-run h-2 w-2 rounded-full shadow-[0_0_6px_oklch(0.78_0.16_75)]" />
                    <span className="bg-status-run h-[1.5px] flex-1" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer detail strip — selected meeting summary */}
      {selected && (
        <div className="bg-bg-0 border-glass-border flex items-center gap-3.5 border-t px-4 py-2.5">
          <span className="bg-acc w-[3px] self-stretch rounded-full" style={{ opacity: ignoredSet.has(selected.id) ? 0.35 : 1 }} />
          <div className="min-w-0 flex-1">
            <div className="text-ink-0 truncate text-[13px] font-medium">{selected.title}</div>
            <div className="text-ink-3 font-mono text-[11px]">
              {new Date(selected.startAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatTimeRange(selected.startAt, selected.endAt)} · {selected.location || '—'}
            </div>
          </div>
          {teamsUrl && (
            <Button
              size="sm"
              variant="primary"
              icon={<Video />}
              onClick={() => window.open(teamsUrl, '_blank')}
            >
              Join
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon={<ExternalLink />}
            onClick={() => void api.calendar.revealMeeting(selected)}
          >
            Calendar
          </Button>
          <button
            onClick={() => onToggleIgnore(selected.id)}
            className="border-glass-border text-ink-3 flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium"
          >
            {ignoredSet.has(selected.id) ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {ignoredSet.has(selected.id) ? 'Reactivate' : 'Ignore'}
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Replace WeekPlaceholder in overlay**

```tsx
{tab === 'week' && (
  <WeekView
    meetings={filtered}
    now={now}
    selectedId={selected?.id ?? null}
    onSelect={setSelectedId}
    ignoredSet={ignoredSet}
    onToggleIgnore={toggleIgnored}
  />
)}
```

**Step 3: Commit**

```bash
git add src/features/calendar/
git commit -m "feat(calendar): add Week grid view with 5-day layout and selected meeting footer"
```

---

### Task 9: Validate & Fix

**Step 1: Run install**

```bash
pnpm install
```

**Step 2: Run tests**

```bash
pnpm test
```

**Step 3: Run lint with autofix**

```bash
pnpm lint --fix
```

**Step 4: Run TypeScript check**

```bash
pnpm ts-check
```

**Step 5: Run lint again for remaining errors**

```bash
pnpm lint
```

Fix any issues found in each step before proceeding.

**Step 6: Final commit**

```bash
git add -A
git commit -m "fix(calendar): lint and TypeScript fixes"
```

---

## File Summary

| Action | File |
|--------|------|
| Modify | `src/stores/overlays.ts` |
| Create | `src/stores/calendar-ignored.ts` |
| Modify | `shared/calendar-types.ts` |
| Create | `src/features/calendar/utils-calendar.ts` |
| Create | `src/features/calendar/ui-countdown-ring/index.tsx` |
| Rewrite | `src/layout/ui-header/next-meeting-button.tsx` |
| Create | `src/features/calendar/ui-meeting-list-item/index.tsx` |
| Create | `src/features/calendar/ui-meeting-detail/index.tsx` |
| Create | `src/features/calendar/ui-calendar-overlay/index.tsx` |
| Modify | `src/routes/__root.tsx` |
| Create | `src/features/calendar/ui-today-timeline-view/index.tsx` |
| Create | `src/features/calendar/ui-week-view/index.tsx` |
