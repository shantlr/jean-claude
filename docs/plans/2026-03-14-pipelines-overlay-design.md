# Pipelines Overlay — View, Monitor & Trigger Azure Pipelines

## Overview

A full-screen overlay accessible from the app header that lets users monitor running pipelines across all projects, view stage-level detail with logs, and trigger new pipeline runs — all without leaving Jean-Claude.

## Trigger

- Header button (left section, after Backlog) with keyboard shortcut `Cmd+Shift+P`
- Adds `'pipelines'` to the `OverlayType` union in `src/stores/overlays.ts`
- Follows existing overlay container pattern in `src/routes/__root.tsx`

## Layout

Near-full-screen overlay matching the Settings overlay pattern: left sidebar for navigation/filtering, main content area for pipeline runs.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Pipelines                                                     [×]  │
├─────────────────┬────────────────────────────────────────────────────┤
│                 │                                                    │
│  All Projects   │  ● frontend-ci #347    main    2m ago   ⏱ 3m 21s │
│                 │    Running · Stage 2/3 · by Patrick                │
│  ▾ Project A    │                                                    │
│    frontend-ci ▶│  ✓ backend-ci #201     main    18m ago  ⏱ 5m 02s │
│    backend-ci  ▶│    Succeeded · by Patrick                          │
│                 │                                                    │
│  ▾ Project B    │  ✗ deploy-stg #88      main    1h ago   ⏱ 12m 41s│
│    deploy-stg  ▶│    Failed at "Deploy" · by CI                      │
│    deploy-prod ▶│                                                    │
│                 │  ✓ frontend-ci #346    feat/x   3h ago  ⏱ 3m 18s │
│                 │    Succeeded · by Patrick                           │
│                 │                                                    │
├─────────────────┤                                                    │
│  ⚙ Settings     │                                                    │
└─────────────────┴────────────────────────────────────────────────────┘
```

## Left Sidebar

### Content

- **"All Projects"** at top — shows runs across all tracked pipelines
- **Project groups** — each project with tracked pipeline definitions nested underneath
  - Project name as collapsible header
  - Each definition shows name + "▶" run button on hover
  - Clicking a definition filters the main list to just that pipeline's runs
  - Clicking a project name filters to all runs for that project
- **"⚙ Settings"** link at bottom — navigates to existing pipeline tracking settings (enable/disable/discover definitions)

### Visibility

Only projects with linked Azure DevOps repos and at least one tracked pipeline appear. Projects without Azure integration are omitted entirely.

## Main Content Area — Run List

Flat chronological list of recent runs for the selected filter (all projects, one project, or one pipeline definition). Most recent first.

### Run Row

Each row shows at a glance:

```
│  ● frontend-ci #347         main      2m 14s ago   ⏱ 3m 21s  │
│    Running · Stage 2/3 · triggered by Patrick                  │
```

- **Status icon** — colored dot/icon
  - 🔵 Running
  - 🟢 Succeeded
  - 🔴 Failed
  - ⚪ Queued
  - 🟡 Partially succeeded
- **Pipeline name + build number**
- **Branch**
- **Relative time** (when it started/finished)
- **Duration**
- **One-line summary** — current stage progress if running, failure point if failed, who triggered it

**Sorting**: Running and queued pipelines pin to the top regardless of time, so active work is always visible.

## Expanded Row — Stages Timeline + Logs

Clicking a run row expands it inline (accordion style). No navigation away from the list.

```
├────────────────────────────────────────────────────────────────┤
│  ✗ deploy-stg #88           main      1h ago       ⏱ 12m 41s │
│                                                                │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    │
│  │✓ Build  │───▶│✓ Test   │───▶│✗ Deploy │───▶│○ Notify │    │
│  │  2m 01s │    │  4m 12s │    │  6m 28s │    │ skipped │    │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘    │
│                                                                │
│  ▾ Deploy (failed)                                             │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ Error: Connection to host timed out after 30s            │ │
│  │ at AzureWebAppDeployV4 step                              │ │
│  │ ...                                                      │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  [Cancel]  [Open in Azure DevOps ↗]                           │
├────────────────────────────────────────────────────────────────┤
```

### Stages Bar

Horizontal flow of stage chips connected by arrows. Each chip shows:
- Stage name
- Status icon (✓/✗/●/○)
- Duration

Color-coded: green for succeeded, red for failed, blue for running (with subtle animation), gray for skipped/pending.

### Stage Expansion

Clicking a stage chip expands a section below showing the jobs within that stage. Each job can further expand to show task-level log output.

**Failed stages auto-expand** on open so you immediately see what went wrong.

### Actions

At the bottom of the expanded area:
- **Cancel** — only visible if run is in progress
- **Open in Azure DevOps ↗** — external link to the full run page in Azure DevOps

## Trigger Run Dialog

Clicking the "▶" button next to a pipeline definition in the sidebar opens a dialog.

```
┌─────────────────────────────────┐
│  Run frontend-ci                │
│                                 │
│  Branch                         │
│  ┌───────────────────────────┐  │
│  │ main                    ▾ │  │
│  └───────────────────────────┘  │
│                                 │
│  Parameters                     │
│  ┌───────────────────────────┐  │
│  │ environment: [staging ▾]  │  │
│  │ debug:       [☐]         │  │
│  │ tag:         [latest   ]  │  │
│  └───────────────────────────┘  │
│                                 │
│         [Cancel]  [Queue Run]   │
└─────────────────────────────────┘
```

### Branch Selector

Combobox — text input with autocomplete suggestions fetched from Azure DevOps refs API. Defaults to the project's default branch. If the user is currently viewing a worktree task, pre-fills with that worktree's branch.

### Parameters

Only shown if the pipeline definition has defined parameters (fetched via Azure API `GET /_apis/build/definitions/{id}?$expand=parameters`). Hidden entirely if no parameters exist.

Input types based on parameter type:
- **Enum** (allowed values list) → select/dropdown
- **Boolean** → checkbox
- **String/number** → text input with default value pre-filled

### After Trigger

- Dialog closes
- New run appears at the top of the list with "Queued" status
- Polling switches to active mode (30s) to pick up status changes quickly

## Data Flow

### Polling & Live Updates

- Reuse existing `pipeline-tracking-service` polling for background status updates
- When overlay is open and runs are in-progress: React Query with short `refetchInterval` (15-30s) for the run list
- When a specific run is expanded: fetch timeline on expand, refetch on interval while running

### New Azure DevOps API Methods

Added to `electron/services/azure-devops-service.ts`:

| Method | Azure API | Purpose |
|--------|-----------|---------|
| `getBuild()` | `GET /_apis/build/builds/{buildId}` | Individual build detail |
| `getBuildTimeline()` | `GET /_apis/build/builds/{buildId}/timeline` | Stages/jobs/tasks with status and timing |
| `getBuildLog()` | `GET /_apis/build/builds/{buildId}/logs/{logId}` | Task-level log content |
| `getRelease()` | `GET /_apis/release/releases/{releaseId}` | Individual release detail with environments |
| `queueBuild()` | `POST /_apis/build/builds` | Trigger a new build |
| `createRelease()` | `POST /_apis/release/releases` | Create a new release |
| `cancelBuild()` | `PATCH /_apis/build/builds/{buildId}` | Cancel a running build (status: cancelling) |
| `listBranches()` | `GET /_apis/git/repositories/{repoId}/refs?filter=heads/` | List branches for combobox |
| `getBuildDefinitionParameters()` | `GET /_apis/build/definitions/{id}` (with $expand) | Fetch parameter definitions for trigger dialog |

### New IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `pipelines:listRuns` | renderer → main | Fetch recent runs for project/definition |
| `pipelines:getRun` | renderer → main | Fetch single run detail |
| `pipelines:getTimeline` | renderer → main | Fetch stages/jobs/tasks timeline |
| `pipelines:getLog` | renderer → main | Fetch log content for a task |
| `pipelines:queueBuild` | renderer → main | Trigger a new build |
| `pipelines:createRelease` | renderer → main | Create a new release |
| `pipelines:cancelBuild` | renderer → main | Cancel a running build |
| `pipelines:listBranches` | renderer → main | Fetch branches for combobox |
| `pipelines:getDefinitionParams` | renderer → main | Fetch parameter definitions |

### New React Query Hooks

In `src/hooks/use-pipeline-runs.ts`:

- `usePipelineRuns(projectId?, definitionId?, kind?)` — list with refetchInterval when in-progress runs exist
- `usePipelineRun(runId, kind)` — single run detail
- `useBuildTimeline(buildId)` — stages/jobs/tasks, refetch while running
- `useBuildLog(buildId, logId)` — task-level log content
- `useBranches(projectId)` — for trigger dialog combobox
- `useBuildDefinitionParams(definitionId)` — for trigger dialog parameter form
- `useQueueBuild()` — mutation
- `useCreateRelease()` — mutation
- `useCancelBuild()` — mutation

## New Files

| File | Purpose |
|------|---------|
| `src/features/pipelines/ui-pipelines-overlay/index.tsx` | Main overlay with sidebar + content layout |
| `src/features/pipelines/ui-pipelines-overlay/sidebar.tsx` | Project/definition tree with run buttons |
| `src/features/pipelines/ui-pipelines-overlay/run-list.tsx` | Chronological run list |
| `src/features/pipelines/ui-pipelines-overlay/run-row.tsx` | Single run row (collapsed) |
| `src/features/pipelines/ui-pipelines-overlay/run-detail.tsx` | Expanded run detail with stages + logs |
| `src/features/pipelines/ui-pipelines-overlay/stages-timeline.tsx` | Horizontal stage chips visualization |
| `src/features/pipelines/ui-pipelines-overlay/trigger-run-dialog.tsx` | Dialog for triggering new runs |
| `src/hooks/use-pipeline-runs.ts` | React Query hooks for pipeline run data |
| `shared/pipeline-types.ts` | Extended types (add run detail, timeline, log, trigger params) |

## Permissions Note

Azure PAT tokens need `Build (Read & Execute)` and `Release (Read, Write, & Execute)` scopes for triggering runs. Viewing only requires Read. If a trigger fails with 403, show a clear error message suggesting the user update their PAT token scopes.
