# Task-as-Workflow — Phase 1 Design

> **Date**: 2026-02-23
> **Status**: Approved
> **Parent**: [Workflow Redesign Design](./2026-02-22-workflow-redesign-design.md)
> **Scope**: Phase 1 — Steps only (templates deferred to Phase 1b)

## Overview

Phase 1 converts tasks from single agent sessions into containers for a DAG of steps. Every task always has at least one step. Steps are independent agent sessions sharing the task's worktree.

## Data Model

### `task_steps` Table (New)

| Column | Type | Description |
|--------|------|-------------|
| id | text PK | nanoid |
| taskId | text FK(tasks) | Cascade delete |
| name | text | Display name (e.g., "Brainstorm", "Implement API") |
| dependsOn | text | JSON array of step IDs (nanoids) |
| promptTemplate | text | Template string with `{{expressions}}` |
| resolvedPrompt | text nullable | Actual prompt sent to agent, filled at start time |
| status | text | `pending \| ready \| running \| completed \| errored \| interrupted` |
| sessionId | text nullable | Agent session ID |
| interactionMode | text nullable | `ask \| auto \| plan` |
| modelPreference | text nullable | Model selection |
| agentBackend | text nullable | `claude-code \| opencode` |
| output | text nullable | Captured on completion (last result or assistant-message) |
| sortOrder | integer | Display ordering in the flow bar |
| createdAt | text | ISO datetime |
| updatedAt | text | ISO datetime |

### Changes to `tasks` Table

**Removed columns** (moved to `task_steps` via safe table recreation migration):
- `sessionId`
- `interactionMode`
- `modelPreference`
- `agentBackend`

**Kept columns**: `id`, `projectId`, `name`, `prompt`, `status` (synced), `branchName`, `sourceBranch`, `worktreePath`, `startCommitHash`, `pendingMessage`, `pullRequestId`, `pullRequestUrl`, `createdAt`, `updatedAt`.

### Changes to `agent_messages` Table

**Added column**: `stepId text nullable` — FK to `task_steps`. `taskId` stays for cascade deletes.

### Changes to `raw_messages` Table

**Added column**: `stepId text nullable` — FK to `task_steps`. Same pattern as `agent_messages`.

## Migration Strategy

The migration runs inside a transaction using the safe table recreation pattern:

1. Create `task_steps` table
2. For each existing task, insert one step row:
   - Copy `sessionId`, `interactionMode`, `modelPreference`, `agentBackend` from the task
   - Set `promptTemplate` = task's `prompt`
   - Set `status` = task's `status` (mapped to step status enum)
   - Set `dependsOn` = `[]`
   - Set `sortOrder` = 0
3. Add `stepId` column to `agent_messages`, backfill from the auto-created step (by matching `taskId`)
4. Add `stepId` column to `raw_messages`, backfill likewise
5. Recreate `tasks` table without `sessionId`, `interactionMode`, `modelPreference`, `agentBackend` (safe recreation pattern with FK protection)

## Always-Step Invariant

Every task has at least one step. There is no "stepless task" code path. The single-step case is a workflow with one node. All session management, message queries, and agent interactions go through steps.

## Task Status Sync

`tasks.status` is kept as a column but auto-updated whenever a step status changes. The step service calls `syncTaskStatus(taskId)` which applies these rules:

| Condition | Task Status |
|-----------|-------------|
| Any step `running` | `running` |
| Any step `errored` | `errored` |
| Any step `interrupted` | `interrupted` |
| All steps `completed` | `completed` |
| Otherwise | `waiting` |

This keeps existing queries (task list, sidebar) working without joins.

## Template Expression System

Step prompts reference outputs of other steps and task-level data:

```
{{step.<nanoid>.output}}   — output of the step with that ID
{{task.prompt}}            — the task's initial description/prompt
{{task.name}}              — the task's auto-generated name
```

**Resolution rules:**
- Resolved at step start time (when user clicks "Start")
- Only completed step outputs are available
- Referencing a non-completed step is prevented by the dependency graph
- `null` output → empty string substitution with warning
- Malformed expressions → left as-is with warning shown to user

**Implementation:** Regex-based string interpolation in the step service. No expression engine.

**UX:** When composing a `promptTemplate`, the UI shows a dropdown of available steps by name. The inserted expression uses the nanoid. Users never type IDs manually.

## Step Lifecycle

```
Task created
  → Single step auto-created (status: ready, dependsOn: [])
  → User can add more steps

User clicks "Start" on a ready step
  → Step service: validate dependsOn all completed
  → Step service: resolve promptTemplate → resolvedPrompt
  → Step service: set step status → running
  → Step service: sync task status → running
  → Agent service: startAgent(stepId, resolvedPrompt)

Agent session runs
  → Messages written with stepId to agent_messages / raw_messages
  → User interacts (follow-ups, permissions, questions)

Session completes
  → Capture output: last `result` entry, fallback to last `assistant-message`
  → Set step status → completed, store output
  → Dependent steps transition: pending → ready
  → Sync task status

Session errors/interrupts
  → Set step status → errored / interrupted
  → Sync task status
```

**Parallel execution:** Multiple steps can be `ready` and `running` simultaneously. The user manually starts each. The UI allows switching between running sessions.

## Service Architecture

### Step Service (`electron/services/step-service.ts`) — New

The orchestrator for step lifecycle:

```
createStep({ taskId, name, dependsOn, promptTemplate, interactionMode?, modelPreference?, agentBackend? })
updateStep({ stepId, name?, dependsOn?, promptTemplate?, interactionMode?, modelPreference?, agentBackend? })
deleteStep({ stepId })
  — also removes this stepId from other steps' dependsOn arrays
reorderSteps({ taskId, stepIds[] })
  — updates sortOrder
startStep({ stepId })
  — validate dependencies → resolve prompt → delegate to agent service
syncTaskStatus({ taskId })
  — recompute task status from step statuses, update tasks table
```

### Agent Service Changes

- `startAgent` takes `stepId` instead of `taskId`
- Reads `sessionId`, `interactionMode`, `modelPreference`, `agentBackend` from the step
- Looks up `taskId` from the step for worktree path resolution
- Writes `stepId` into `agent_messages` and `raw_messages` on every message event
- On session complete: captures output → writes to `step.output`

### Output Capture

On session completion, scan the step's messages:
1. Look for the last entry with type `result` — use its text content
2. If no `result` entry, use the last `assistant-message` text content
3. Store in `task_steps.output`

## UI Changes

### Step Flow Bar (`<StepFlowBar>`)

A compact horizontal bar in the task panel, between the header and the message stream. **Always visible**, even for single-step tasks (one pill + `[+]` button for discoverability).

```
┌──────────────────────────────────────────────────────┐
│ Header (task name, branch, PR badge, menu)           │
├──────────────────────────────────────────────────────┤
│ [● Brainstorm] ──→ [○ Implement] ──→ [○ Review]  +  │
├──────────────────────────────────────────────────────┤
│ Message Stream (for selected step)                   │
├──────────────────────────────────────────────────────┤
│ Message Input                                        │
└──────────────────────────────────────────────────────┘
```

**Step node states (pills):**

| Status | Appearance |
|--------|------------|
| `pending` | Dimmed, not clickable |
| `ready` | Outlined, clickable |
| `running` | Filled/pulsing, clickable |
| `completed` | Checkmark, clickable |
| `errored` | Red indicator |
| `interrupted` | Warning indicator |

**Interactions:**
- Click node → select as `activeStepId`, message stream switches
- `[+]` button → add step (name, dependencies, prompt template)
- Right-click / overflow menu → edit, delete, start (if ready)
- Connecting lines show dependency flow; parallel branches stack vertically

### Message Stream Scoping

- Queries `agent_messages` by `stepId` (not `taskId`)
- **Ready step selected**: Show resolved prompt preview + "Start Step" button
- **Pending step selected**: Show which dependencies are blocking
- **Completed step selected**: Show messages read-only (input disabled)
- **Running step selected**: Full interactive message stream + input

### Navigation Store Changes

Add `activeStepId: string | null` to per-task state in `navigation.ts`.

**Auto-select logic:** Running step → first ready step → last completed step.

### Task Creation Flow

Unchanged UX. A single step is auto-created inheriting:
- `interactionMode` from the task creation form
- `modelPreference` from the task creation form
- `agentBackend` from the task creation form
- `promptTemplate` = task's `prompt`

Users can add more steps after task creation.

## Scope Boundary

### In Scope
- `task_steps` table + migration (safe table recreation, field move, backfill)
- `stepId` on `agent_messages` and `raw_messages` (backfill)
- Step service: CRUD, dependency validation, prompt resolution, output capture, task status sync
- Agent service refactor: step-centric `startAgent`
- `<StepFlowBar>` component (dedicated, not shared `<DagView>`)
- Message stream scoped to `activeStepId`
- Navigation store: `activeStepId` per task
- Step creation/editing UI
- Parallel step execution
- Task creation auto-creates single step

### Out of Scope (Deferred)
- Workflow templates → Phase 1b
- "Create task from template" flow → Phase 1b
- Shared `<DagView>` component → Phase 3 (Roadmaps)
- Auto-start steps (automatic transitions) → future
- Feed → Phase 2
- Roadmaps → Phase 3

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `agent_messages` ↔ steps | Add nullable `stepId`, keep `taskId` for cascades | Backward compatible, clean cascade deletes |
| Always create step row | Yes | One code path, no dual logic |
| Task status | Synced from step statuses | Existing queries keep working |
| Fields on tasks vs steps | Move completely, backfill | Clean schema, no dead columns |
| Step ID format | nanoid, no slug | Consistent with rest of app |
| Output capture | Last `result`, fallback `assistant-message` | Covers both entry types |
| Templates | Deferred to Phase 1b | Ship core step DAG first |
| Step flow UI | Dedicated `<StepFlowBar>` | Avoid premature abstraction |
| Agent service API | Step-centric `startAgent(stepId)` | Clean separation of concerns |
| Active step tracking | `activeStepId` in navigation store | Consistent with existing patterns |
| Single-step visibility | Bar always visible | Discoverability |
| Parallel execution | Supported | Core DAG value proposition |
