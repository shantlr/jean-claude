import clsx from 'clsx';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  MapPin,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Dropdown } from '@/common/ui/dropdown';
import { useCalendarNotificationsSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';
import { useToastStore } from '@/stores/toasts';
import type { UpcomingMeeting } from '@shared/calendar-types';

const TEAMS_URL_PATTERN =
  /https?:\/\/(?:[^\s<>()"']+\.)?(?:teams\.microsoft\.com|teams\.live\.com|teams\.cloud\.microsoft)\/[^\s<>()"']+/gi;

function extractTeamsUrl(meeting: UpcomingMeeting): string | null {
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
      // Ignore malformed calendar text fragments.
    }
  }

  return null;
}

function formatMeetingBadge(startAt: string): string {
  const date = new Date(startAt);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  return sameDay
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleString([], {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function formatMeetingDate(startAt: string): string {
  return new Date(startAt).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatMeetingTimeRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);

  return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function compareMeetings(a: UpcomingMeeting, b: UpcomingMeeting): number {
  const nowMs = Date.now();
  const aStartMs = new Date(a.startAt).getTime();
  const aEndMs = new Date(a.endAt).getTime();
  const bStartMs = new Date(b.startAt).getTime();
  const bEndMs = new Date(b.endAt).getTime();

  const aIsLive =
    Number.isFinite(aStartMs) && Number.isFinite(aEndMs)
      ? aStartMs <= nowMs && aEndMs >= nowMs
      : false;
  const bIsLive =
    Number.isFinite(bStartMs) && Number.isFinite(bEndMs)
      ? bStartMs <= nowMs && bEndMs >= nowMs
      : false;

  if (aIsLive !== bIsLive) {
    return aIsLive ? -1 : 1;
  }

  if (aIsLive && bIsLive) {
    const liveEndDiff = aEndMs - bEndMs;
    if (Number.isFinite(liveEndDiff) && liveEndDiff !== 0) {
      return liveEndDiff;
    }
  }

  const startDiff = aStartMs - bStartMs;
  if (Number.isFinite(startDiff) && startDiff !== 0) {
    return startDiff;
  }

  const startTextDiff = a.startAt.localeCompare(b.startAt);
  if (startTextDiff !== 0) {
    return startTextDiff;
  }

  const endDiff = aEndMs - bEndMs;
  if (Number.isFinite(endDiff) && endDiff !== 0) {
    return endDiff;
  }

  const endTextDiff = a.endAt.localeCompare(b.endAt);
  if (endTextDiff !== 0) {
    return endTextDiff;
  }

  return a.title.localeCompare(b.title);
}

function getMeetingStatus(meeting: UpcomingMeeting): {
  label: string | null;
  tone: 'soon' | 'live' | 'normal';
} {
  const nowMs = Date.now();
  const startMs = new Date(meeting.startAt).getTime();
  const endMs = new Date(meeting.endAt).getTime();

  if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
    if (startMs <= nowMs && endMs >= nowMs) {
      return { label: 'Now', tone: 'live' };
    }

    const minutesUntil = Math.round((startMs - nowMs) / 60_000);
    if (minutesUntil >= 0 && minutesUntil <= 15) {
      return {
        label: minutesUntil <= 1 ? 'Soon' : `${minutesUntil}m`,
        tone: 'soon',
      };
    }
  }

  return { label: null, tone: 'normal' };
}

function statusClasses(tone: 'soon' | 'live' | 'normal'): string {
  if (tone === 'live') {
    return 'bg-status-done/15 text-status-done';
  }

  if (tone === 'soon') {
    return 'bg-status-warn/15 text-status-warn';
  }

  return 'bg-glass-medium text-ink-2';
}

function MeetingRow({
  meeting,
  isSelected,
  onSelect,
}: {
  meeting: UpcomingMeeting;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const status = getMeetingStatus(meeting);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        'border-glass-border/70 hover:bg-glass-medium flex w-full items-start justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
        isSelected && 'border-acc/50 bg-acc/10 hover:bg-acc/12',
      )}
      aria-pressed={isSelected}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="text-ink-1 truncate text-sm font-medium">
            {meeting.title}
          </div>
          {status.label && (
            <span
              className={clsx(
                'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                statusClasses(status.tone),
              )}
            >
              {status.label}
            </span>
          )}
        </div>
        <div className="text-ink-3 mt-1 text-xs">
          {formatMeetingDate(meeting.startAt)}
        </div>
        <div className="text-ink-2 mt-0.5 text-xs">
          {formatMeetingTimeRange(meeting.startAt, meeting.endAt)}
        </div>
        <div className="text-ink-3 mt-1 flex items-center gap-1 text-xs">
          <MapPin className="h-3 w-3 shrink-0" />
          <span className="truncate">{meeting.location || 'No location'}</span>
        </div>
      </div>
      {isSelected ? (
        <ChevronUp className="text-acc-ink mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <ChevronDown className="text-ink-3 mt-0.5 h-4 w-4 shrink-0" />
      )}
    </button>
  );
}

function MeetingDetailsPane({
  meeting,
  onOpen,
  onOpenTeams,
}: {
  meeting: UpcomingMeeting;
  onOpen: () => void;
  onOpenTeams: (url: string) => void;
}) {
  const status = getMeetingStatus(meeting);
  const teamsUrl = extractTeamsUrl(meeting);
  const detailItems = [
    {
      label: 'Date',
      value: formatMeetingDate(meeting.startAt),
      icon: <CalendarClock className="h-4 w-4" />,
    },
    {
      label: 'Time',
      value: formatMeetingTimeRange(meeting.startAt, meeting.endAt),
      icon: <Clock className="h-4 w-4" />,
    },
    {
      label: 'Location',
      value: meeting.location || 'No location',
      icon: <MapPin className="h-4 w-4" />,
    },
    {
      label: 'Calendar',
      value: meeting.calendarName,
      icon: <CalendarClock className="h-4 w-4" />,
    },
  ];

  return (
    <aside className="border-glass-border/70 bg-bg-2 flex min-h-0 flex-col overflow-hidden rounded-xl border">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-acc-ink text-[11px] font-semibold tracking-wide uppercase">
              Meeting details
            </div>
            <h3 className="text-ink-1 mt-1.5 text-xl leading-tight font-semibold tracking-[-0.02em]">
              {meeting.title}
            </h3>
          </div>
          {status.label && (
            <span
              className={clsx(
                'shrink-0 rounded-full px-2 py-1 text-[11px] font-medium',
                statusClasses(status.tone),
              )}
            >
              {status.label}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {detailItems.map((item) => (
            <div
              key={item.label}
              className="border-glass-border/70 bg-glass-subtle rounded-lg border p-2.5"
            >
              <div className="text-ink-3 flex items-center gap-2 text-[11px] font-medium">
                {item.icon}
                {item.label}
              </div>
              <div className="text-ink-1 mt-1.5 text-sm leading-snug font-semibold">
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div className="border-glass-border/70 bg-glass-subtle mt-3 rounded-lg border p-2.5">
          <div className="text-ink-3 text-[11px] font-medium">Notes</div>
          <div className="text-ink-1 mt-1.5 text-xs leading-5 whitespace-pre-wrap">
            {meeting.notes || 'No notes for this meeting.'}
          </div>
        </div>
      </div>

      <div className="border-glass-border/70 bg-bg-2/95 shrink-0 border-t p-3">
        <div className="flex flex-wrap gap-2">
          {teamsUrl && (
            <Button
              size="sm"
              variant="primary"
              icon={<Video />}
              onClick={() => onOpenTeams(teamsUrl)}
            >
              Open Teams Call
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            icon={<ExternalLink />}
            onClick={onOpen}
          >
            Open in Calendar
          </Button>
        </div>
      </div>
    </aside>
  );
}

export function NextMeetingButton() {
  const { data: calendarNotificationsSetting } =
    useCalendarNotificationsSetting();
  const enabled = calendarNotificationsSetting?.enabled ?? false;
  const canShow = enabled && api.platform === 'darwin';
  const [meetings, setMeetings] = useState<UpcomingMeeting[]>([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const addToast = useToastStore((state) => state.addToast);

  useEffect(() => {
    if (!canShow) {
      setMeetings([]);
      setIsLoading(false);
      return;
    }

    let isCancelled = false;

    const loadMeetings = async () => {
      setIsLoading(true);
      try {
        const nextMeetings = await api.calendar.listUpcomingMeetings();
        if (!isCancelled) {
          const sortedMeetings = [...nextMeetings].sort(compareMeetings);
          setMeetings(sortedMeetings);
          setSelectedMeetingId((current) =>
            current && sortedMeetings.some((meeting) => meeting.id === current)
              ? current
              : (sortedMeetings[0]?.id ?? null),
          );
        }
      } catch (error) {
        if (!isCancelled) {
          addToast({
            message:
              error instanceof Error
                ? error.message
                : 'Could not load upcoming meetings',
            type: 'error',
          });
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadMeetings();
    const intervalId = window.setInterval(() => {
      void loadMeetings();
    }, 60_000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [addToast, canShow]);

  if (!canShow) {
    return null;
  }

  const nextMeeting = meetings[0];
  const nextMeetingStatus = nextMeeting ? getMeetingStatus(nextMeeting) : null;
  const selectedMeeting =
    meetings.find((meeting) => meeting.id === selectedMeetingId) ?? nextMeeting;

  const openMeeting = (meeting: UpcomingMeeting) => {
    void api.calendar.revealMeeting(meeting).catch((error) => {
      addToast({
        message:
          error instanceof Error
            ? error.message
            : 'Could not open meeting in Calendar',
        type: 'error',
      });
    });
  };

  const openTeamsCall = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <Dropdown
      align="right"
      trigger={
        <Button
          variant="ghost"
          size="sm"
          className={clsx(
            'max-w-[280px] gap-2 rounded-lg border px-2.5',
            nextMeetingStatus?.tone === 'live'
              ? 'border-status-done/40 bg-status-done/8 hover:bg-status-done/12'
              : nextMeetingStatus?.tone === 'soon'
                ? 'border-status-warn/40 bg-status-warn/8 hover:bg-status-warn/12'
                : nextMeeting
                  ? 'border-acc/35 bg-acc/8 hover:bg-acc/12'
                  : 'border-glass-border bg-glass-subtle hover:bg-glass-light',
          )}
          title={nextMeeting ? nextMeeting.title : 'Upcoming meetings'}
        >
          <CalendarClock className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate text-xs">
            {isLoading
              ? 'Loading meetings...'
              : nextMeeting
                ? `${formatMeetingBadge(nextMeeting.startAt)} · ${nextMeeting.title}`
                : 'No upcoming meetings'}
          </span>
          {nextMeetingStatus?.label && (
            <span
              className={clsx(
                'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                statusClasses(nextMeetingStatus.tone),
              )}
            >
              {nextMeetingStatus.label}
            </span>
          )}
        </Button>
      }
      className="flex h-[88vh] !max-h-[calc(100vh-32px)] w-[920px] max-w-[calc(100vw-32px)] flex-col !overflow-hidden p-3"
    >
      <div className="px-2 pt-1 pb-2">
        <div className="text-ink-1 text-sm font-semibold">
          Upcoming meetings
        </div>
        <div className="text-ink-3 mt-0.5 text-xs">
          macOS Calendar events scheduled soonest first.
        </div>
      </div>

      {isLoading ? (
        <div className="text-ink-3 px-2 py-6 text-center text-sm">
          Loading upcoming meetings...
        </div>
      ) : meetings.length === 0 ? (
        <div className="text-ink-3 px-2 py-6 text-center text-sm">
          No upcoming meetings found.
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-3 px-2 pb-2 md:grid-cols-[minmax(260px,360px)_1fr]">
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
            {meetings.map((meeting) => (
              <MeetingRow
                key={meeting.id}
                meeting={meeting}
                isSelected={selectedMeeting?.id === meeting.id}
                onSelect={() => setSelectedMeetingId(meeting.id)}
              />
            ))}
          </div>
          {selectedMeeting && (
            <MeetingDetailsPane
              meeting={selectedMeeting}
              onOpen={() => openMeeting(selectedMeeting)}
              onOpenTeams={openTeamsCall}
            />
          )}
        </div>
      )}
    </Dropdown>
  );
}
