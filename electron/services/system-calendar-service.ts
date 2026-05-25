import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { BrowserWindow } from 'electron';

import type { UpcomingMeeting } from '@shared/calendar-types';
import type { AppNotification } from '@shared/notification-types';

import { NotificationRepository } from '../database/repositories/notifications';
import { SettingsRepository } from '../database/repositories/settings';
import { dbg } from '../lib/debug';

import { notificationService } from './notification-service';
import {
  buildCalendarNotificationKey,
  type CalendarEventRecord,
  clampCalendarLeadTimeMinutes,
} from './system-calendar-utils';

const execFileAsync = promisify(execFile);

const POLL_INTERVAL_MS = 60_000;
const APPLE_SCRIPT_TIMEOUT_MS = 60_000;
const UPCOMING_MEETINGS_LOOKAHEAD_MINUTES = 14 * 24 * 60;
const UPCOMING_MEETINGS_MAX = 25;
const REVEAL_MEETING_TIMEOUT_MS = 15_000;

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
    notes?: string;
    url?: string;
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
      notes: event.notes ?? '',
      url: event.url ?? '',
    }));
}

function buildSystemCalendarSwiftScript({
  lookaheadMinutes,
  includeOngoing,
}: {
  lookaheadMinutes: number;
  includeOngoing: boolean;
}): string {
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
  let notes: String
  let url: String
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
let start = ${includeOngoing}
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

  let shouldInclude = ${includeOngoing}
    ? event.endDate >= now && event.startDate <= end
    : event.startDate >= now && event.startDate <= end

  if !shouldInclude {
    return nil
  }

  return Meeting(
    externalId: event.calendarItemExternalIdentifier,
    subject: event.title ?? "",
    startAt: formatter.string(from: event.startDate),
    endAt: formatter.string(from: event.endDate),
    startLabel: timeFormatter.string(from: event.startDate),
    location: event.location ?? "",
    calendarName: event.calendar.title,
    notes: event.notes ?? "",
    url: event.url?.absoluteString ?? ""
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
      lookaheadMinutes: UPCOMING_MEETINGS_LOOKAHEAD_MINUTES,
      includeOngoing: true,
    });

    return events
      .sort(compareMeetingUrgency)
      .slice(0, UPCOMING_MEETINGS_MAX)
      .map((event) => ({
        id: buildCalendarNotificationKey(event),
        externalId: event.externalId,
        title: event.subject,
        startAt: event.startAt,
        endAt: event.endAt,
        location: event.location,
        calendarName: event.calendarName,
        notes: event.notes,
        url: event.url,
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
  }: {
    lookaheadMinutes: number;
    includeOngoing: boolean;
  }): Promise<CalendarEventRecord[]> {
    const script = buildSystemCalendarSwiftScript({
      lookaheadMinutes,
      includeOngoing,
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
    if (events.length === 0) {
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
    const title = 'Meeting starting soon';
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
