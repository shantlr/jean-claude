import { Calendar, Video } from 'lucide-react';
import { type MouseEvent, startTransition, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';


import {
  extractTeamsUrl,
  formatTimeHHMM,
  getMeetingState,
  getTeamsJoinUrl,
  relativeLabel,
  sortMeetings,
} from '@/features/calendar/utils-calendar';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { CountdownRing } from '@/features/calendar/ui-countdown-ring';
import { Kbd } from '@/common/ui/kbd';
import type { UpcomingMeeting } from '@shared/calendar-types';
import { useCalendarIgnoredStore } from '@/stores/calendar-ignored';
import { useCalendarNotificationsSetting } from '@/hooks/use-settings';
import { useOverlaysStore } from '@/stores/overlays';
import { useToastStore } from '@/stores/toasts';



const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

function getNextClockDelay(meeting: UpcomingMeeting, now: number) {
  const start = new Date(meeting.startAt).getTime();
  const end = new Date(meeting.endAt).getTime();

  if (start <= now) {
    return Math.min(15 * SECOND_MS, Math.max(SECOND_MS, end - now));
  }

  const untilStart = start - now;
  if (untilStart <= MINUTE_MS) return 10 * SECOND_MS;
  if (untilStart <= 10 * MINUTE_MS) return 30 * SECOND_MS;
  if (untilStart <= 30 * MINUTE_MS) return MINUTE_MS;

  return Math.min(
    5 * MINUTE_MS,
    Math.max(MINUTE_MS, untilStart - 30 * MINUTE_MS),
  );
}

export function NextMeetingButton() {
  const { data: calendarNotificationsSetting } =
    useCalendarNotificationsSetting();
  const enabled = calendarNotificationsSetting?.enabled ?? false;
  const meetingJoinTarget = calendarNotificationsSetting?.meetingJoinTarget;
  const canShow = enabled && api.platform === 'darwin';
  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const addToast = useToastStore((s) => s.addToast);
  const toggleOverlay = useOverlaysStore((s) => s.toggle);
  const ignoredIds = useCalendarIgnoredStore((s) => s.ignoredIds);

  // Poll meetings every 60s
  useEffect(() => {
    if (!canShow) {
      startTransition(() => setMeetings([]));
      startTransition(() => setHasLoaded(false));
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api.calendar.listUpcomingMeetings();
        if (!cancelled) {
          setMeetings(result);
          setHasLoaded(true);
          setNow(Date.now());
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

  const ignoredSet = useMemo(() => new Set(ignoredIds), [ignoredIds]);

  const activeMeetings = useMemo(
    () =>
      sortMeetings(
        meetings.filter(
          (m) => !ignoredSet.has(m.id) && new Date(m.endAt).getTime() > now,
        ),
        now,
      ),
    [meetings, ignoredSet, now],
  );

  useEffect(() => {
    if (!canShow || activeMeetings.length === 0) return;
    const id = window.setTimeout(
      () => setNow(Date.now()),
      getNextClockDelay(activeMeetings[0], now),
    );
    return () => window.clearTimeout(id);
  }, [activeMeetings, canShow, now]);

  if (!canShow) return null;

  const next = activeMeetings[0] ?? null;
  const state = next ? getMeetingState(next, now) : 'none';
  const teamsUrl = next ? extractTeamsUrl(next) : null;

  const handleClick = () => toggleOverlay('calendar');
  const handleJoin = (e: MouseEvent) => {
    e.stopPropagation();
    if (teamsUrl) {
      void api.calendar.suppressMeetingStartPopup(next).catch(() => {});
      void api.shell
        .openTeamsJoinUrl(getTeamsJoinUrl(teamsUrl, meetingJoinTarget))
        .catch((error) => {
          addToast({
            message:
              error instanceof Error ? error.message : 'Could not open Teams',
            type: 'error',
          });
        });
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={clsx(
        'max-w-[340px] min-w-0 flex-1 gap-2 overflow-hidden rounded-lg border px-2.5 whitespace-nowrap',
        state === 'live' &&
          'border-status-run/40 bg-status-run/8 hover:bg-status-run/12',
        state === 'imminent' && 'border-acc/40 bg-acc/8 hover:bg-acc/12',
        state === 'soon' && 'border-acc/35 bg-acc/8 hover:bg-acc/12',
        (state === 'upcoming' || state === 'none') &&
          'border-glass-border bg-glass-subtle hover:bg-glass-light',
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
          <span className="text-ink-3 shrink-0 font-mono text-[11px]">
            {formatTimeHHMM(next.startAt)}
          </span>
          <span className="text-ink-1 max-w-[180px] min-w-0 truncate text-xs font-medium">
            {next.title}
          </span>
          {state === 'live' && (
            <span className="text-status-run flex items-center gap-1 font-mono text-[11px] font-semibold tracking-wide uppercase">
              <span className="bg-status-run h-1.5 w-1.5 animate-pulse rounded-full" />
              LIVE
            </span>
          )}
          {(state === 'soon' || state === 'upcoming') && (
            <span
              className={clsx(
                'shrink-0 font-mono text-[11px]',
                state === 'soon' ? 'text-acc-ink font-semibold' : 'text-ink-3',
              )}
            >
              {relativeLabel(next, now)}
            </span>
          )}
          {state === 'imminent' && teamsUrl && (
            <button
              type="button"
              onClick={handleJoin}
              className="bg-acc text-bg-0 flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
            >
              <Video className="h-3 w-3" />
              Join
            </button>
          )}
          {state === 'live' && teamsUrl && (
            <button
              type="button"
              onClick={handleJoin}
              className="bg-status-run/20 text-status-run flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold"
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
            {!hasLoaded ? 'Loading...' : 'No meetings'}
          </span>
        </>
      )}
      <Kbd shortcut="cmd+;" className="ml-0.5" />
    </Button>
  );
}
