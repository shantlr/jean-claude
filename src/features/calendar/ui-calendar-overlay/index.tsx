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
import { TodayTimelineView } from '@/features/calendar/ui-today-timeline-view';
import { WeekView } from '@/features/calendar/ui-week-view';
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
  const [todayMeetings, setTodayMeetings] = useState<UpcomingMeeting[]>([]);
  const [tab, setTab] = useState<CalendarTab>('next');
  const [search, setSearch] = useState('');
  const [hideIgnored, setHideIgnored] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const ignoredIds = useCalendarIgnoredStore((s) => s.ignoredIds);
  const toggleIgnored = useCalendarIgnoredStore((s) => s.toggleIgnored);
  const ignoredSet = useMemo(() => new Set(ignoredIds), [ignoredIds]);

  useRegisterKeyboardBindings('calendar-overlay', {
    escape: () => {
      onClose();
      return true;
    },
  });

  // Load meetings
  useEffect(() => {
    if (!canShow) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [upcoming, today] = await Promise.all([
          api.calendar.listUpcomingMeetings(),
          api.calendar.listTodayMeetings(),
        ]);
        if (!cancelled) {
          setMeetings(upcoming);
          setTodayMeetings(today);
        }
      } catch (error) {
        if (!cancelled) {
          addToast({
            message:
              error instanceof Error
                ? error.message
                : 'Could not load meetings',
            type: 'error',
          });
        }
      }
    };
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [addToast, canShow]);

  // Refresh `now` every 30s for countdown updates
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

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
  }, [meetings, search, hideIgnored, ignoredSet, now]);

  const filteredToday = useMemo(() => {
    let result = todayMeetings;
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
  }, [todayMeetings, search, hideIgnored, ignoredSet, now]);

  const ignoredCount = useMemo(
    () => meetings.filter((m) => ignoredSet.has(m.id)).length,
    [meetings, ignoredSet],
  );

  const allMeetings = useMemo(() => {
    const seen = new Set<string>();
    const combined: UpcomingMeeting[] = [];
    for (const m of [...filtered, ...filteredToday]) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        combined.push(m);
      }
    }
    return combined;
  }, [filtered, filteredToday]);

  const selected = useMemo(
    () =>
      allMeetings.find((m) => m.id === selectedId) ?? allMeetings[0] ?? null,
    [allMeetings, selectedId],
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
                <span className="text-ink-0 text-sm font-semibold tracking-tight">
                  Calendar
                </span>
                <span className="text-ink-4 font-mono text-[11px]">
                  macOS Calendar · synced
                </span>
                <div className="flex-1" />

                {/* Search */}
                <div className="border-glass-border bg-bg-0 flex w-60 items-center gap-1.5 rounded border px-2.5 py-1.5">
                  <Search className="text-ink-3 h-3 w-3" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search meetings…"
                    className="placeholder:text-ink-3 text-ink-1 min-w-0 flex-1 border-none bg-transparent text-xs outline-none"
                  />
                  <Kbd shortcut="cmd+f" />
                </div>

                {/* Hide ignored toggle */}
                <button
                  type="button"
                  onClick={() => setHideIgnored(!hideIgnored)}
                  className={clsx(
                    'border-glass-border flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors',
                    hideIgnored ? 'bg-acc/10 text-acc-ink' : 'text-ink-2',
                  )}
                >
                  {hideIgnored ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                  {hideIgnored ? 'Ignored hidden' : 'All visible'}
                  <span className="text-ink-4 font-mono text-[10px]">
                    {ignoredCount}
                  </span>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
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
                <TodayTimelineView
                  meetings={filteredToday}
                  now={now}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                  ignoredSet={ignoredSet}
                  onToggleIgnore={toggleIgnored}
                />
              )}
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
    () =>
      meetings.filter(
        (m) => new Date(m.endAt).getTime() > todayStart.getTime(),
      ),
    [meetings, todayStart],
  );
  const grouped = useMemo(
    () => groupByDay(upcomingMeetings),
    [upcomingMeetings],
  );
  const selected = useMemo(
    () =>
      upcomingMeetings.find((m) => m.id === selectedId) ??
      upcomingMeetings[0] ??
      null,
    [upcomingMeetings, selectedId],
  );

  return (
    <>
      {/* Left — list */}
      <div className="border-glass-border flex w-[380px] flex-col border-r">
        <div className="px-4 pt-3.5 pb-2.5">
          <div className="text-ink-0 text-[13px] font-semibold">
            Upcoming meetings
          </div>
          <div className="text-ink-3 mt-0.5 text-[11px]">
            {upcomingMeetings.length} event
            {upcomingMeetings.length !== 1 ? 's' : ''} · soonest first
          </div>
        </div>
        <div className="scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-3 pb-3">
          {grouped.map(({ date, meetings: dayMeetings }) => (
            <div key={date.getTime()} className="flex flex-col gap-1.5">
              <div
                className={clsx(
                  'flex items-center gap-2 px-1 text-[11px] font-semibold tracking-wide uppercase',
                  isSameDay(date, new Date(now))
                    ? 'text-acc-ink'
                    : 'text-ink-3',
                )}
              >
                {dayBadge(date, new Date(now))}
                <span
                  className={clsx(
                    'h-px flex-1',
                    isSameDay(date, new Date(now))
                      ? 'bg-acc/30'
                      : 'bg-glass-border',
                  )}
                />
                <span className="text-ink-4 font-mono text-[10px]">
                  {dayMeetings.length}
                </span>
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
            <div className="text-ink-4 py-8 text-center text-sm">
              No upcoming meetings
            </div>
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
