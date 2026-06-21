import {
  BellOff,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  Repeat,
  Search,
  Zap,
} from 'lucide-react';
import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';



import {
  dayBadge,
  groupByDay,
  isSameDay,
  sortMeetings,
} from '@/features/calendar/utils-calendar';
import {
  useKeyboardLayer,
  useRegisterKeyboardBindings,
} from '@/common/context/keyboard-bindings';
import { api } from '@/lib/api';
import { Kbd } from '@/common/ui/kbd';
import { MeetingDetail } from '@/features/calendar/ui-meeting-detail';
import { MeetingListItem } from '@/features/calendar/ui-meeting-list-item';
import { TodayTimelineView } from '@/features/calendar/ui-today-timeline-view';
import type { UpcomingMeeting } from '@shared/calendar-types';
import { useCalendarIgnoredStore } from '@/stores/calendar-ignored';
import { useCalendarNotificationsSetting } from '@/hooks/use-settings';
import { useToastStore } from '@/stores/toasts';
import { WeekView } from '@/features/calendar/ui-week-view';



type CalendarTab = 'next' | 'today' | 'week';

const TABS: { id: CalendarTab; label: string; icon: typeof Zap }[] = [
  { id: 'next', label: 'Up Next', icon: Zap },
  { id: 'today', label: 'Today', icon: Clock },
  { id: 'week', label: 'Week', icon: Calendar },
];

function recurrenceKey(meeting: UpcomingMeeting): string {
  if (meeting.externalId) return meeting.externalId;

  const durationMs =
    new Date(meeting.endAt).getTime() - new Date(meeting.startAt).getTime();
  return [
    meeting.calendarName,
    meeting.title,
    meeting.location,
    Number.isFinite(durationMs) ? durationMs : '',
  ].join(':');
}

function getRecurringOccurrences({
  meeting,
  meetings,
}: {
  meeting: UpcomingMeeting;
  meetings: UpcomingMeeting[];
}): UpcomingMeeting[] {
  const key = recurrenceKey(meeting);
  const selectedStart = new Date(meeting.startAt).getTime();
  return meetings
    .filter(
      (m) =>
        m.recurring &&
        recurrenceKey(m) === key &&
        new Date(m.startAt).getTime() >= selectedStart,
    )
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
}

function buildIgnoreOptions({
  meeting,
  meetings,
}: {
  meeting: UpcomingMeeting;
  meetings: UpcomingMeeting[];
}): { count: number; label: string }[] {
  if (!meeting.recurring) return [{ count: 1, label: 'This' }];

  const occurrenceCount = getRecurringOccurrences({ meeting, meetings }).length;
  const counts = [1, 2, 5, occurrenceCount].filter(
    (count, index, values) =>
      count <= occurrenceCount && values.indexOf(count) === index,
  );

  return counts.map((count) => ({
    count,
    label:
      count === 1
        ? 'This'
        : count === occurrenceCount
          ? `All ${occurrenceCount}`
          : `Next ${count}`,
  }));
}

export function CalendarOverlay({ onClose }: { onClose: () => void }) {
  const layer = useKeyboardLayer('overlay', {
    exclusive: true,
    passthrough: ['global-nav'],
  });
  const { data: setting } = useCalendarNotificationsSetting();
  const enabled = setting?.enabled ?? false;
  const canShow = enabled && api.platform === 'darwin';

  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([]);
  const [todayMeetings, setTodayMeetings] = useState<UpcomingMeeting[]>([]);
  const [tab, setTab] = useState<CalendarTab>('next');
  const [search, setSearch] = useState('');
  const [hideIgnored, setHideIgnored] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ignoreScopeMeeting, setIgnoreScopeMeeting] =
    useState<UpcomingMeeting | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const ignoredIds = useCalendarIgnoredStore((s) => s.ignoredIds);
  const addIgnored = useCalendarIgnoredStore((s) => s.addIgnored);
  const removeIgnored = useCalendarIgnoredStore((s) => s.removeIgnored);
  const ignoredSet = useMemo(() => new Set(ignoredIds), [ignoredIds]);

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
          (m.organizer || '').toLowerCase().includes(q) ||
          (m.organizerEmail || '').toLowerCase().includes(q) ||
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
          (m.organizer || '').toLowerCase().includes(q) ||
          (m.organizerEmail || '').toLowerCase().includes(q) ||
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

  const upNextMeetings = useMemo(() => {
    return filtered.filter((m) => new Date(m.endAt).getTime() > now);
  }, [filtered, now]);

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

  const loadedMeetings = useMemo(() => {
    const seen = new Set<string>();
    const combined: UpcomingMeeting[] = [];
    for (const m of [...meetings, ...todayMeetings]) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        combined.push(m);
      }
    }
    return combined;
  }, [meetings, todayMeetings]);

  const ignoreMeetingOccurrences = (
    meeting: UpcomingMeeting,
    count: number,
  ) => {
    const occurrenceIds = getRecurringOccurrences({
      meeting,
      meetings: loadedMeetings,
    })
      .slice(0, count)
      .map((m) => m.id);
    addIgnored(occurrenceIds.length > 0 ? occurrenceIds : [meeting.id]);
  };

  const getIgnoreOptions = (meeting: UpcomingMeeting) =>
    buildIgnoreOptions({ meeting, meetings: loadedMeetings });

  const requestIgnoreMeeting = (meeting: UpcomingMeeting) => {
    if (meeting.recurring && getIgnoreOptions(meeting).length > 1) {
      setIgnoreScopeMeeting(meeting);
      return;
    }

    ignoreMeetingOccurrences(meeting, 1);
  };

  const selected = useMemo(
    () =>
      allMeetings.find((m) => m.id === selectedId) ?? allMeetings[0] ?? null,
    [allMeetings, selectedId],
  );

  useRegisterKeyboardBindings(
    'calendar-overlay',
    {
      escape: () => {
        if (ignoreScopeMeeting) {
          setIgnoreScopeMeeting(null);
          return true;
        }
        onClose();
        return true;
      },
      i: {
        ignoreIfInput: true,
        handler: () => {
          if (!selected || ignoreScopeMeeting) return false;
          if (ignoredSet.has(selected.id)) {
            removeIgnored(selected.id);
          } else {
            requestIgnoreMeeting(selected);
          }
          return true;
        },
      },
      up: {
        ignoreIfInput: true,
        handler: () => {
          if (
            tab !== 'next' ||
            ignoreScopeMeeting ||
            upNextMeetings.length === 0
          ) {
            return false;
          }
          const currentIndex = Math.max(
            0,
            upNextMeetings.findIndex((m) => m.id === selected?.id),
          );
          setSelectedId(upNextMeetings[Math.max(0, currentIndex - 1)].id);
          return true;
        },
      },
      down: {
        ignoreIfInput: true,
        handler: () => {
          if (
            tab !== 'next' ||
            ignoreScopeMeeting ||
            upNextMeetings.length === 0
          ) {
            return false;
          }
          const currentIndex = Math.max(
            0,
            upNextMeetings.findIndex((m) => m.id === selected?.id),
          );
          setSelectedId(
            upNextMeetings[
              Math.min(upNextMeetings.length - 1, currentIndex + 1)
            ].id,
          );
          return true;
        },
      },
    },
    { layer },
  );

  // Auto-select first meeting on mount
  useEffect(() => {
    if (!selectedId && upNextMeetings.length > 0) {
      startTransition(() => setSelectedId(upNextMeetings[0].id));
    }
  }, [selectedId, upNextMeetings]);

  return createPortal(
    <FocusLock returnFocus autoFocus={false}>
      <RemoveScroll>
        <div
          className="bg-bg-0/50 fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm"
          onClick={onClose}
        >
          <div
            className="bg-bg-1 border-glass-border relative flex h-[min(760px,calc(100vh-60px))] w-[min(1180px,calc(100vw-60px))] flex-col overflow-hidden rounded-xl border shadow-2xl"
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
                  meetings={upNextMeetings}
                  now={now}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                  ignoredSet={ignoredSet}
                  onReactivate={removeIgnored}
                  onRequestIgnore={requestIgnoreMeeting}
                />
              )}
              {tab === 'today' && (
                <TodayTimelineView
                  meetings={filteredToday}
                  now={now}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                  ignoredSet={ignoredSet}
                  onReactivate={removeIgnored}
                  onRequestIgnore={requestIgnoreMeeting}
                />
              )}
              {tab === 'week' && (
                <WeekView
                  meetings={filtered}
                  now={now}
                  selectedId={selected?.id ?? null}
                  onSelect={setSelectedId}
                  ignoredSet={ignoredSet}
                  onReactivate={removeIgnored}
                  onRequestIgnore={requestIgnoreMeeting}
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
              <div className="flex-1" />
              <span>{meetings.length} events loaded</span>
            </div>

            {ignoreScopeMeeting && (
              <RecurringIgnoreModal
                meeting={ignoreScopeMeeting}
                options={getIgnoreOptions(ignoreScopeMeeting)}
                onClose={() => setIgnoreScopeMeeting(null)}
                onChoose={(count) => {
                  ignoreMeetingOccurrences(ignoreScopeMeeting, count);
                  setIgnoreScopeMeeting(null);
                }}
              />
            )}
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
  onReactivate,
  onRequestIgnore,
}: {
  meetings: UpcomingMeeting[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  ignoredSet: Set<string>;
  onReactivate: (id: string) => void;
  onRequestIgnore: (meeting: UpcomingMeeting) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const upcomingMeetings = useMemo(
    () => meetings.filter((m) => new Date(m.endAt).getTime() > now),
    [meetings, now],
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

  useEffect(() => {
    const selectedItem = listRef.current?.querySelector<HTMLButtonElement>(
      'button[data-selected="true"]',
    );
    selectedItem?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto',
    });
  }, [selected?.id]);

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
        <div
          ref={listRef}
          className="scroll flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-3 pb-3"
        >
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
          onToggleIgnore={() => {
            if (!selected) return;
            if (ignoredSet.has(selected.id)) {
              onReactivate(selected.id);
            } else {
              onRequestIgnore(selected);
            }
          }}
        />
      </div>
    </>
  );
}

function RecurringIgnoreModal({
  meeting,
  options,
  onClose,
  onChoose,
}: {
  meeting: UpcomingMeeting;
  options: { count: number; label: string }[];
  onClose: () => void;
  onChoose: (count: number) => void;
}) {
  const layer = useKeyboardLayer('dialog', { exclusive: true });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    optionRefs.current[selectedIndex]?.focus();
  }, [selectedIndex]);

  useRegisterKeyboardBindings(
    'calendar-recurring-ignore-modal',
    {
      escape: () => {
        onClose();
        return true;
      },
      up: () => {
        setSelectedIndex((index) => Math.max(0, index - 1));
        return true;
      },
      down: () => {
        setSelectedIndex((index) => Math.min(options.length - 1, index + 1));
        return true;
      },
      enter: () => {
        const option = options[selectedIndex];
        if (!option) return false;
        onChoose(option.count);
        return true;
      },
      '1': () => {
        if (!options[0]) return false;
        onChoose(options[0].count);
        return true;
      },
      '2': () => {
        if (!options[1]) return false;
        onChoose(options[1].count);
        return true;
      },
      '3': () => {
        if (!options[2]) return false;
        onChoose(options[2].count);
        return true;
      },
      '4': () => {
        if (!options[3]) return false;
        onChoose(options[3].count);
        return true;
      },
    },
    { layer },
  );

  return (
    <div
      className="bg-bg-0/60 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="border-glass-border bg-bg-1 w-[min(430px,calc(100%-32px))] overflow-hidden rounded-xl border shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-ignore-title"
        aria-describedby="calendar-ignore-description"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-glass-border border-b px-5 pt-4 pb-3">
          <div className="text-acc-ink mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase">
            <Repeat className="h-3.5 w-3.5" />
            recurring meeting
          </div>
          <div
            id="calendar-ignore-title"
            className="text-ink-0 text-lg leading-snug font-semibold"
          >
            Ignore {meeting.title}?
          </div>
          <div
            id="calendar-ignore-description"
            className="text-ink-3 mt-1 font-mono text-[11px]"
          >
            Choose how many upcoming occurrences Jean-Claude should ignore.
          </div>
        </div>

        <div className="flex flex-col gap-2 px-4 py-4">
          {options.map((option, index) => (
            <button
              key={option.count}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              onClick={() => onChoose(option.count)}
              onFocus={() => setSelectedIndex(index)}
              className={clsx(
                'border-glass-border bg-bg-0 hover:bg-glass-medium flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
                index === selectedIndex && 'ring-acc/50 ring-2',
              )}
            >
              <span className="bg-acc/12 text-acc-ink flex h-8 w-8 items-center justify-center rounded-full font-mono text-xs font-semibold">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink-0 block text-sm font-medium">
                  {option.label}
                </span>
                <span className="text-ink-4 block text-[11px]">
                  {option.count === 1
                    ? 'Only this calendar occurrence'
                    : `Ignore ${option.count} upcoming occurrences`}
                </span>
              </span>
              <Kbd shortcut={String(index + 1) as '1' | '2' | '3' | '4'} />
              <BellOff className="text-ink-4 h-4 w-4" />
            </button>
          ))}
        </div>

        <div className="border-glass-border bg-bg-0 flex justify-end border-t px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="text-ink-3 hover:bg-glass-light rounded px-3 py-1.5 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
