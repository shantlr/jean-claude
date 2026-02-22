# Workflow Redesign — High-Level Design

> **Date**: 2026-02-22
> **Status**: Draft
> **Approach**: Bottom-Up (Task Workflow → Feed → Roadmaps)

## Overview

A fundamental rework of Jean-Claude's user experience, replacing the task-centric manual orchestration model with a workflow-driven system. Three interconnected features:

1. **Task-as-Workflow** — Tasks become multi-step DAGs instead of single agent sessions
2. **Feed** — A prioritized stream replaces the sidebar as primary navigation
3. **Roadmaps** — Cross-project DAGs that orchestrate tasks with execution-order dependencies

### Hierarchy

```
Roadmap (macro orchestration)
└── Task nodes connected by edges (execution order)
    └── Task (feature-level work unit)
        └── Step nodes connected by edges (execution order)
            └── Step (single agent session)
```

Roadmaps and task step flows share the same DAG visual language and rendering component.

---

## Feature 1: Task-as-Workflow

### Concept

A Task becomes a container for an ordered DAG of Steps. Each step is an independent agent session sharing the task's worktree. Steps declare dependencies on other steps; parallel branches run concurrently.

### Data Model

#### TaskStep (new entity)

| Field | Type | Description |
|-------|------|-------------|
| id | string | Unique ID, user-readable slug (auto-generated from name, editable) |
| taskId | string | FK to tasks |
| name | string | Display name (e.g., "Brainstorm", "Implement API") |
| dependsOn | string[] (JSON) | IDs of steps this step waits on |
| promptTemplate | text | Template string with `{{expressions}}` |
| resolvedPrompt | text (nullable) | Actual prompt sent to agent, after variable resolution |
| status | enum | `pending \| ready \| running \| completed \| errored \| interrupted` |
| sessionId | string (nullable) | Agent session for this step |
| interactionMode | enum (nullable) | Optional override: `ask \| auto \| plan` |
| modelPreference | string (nullable) | Optional override |
| agentBackend | string (nullable) | Optional override |
| output | text (nullable) | Last assistant result message, captured on completion |
| createdAt | datetime | |
| updatedAt | datetime | |

**Status semantics:**
- `pending` — dependencies not yet met
- `ready` — all dependencies completed, user can start this step
- `running` — agent session active
- `completed` — session finished, output captured
- `errored` / `interrupted` — session failed

#### WorkflowTemplate (new entity)

| Field | Type | Description |
|-------|------|-------------|
| id | string | |
| name | string | Template name (e.g., "Standard Feature", "Bug Fix") |
| description | text (nullable) | |
| isBuiltIn | boolean | System-provided vs user-created |
| createdAt | datetime | |
| updatedAt | datetime | |

#### WorkflowTemplateStep (new entity)

| Field | Type | Description |
|-------|------|-------------|
| id | string | |
| templateId | string | FK to workflow_templates |
| stepId | string | Slug used in expressions |
| name | string | |
| dependsOn | string[] (JSON) | Step IDs within the template |
| promptTemplate | text | |
| interactionMode | enum (nullable) | |
| modelPreference | string (nullable) | |
| sortOrder | integer | For display ordering |

### Template Expression System

Step prompts reference outputs of other steps via ID-based expressions:

```
{{step.<id>.output}}     — output of the step with that ID
{{task.prompt}}           — the task's initial description/prompt
{{task.name}}             — the task's auto-generated name
```

Expressions are resolved at step start time. Only completed step outputs are available. Referencing a non-completed step's output is an error (prevented by dependency graph — a step can only reference steps it depends on).

**Example — review step prompt:**
```
Review the following implementations:

API changes:
{{step.impl-api.output}}

UI changes:
{{step.impl-ui.output}}

Verify they align with the spec:
{{step.brainstorm.output}}
```

For processing/summarizing a previous step's output, create a dedicated step with a prompt like:
```
Summarize the following into key decisions and specs:
{{step.brainstorm.output}}
```

No special expression processing engine needed — simple string interpolation.

### Step Lifecycle

1. Task is created (optionally from a workflow template)
2. Steps with no dependencies start as `ready`
3. User manually clicks "Start" on a ready step
4. Step's prompt template is resolved (variables filled from completed dependencies)
5. Agent session starts with the resolved prompt
6. User interacts with the agent session (follow-up prompts, permissions, etc.)
7. When the session completes, the step captures its output (last assistant message)
8. Dependent steps transition from `pending` → `ready`
9. Repeat until all steps complete

Transitions between steps are **manual** (user initiates each step). Automatic transitions are a future enhancement.

### Migration from Current Model

- Existing tasks get a single auto-created step containing the current sessionId, prompt, mode, model, and backend
- New tasks without a template also default to a single step (preserves current UX)
- Adding steps is always optional — single-step tasks work exactly like today
- The `tasks` table retains `prompt` (initial description) and worktree fields; step-level fields (`sessionId`, `interactionMode`, `modelPreference`, `agentBackend`) move to `task_steps`

### UI: Horizontal Step Flow

A collapsible horizontal DAG bar sits at the top of the task panel:

```
┌──────────────────────────────────────────────────────┐
│ Step Flow (collapsible)                              │
│                                                      │
│  [✓ brainstorm] ──→ [● impl-api] ──→ [○ review]    │
│                  └→ [◉ impl-ui]  ──↗                │
│                                        [+ Add Step]  │
├──────────────────────────────────────────────────────┤
│ Message Stream (for selected step)                   │
│                                                      │
│  ...agent messages for the active/selected step...   │
│                                                      │
├──────────────────────────────────────────────────────┤
│ Message Input                                        │
└──────────────────────────────────────────────────────┘
```

- Same left-to-right DAG visual language as Roadmaps
- Clicking a node selects that step; the message stream below updates
- Completed steps show their session read-only; pending steps show "Start Step" with resolved prompt preview
- Steps can be added, removed, and have dependencies edited inline
- Parallel branches stack vertically

---

## Feature 2: The Feed

### Concept

The feed **replaces the sidebar entirely** as the primary navigation surface. It's a prioritized stream of actionable items from all projects, organized into user-customizable categories.

### Data Model

#### FeedCategory (new entity)

| Field | Type | Description |
|-------|------|-------------|
| id | string | |
| name | string | User-editable (e.g., "Urgent", "Needs Action") |
| sortOrder | integer | Drag to reorder priority |
| color | string (nullable) | Optional visual indicator |
| isDefault | boolean | Part of initial setup (still editable/deletable) |
| createdAt | datetime | |

#### FeedItem (new entity)

| Field | Type | Description |
|-------|------|-------------|
| id | string | |
| type | enum | `task-update \| work-item \| pr-authored \| pr-review \| comment` |
| sourceId | string | taskId, workItemId, prId, etc. |
| projectId | string (nullable) | For project badge display |
| categoryId | string | FK to feed_categories |
| title | string | Short display text |
| subtitle | string (nullable) | Context (project name, timestamp) |
| status | enum | `unread \| read \| actioned \| dismissed` |
| metadata | JSON (nullable) | Type-specific extra data |
| createdAt | datetime | |
| updatedAt | datetime | |

#### FeedCategoryMapping (default assignment rules)

| Field | Type | Description |
|-------|------|-------------|
| id | string | |
| categoryId | string | FK to feed_categories |
| itemType | enum | Which feed item type this rule applies to |
| condition | text (nullable) | Future: status-based rules, e.g., `status = 'errored'` |

### Default Categories (Initial Setup)

Seeded on first launch, fully editable by the user:

| Priority | Name | Auto-assigned Items |
|----------|------|---------------------|
| 1 | Needs Action | Permission requests, agent questions, PR reviews assigned |
| 2 | Active Tasks | Running agent sessions |
| 3 | Blocked / Errors | Errored tasks, PRs with conflicts |
| 4 | Updates | PR comments, work item comments, task completions |
| 5 | Backlog | Unstarted work items, pending tasks |

Users can:
- **Rename** any category
- **Add** new custom categories
- **Delete** categories (items fall to an uncategorized default)
- **Reorder** categories by drag (changes global priority)
- **Move items** between categories manually (overrides auto-assignment)

Within each category, items sort by recency (newest first).

### Feed Item Sources

| Source | Item Type | Trigger |
|--------|-----------|---------|
| Local tasks | `task-update` | Task status change, permission request, completion |
| Azure DevOps work items | `work-item` | Provider polling (assigned/mentioned items) |
| PRs (authored) | `pr-authored` | PR status change, new comments, merge conflicts |
| PRs (to review) | `pr-review` | Review requested, PR updated |
| Work item comments | `comment` | New comment on linked work items |

**Population strategy:**
- Local data (tasks) generates feed items on status change events
- Provider data (PRs, work items) polled periodically via background service
- Feed items are **persisted in the database** — survive restarts, accumulate history

### Feed UI

```
┌─────────────────────┬────────────────────────────────┐
│ Feed                │ Content Panel                  │
│                     │ (Task / PR / Work Item view)   │
│ ─ Needs Action (2) ─│                                │
│ 🔴 Auth task: perm  │                                │
│ 🔵 Review PR #58    │                                │
│                     │                                │
│ ─ Active Tasks (3) ─│                                │
│ 🟢 API refactor     │                                │
│ 🟢 UI migration     │                                │
│ 🟡 DB schema task   │                                │
│                     │                                │
│ ─ Updates (1) ──────│                                │
│ 💬 Comment on PR #42│                                │
│                     │                                │
│ ─ Backlog (4) ──────│                                │
│ 📋 US-123: Add auth │                                │
│ 📋 US-124: Fix perf │                                │
│                     │                                │
│ [+ New Task]        │                                │
└─────────────────────┴────────────────────────────────┘
```

- Collapsible category sections with count badges
- Item click navigates to the relevant view (task panel, PR viewer, work item detail)
- Project color badges on each item for cross-project identification
- Unread dot indicator on items with new activity
- Roadmap context shown on roadmap-linked tasks (e.g., "API impl — Auth Feature roadmap")

---

## Feature 3: Roadmaps

### Concept

A Roadmap is a named DAG of tasks that visualizes execution order, parallelism, and progress. Roadmap nodes ARE tasks. Roadmaps can span multiple projects.

### Data Model

#### Roadmap (new entity)

| Field | Type | Description |
|-------|------|-------------|
| id | string | |
| name | string | e.g., "Q1 Backend Overhaul" |
| description | text (nullable) | |
| createdAt | datetime | |
| updatedAt | datetime | |

#### RoadmapNode (new entity)

| Field | Type | Description |
|-------|------|-------------|
| id | string | |
| roadmapId | string | FK to roadmaps |
| taskId | string | FK to tasks |
| positionX | real | For manual layout adjustments |
| positionY | real | For manual layout adjustments |
| createdAt | datetime | |

#### RoadmapEdge (new entity)

| Field | Type | Description |
|-------|------|-------------|
| id | string | |
| roadmapId | string | FK to roadmaps |
| fromNodeId | string | FK to roadmap_nodes |
| toNodeId | string | FK to roadmap_nodes |

### Key Properties

- **Tasks are independent** — a task can exist in zero or many roadmaps (many-to-many via RoadmapNode). The roadmap is an orchestration view, not a container.
- **Edges = execution order** — an edge from A → B means "task A should complete before task B starts." This is advisory for now (no enforcement), with visual indicators for blocked nodes.
- **Cross-project** — nodes reference tasks from any project. Each node displays a project badge/color.
- **Derived status** — no stored status on the roadmap itself:
  - All tasks completed → roadmap complete
  - Any task running → roadmap in progress
  - Any task errored → roadmap has errors
  - All tasks pending → roadmap not started
- **Layout** — dagre auto-layout by default; manual position overrides (positionX/Y) preserved.

### Roadmap UI

Horizontal left-to-right DAG, same rendering component as task step flow:

```
┌──────────────────────────────────────────────────────────────┐
│ Roadmap: Auth Feature                              [+ Node]  │
│                                                              │
│  [✓ Brainstorm] ──→ [● API impl] ──→ [○ Integration tests] │
│     (proj: BE)       (proj: BE)   ┌→  (proj: BE)           │
│                  └→ [◉ UI impl]  ─┘                         │
│                      (proj: FE)                              │
│                                                              │
│  Legend: ✓ done  ● running  ◉ ready  ○ blocked              │
└──────────────────────────────────────────────────────────────┘
```

**Node display:**
- Task name
- Status indicator (color + icon)
- Project badge (color dot or label)
- Click to open task panel (with its step workflow)

**Interactions:**
- Add node — create a new task or link an existing task
- Add edge — drag from one node to another
- Remove edge — click an edge to delete
- Move node — drag to reposition
- Zoom/pan — for large roadmaps

### Navigation

- **Feed**: A "Roadmaps" section at the top of the feed (always visible, like pinned items)
- **Command palette**: Cmd+K → search roadmap name
- **Route**: `/roadmaps/:roadmapId`

---

## Shared: DAG Rendering Component

Both Roadmaps and Task Step Flows use the same `<DagView>` component:

```typescript
<DagView
  nodes={[{ id, label, status, badge?, metadata? }]}
  edges={[{ from, to }]}
  onNodeClick={(nodeId) => void}
  onAddEdge={(from, to) => void}
  onRemoveEdge={(edgeId) => void}
  onNodeDrag={(nodeId, x, y) => void}
  layout="auto" | "manual"
  scale="compact" | "full"    // compact = step flow, full = roadmap
  editable={boolean}          // whether user can add/remove edges and nodes
/>
```

Rendering approach: Custom React SVG/Canvas with dagre for auto-layout. Lightweight, no heavy diagramming library.

---

## Implementation Order

**Phase 1: Task-as-Workflow**
- New database tables: `task_steps`, `workflow_templates`, `workflow_template_steps`
- Migration: existing tasks get a single auto-created step
- Step service: CRUD, dependency resolution, prompt template interpolation, output capture
- UI: horizontal step flow bar in task panel, step creation/editing
- Workflow template CRUD and "create task from template" flow

**Phase 2: Feed**
- New database tables: `feed_categories`, `feed_items`, `feed_category_mappings`
- Feed service: item creation from task events, provider polling
- Category management UI
- Replace sidebar with feed component
- Route updates: feed as primary navigation

**Phase 3: Roadmaps**
- New database tables: `roadmaps`, `roadmap_nodes`, `roadmap_edges`
- Roadmap service: CRUD, status derivation
- Shared `<DagView>` component (also retrofit into step flow)
- Roadmap creation/editing UI
- Feed integration: roadmap section in feed
- Route: `/roadmaps/:roadmapId`

---

## New Database Tables Summary

| Table | Phase | Purpose |
|-------|-------|---------|
| `task_steps` | 1 | Steps within a task (DAG of agent sessions) |
| `workflow_templates` | 1 | Reusable workflow definitions |
| `workflow_template_steps` | 1 | Steps within a template |
| `feed_categories` | 2 | User-customizable priority buckets |
| `feed_items` | 2 | Unified stream of actionable items |
| `feed_category_mappings` | 2 | Auto-assignment rules for feed items |
| `roadmaps` | 3 | Named orchestration DAGs |
| `roadmap_nodes` | 3 | Task references within a roadmap |
| `roadmap_edges` | 3 | Execution-order edges between nodes |

## Modified Tables

| Table | Change | Phase |
|-------|--------|-------|
| `tasks` | Add `workflowTemplateId` (nullable FK). Step-level fields (`sessionId`, `interactionMode`, `modelPreference`, `agentBackend`) logically move to `task_steps` but remain on tasks for backward compat during migration. | 1 |

## New Routes

| Route | Phase | Purpose |
|-------|-------|---------|
| `/roadmaps/:roadmapId` | 3 | Roadmap DAG view |
