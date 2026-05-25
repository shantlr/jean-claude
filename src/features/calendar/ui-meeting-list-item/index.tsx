import clsx from 'clsx';
import { BellOff, MapPin, Repeat, Video } from 'lucide-react';

import {
  extractTeamsUrl,
  formatTimeRange,
  getMeetingState,
} from '@/features/calendar/utils-calendar';
import type { UpcomingMeeting } from '@shared/calendar-types';

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(date: Date): number {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
}

function formatFutureCountdown(startAt: number, now: number): string {
  const startDate = new Date(startAt);
  const todayStart = startOfLocalDay(new Date(now));
  const startDay = startOfLocalDay(startDate);
  const dayDiff = Math.round((startDay - todayStart) / DAY_MS);
  const time = startDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (dayDiff === 1) return `Tomorrow ${time}`;
  if (dayDiff > 1 && dayDiff < 7) {
    return `${startDate.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  }
  if (dayDiff >= 7) {
    return `${startDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })} ${time}`;
  }

  const mins = Math.round((startAt - now) / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const mm = mins % 60;
  return `${h}h${String(mm).padStart(2, '0')}`;
}

function CountdownBadge({
  meeting,
  now,
}: {
  meeting: UpcomingMeeting;
  now: number;
}) {
  const state = getMeetingState(meeting, now);
  const start = new Date(meeting.startAt).getTime();
  const end = new Date(meeting.endAt).getTime();

  if (state === 'live') {
    const left = Math.max(1, Math.round((end - now) / 60_000));
    return (
      <span className="text-status-run flex items-center gap-1 font-mono text-[11px] font-semibold tracking-wide uppercase">
        <span className="bg-status-run h-1.5 w-1.5 animate-pulse rounded-full" />
        LIVE · {left}m
      </span>
    );
  }
  if (state === 'imminent') {
    return (
      <span className="text-acc-ink font-mono text-[11px] font-semibold">
        NOW
      </span>
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
  return (
    <span className="text-ink-3 shrink-0 font-mono text-[11px]">
      {formatFutureCountdown(start, now)}
    </span>
  );
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
      data-selected={selected ? 'true' : undefined}
      onClick={onSelect}
      className={clsx(
        'flex w-full gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-acc/35 bg-acc/10'
          : 'border-glass-border/70 bg-bg-1 hover:bg-glass-medium',
        dim && 'opacity-55',
      )}
    >
      <span
        className="bg-acc w-[3px] self-stretch rounded-full"
        style={{ opacity: dim ? 0.35 : 1 }}
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span
            className={clsx(
              'flex-1 truncate text-[13px] font-medium',
              dim ? 'text-ink-3' : 'text-ink-0',
            )}
          >
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
            <span className="text-ink-3 flex items-center gap-1 font-mono text-[10px] tracking-wide uppercase">
              <Repeat className="h-2.5 w-2.5" /> recurring
            </span>
          )}
          {isIgnored && (
            <span className="text-ink-3 flex items-center gap-1 font-mono text-[10px] tracking-wide uppercase">
              <BellOff className="h-2.5 w-2.5" /> ignored
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
