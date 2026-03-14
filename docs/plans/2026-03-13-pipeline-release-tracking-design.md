# Pipeline & Release Tracking with Notification Center

## Overview

Track Azure DevOps build pipelines and release pipelines per-project, with adaptive polling and a general-purpose notification center in the app header.

## Goals

- Auto-discover pipeline and release definitions for linked Azure DevOps projects
- Granular enable/disable per pipeline/release definition
- Adaptive polling: fast (30s) when pipelines are active, slow (5min) when idle
- OS-level desktop notifications on completion/failure
- In-app notification center in the header bar with unread count and latest message
- General-purpose notification system extensible to future notification types (PR updates, agent completions, etc.)

## Data Model

### New Table: `notifications`

| Column      | Type    | Description                                                                                         |
| ----------- | ------- | --------------------------------------------------------------------------------------------------- |
| `id`        | text PK | UUID                                                                                                |
| `projectId` | text FK | Linked project (nullable for global notifications)                                                  |
| `type`      | text    | Notification type (e.g., `pipeline-completed`, `pipeline-failed`, `release-completed`, `release-failed`) |
| `title`     | text    | Short summary, e.g., "Build #142 failed"                                                            |
| `body`      | text    | Detail text: pipeline name, branch, duration                                                        |
| `sourceUrl` | text    | Link to Azure DevOps pipeline/release run (nullable)                                                |
| `read`      | integer | 0/1 boolean for seen/unseen state                                                                   |
| `createdAt` | text    | ISO timestamp                                                                                       |
| `meta`      | text    | JSON blob for type-specific data (pipelineId, releaseId, status, branch, etc.)                      |

Auto-cleanup: purge notifications older than 7 days on app startup or daily.

### New Table: `tracked_pipelines`

| Column             | Type    | Description                                               |
| ------------------ | ------- | --------------------------------------------------------- |
| `id`               | text PK | UUID                                                      |
| `projectId`        | text FK | Linked project                                            |
| `azurePipelineId`  | integer | Azure DevOps pipeline/release definition ID               |
| `kind`             | text    | `'build'` or `'release'`                                  |
| `name`             | text    | Display name from Azure                                   |
| `enabled`          | integer | 0/1 — whether to poll this definition                     |
| `lastCheckedRunId` | integer | Last run ID seen (to detect new completions)              |
| `createdAt`        | text    | ISO timestamp                                             |

## Service Layer

### Pipeline Tracking Service

**New file**: `electron/services/pipeline-tracking-service.ts`

Responsibilities:

1. **Discovery**: Fetch all build and release definitions for a project's linked Azure DevOps repo. Populate `tracked_pipelines` with `enabled: false` by default. Re-discovery via manual refresh.

2. **Polling loop**: Single `setInterval`-based loop across all projects:
   - Gather all `enabled` tracked pipelines grouped by project
   - For each, call Azure DevOps API to get recent runs since `lastCheckedRunId`
   - For new completed/failed runs: create `notification` row, emit IPC event, fire OS desktop notification
   - Update `lastCheckedRunId`

3. **Adaptive interval**:
   - **Active mode (30s)**: At least one tracked pipeline has a run in progress
   - **Idle mode (5min)**: No runs in progress across any tracked pipeline
   - Transition between modes by checking run statuses on each poll

4. **Cleanup**: On startup or daily, purge notifications older than 7 days.

### Azure DevOps API Additions

New methods in `electron/services/azure-devops-service.ts`:

- `listBuildDefinitions({ providerId, projectId })` — `GET _apis/build/definitions`
- `listReleaseDefinitions({ providerId, projectId })` — `GET _apis/release/definitions`
- `listBuilds({ providerId, projectId, definitionId, minId? })` — `GET _apis/build/builds`
- `listReleases({ providerId, projectId, definitionId, minId? })` — `GET _apis/release/releases`

### IPC Channels

| Channel                      | Direction        | Purpose                                      |
| ---------------------------- | ---------------- | -------------------------------------------- |
| `notifications:list`         | renderer → main  | Fetch all notifications (with optional filters) |
| `notifications:markRead`     | renderer → main  | Mark one or all as read                      |
| `notifications:new`          | main → renderer  | Event when a new notification is created     |
| `tracked-pipelines:list`     | renderer → main  | Get all pipelines for a project              |
| `tracked-pipelines:toggle`   | renderer → main  | Enable/disable a specific pipeline           |
| `tracked-pipelines:refresh`  | renderer → main  | Re-discover definitions from Azure           |

## Notification Store

**New file**: `src/stores/notifications.ts` (Zustand with persist)

```
State:
  notifications: Notification[]
  unreadCount: number

Actions:
  loadNotifications()          // fetch from DB via IPC on app start
  addNotification(notification) // called on IPC `notifications:new` event
  markAsRead(id)               // single notification
  markAllAsRead()              // bulk action
  removeNotification(id)       // manual dismiss
```

New notifications arrive via IPC channel `notifications:new` from the main process.

## UI Components

### Header Notification Bar

**Location**: App header, left of the FIM cost display.

```
[ ... header content ... ] [ 🔔 3 │ Deploy to staging fai… ] [ FIM $0.42 ]
```

- Bell icon with unread count badge (hidden when 0)
- Latest notification message, truncated with ellipsis
- Entire bar is clickable → opens the notification center overlay

### Notification Center Overlay

Dropdown/popover anchored to the header notification bar.

- **Header row**: "Notifications" title + "Mark all as read" action
- **List**: Chronological, grouped by today / yesterday / older
  - Each item: status icon (green check for success, red X for failure), title, body preview, relative time, project name tag
  - Unread items have a subtle left-border accent or dot indicator
  - Click → opens `sourceUrl` in external browser (Azure DevOps)
- **Empty state**: "No notifications yet"
- **Footer**: Link to pipeline tracking settings

### Pipeline Tracking Settings

**Location**: New menu item **"Pipelines"** in the project settings sidebar (Settings Overlay → Project tab), between "Integrations" and "Run Commands".

**Visibility**: Only shown when the project has a linked Azure DevOps repo.

**Component**: `src/features/project/ui-project-pipeline-settings/index.tsx`

```
┌─────────────────────────────────────────────────────────┐
│  Pipeline Tracking                        [ Refresh ↻ ] │
│                                                         │
│  Build Pipelines                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ [toggle] frontend-ci        main, PR triggers      │ │
│  │ [toggle] backend-ci         main, PR triggers      │ │
│  │ [toggle] e2e-tests          nightly                │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  Release Pipelines                                      │
│  ┌────────────────────────────────────────────────────┐ │
│  │ [toggle] Deploy to Staging   auto after backend-ci │ │
│  │ [toggle] Deploy to Production  manual approval     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                         │
│  Polling: Active (every 30s) · Last checked: 30s ago    │
└─────────────────────────────────────────────────────────┘
```

**Empty states**:
- No linked repo: "Link an Azure DevOps repository in Integrations to track pipelines"
- Linked but no definitions: "No pipelines found for this repository"

## New Files Summary

| File                                                          | Purpose                                      |
| ------------------------------------------------------------- | -------------------------------------------- |
| `electron/database/migrations/NNN_notifications.ts`           | Create `notifications` table                 |
| `electron/database/migrations/NNN_tracked_pipelines.ts`       | Create `tracked_pipelines` table             |
| `electron/database/repositories/notifications.ts`             | Notification CRUD + cleanup                  |
| `electron/database/repositories/tracked-pipelines.ts`         | Tracked pipeline CRUD                        |
| `electron/services/pipeline-tracking-service.ts`              | Discovery, polling, adaptive interval        |
| `src/stores/notifications.ts`                                 | Zustand notification state                   |
| `src/hooks/use-notifications.ts`                              | React Query hooks for notifications          |
| `src/hooks/use-tracked-pipelines.ts`                          | React Query hooks for tracked pipelines      |
| `src/features/project/ui-project-pipeline-settings/index.tsx` | Pipeline toggle settings UI                  |
| `src/layout/ui-notification-bar/index.tsx`                    | Header notification bar component            |
| `src/features/notifications/ui-notification-center/index.tsx` | Notification center overlay                  |
