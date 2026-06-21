import clsx from 'clsx';
import { Zap } from 'lucide-react';



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
import { MeetingDetail } from '@/features/calendar/ui-meeting-detail';
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
  const todayDate = new Date(now);
  const dayStart = startOfDay(todayDate);
  const dayEnd = addDays(dayStart, 1);

  const dayMeetings = meetings.filter(
    (m) => new Date(m.startAt) >= dayStart && new Date(m.startAt) < dayEnd,
  );

  const cols = layoutColumns(dayMeetings);
  const selected =
    dayMeetings.find((m) => m.id === selectedId) ?? dayMeetings[0] ?? null;

  const freeBlocks = computeFreeBlocks(
    dayMeetings.filter((m) => !ignoredSet.has(m.id)),
    dayStart,
  );

  const totalMins = dayMeetings.reduce(
    (acc, m) => acc + minutesBetween(m.startAt, m.endAt),
    0,
  );

  const currentHour = todayDate.getHours();
  const showTimeLine =
    isSameDay(todayDate, dayStart) &&
    currentHour >= HOUR_START &&
    currentHour < HOUR_END;

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
              <span className="text-ink-4 text-[10px] font-semibold tracking-wide uppercase">
                focus
              </span>
              {freeBlocks.map((g, i) => (
                <span
                  key={i}
                  className="border-status-done/30 bg-status-done/10 text-status-done flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] font-medium"
                >
                  <Zap className="h-2.5 w-2.5" />
                  {formatTimeHHMM(g.start.toISOString())}–
                  {formatTimeHHMM(g.end.toISOString())}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="scroll flex-1 overflow-auto py-3.5">
          <div className="relative mr-5 ml-[60px]" style={{ height: TOTAL_H }}>
            {/* Hour rules */}
            {Array.from({ length: HOURS + 1 }).map((_, i) => (
              <div
                key={i}
                className="absolute flex items-center gap-2.5"
                style={{
                  top: i * PX_PER_HOUR,
                  left: -50,
                  right: 0,
                }}
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
                <button
                  type="button"
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={clsx(
                    'absolute cursor-default overflow-hidden rounded-md border-l-[3px] text-left transition-colors',
                    dim
                      ? 'border-l-ink-4 bg-bg-1 opacity-55'
                      : isSelected
                        ? 'border-l-acc bg-acc/30'
                        : 'border-l-acc bg-acc/15',
                    isSelected && 'ring-acc/50 ring-2',
                    !dim && !isSelected && 'border-acc/30 border',
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
                    <div
                      className={clsx(
                        'truncate text-xs font-medium',
                        dim ? 'text-ink-3' : 'text-ink-0',
                      )}
                    >
                      {m.title}
                    </div>
                    {h > 36 && (
                      <div className="text-ink-3 mt-0.5 font-mono text-[10px]">
                        {formatTimeRange(m.startAt, m.endAt)}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Current time line */}
            {showTimeLine && (
              <div
                className="pointer-events-none absolute right-0 -left-2 z-10 flex items-center gap-1.5"
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
