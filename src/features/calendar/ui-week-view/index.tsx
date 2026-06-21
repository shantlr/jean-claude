import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
  EyeOff,
  Video,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import clsx from 'clsx';


import {
  addDays,
  extractTeamsUrl,
  formatTimeHHMM,
  formatTimeRange,
  getTeamsJoinUrl,
  isSameDay,
  layoutColumns,
  minutesBetween,
  startOfDay,
} from '@/features/calendar/utils-calendar';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { OrganizerTooltip } from '@/features/calendar/ui-organizer-tooltip';
import type { UpcomingMeeting } from '@shared/calendar-types';
import { useCalendarNotificationsSetting } from '@/hooks/use-settings';
import { useToastStore } from '@/stores/toasts';


const HOUR_START = 8;
const HOUR_END = 19;
const HOURS = HOUR_END - HOUR_START;
const PX_PER_HOUR = 56;
const TOTAL_H = HOURS * PX_PER_HOUR;

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatWeekRange(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const sameYear = start.getFullYear() === end.getFullYear();

  if (sameMonth && sameYear) {
    return `${start.toLocaleDateString(undefined, {
      month: 'short',
    })} ${start.getDate()}-${end.getDate()}`;
  }

  return `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} - ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

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
  const addToast = useToastStore((s) => s.addToast);
  const { data: calendarNotificationsSetting } =
    useCalendarNotificationsSetting();
  const today = useMemo(() => new Date(now), [now]);
  const [weekOffset, setWeekOffset] = useState(0);
  const monday = useMemo(() => {
    const dow = (today.getDay() + 6) % 7; // 0=Mon
    return startOfDay(addDays(today, weekOffset * 7 - dow));
  }, [today, weekOffset]);
  const days = useMemo(
    () => Array.from({ length: 5 }).map((_, i) => addDays(monday, i)),
    [monday],
  );
  const weekEnd = addDays(days[4], 1);
  const weekLabel = formatWeekRange(days[0], days[4]);

  const weekMeetings = useMemo(
    () =>
      meetings.filter(
        (m) => new Date(m.startAt) >= monday && new Date(m.startAt) < weekEnd,
      ),
    [meetings, monday, weekEnd],
  );

  const selected = useMemo(
    () => weekMeetings.find((m) => m.id === selectedId) ?? null,
    [weekMeetings, selectedId],
  );

  const teamsUrl = selected ? extractTeamsUrl(selected) : null;
  const selectedIsIgnored = selected ? ignoredSet.has(selected.id) : false;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Week header */}
      <div
        className="border-glass-border grid border-b"
        style={{ gridTemplateColumns: '52px repeat(5, 1fr)' }}
      >
        <div className="text-ink-4 flex items-center justify-between px-1 py-2.5 font-mono text-[10px]">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWeekOffset((offset) => offset - 1)}
            className="hover:bg-glass-light hover:text-ink-1 rounded p-1 transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWeekOffset((offset) => offset + 1)}
            className="hover:bg-glass-light hover:text-ink-1 rounded p-1 transition-colors"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        {days.map((d, i) => {
          const isToday = isSameDay(d, today);
          const dayMeetings = weekMeetings.filter((m) =>
            isSameDay(new Date(m.startAt), d),
          );
          const ignoredDay = dayMeetings.filter((m) =>
            ignoredSet.has(m.id),
          ).length;
          const totalMins = dayMeetings.reduce(
            (acc, m) => acc + minutesBetween(m.startAt, m.endAt),
            0,
          );

          return (
            <div
              key={i}
              className={clsx(
                'border-glass-border border-l px-3 py-2.5',
                isToday && 'bg-acc/8',
              )}
            >
              <div className="flex items-baseline gap-1.5">
                <span
                  className={clsx(
                    'text-[10px] font-semibold tracking-wide uppercase',
                    isToday ? 'text-acc-ink' : 'text-ink-3',
                  )}
                >
                  {DAYS_SHORT[d.getDay()]}
                </span>
                <span
                  className={clsx(
                    'text-lg font-semibold tracking-tight',
                    isToday ? 'text-ink-0' : 'text-ink-1',
                  )}
                >
                  {d.getDate()}
                </span>
                {i === 0 && (
                  <span className="text-ink-4 font-mono text-[10px]">
                    {weekLabel}
                  </span>
                )}
                {isToday && (
                  <span className="bg-acc text-bg-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold tracking-wide uppercase">
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
        <div
          className="grid"
          style={{
            gridTemplateColumns: '52px repeat(5, 1fr)',
            minHeight: TOTAL_H,
          }}
        >
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
            const dayMeetings = weekMeetings.filter((m) =>
              isSameDay(new Date(m.startAt), d),
            );
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
                    className="bg-glass-border absolute right-0 left-0 opacity-50"
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
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => onSelect(m.id)}
                      className={clsx(
                        'absolute cursor-default overflow-hidden rounded border-l-[3px] text-left transition-colors',
                        dim
                          ? 'border-l-ink-4 bg-bg-1 opacity-50'
                          : isSel
                            ? 'border-l-acc bg-acc/30'
                            : 'border-l-acc bg-acc/12',
                        isSel && 'ring-acc/50 ring-2',
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
                        <div
                          className={clsx(
                            'truncate text-[11px] leading-tight font-medium',
                            dim ? 'text-ink-3' : 'text-ink-0',
                          )}
                        >
                          {m.title}
                        </div>
                        {h > 32 && (
                          <div className="text-ink-3 mt-0.5 font-mono text-[9.5px]">
                            {formatTimeHHMM(m.startAt)}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}

                {/* Current time line on today */}
                {isToday &&
                  today.getHours() >= HOUR_START &&
                  today.getHours() < HOUR_END && (
                    <div
                      className="pointer-events-none absolute right-0 -left-1 z-10 flex items-center gap-1"
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
          <span
            className="bg-acc w-[3px] self-stretch rounded-full"
            style={{
              opacity: ignoredSet.has(selected.id) ? 0.35 : 1,
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="text-ink-0 truncate text-[13px] font-medium">
              {selected.title}
            </div>
            <div className="text-ink-3 font-mono text-[11px]">
              {new Date(selected.startAt).toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              })}{' '}
              · {formatTimeRange(selected.startAt, selected.endAt)}
              {selected.organizer ? (
                <OrganizerTooltip meeting={selected}>
                  <span> · From {selected.organizer}</span>
                </OrganizerTooltip>
              ) : null}{' '}
              · {selected.location || '-'}
            </div>
          </div>
          {teamsUrl && (
            <Button
              size="sm"
              variant="primary"
              icon={<Video />}
              onClick={() => {
                void api.shell
                  .openTeamsJoinUrl(
                    getTeamsJoinUrl(
                      teamsUrl,
                      calendarNotificationsSetting?.meetingJoinTarget,
                    ),
                  )
                  .catch((error) => {
                    addToast({
                      message:
                        error instanceof Error
                          ? error.message
                          : 'Could not open Teams',
                      type: 'error',
                    });
                  });
              }}
            >
              Join
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon={<ExternalLink />}
            onClick={() => {
              api.calendar.revealMeeting(selected).catch((error) => {
                addToast({
                  message:
                    error instanceof Error
                      ? error.message
                      : 'Could not open in Calendar',
                  type: 'error',
                });
              });
            }}
          >
            Calendar
          </Button>
          <button
            type="button"
            onClick={() => {
              if (selectedIsIgnored) {
                onReactivate(selected.id);
              } else {
                onRequestIgnore(selected);
              }
            }}
            className="border-glass-border text-ink-3 flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium"
          >
            {selectedIsIgnored ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            {selectedIsIgnored ? 'Reactivate' : 'Ignore'}
            <Kbd shortcut="i" />
          </button>
        </div>
      )}
    </div>
  );
}
