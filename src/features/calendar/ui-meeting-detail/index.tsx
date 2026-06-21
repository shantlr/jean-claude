import {
  Calendar,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  MapPin,
  Repeat,
  User,
  Video,
} from 'lucide-react';
import clsx from 'clsx';


import {
  extractTeamsUrl,
  formatDayHeader,
  formatTimeRange,
  getMeetingState,
  getTeamsJoinUrl,
  minutesBetween,
} from '@/features/calendar/utils-calendar';
import { api } from '@/lib/api';
import { Button } from '@/common/ui/button';
import { CountdownRing } from '@/features/calendar/ui-countdown-ring';
import { Kbd } from '@/common/ui/kbd';
import { OrganizerTooltip } from '@/features/calendar/ui-organizer-tooltip';
import type { UpcomingMeeting } from '@shared/calendar-types';
import { useCalendarNotificationsSetting } from '@/hooks/use-settings';
import { useToastStore } from '@/stores/toasts';



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
  const addToast = useToastStore((s) => s.addToast);
  const { data: calendarNotificationsSetting } =
    useCalendarNotificationsSetting();

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
    api.calendar.revealMeeting(meeting).catch((error) => {
      addToast({
        message:
          error instanceof Error ? error.message : 'Could not open in Calendar',
        type: 'error',
      });
    });
  };

  const openTeams = () => {
    if (teamsUrl) {
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
              error instanceof Error ? error.message : 'Could not open Teams',
            type: 'error',
          });
        });
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-glass-border border-b px-5 pt-4 pb-3">
        <div className="text-acc-ink mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-widest uppercase">
          <span className="bg-acc h-1.5 w-1.5 rounded-full shadow-[0_0_8px_oklch(0.72_0.2_295/0.6)]" />
          Meeting details
          <div className="flex-1" />
          <span
            className={state === 'live' ? 'text-status-run' : 'text-acc-ink'}
          >
            {stateLabel}
          </span>
        </div>
        <h3 className="text-ink-0 text-[22px] leading-tight font-semibold tracking-tight">
          {meeting.title}
        </h3>

        {/* Live status bar */}
        {(state === 'soon' || state === 'imminent' || state === 'live') &&
          !isIgnored && (
            <div
              className={clsx(
                'mt-3 flex items-center gap-2.5 rounded-md border p-2.5',
                state === 'live'
                  ? 'border-status-run/40 bg-status-run/10'
                  : 'border-acc/40 bg-acc/10',
              )}
            >
              <CountdownRing
                startAt={meeting.startAt}
                endAt={meeting.endAt}
                now={now}
                size={26}
                strokeWidth={2.5}
                color={
                  state === 'live'
                    ? 'oklch(0.78 0.16 75)'
                    : 'oklch(0.72 0.2 295)'
                }
              />
              <div className="min-w-0 flex-1">
                <div className="text-ink-0 text-sm font-medium">
                  {state === 'live'
                    ? 'In progress'
                    : `Starts in ${Math.max(1, Math.ceil((new Date(meeting.startAt).getTime() - now) / 60_000))} min`}
                </div>
                <div className="text-ink-3 font-mono text-[11px]">
                  {formatTimeRange(meeting.startAt, meeting.endAt)} ·{' '}
                  {minutesBetween(meeting.startAt, meeting.endAt)}m
                </div>
              </div>
              {teamsUrl && (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Video />}
                  onClick={openTeams}
                >
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
        {meeting.recurring && (
          <>
            <span className="text-ink-4">·</span>
            <span className="flex items-center gap-1.5 font-mono uppercase">
              <Repeat className="text-ink-3 h-3 w-3" />
              recurring
            </span>
          </>
        )}
        {meeting.organizer && (
          <>
            <span className="text-ink-4">·</span>
            <OrganizerTooltip meeting={meeting}>
              <span className="flex max-w-[220px] items-center gap-1.5 truncate">
                <User className="text-ink-3 h-3 w-3 shrink-0" />
                From {meeting.organizer}
              </span>
            </OrganizerTooltip>
          </>
        )}
        <span className="text-ink-4">·</span>
        <span className="flex items-center gap-1.5 font-mono">
          <Clock className="text-ink-3 h-3 w-3" />
          {formatTimeRange(meeting.startAt, meeting.endAt)}
          <span className="text-ink-4">
            · {minutesBetween(meeting.startAt, meeting.endAt)}m
          </span>
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
            <div className="text-ink-3 mb-1.5 text-[11px] tracking-widest uppercase">
              Notes
            </div>
            <pre className="text-ink-1 font-sans text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">
              {meeting.notes}
            </pre>
          </>
        ) : (
          <div className="text-ink-4 text-sm italic">
            No notes for this meeting.
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="border-glass-border flex items-center gap-2 border-t px-5 py-3">
        {teamsUrl && (
          <Button
            size="sm"
            variant="primary"
            icon={<Video />}
            onClick={openTeams}
          >
            Open Teams Call
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          icon={<ExternalLink />}
          onClick={openInCalendar}
        >
          Open in Calendar
        </Button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onToggleIgnore}
          className={clsx(
            'border-glass-border flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition-colors',
            isIgnored
              ? 'bg-glass-medium text-ink-2'
              : 'text-ink-3 hover:bg-glass-light',
          )}
        >
          {isIgnored ? (
            <Eye className="h-3.5 w-3.5" />
          ) : (
            <EyeOff className="h-3.5 w-3.5" />
          )}
          {isIgnored ? 'Reactivate' : 'Ignore'}
          <Kbd shortcut="i" />
        </button>
      </div>
    </div>
  );
}
