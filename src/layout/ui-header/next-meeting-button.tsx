import clsx from 'clsx';
import { Calendar, Video } from 'lucide-react';
import { type MouseEvent, useEffect, useMemo, useState } from 'react';

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
  const { data: calendarNotificationsSetting } =
    useCalendarNotificationsSetting();
  const enabled = calendarNotificationsSetting?.enabled ?? false;
  const canShow = enabled && api.platform === 'darwin';
  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const addToast = useToastStore((s) => s.addToast);
  const toggleOverlay = useOverlaysStore((s) => s.toggle);
  const ignoredIds = useCalendarIgnoredStore((s) => s.ignoredIds);

  // Poll meetings every 60s
  useEffect(() => {
    if (!canShow) {
      setMeetings([]);
      setHasLoaded(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api.calendar.listUpcomingMeetings();
        if (!cancelled) {
          setMeetings(result);
          setHasLoaded(true);
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

  const ignoredSet = useMemo(() => new Set(ignoredIds), [ignoredIds]);

  const activeMeetings = useMemo(
    () =>
      sortMeetings(
        meetings.filter((m) => !ignoredSet.has(m.id)),
        now,
      ),
    [meetings, ignoredSet, now],
  );

  if (!canShow) return null;

  const next = activeMeetings[0] ?? null;
  const state = next ? getMeetingState(next, now) : 'none';
  const teamsUrl = next ? extractTeamsUrl(next) : null;

  const handleClick = () => toggleOverlay('calendar');
  const handleJoin = (e: MouseEvent) => {
    e.stopPropagation();
    if (teamsUrl) window.open(teamsUrl, '_blank');
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
