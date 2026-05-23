# Outlook Calendar Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add macOS Outlook calendar polling so Jean-Claude can show a notification shortly before a meeting starts without requiring Microsoft admin setup.

**Architecture:** Add a main-process service that polls local Outlook calendar events through `osascript`, dedupes upcoming meetings, persists them into the existing notifications table, and emits them to the renderer like pipeline notifications. Add a small settings surface for enabling the feature and choosing the lead time.

**Tech Stack:** Electron main process, TypeScript, AppleScript via `osascript`, existing settings repository, existing notifications store/UI, Vitest.

---

### Task 1: Add calendar notification settings

**Files:**
- Modify: `shared/types.ts`
- Modify: `src/hooks/use-settings.ts`
- Modify: `src/features/settings/ui-general-settings/index.tsx`

**Steps:**
1. Add a `calendarNotifications` setting type with `enabled` and `leadTimeMinutes` fields.
2. Add validation and default values in `shared/types.ts`.
3. Add React Query convenience hooks in `src/hooks/use-settings.ts`.
4. Add a General Settings section for enabling Outlook reminders and editing lead time.

### Task 2: Add Outlook polling service

**Files:**
- Create: `electron/services/system-calendar-service.ts`
- Modify: `electron/main.ts`

**Steps:**
1. Add a service that polls Outlook on macOS with `osascript`.
2. Parse upcoming event data and ignore all-day events.
3. Deduplicate reminders so each event/start time only notifies once per app session.
4. Persist notifications through `NotificationRepository`, emit them to renderer, and show desktop notifications.
5. Start and stop the service from `electron/main.ts`.

### Task 3: Teach notification UI about meeting reminders

**Files:**
- Modify: `shared/notification-types.ts`
- Modify: `src/features/notifications/ui-notification-center/index.tsx`
- Modify: `src/features/activity-center/ui-activity-center-overlay/index.tsx`

**Steps:**
1. Add a new notification type for upcoming meetings.
2. Show an informational icon for meeting reminders.
3. Rename activity-center notification tab labels away from build-specific wording.
4. Keep notification click behavior safe when there is no source URL.

### Task 4: Add unit coverage for parser/dedupe helpers

**Files:**
- Create: `electron/services/system-calendar-service.test.ts`

**Steps:**
1. Test parsing of osascript output.
2. Test empty output handling.
3. Test session notification key generation/dedupe behavior.

### Task 5: Add changelog and verify

**Files:**
- Modify or create: `changelogs/2026-05-23.md`

**Steps:**
1. Add concise changelog entry for Outlook calendar meeting reminders.
2. Run `pnpm install`.
3. Run `pnpm test`.
4. Run `pnpm lint --fix`.
5. Run `pnpm ts-check`.
6. Run `pnpm lint`.
