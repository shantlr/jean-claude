export interface UpcomingMeeting {
  id: string;
  externalId: string;
  title: string;
  startAt: string;
  endAt: string;
  location: string;
  calendarName: string;
  notes: string;
  url: string;
  /** Attendee initials (optional, not all backends provide this) */
  attendees?: string[];
  /** Whether this is a recurring event */
  recurring?: boolean;
}
