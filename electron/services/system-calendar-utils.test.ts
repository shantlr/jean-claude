import { describe, expect, it } from 'vitest';

import {
  buildCalendarNotificationKey,
  clampCalendarLeadTimeMinutes,
  isLikelyAllDayCalendarEvent,
  parseCalendarEventRecords,
} from './system-calendar-utils';

describe('parseCalendarEventRecords', () => {
  it('parses delimited osascript output into calendar events', () => {
    const raw =
      'evt-1\u001fDesign Review\u001f2026-05-23T10:00:00\u001f2026-05-23T10:30:00\u001f10:00 AM\u001fRoom A\u001fWork\u001fPrep notes' +
      '\u001e' +
      'evt-2\u001fStandup\u001f2026-05-23T11:00:00\u001f2026-05-23T11:15:00\u001f11:00 AM\u001f\u001fPersonal\u001f';

    expect(parseCalendarEventRecords(raw)).toEqual([
      {
        externalId: 'evt-1',
        subject: 'Design Review',
        startAt: '2026-05-23T10:00:00',
        endAt: '2026-05-23T10:30:00',
        startLabel: '10:00 AM',
        location: 'Room A',
        calendarName: 'Work',
        notes: 'Prep notes',
      },
      {
        externalId: 'evt-2',
        subject: 'Standup',
        startAt: '2026-05-23T11:00:00',
        endAt: '2026-05-23T11:15:00',
        startLabel: '11:00 AM',
        location: '',
        calendarName: 'Personal',
        notes: '',
      },
    ]);
  });

  it('returns empty array for blank output', () => {
    expect(parseCalendarEventRecords('')).toEqual([]);
    expect(parseCalendarEventRecords('   ')).toEqual([]);
  });

  it('drops malformed records', () => {
    const raw =
      'evt-1\u001fPlanning\u001f2026-05-23T09:00:00\u001f2026-05-23T09:30:00\u001f09:00 AM\u001fZoom\u001fWork\u001fAgenda' +
      '\u001e' +
      'broken\u001frecord';

    expect(parseCalendarEventRecords(raw)).toEqual([
      {
        externalId: 'evt-1',
        subject: 'Planning',
        startAt: '2026-05-23T09:00:00',
        endAt: '2026-05-23T09:30:00',
        startLabel: '09:00 AM',
        location: 'Zoom',
        calendarName: 'Work',
        notes: 'Agenda',
      },
    ]);
  });
});

describe('buildCalendarNotificationKey', () => {
  it('combines external id and start time for dedupe', () => {
    expect(
      buildCalendarNotificationKey({
        externalId: 'abc123',
        subject: 'Design Review',
        startAt: '2026-05-23T14:00:00',
      }),
    ).toBe('abc123:2026-05-23T14:00:00');
  });

  it('falls back to subject when external id is missing', () => {
    expect(
      buildCalendarNotificationKey({
        externalId: '',
        subject: 'Planning',
        startAt: '2026-05-23T14:00:00',
      }),
    ).toBe('Planning:2026-05-23T14:00:00');
  });
});

describe('clampCalendarLeadTimeMinutes', () => {
  it('clamps to supported range', () => {
    expect(clampCalendarLeadTimeMinutes(0)).toBe(1);
    expect(clampCalendarLeadTimeMinutes(5)).toBe(5);
    expect(clampCalendarLeadTimeMinutes(80)).toBe(60);
    expect(clampCalendarLeadTimeMinutes(7.9)).toBe(7);
  });
});

describe('isLikelyAllDayCalendarEvent', () => {
  it('detects midnight events spanning nearly a full day', () => {
    expect(
      isLikelyAllDayCalendarEvent({
        startAt: '2026-05-23T00:00:00',
        endAt: '2026-05-24T00:00:00',
      }),
    ).toBe(true);
  });

  it('keeps normal timed meetings', () => {
    expect(
      isLikelyAllDayCalendarEvent({
        startAt: '2026-05-23T10:00:00',
        endAt: '2026-05-23T10:30:00',
      }),
    ).toBe(false);
  });
});
