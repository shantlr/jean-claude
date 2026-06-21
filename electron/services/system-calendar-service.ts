import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { BrowserWindow, screen, shell } from 'electron';

import { getTeamsJoinUrl, isValidTeamsJoinUrl } from '@shared/teams-url';
import type { AppNotification } from '@shared/notification-types';
import type { UpcomingMeeting } from '@shared/calendar-types';



import { dbg } from '../lib/debug';
import { NotificationRepository } from '../database/repositories/notifications';
import { SettingsRepository } from '../database/repositories/settings';


import {
  buildCalendarNotificationKey,
  type CalendarEventRecord,
  clampCalendarLeadTimeMinutes,
} from './system-calendar-utils';
import { notificationService } from './notification-service';


const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = 60_000;
const APPLE_SCRIPT_TIMEOUT_MS = 60_000;
const CALENDAR_MEETINGS_LOOKAHEAD_MINUTES = 31 * 24 * 60;
const CALENDAR_MEETINGS_LOOKBEHIND_MINUTES = 31 * 24 * 60;
const CALENDAR_MEETINGS_MAX = 250;
const REVEAL_MEETING_TIMEOUT_MS = 15_000;
const MEETING_START_POPUP_GRACE_MS = 5 * 60_000;
const MEETING_START_POPUP_WIDTH = 480;
const MEETING_START_POPUP_HEIGHT = 260;
const MEETING_START_POPUP_SCHEME = 'jean-claude-meeting-popup:';

const TEAMS_URL_PATTERN =
  /https?:\/\/(?:[^\s<>()"']+\.)?(?:teams\.microsoft\.com|teams\.live\.com|teams\.cloud\.microsoft)\/[^\s<>()"']+/gi;

function compareCalendarDateTime(a: string, b: string): number {
  const timestampDiff = new Date(a).getTime() - new Date(b).getTime();
  if (Number.isFinite(timestampDiff) && timestampDiff !== 0) {
    return timestampDiff;
  }

  return a.localeCompare(b);
}

function compareMeetingUrgency(
  a: Pick<CalendarEventRecord, 'startAt' | 'endAt' | 'subject'>,
  b: Pick<CalendarEventRecord, 'startAt' | 'endAt' | 'subject'>,
): number {
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
    const endDiff = compareCalendarDateTime(a.endAt, b.endAt);
    if (endDiff !== 0) return endDiff;
  }

  const startDiff = compareCalendarDateTime(a.startAt, b.startAt);
  if (startDiff !== 0) return startDiff;

  const endDiff = compareCalendarDateTime(a.endAt, b.endAt);
  if (endDiff !== 0) return endDiff;

  return a.subject.localeCompare(b.subject);
}

function safeJsonParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatMeetingBody(event: CalendarEventRecord): string {
  const locationSuffix = event.location ? ` - ${event.location}` : '';
  return `Starts at ${event.startLabel}${locationSuffix}`;
}

function formatMeetingTimeRange(event: CalendarEventRecord): string {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  return `${start.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })} - ${end.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function extractTeamsUrl(event: CalendarEventRecord): string | null {
  const haystack = [event.url, event.location, event.notes].join('\n');
  const matches = haystack.matchAll(TEAMS_URL_PATTERN);
  for (const match of matches) {
    const rawUrl = match[0].replaceAll('&amp;', '&').replace(/[.,;:!?]+$/, '');
    if (isValidTeamsUrl(rawUrl)) {
      return new URL(rawUrl).toString();
    }
  }
  return null;
}

function isValidTeamsUrl(value: string): boolean {
  return isValidTeamsJoinUrl(value) && new URL(value).protocol === 'https:';
}

function buildMeetingStartPopupHtml(event: CalendarEventRecord): string {
  const teamsUrl = extractTeamsUrl(event);
  const timeRange = formatMeetingTimeRange(event);
  const joinHref = teamsUrl
    ? `${MEETING_START_POPUP_SCHEME}//join?url=${encodeURIComponent(teamsUrl)}`
    : null;
  const dismissHref = `${MEETING_START_POPUP_SCHEME}//dismiss`;
  const secondaryText = [timeRange, event.calendarName]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; navigate-to ${MEETING_START_POPUP_SCHEME};" />
    <title>Meeting started</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: stretch;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: radial-gradient(circle at 18% 12%, rgba(250, 204, 21, 0.28), transparent 34%), #101014;
        color: #f8fafc;
      }
      main {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;
        border: 1px solid rgba(250, 204, 21, 0.32);
        background: linear-gradient(145deg, rgba(24, 24, 27, 0.96), rgba(9, 9, 11, 0.96));
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.42);
        min-height: 100vh;
      }
      .eyebrow {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #fde68a;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      .pulse {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: #facc15;
        box-shadow: 0 0 0 8px rgba(250, 204, 21, 0.16);
      }
      h1 {
        margin: 0;
        font-size: 26px;
        line-height: 1.05;
        letter-spacing: -0.04em;
      }
      .meta {
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.45;
      }
      .actions {
        display: flex;
        gap: 10px;
        margin-top: auto;
      }
      a {
        flex: 1;
        border-radius: 12px;
        padding: 12px 14px;
        text-align: center;
        text-decoration: none;
        font-size: 13px;
        font-weight: 800;
      }
      .join {
        background: #facc15;
        color: #111827;
      }
      .dismiss {
        background: rgba(255, 255, 255, 0.08);
        color: #e5e7eb;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow"><span class="pulse"></span>Meeting started</div>
      <h1>${escapeHtml(event.subject)}</h1>
      <div class="meta">${escapeHtml(secondaryText)}</div>
      ${event.location ? `<div class="meta">${escapeHtml(event.location)}</div>` : ''}
      <div class="actions">
        ${joinHref ? `<a class="join" href="${joinHref}">Open Teams call</a>` : ''}
        <a class="dismiss" href="${dismissHref}">Dismiss</a>
      </div>
    </main>
  </body>
</html>`;
}

function parseSystemCalendarEvents(rawOutput: string): CalendarEventRecord[] {
  if (!rawOutput.trim()) {
    return [];
  }

  const parsed = JSON.parse(rawOutput) as Array<{
    externalId?: string;
    subject?: string;
    startAt?: string;
    endAt?: string;
    startLabel?: string;
    location?: string;
    calendarName?: string;
    organizer?: string;
    organizerEmail?: string;
    notes?: string;
    url?: string;
    recurring?: boolean;
  }>;

  return parsed
    .filter(
      (event) =>
        !!event.subject &&
        !!event.startAt &&
        !!event.endAt &&
        !!event.startLabel,
    )
    .map((event) => ({
      externalId: event.externalId ?? '',
      subject: event.subject ?? '',
      startAt: event.startAt ?? '',
      endAt: event.endAt ?? '',
      startLabel: event.startLabel ?? '',
      location: event.location ?? '',
      calendarName: event.calendarName ?? '',
      organizer: event.organizer ?? '',
      organizerEmail: event.organizerEmail ?? '',
      notes: event.notes ?? '',
      url: event.url ?? '',
      recurring: event.recurring ?? false,
    }));
}

function buildSystemCalendarSwiftScript({
  lookaheadMinutes,
  includeOngoing,
  lookBehindMinutes,
}: {
  lookaheadMinutes: number;
  includeOngoing: boolean;
  lookBehindMinutes?: number;
}): string {
  const hasLookBehind =
    lookBehindMinutes !== undefined && lookBehindMinutes > 0;
  return `
import Foundation
import EventKit

struct Meeting: Encodable {
  let externalId: String
  let subject: String
  let startAt: String
  let endAt: String
  let startLabel: String
  let location: String
  let calendarName: String
  let organizer: String
  let organizerEmail: String
  let notes: String
  let url: String
  let recurring: Bool
}

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
var accessGranted = false
var accessError: Error?

if #available(macOS 14.0, *) {
  store.requestFullAccessToEvents { granted, error in
    accessGranted = granted
    accessError = error
    semaphore.signal()
  }
} else {
  store.requestAccess(to: .event) { granted, error in
    accessGranted = granted
    accessError = error
    semaphore.signal()
  }
}

_ = semaphore.wait(timeout: .now() + 30)

if let accessError {
  throw accessError
}

guard accessGranted else {
  throw NSError(domain: "JeanClaudeCalendar", code: 1, userInfo: [NSLocalizedDescriptionKey: "Calendar access not granted"])
}

let now = Date()
let start = ${hasLookBehind}
  ? now.addingTimeInterval(-${hasLookBehind ? lookBehindMinutes : 0} * 60)
  : ${includeOngoing}
    ? now.addingTimeInterval(-14 * 24 * 60 * 60)
    : now
let end = now.addingTimeInterval(${lookaheadMinutes} * 60)
let predicate = store.predicateForEvents(withStart: start, end: end, calendars: nil)
let formatter = DateFormatter()
formatter.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
let timeFormatter = DateFormatter()
timeFormatter.dateFormat = "h:mm a"

let events = store.events(matching: predicate)
let filteredEvents = events.compactMap { event -> Meeting? in
  if event.isAllDay {
    return nil
  }

  let shouldInclude = ${hasLookBehind}
    ? event.startDate >= start && event.startDate <= end
    : ${includeOngoing}
      ? event.endDate >= now && event.startDate <= end
      : event.startDate >= now && event.startDate <= end

  if !shouldInclude {
    return nil
  }

  let organizerName = event.organizer?.name?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
  let organizerUrl = event.organizer?.url.absoluteString ?? ""
  let organizerEmail = organizerUrl.hasPrefix("mailto:")
    ? String(organizerUrl.dropFirst("mailto:".count))
    : ""
  let organizerDisplay = organizerName.isEmpty ? organizerEmail : organizerName

  return Meeting(
    externalId: event.calendarItemExternalIdentifier,
    subject: event.title ?? "",
    startAt: formatter.string(from: event.startDate),
    endAt: formatter.string(from: event.endDate),
    startLabel: timeFormatter.string(from: event.startDate),
    location: event.location ?? "",
    calendarName: event.calendar.title,
    organizer: organizerDisplay,
    organizerEmail: organizerEmail,
    notes: event.notes ?? "",
    url: event.url?.absoluteString ?? "",
    recurring: !(event.recurrenceRules ?? []).isEmpty
  )
}

let encoder = JSONEncoder()
let data = try encoder.encode(filteredEvents)
print(String(data: data, encoding: .utf8) ?? "[]")
`;
}

function buildSystemCalendarDiagnosticsSwiftScript(): string {
  return `
import Foundation
import EventKit

struct CalendarSummary: Encodable {
  let calendarName: String
  let source: String
}

let store = EKEventStore()
let semaphore = DispatchSemaphore(value: 0)
var accessGranted = false

if #available(macOS 14.0, *) {
  store.requestFullAccessToEvents { granted, _ in
    accessGranted = granted
    semaphore.signal()
  }
} else {
  store.requestAccess(to: .event) { granted, _ in
    accessGranted = granted
    semaphore.signal()
  }
}

_ = semaphore.wait(timeout: .now() + 30)

guard accessGranted else {
  throw NSError(domain: "JeanClaudeCalendar", code: 1, userInfo: [NSLocalizedDescriptionKey: "Calendar access not granted"])
}

let summaries = store.calendars(for: .event).map {
  CalendarSummary(calendarName: $0.title, source: $0.source.title)
}

let encoder = JSONEncoder()
let data = try encoder.encode(summaries)
print(String(data: data, encoding: .utf8) ?? "[]")
`;
}

function escapeAppleScriptString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function buildSystemCalendarRevealScript({
  externalId,
  calendarName,
  title,
  startAt,
  endAt,
}: {
  externalId: string;
  calendarName: string;
  title: string;
  startAt: string;
  endAt: string;
}): string {
  return `
on formatForMachine(d)
  set yearText to (year of d as integer) as string
  set monthValue to month of d as integer
  set dayValue to day of d
  set hourValue to hours of d
  set minuteValue to minutes of d
  set secondValue to seconds of d

  set monthText to text -2 thru -1 of ("0" & monthValue)
  set dayText to text -2 thru -1 of ("0" & dayValue)
  set hourText to text -2 thru -1 of ("0" & hourValue)
  set minuteText to text -2 thru -1 of ("0" & minuteValue)
  set secondText to text -2 thru -1 of ("0" & secondValue)

  return yearText & "-" & monthText & "-" & dayText & "T" & hourText & ":" & minuteText & ":" & secondText
end formatForMachine

tell application "Calendar"
  activate
  tell calendar "${escapeAppleScriptString(calendarName)}"
    set targetUid to "${escapeAppleScriptString(externalId)}"
    set targetTitle to "${escapeAppleScriptString(title)}"
    set fallbackEvent to missing value
    set matchingEvents to every event
    repeat with matchingEvent in matchingEvents
      if (my formatForMachine(start date of matchingEvent)) is "${escapeAppleScriptString(startAt)}" and (my formatForMachine(end date of matchingEvent)) is "${escapeAppleScriptString(endAt)}" then
        set eventUid to uid of matchingEvent as string
        if targetUid is not "" and eventUid is targetUid then
          show matchingEvent
          return
        end if
        set eventSummary to summary of matchingEvent as string
        if eventSummary is targetTitle or eventSummary is in targetTitle or targetTitle is in eventSummary then
          show matchingEvent
          return
        end if
        if fallbackEvent is missing value then
          set fallbackEvent to matchingEvent
        end if
      end if
    end repeat
    if fallbackEvent is not missing value then
      show fallbackEvent
      return
    end if
    error "Could not find meeting in Calendar"
  end tell
end tell
`;
}

class SystemCalendarService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private lastErrorKey: string | null = null;
  private notifiedEvents = new Map<string, number>();
  private startPopupEvents = new Map<string, number>();
  private startPopupWindows = new Map<string, BrowserWindow>();
  private ignoredMeetingIds = new Set<string>();
  private hasReceivedIgnoredMeetingIds = false;

  start() {
    if (process.platform !== 'darwin') {
      dbg.notification(
        'Skipping system calendar polling on %s',
        process.platform,
      );
      return;
    }

    if (this.timer) {
      return;
    }

    dbg.notification('Starting system calendar polling service');
    void this.poll();
    this.timer = setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.closeMeetingStartPopups();
  }

  setIgnoredMeetingIds(ids: string[]) {
    this.ignoredMeetingIds = new Set(ids);
    this.hasReceivedIgnoredMeetingIds = true;
    this.closeIgnoredMeetingStartPopups();
  }

  suppressMeetingStartPopup(meeting: UpcomingMeeting) {
    const endAtMs = new Date(meeting.endAt).getTime();
    this.startPopupEvents.set(
      meeting.id,
      Number.isFinite(endAtMs) ? endAtMs : Date.now(),
    );
    const popup = this.startPopupWindows.get(meeting.id);
    if (popup && !popup.isDestroyed()) {
      popup.close();
    }
    this.startPopupWindows.delete(meeting.id);
  }

  async listUpcomingMeetings(): Promise<UpcomingMeeting[]> {
    if (process.platform !== 'darwin') {
      return [];
    }

    const settings = await SettingsRepository.get('calendarNotifications');
    if (!settings.enabled) {
      return [];
    }

    const events = await this.fetchUpcomingEvents({
      lookaheadMinutes: CALENDAR_MEETINGS_LOOKAHEAD_MINUTES,
      includeOngoing: false,
      lookBehindMinutes: CALENDAR_MEETINGS_LOOKBEHIND_MINUTES,
    });

    return events
      .sort(compareMeetingUrgency)
      .slice(0, CALENDAR_MEETINGS_MAX)
      .map((event) => ({
        id: buildCalendarNotificationKey(event),
        externalId: event.externalId,
        title: event.subject,
        startAt: event.startAt,
        endAt: event.endAt,
        location: event.location,
        calendarName: event.calendarName,
        organizer: event.organizer,
        organizerEmail: event.organizerEmail,
        notes: event.notes,
        url: event.url,
        recurring: event.recurring,
      }));
  }

  async listTodayMeetings(): Promise<UpcomingMeeting[]> {
    if (process.platform !== 'darwin') {
      return [];
    }

    const settings = await SettingsRepository.get('calendarNotifications');
    if (!settings.enabled) {
      return [];
    }

    // Calculate minutes from now back to start of today
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const lookBehindMinutes = Math.ceil(
      (now.getTime() - startOfToday.getTime()) / 60_000,
    );

    // Look ahead to end of today
    const endOfToday = new Date(startOfToday);
    endOfToday.setHours(23, 59, 59, 999);
    const lookaheadMinutes = Math.ceil(
      (endOfToday.getTime() - now.getTime()) / 60_000,
    );

    const events = await this.fetchUpcomingEvents({
      lookaheadMinutes,
      includeOngoing: false,
      lookBehindMinutes,
    });

    return events.sort(compareMeetingUrgency).map((event) => ({
      id: buildCalendarNotificationKey(event),
      externalId: event.externalId,
      title: event.subject,
      startAt: event.startAt,
      endAt: event.endAt,
      location: event.location,
      calendarName: event.calendarName,
      organizer: event.organizer,
      organizerEmail: event.organizerEmail,
      notes: event.notes,
      url: event.url,
      recurring: event.recurring,
    }));
  }

  async revealMeeting(meeting: UpcomingMeeting): Promise<void> {
    if (process.platform !== 'darwin') {
      return;
    }

    const script = buildSystemCalendarRevealScript({
      externalId: meeting.externalId,
      calendarName: meeting.calendarName,
      title: meeting.title,
      startAt: meeting.startAt,
      endAt: meeting.endAt,
    });
    await execFileAsync('osascript', ['-e', script], {
      timeout: REVEAL_MEETING_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
  }

  private async poll() {
    if (this.isPolling) {
      return;
    }

    this.isPolling = true;

    try {
      const settings = await SettingsRepository.get('calendarNotifications');
      if (!settings.enabled) {
        this.cleanupExpiredNotifiedEvents();
        this.closeMeetingStartPopups();
        return;
      }

      const leadTimeMinutes = clampCalendarLeadTimeMinutes(
        settings.leadTimeMinutes,
      );
      const events = await this.fetchUpcomingEvents({
        lookaheadMinutes: leadTimeMinutes,
        includeOngoing: false,
      });
      this.lastErrorKey = null;

      for (const event of events) {
        const notificationKey = buildCalendarNotificationKey(event);
        if (this.notifiedEvents.has(notificationKey)) {
          continue;
        }

        await this.createMeetingNotification({
          event,
          notificationKey,
        });
      }

      if (settings.showStartWindow && this.hasReceivedIgnoredMeetingIds) {
        const ongoingEvents = await this.fetchUpcomingEvents({
          lookaheadMinutes: 0,
          includeOngoing: true,
          lookBehindMinutes: Math.ceil(MEETING_START_POPUP_GRACE_MS / 60_000),
          logDiagnostics: false,
        });
        for (const event of ongoingEvents) {
          const notificationKey = buildCalendarNotificationKey(event);
          if (this.ignoredMeetingIds.has(notificationKey)) {
            continue;
          }

          if (this.startPopupEvents.has(notificationKey)) {
            continue;
          }

          const startAtMs = new Date(event.startAt).getTime();
          const endAtMs = new Date(event.endAt).getTime();
          const nowMs = Date.now();
          if (
            !Number.isFinite(startAtMs) ||
            !Number.isFinite(endAtMs) ||
            startAtMs > nowMs ||
            endAtMs <= nowMs ||
            nowMs - startAtMs > MEETING_START_POPUP_GRACE_MS
          ) {
            continue;
          }

          if (this.showMeetingStartPopup(event, notificationKey)) {
            this.startPopupEvents.set(notificationKey, endAtMs);
          }
        }
      } else {
        this.closeMeetingStartPopups();
      }

      this.cleanupExpiredNotifiedEvents();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== this.lastErrorKey) {
        dbg.notification('System calendar poll failed: %O', error);
        this.lastErrorKey = message;
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async fetchUpcomingEvents({
    lookaheadMinutes,
    includeOngoing,
    lookBehindMinutes,
    logDiagnostics = true,
  }: {
    lookaheadMinutes: number;
    includeOngoing: boolean;
    lookBehindMinutes?: number;
    logDiagnostics?: boolean;
  }): Promise<CalendarEventRecord[]> {
    const script = buildSystemCalendarSwiftScript({
      lookaheadMinutes,
      includeOngoing,
      lookBehindMinutes,
    });
    const { stdout } = await execFileAsync('xcrun', ['swift', '-e', script], {
      timeout: APPLE_SCRIPT_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    });
    const events = parseSystemCalendarEvents(stdout);
    dbg.notification(
      'Fetched %d system calendar events for %d-minute lookahead',
      events.length,
      lookaheadMinutes,
    );
    if (events.length === 0 && logDiagnostics) {
      await this.logCalendarDiagnostics();
    }
    return events;
  }

  private async logCalendarDiagnostics() {
    try {
      const { stdout } = await execFileAsync(
        'xcrun',
        ['swift', '-e', buildSystemCalendarDiagnosticsSwiftScript()],
        {
          timeout: APPLE_SCRIPT_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
        },
      );
      const summaries = (
        JSON.parse(stdout) as Array<{ calendarName?: string; source?: string }>
      ).map(
        ({ calendarName = '', source = '' }) =>
          `${calendarName || '<unnamed>'}${source ? `@${source}` : ''}`,
      );

      dbg.notification(
        'System calendar diagnostics: %s',
        summaries.length > 0 ? summaries.join(', ') : 'no calendars visible',
      );
    } catch (error) {
      dbg.notification('System calendar diagnostics failed: %O', error);
    }
  }

  private async createMeetingNotification({
    event,
    notificationKey,
  }: {
    event: CalendarEventRecord;
    notificationKey: string;
  }) {
    const title = '📅 Meeting starting soon';
    const body = `${event.subject} - ${formatMeetingBody(event)}`;

    const notification = await NotificationRepository.create({
      projectId: null,
      type: 'calendar-event-starting',
      title,
      body,
      sourceUrl: null,
      read: 0,
      meta: JSON.stringify({
        provider: 'system-calendar',
        externalId: event.externalId,
        startAt: event.startAt,
        endAt: event.endAt,
        location: event.location,
      }),
    });

    this.emitToRenderer(this.rowToAppNotification(notification));
    this.notifiedEvents.set(notificationKey, new Date(event.endAt).getTime());

    notificationService.notify({
      id: `calendar:${notificationKey}`,
      title,
      body,
      onClick: () => {
        const win = BrowserWindow.getAllWindows().find(
          (item) => !item.isDestroyed(),
        );
        if (win) {
          win.focus();
        }
      },
    });
  }

  private cleanupExpiredNotifiedEvents() {
    const cutoff = Date.now() - 30 * 60_000;
    for (const [notificationKey, endAtMs] of this.notifiedEvents) {
      if (!Number.isFinite(endAtMs) || endAtMs < cutoff) {
        this.notifiedEvents.delete(notificationKey);
      }
    }
    for (const [notificationKey, endAtMs] of this.startPopupEvents) {
      if (!Number.isFinite(endAtMs) || endAtMs < cutoff) {
        this.startPopupEvents.delete(notificationKey);
      }
    }
  }

  private closeIgnoredMeetingStartPopups() {
    for (const notificationKey of this.ignoredMeetingIds) {
      const popup = this.startPopupWindows.get(notificationKey);
      if (popup && !popup.isDestroyed()) {
        popup.close();
      }
      this.startPopupEvents.delete(notificationKey);
      this.startPopupWindows.delete(notificationKey);
    }
  }

  private showMeetingStartPopup(
    event: CalendarEventRecord,
    notificationKey: string,
  ): boolean {
    const existing = this.startPopupWindows.get(notificationKey);
    if (existing) {
      existing.showInactive();
      return true;
    }

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    const area = display.workArea;
    const x = area.x + (area.width - MEETING_START_POPUP_WIDTH) / 2;
    const y = area.y + (area.height - MEETING_START_POPUP_HEIGHT) / 2;

    const popup = new BrowserWindow({
      width: MEETING_START_POPUP_WIDTH,
      height: MEETING_START_POPUP_HEIGHT,
      x: Math.round(x),
      y: Math.round(y),
      title: `Meeting started: ${notificationKey}`,
      alwaysOnTop: true,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      resizable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.startPopupWindows.set(notificationKey, popup);
    popup.once('closed', () => {
      this.startPopupWindows.delete(notificationKey);
    });

    popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    popup.setAlwaysOnTop(true, 'floating');
    popup.webContents.setWindowOpenHandler(({ url }) => {
      this.handleMeetingPopupNavigation(url, popup);
      return { action: 'deny' };
    });
    popup.webContents.on('will-navigate', (event, url) => {
      if (this.handleMeetingPopupNavigation(url, popup)) {
        event.preventDefault();
      }
    });
    popup.once('ready-to-show', () => {
      popup.showInactive();
    });

    popup
      .loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          buildMeetingStartPopupHtml(event),
        )}`,
      )
      .catch((error) => {
        dbg.notification('Meeting start popup failed to load: %O', error);
        this.startPopupEvents.delete(notificationKey);
        this.startPopupWindows.delete(notificationKey);
        if (!popup.isDestroyed()) {
          popup.close();
        }
      });
    return true;
  }

  private handleMeetingPopupNavigation(url: string, popup: BrowserWindow) {
    if (!url.startsWith(MEETING_START_POPUP_SCHEME)) {
      return false;
    }

    if (url.startsWith(`${MEETING_START_POPUP_SCHEME}//join`)) {
      const parsed = new URL(url);
      const teamsUrl = parsed.searchParams.get('url');
      if (teamsUrl && isValidTeamsUrl(teamsUrl)) {
        void SettingsRepository.get('calendarNotifications')
          .then((settings) =>
            shell.openExternal(
              getTeamsJoinUrl(teamsUrl, settings.meetingJoinTarget),
            ),
          )
          .catch((error) => {
            dbg.notification('Failed to open Teams meeting: %O', error);
            void shell.openExternal(teamsUrl);
          });
      }
    }

    if (!popup.isDestroyed()) {
      popup.close();
    }
    return true;
  }

  private closeMeetingStartPopups() {
    for (const popup of this.startPopupWindows.values()) {
      if (!popup.isDestroyed()) {
        popup.close();
      }
    }
    this.startPopupWindows.clear();
  }

  private rowToAppNotification(row: {
    id: string;
    projectId: string | null;
    type: string;
    title: string;
    body: string;
    sourceUrl: string | null;
    read: number;
    meta: string | null;
    createdAt: string;
  }): AppNotification {
    return {
      id: row.id,
      projectId: row.projectId,
      type: row.type as AppNotification['type'],
      title: row.title,
      body: row.body,
      sourceUrl: row.sourceUrl,
      read: row.read === 1,
      meta: safeJsonParse(row.meta),
      createdAt: row.createdAt,
    };
  }

  private emitToRenderer(notification: AppNotification) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('notifications:new', notification);
      }
    }
  }
}

export const systemCalendarService = new SystemCalendarService();
