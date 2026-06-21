# Work Activity Tracker Design

## Goal

Track subjects worked on so weekly timesheets can be drafted from Jean-Claude activity without tracking time. The tracker records durable activity events when the user prompts a task or completes explicit PR review actions.

This is an activity log, not time tracking. It answers: "What did I work on this week, by day, project, work item, task, and PR?"

## Key Decisions

- Use an append-only SQLite event log.
- Store denormalized snapshots so activity survives task and task-step cleanup.
- Do not depend on task/task-step rows for report rendering.
- Log every prompt at submit time.
- Store prompt snippets only: first 500 characters plus original length.
- Store `workItemIds` and minimal work item context: provider/org/project, no title/type/state/url.
- Show activity in a global overlay opened from an icon-only header button beside usage metrics.
- Do not add a dedicated route/page for activity.
- Do not log PR opens/views.
- Include privacy controls: enable/disable logging, delete/export activity.

## Event Types

MVP events:

- `task_prompted`: user submits a prompt to a task or task step.
- `pr_comment_added`: user submits a PR review comment successfully.
- `pr_approved`: user approves or approves-with-suggestions successfully.

Out of scope for MVP:

- PR opened/viewed events.
- Passive time tracking.
- Background agent runtime without user prompt.
- Automatic time estimates.

## Data Model

Add `work_activity_events` table.

```ts
type WorkActivityEventType =
  | 'task_prompted'
  | 'pr_comment_added'
  | 'pr_approved';

type WorkActivityEvent = {
  id: string;
  occurredAt: string;
  type: WorkActivityEventType;

  projectId: string | null;
  projectName: string | null;
  providerId: string | null;
  azureOrgId: string | null;
  azureProjectId: string | null;
  repoId: string | null;

  taskId: string | null;
  taskTitle: string | null;
  stepId: string | null;

  promptSnippet: string | null;
  promptLength: number | null;

  workItemIds: string[];
  workItems: Array<{
    id: string;
    providerId: string;
    azureOrgId: string;
    azureProjectId: string;
  }>;

  pullRequest: {
    providerId: string;
    azureOrgId: string;
    azureProjectId: string;
    repoId: string;
    pullRequestId: string;
    title: string | null;
    url: string | null;
  } | null;

  metadata: Record<string, unknown>;
};
```

SQLite columns:

```sql
CREATE TABLE work_activity_events (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL,
  type TEXT NOT NULL,

  project_id TEXT,
  project_name TEXT,
  provider_id TEXT,
  azure_org_id TEXT,
  azure_project_id TEXT,
  repo_id TEXT,

  task_id TEXT,
  task_title TEXT,
  step_id TEXT,

  prompt_snippet TEXT,
  prompt_length INTEGER,

  work_item_ids_json TEXT NOT NULL DEFAULT '[]',
  work_items_json TEXT NOT NULL DEFAULT '[]',
  pull_request_json TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_work_activity_events_occurred_at
  ON work_activity_events(occurred_at);

CREATE INDEX idx_work_activity_events_type
  ON work_activity_events(type);

CREATE INDEX idx_work_activity_events_project_id
  ON work_activity_events(project_id);
```

No foreign keys to tasks or task steps. `project_id` is stored as a reference-like value, but reports must be able to render from snapshots if project rows change.

## Logging Rules

### Task Prompts

Log `task_prompted` when user submits prompt. Use submit timestamp, even if agent startup later fails.

Snapshot:

- Jean-Claude project id/name.
- provider/repo/Azure project context when available.
- task id/title.
- step id.
- prompt snippet and length.
- associated `workItemIds` from task context.
- work item context for each ID: provider id, Azure org id, Azure project id.

### PR Comments

Log `pr_comment_added` after review comment submission succeeds.

Snapshot:

- project/provider/repo/Azure context.
- PR id/title/url.
- associated `workItemIds` from PR-linked work items if known.
- optional task context if comment was submitted from task review UI.

### PR Approval

Log `pr_approved` after approval/approve-with-suggestions succeeds.

Snapshot:

- project/provider/repo/Azure context.
- PR id/title/url.
- associated `workItemIds` from PR-linked work items if known.
- approval vote in metadata.

## Activity Overlay

Add icon-only header button beside usage metrics.

- Icon: `BarChart3` or `Activity`.
- Tooltip: `Work activity`.
- Opens global overlay.

Overlay content:

- Week selector.
- Optional filters: project, work item, event type.
- Metric row: total events, unique projects, unique work items, unique PRs, unique tasks.
- Daily sections grouped by day -> project -> work item.
- Copy button for compact timesheet text.
- Privacy/settings controls: logging toggle, delete/export.

Default grouping:

```md
Mon Jun 15
- Jean-Claude
  - JC-123
    - Prompted task: Add activity tracker
    - Reviewed PR #45
```

## Runtime Grouping

Store raw events independently. Collapse repeated subjects only in overlay/export rendering.

Initial grouping order:

1. Day from `occurredAt`.
2. Project from `projectName` fallback `projectId`.
3. Work item from `workItemIds`, with `(no work item)` bucket when empty.
4. Event subject from task title, PR title, or prompt snippet.

## Privacy And Retention

Settings:

- Enable/disable activity logging.
- Delete all activity.
- Delete activity before date.
- Export raw JSON.
- Copy weekly timesheet text.

Default: logging enabled, keep forever.

When disabled, logging calls should no-op before writing events.

## Architecture

Main process:

- `work-activity-repository`: SQLite CRUD and range queries.
- `work-activity-service`: builds snapshots and applies logging setting.
- IPC handlers: query events, log event, delete/export controls, update setting.

Renderer:

- API typings in `src/lib/api.ts`.
- React Query hooks for weekly activity and settings.
- Header button opens overlay store state.
- Overlay groups events at runtime for report UI and copy text.

## Testing

Unit tests:

- prompt snippet truncates to 500 chars and records full length.
- repository serializes/deserializes JSON fields.
- weekly grouping handles multiple prompts on same task/day.
- work items group by `workItemIds` with provider/org/project context retained.
- disabled logging writes no events.

Integration-ish tests where practical:

- task prompt submit calls activity logging once.
- PR comment success logs `pr_comment_added`.
- PR approval success logs `pr_approved`.

## Implementation Notes

- Keep event creation best-effort. Activity logging failures must not block prompt submission or PR actions.
- Avoid synchronous UI waits for logging.
- Never join task/task-step tables for overlay rendering.
- Do not update changelogs as part of implementation unless explicitly requested.
