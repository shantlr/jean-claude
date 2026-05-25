const CALENDAR_FIELD_DELIMITER = String.fromCharCode(31);
const CALENDAR_RECORD_DELIMITER = String.fromCharCode(30);

export interface CalendarEventRecord {
  externalId: string;
  subject: string;
  startAt: string;
  endAt: string;
  startLabel: string;
  location: string;
  calendarName: string;
  notes: string;
  url: string;
}

export function parseCalendarEventRecords(
  rawOutput: string,
): CalendarEventRecord[] {
  if (!rawOutput.trim()) {
    return [];
  }

  return rawOutput
    .split(CALENDAR_RECORD_DELIMITER)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [
        externalId = '',
        subject = '',
        startAt = '',
        endAt = '',
        startLabel = '',
        location = '',
        calendarName = '',
        notes = '',
        url = '',
      ] = record.split(CALENDAR_FIELD_DELIMITER);

      return {
        externalId,
        subject,
        startAt,
        endAt,
        startLabel,
        location,
        calendarName,
        notes,
        url,
      };
    })
    .filter(
      (event) =>
        !!event.subject &&
        !!event.startAt &&
        !!event.endAt &&
        !!event.startLabel,
    );
}

export function buildCalendarNotificationKey(
  event: Pick<CalendarEventRecord, 'externalId' | 'startAt' | 'subject'>,
): string {
  const baseId = event.externalId || event.subject;
  return `${baseId}:${event.startAt}`;
}

export function clampCalendarLeadTimeMinutes(value: number): number {
  return Math.min(Math.max(Math.trunc(value), 1), 60);
}

export function isLikelyAllDayCalendarEvent(
  event: Pick<CalendarEventRecord, 'startAt' | 'endAt'>,
): boolean {
  const startAt = new Date(event.startAt);
  const endAt = new Date(event.endAt);

  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    endAt <= startAt
  ) {
    return false;
  }

  const durationMs = endAt.getTime() - startAt.getTime();
  const startsAtMidnight =
    startAt.getHours() === 0 &&
    startAt.getMinutes() === 0 &&
    startAt.getSeconds() === 0;

  return startsAtMidnight && durationMs >= 23 * 60 * 60 * 1000;
}

export { CALENDAR_FIELD_DELIMITER, CALENDAR_RECORD_DELIMITER };
