# Management & Multitasking UX Redesign

## Design Philosophy

Jean-Claude is a **developer velocity tool** for orchestrating AI coding agents. The goal is to minimize friction from "I see a work item" to "PR is ready for review".

### Core User Profile

- **Rapid switching** between 4-8 concurrent active sessions
- **Deep Azure DevOps integration** - work items as first-class entry points
- **Fast PR creation** from agent work
- **Efficient code review** of agent changes - understanding *why* the agent made decisions

---

## Design Principle: Command Palette as Central Hub

**The ⌘P command palette is the primary interface for all actions.**

Every new feature should ask: *"How does this surface in the command palette?"*

### Design Rules for New Features

| Rule | Example |
|------|---------|
| Every action has a command | "Merge branch" → appears in palette when worktree task focused |
| Searchable by natural terms | "pr", "pull request", "create pr" all find "Create PR..." |
| Context-aware visibility | Only show relevant commands for current state |
| Keyboard shortcut optional | Frequent actions get shortcuts, but all actions accessible via ⌘P |
| Discoverability | Users learn features by browsing the palette |

### Future Features Checklist

- [ ] How is this triggered from ⌘P?
- [ ] What contexts should it appear in?
- [ ] What search terms should match it?
- [ ] Does it need a dedicated shortcut?

---

## Keyboard Shortcuts Overview

### Global Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘P` | Command palette - search sessions, run commands |
| `⌘N` | New task spotlight |
| `⌘L` | Focus input bar |
| `⌘,` | Settings |
| `Escape` | Dismiss overlay / Interrupt agent |

### Session Navigation

| Shortcut | Action |
|----------|--------|
| `⌘1` - `⌘9` | Jump to session 1-9 |
| `⌘↑` | Previous session |
| `⌘↓` | Next session |
| `⌘Tab` | Next project filter |
| `⌘⇧Tab` | Previous project filter |

### Main Workspace (Task Focused)

| Shortcut | Action |
|----------|--------|
| `⌘D` | Toggle diff view |
| `⌘M` | Toggle messages / conversation |
| `⌘I` | Toggle info panel (settings, work item) |
| `⌘⇧P` | Create PR |
| `⌘⇧C` | Commit changes |
| `⌘⇧S` | Generate summary |
| `⌘R` | Run command |
| `⌘O` | Open in VS Code |
| `⌘.` | Open in terminal |
| `⌘Enter` | Send message (from input bar) |

### Diff View

| Shortcut | Action |
|----------|--------|
| `↑` / `↓` | Navigate files |
| `⌘[` / `⌘]` | Previous / Next file |
| `⌘\` | Toggle side-by-side / unified diff |

### Discoverability

Keyboard shortcuts should be discoverable through multiple channels:

1. **Command palette** - Every action shows its shortcut (e.g., `Create PR... ⌘⇧P`)
2. **Tooltips** - Hover on buttons shows shortcut hint
3. **Keyboard help overlay** - `⌘/` or `?` opens a full shortcuts reference
4. **Onboarding hints** - First-time users see subtle hints for key shortcuts
5. **Settings > Keyboard Shortcuts** - Full list, potentially customizable later

---

## Feature 1: ⌘N New Task Spotlight

A keyboard-driven overlay for quickly spawning new tasks from work items or ad-hoc prompts.

### Overlay Behavior

- **Modal without backdrop** - No dimming, clicking outside dismisses
- **Centered** - Raycast/Spotlight style, top-center of screen
- **Initial focus** - Input field, ready to type

### Input Mode Logic

The input field behavior changes based on context:

| Project Selection | Has Work Items? | Input Mode | Placeholder |
|-------------------|-----------------|------------|-------------|
| "All" | - | Search | "Search work items..." |
| Project | Yes | Search | "Search work items..." |
| Project | No | Prompt | "Describe your task..." |

### Layout (Search Mode)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⌘N  │ Search work items...                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────┐ ┌─────────┐ ┌─────────────┐ ┌────────────┐            │
│  │ All │ │ webapp  │ │ project-api │ │ mobile-app │            │
│  │  ●  │ │         │ │             │ │            │            │
│  └─────┘ └─────────┘ └─────────────┘ └────────────┘            │
│     ← ⌘⇧Tab                              ⌘Tab →                │
│                                                                 │
│  ┌─────────────────────────┬───────────────────────────────────┐│
│  │ MY WORK ITEMS           │                                   ││
│  │                         │   (no selection yet)              ││
│  │   🐛 #4521  Fix null    │                                   ││
│  │   📘 #4518  Add pass    │   Select a work item to see       ││
│  │   📘 #4502  Implement   │   details                         ││
│  │                         │                                   ││
│  └─────────────────────────┴───────────────────────────────────┘│
│                                                                 │
│  ☑ Create worktree    ⌘B                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Layout (Work Item Selected)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⌘N  │ Search work items...                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────┐ ┌─────────┐ ┌─────────────┐ ┌────────────┐            │
│  │ All │ │ webapp  │ │ project-api │ │ mobile-app │            │
│  │  ●  │ │         │ │             │ │            │            │
│  └─────┘ └─────────┘ └─────────────┘ └────────────┘            │
│                                                                 │
│  ┌─────────────────────────┬───────────────────────────────────┐│
│  │ MY WORK ITEMS           │ 🐛 #4521                          ││
│  │                         │                                   ││
│  │ ● 🐛 #4521  Fix null    │ Fix null pointer in checkout      ││
│  │   📘 #4518  Add pass    │                                   ││
│  │   📘 #4502  Implement   │ Assigned: You                     ││
│  │                         │ State: Active    Sprint: 42       ││
│  │                         │                                   ││
│  │                         │ ───────────────────────────────── ││
│  │                         │                                   ││
│  │                         │ When user clicks checkout with    ││
│  │                         │ empty cart, app crashes...        ││
│  │                         │                                   ││
│  └─────────────────────────┴───────────────────────────────────┘│
│                                                                 │
│  ☑ Create worktree    ⌘B              ⌘Enter to start task    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Layout (Prompt Mode - Project Without Work Items)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⌘N  │ Describe your task...                                   │
│      │ (supports multiline)                          ⌘Enter ⏎  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────┐ ┌─────────┐ ┌─────────────┐ ┌────────────┐            │
│  │ All │ │ webapp  │ │ local-proj  │ │ mobile-app │            │
│  │     │ │         │ │      ●      │ │            │            │
│  └─────┘ └─────────┘ └─────────────┘ └────────────┘            │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                                                             ││
│  │   No work items linked to this project.                     ││
│  │   Type a prompt above to create a task.                     ││
│  │                                                             ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ☑ Create worktree    ⌘B              ⌘Enter to start task    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Work Item Selection Flow

Two-step selection for safety:

1. **Navigate** with `↑` `↓` - details panel updates live (preview)
2. **Select** with `Enter` - confirms selection (visual: bullet + accent border)
3. **Start task** with `⌘Enter` - only works after selection

Visual difference:

```
Highlighted (arrow navigation):
┌─────────────────────────┐
│   🐛 #4521  Fix null  ← │  ← subtle highlight (light background)
│   📘 #4518  Add pass    │
└─────────────────────────┘

Selected (after Enter):
┌─────────────────────────┐
│ ● 🐛 #4521  Fix null  ← │  ← strong selection (bullet + accent border)
│   📘 #4518  Add pass    │
└─────────────────────────┘
```

### Full Keyboard Behavior

| Focus | Mode | State | Key | Action |
|-------|------|-------|-----|--------|
| **Input** | Search | - | Type | Filters work items list |
| **Input** | Search | - | `Enter` | No-op |
| **Input** | Search | - | `Tab` | Focus work items list |
| **Input** | Prompt | - | Type | Compose prompt (multiline) |
| **Input** | Prompt | - | `Enter` | Newline |
| **Input** | Prompt | - | `⌘Enter` | Start task with prompt |
| **Input** | Any | - | `⌘Tab` | Next project tile |
| **Input** | Any | - | `⌘⇧Tab` | Previous project tile |
| **Input** | Any | - | `⌘B` | Toggle worktree |
| **Input** | Any | - | `Escape` | Dismiss (preserve draft) |
| **Input** | Any | - | `⌘⇧Escape` | Dismiss (discard draft) |
| **Work items** | - | Navigating | `↑` `↓` | Navigate, details update live |
| **Work items** | - | Navigating | `Enter` | Select highlighted item |
| **Work items** | - | Navigating | Type | Jump to input, start filtering |
| **Work items** | - | Selected | `↑` `↓` | Navigate, changes selection |
| **Work items** | - | Selected | `⌘Enter` | Start task from selected work item |
| **Work items** | - | Selected | `Escape` | Deselect, clear details |
| **Work items** | - | Any | `⇧Tab` | Focus input |
| **Work items** | - | Any | `⌘Tab` | Next project tile |
| **Work items** | - | Any | `⌘⇧Tab` | Previous project tile |
| **Work items** | - | Any | `⌘B` | Toggle worktree |

### Draft Persistence

| Field | Persisted |
|-------|-----------|
| `projectId` | ✓ Selected project tile |
| `workItemId` | ✓ Selected work item |
| `prompt` | ✓ Typed text |
| `createWorktree` | ✓ Toggle state |
| `workItemsFilter` | ✓ Search text (when in search mode) |

**Behavior:**
- **Global draft** (one across the app)
- **Survives dismiss** (Escape)
- **Cleared on task creation** (⌘Enter)
- **Explicit discard** with ⌘⇧Escape
- **Visual indicator**: Dot on "+ New" button when draft exists

---

## Feature 2: ⌘P Command Palette

A Raycast-style centered overlay for searching sessions and running commands. Context-aware based on current focus.

### Layout (No Task Focused)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⌘P  │ Search...                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  RECENT SESSIONS                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ → 🔵 Add auth middleware           project-api   2m     │   │
│  │   🟡 Fix login redirect            webapp        5m     │   │
│  │   🔵 Implement audit logging       project-api   8m     │   │
│  │   ⚪ Update user model              webapp        1h     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  COMMANDS                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   New task...                                      ⌘N   │   │
│  │   Settings...                                      ⌘,   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Layout (Task Focused)

```
┌─────────────────────────────────────────────────────────────────┐
│  ⌘P  │ Search...                                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CURRENT TASK: Add auth middleware                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   View diff...                                     ⌘D   │   │
│  │   Generate summary...                                   │   │
│  │   Create PR...                                    ⌘⇧P   │   │
│  │   Commit changes...                               ⌘⇧C   │   │
│  │   Run command...                                  ⌘R    │   │
│  │   Open in VS Code                                 ⌘O    │   │
│  │   Open in terminal                                ⌘T    │   │
│  │   Interrupt agent                                 Esc   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  OTHER SESSIONS                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   🟡 Fix login redirect            webapp        5m     │   │
│  │   🔵 Implement audit logging       project-api   8m     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  COMMANDS                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   New task...                                      ⌘N   │   │
│  │   Settings...                                      ⌘,   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Keyboard Interactions

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate (sessions + commands unified) |
| `Enter` | Select |
| `Escape` | Dismiss |
| Type | Filter by session name, project name |

### Context-Aware Commands

| Context | Commands shown |
|---------|----------------|
| **No task focused** | New task, Settings |
| **Task focused** | View diff, Generate summary, Create PR, Commit, Run command, Open in VS Code, Open in terminal, Interrupt agent |
| **Task with worktree** | + Merge branch... |
| **Task with linked work item** | + View work item in Azure DevOps |
| **Task with linked PR** | + View PR, View PR in Azure DevOps |

### Status Indicators

| Icon | Meaning |
|------|---------|
| 🔵 | Agent running |
| 🟡 | Waiting for input (permission/question) |
| 🔴 | Errored |
| ⚪ | Completed / Idle |

---

## Feature 3: Session List Design

A flat list of all active sessions with project filtering. Replaces the two-level hierarchy (projects → tasks).

### Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ⌘P                                                     Usage │ ⚙️     │
├────────────────┬─────────────────────────────────────────────────────────┤
│                │                                                         │
│ All│web│api│...│  ← ⌘Tab / ⌘⇧Tab to switch filters                      │
│  ●             │                                                         │
│ ────────────── │                                                         │
│                │                                                         │
│ ┌────────────┐ │                                                         │
│ │🔵 Auth    1│ │                                                         │
│ │   api  2m ●│ │   ← selected (highlight/border)                         │
│ └────────────┘ │                                                         │
│ ┌────────────┐ │                 MAIN WORKSPACE                          │
│ │🟡 Login   2│ │                                                         │
│ │   web  5m  │ │           (Task conversation, diff, etc.)               │
│ └────────────┘ │                                                         │
│ ┌────────────┐ │                                                         │
│ │🔵 Audit   3│ │                                                         │
│ │   api  8m  │ │                                                         │
│ └────────────┘ │                                                         │
│ ┌────────────┐ │                                                         │
│ │⚪ User    4│ │                                                         │
│ │   web  1h  │ │                                                         │
│ └────────────┘ │                                                         │
│                │ ┌─────────────────────────────────────────────────────┐ │
│  + New  ●      │ │ [Input bar - full width]                    ⏎ Send │ │
│                │ └─────────────────────────────────────────────────────┘ │
└────────────────┴─────────────────────────────────────────────────────────┘
```

### Elements

| Element | Description |
|---------|-------------|
| **Project tabs** | Compact horizontal list: `All│web│api│mobile`. Filters session list. |
| **Session cards** | Minimal: status icon, name, project tag, time, number badge (1-9) |
| **Selected card** | Highlight/border treatment |
| **Input bar** | Full width, bottom of main workspace, tied to current task |
| **"+ New"** | Opens ⌘N spotlight. Shows dot when draft exists. |

### Session Card

```
┌────────────────┐
│ 🔵 Auth midw..1│  ← status + truncated name + number
│    api    2m   │  ← project tag + time
└────────────────┘
```

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `⌘1` - `⌘9` | Jump directly to session 1-9 (relative to current filter) |
| `⌘↑` / `⌘↓` | Previous / Next session |
| `⌘Tab` | Next project filter |
| `⌘⇧Tab` | Previous project filter |
| `⌘L` | Focus input bar |

### Behaviors

- **Project tabs filter** the session list (not navigate away)
- **"All"** shows all sessions across projects
- **Session numbers are relative** to current filter
- **Switching sessions** immediately shows that task in main workspace
- **Input bar context** changes with selected session

---

## Feature 4: Annotated Diff / Review Experience

### Key Insight

Agent code review pain is about **understanding changes**, not finding them.

### Approach

- **On-demand summary generation** (⌘⇧S) - only pay token cost when you need to review
- **Summary + rationale** - high-level "What I Did" + "Key Decisions"
- **Inline explanations** - 💬 gutter icons that expand to show reasoning

### Before Summary Generation (⌘D)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Auth middleware                               ⌘⇧S Generate Summary     │
├────────────────┬─────────────────────────────────────────────────────────┤
│                │                                                         │
│  FILES (4)     │  src/middleware/auth.ts                                │
│                │  ─────────────────────────────────────────────────────  │
│  ● auth.ts     │                                                         │
│    user.ts     │     + import { verify } from 'jsonwebtoken';           │
│    routes.ts   │     + import { UnauthorizedError } from '../errors';   │
│    index.ts    │                                                         │
│                │     + export async function authMiddleware(req, res) { │
│                │     +   const token = req.headers.authorization;       │
│                │     ...                                                 │
└────────────────┴─────────────────────────────────────────────────────────┘
```

### After Summary Generation (⌘⇧S)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Auth middleware                                       Summary ✓        │
├────────────────┬─────────────────────────────────────────────────────────┤
│                │ ┌─────────────────────────────────────────────────────┐ │
│  SUMMARY       │ │ ## What I Did                                      │ │
│  ──────────    │ │ Added JWT-based authentication middleware that     │ │
│  4 files       │ │ validates tokens on protected routes.              │ │
│  +127 -12      │ │                                                     │ │
│                │ │ ## Key Decisions                                   │ │
│  ────────────  │ │ - Used `jsonwebtoken` (already in dependencies)    │ │
│                │ │ - Token from Authorization header (standard)       │ │
│  FILES         │ │ - Custom UnauthorizedError for consistency         │ │
│                │ │ - Attached decoded user to req.user                │ │
│  ● auth.ts  💬 │ └─────────────────────────────────────────────────────┘ │
│    user.ts  💬 │                                                         │
│    routes.ts💬 │  src/middleware/auth.ts                                │
│    index.ts    │  ─────────────────────────────────────────────────────  │
│                │                                                         │
│                │  💬 + import { verify } from 'jsonwebtoken';           │
│                │     + import { UnauthorizedError } from '../errors';   │
│                │                                                         │
│                │  💬 + export async function authMiddleware(req, res) { │
│                │     +   const token = req.headers.authorization;       │
│                │     ...                                                 │
└────────────────┴─────────────────────────────────────────────────────────┘
```

### Clicking a 💬 Gutter Icon

```
│                │                                                         │
│                │  💬 + import { verify } from 'jsonwebtoken';           │
│                │  ┌───────────────────────────────────────────────────┐ │
│                │  │ Used jsonwebtoken because it's already in your   │ │
│                │  │ dependencies. Considered jose but would add a    │ │
│                │  │ new dependency for the same functionality.       │ │
│                │  └───────────────────────────────────────────────────┘ │
│                │     + import { UnauthorizedError } from '../errors';   │
│                │                                                         │
```

### Elements

| Element | Description |
|---------|-------------|
| **Summary panel** | Collapsible. Shows "What I Did" + "Key Decisions" |
| **File list 💬** | Badge on files that have annotations |
| **Gutter 💬 icons** | Click to expand inline explanation. Click again to collapse. |
| **Summary ✓** | Indicator that annotations are loaded |
| **Stats** | File count, lines added/removed |

### Generation Behavior

- **⌘⇧S** triggers generation of **both** summary and all inline annotations
- Single token cost - complete context for review
- Annotations are persisted (don't regenerate on revisit)
- Can regenerate if code changes after initial generation

### Keyboard Shortcuts (Diff View)

| Key | Action |
|-----|--------|
| `⌘⇧S` | Generate summary + annotations |
| `↑` / `↓` | Navigate files |
| `⌘[` / `⌘]` | Previous / Next file |
| `⌘\` | Toggle side-by-side / unified diff |

---

## Edge Cases & Error States

### ⌘N New Task Spotlight

| Scenario | Behavior |
|----------|----------|
| **No projects exist** | Show empty state: "Add a project first" with link to project setup |
| **No work items (API connected)** | Show "No work items assigned to you" with filter options |
| **No work items (API not connected)** | Show "Connect Azure DevOps to see work items" + quick prompt still works |
| **Azure DevOps API error** | Show error inline: "Couldn't load work items" with retry button |
| **Work item details fail to load** | Show partial info, "Details unavailable" in description area |
| **Starting task fails** | Toast error, keep spotlight open with draft preserved |
| **Worktree creation fails** | Toast error with reason (e.g., "uncommitted changes"), offer to create without worktree |

### ⌘P Command Palette

| Scenario | Behavior |
|----------|----------|
| **No active sessions** | "No active sessions" in sessions section, commands still available |
| **Search returns no results** | "No matching sessions or commands" |
| **Session no longer exists** | If selected, toast "Session not found", remove from list |
| **Command fails to execute** | Toast with error, palette closes |

### Session List

| Scenario | Behavior |
|----------|----------|
| **No sessions at all** | Empty state: "Start a task with ⌘N" |
| **Filter has no sessions** | "No sessions in [project]" with option to show all |
| **Session errored** | 🔴 status, click shows error details in main workspace |
| **Agent disconnected** | Show "Reconnecting..." indicator, auto-retry |
| **Session taking too long** | Show elapsed time, no timeout (user can interrupt) |

### Annotated Diff

| Scenario | Behavior |
|----------|----------|
| **No changes to show** | "No changes yet" empty state |
| **Summary generation fails** | Toast error, show "Generation failed" with retry button |
| **Partial generation** | Show what succeeded, indicate incomplete files |
| **Code changed after summary** | Show "Changes detected since summary" with regenerate option |
| **Very large diff (100+ files)** | Warn about token cost before generating, allow proceed |
| **Annotations outdated** | Visual indicator (stale badge), offer regenerate |

---

## Data Model Changes

### ⌘N New Task Spotlight - Draft Persistence

**Current:** Draft stored in Zustand per-project (`new-task-form.ts`)

**New:** Global draft (single across app)

```ts
// Current
interface NewTaskFormStore {
  drafts: Record<string, Draft>; // keyed by projectId
}

// New
interface NewTaskFormStore {
  draft: Draft | null; // single global draft
}

interface Draft {
  projectId: string | null;       // selected project (or null for "All")
  workItemId: string | null;      // selected work item
  prompt: string;                 // typed prompt text
  createWorktree: boolean;        // worktree toggle
}
```

**No database changes** - draft is ephemeral UI state.

---

### Session List - Flat View with Filters

**Current:** Tasks fetched per-project, navigation tracks per-project state

**New:** All active tasks fetched together, project becomes a filter

| Layer | Change |
|-------|--------|
| **React Query** | Add `useAllActiveTasks()` hook - fetches tasks across all projects |
| **Navigation store** | Add `projectFilter: string \| 'all'` to track selected filter |
| **Repository** | Add `getAllActiveTasks()` method |

```ts
// New navigation store state
interface NavigationStore {
  projectFilter: string | 'all';  // 'all' or projectId
  // ... existing fields
}
```

**No database schema changes** - just different query patterns.

---

### Annotated Diff - Summary & Annotations

**Current:** No persistence for summaries or annotations

**New:** Need to store generated summaries and inline annotations per task

| Change | Description |
|--------|-------------|
| **New table: `task_summaries`** | Stores generated summary + annotations |

```sql
CREATE TABLE task_summaries (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  commit_hash TEXT NOT NULL,           -- snapshot of code state
  summary TEXT NOT NULL,               -- "What I Did" + "Key Decisions" markdown
  annotations TEXT NOT NULL,           -- JSON: { filePath: { lineNumber: explanation } }
  created_at TEXT NOT NULL,

  UNIQUE(task_id, commit_hash)
);
```

**Schema changes:**
- New `task_summaries` table
- New `TaskSummaryRepository`

**React Query:**
- `useTaskSummary(taskId)` - fetches summary if exists
- `useGenerateSummary(taskId)` - mutation to generate + persist

---

### Command Palette - Context Awareness

**No data model changes** - context determined at runtime from:
- Current route (which task is focused)
- Task state (has worktree? has PR? has work item?)

---

### Summary of Data Model Changes

| Area | Schema Change | State Change |
|------|---------------|--------------|
| **New Task Draft** | None | Zustand: global draft instead of per-project |
| **Session List** | None | Zustand: add `projectFilter`. React Query: add `useAllActiveTasks()` |
| **Annotated Diff** | New `task_summaries` table | React Query: `useTaskSummary`, `useGenerateSummary` |
| **Command Palette** | None | None (runtime context) |

---

## Transition Plan

### Phase 1: Foundation (Low risk, high value)

**Goal:** Add new features without breaking existing UI

| Change | Description |
|--------|-------------|
| **⌘P Command Palette** | Add as overlay on top of existing UI. Works alongside current navigation. |
| **⌘L Focus input** | Simple shortcut, no UI changes. |
| **Keyboard shortcuts** | Add remaining shortcuts (⌘1-9, ⌘↑/↓, etc.) that work with current task list. |
| **Keyboard help (⌘/)** | Add shortcuts reference overlay. |

**Result:** Users can start using keyboard-driven workflow immediately. Old UI still works.

---

### Phase 2: Session List (Medium risk)

**Goal:** Flatten the hierarchy, introduce project filtering

| Change | Description |
|--------|-------------|
| **Replace project sidebar** | Project tiles become horizontal filter tabs at top of sidebar. |
| **Flat session list** | Show all active sessions in one list, filtered by selected project tab. |
| **Session cards** | Redesign task items as minimal cards with status, name, project, time. |
| **"All" filter** | Default view shows all sessions across projects. |

**Result:** Core navigation model changes. ⌘P + session list are now primary navigation.

---

### Phase 3: New Task Spotlight (Medium risk)

**Goal:** Replace new task form with ⌘N spotlight

| Change | Description |
|--------|-------------|
| **⌘N Spotlight overlay** | Build the full spotlight with project tiles, work items, details panel. |
| **Draft persistence** | Store draft in Zustand, show indicator on "+ New" button. |
| **Deprecate old form** | Remove `/projects/:id/tasks/new` route, redirect to ⌘N. |

**Result:** Task creation is now keyboard-driven and work-item-centric.

---

### Phase 4: Annotated Diff (Lower risk, can parallelize)

**Goal:** Add summary + annotations to diff view

| Change | Description |
|--------|-------------|
| **⌘⇧S Generate Summary** | Add button/shortcut to existing diff view. |
| **Summary panel** | Collapsible panel above diff content. |
| **Gutter icons** | Add 💬 icons with expandable explanations. |
| **Persist annotations** | Store in database, keyed by task + commit hash. |

**Result:** Code review experience significantly improved.

---

### Phase 5: Polish & Cleanup

| Change | Description |
|--------|-------------|
| **Remove legacy navigation** | Remove old project sidebar code if still present. |
| **Onboarding hints** | Add first-time user hints for key shortcuts. |
| **Settings > Shortcuts** | Add shortcuts reference page. |
| **Accessibility audit** | Ensure keyboard navigation is complete and screen-reader friendly. |

---

## Implementation: Keyboard Bindings System

A composable, layered keyboard shortcut system using React Context.

### BindingKey Type System

```ts
// Modifier keys
type CmdModifier = 'cmd';
type ShiftModifier = 'shift';
type AltModifier = 'alt';
type CtrlModifier = 'ctrl';

// Letter keys
type LetterKey = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j' | 'k' | 'l' | 'm'
               | 'n' | 'o' | 'p' | 'q' | 'r' | 's' | 't' | 'u' | 'v' | 'w' | 'x' | 'y' | 'z';

// Number keys
type NumberKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';

// Special keys
type SpecialKey =
  | 'enter'
  | 'escape'
  | 'tab'
  | 'space'
  | 'backspace'
  | 'delete'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | '['
  | ']'
  | '\\'
  | '/'
  | '.'
  | ','
  | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | 'f6' | 'f7' | 'f8' | 'f9' | 'f10' | 'f11' | 'f12';

// Base key (letter, number, or special)
type BaseKey = LetterKey | NumberKey | SpecialKey;

// Binding key combinations (order enforced: cmd > ctrl > alt > shift > base)
type BindingKey =
  | BaseKey                                              // e.g., "enter", "escape"
  | `shift+${BaseKey}`                                   // e.g., "shift+tab"
  | `alt+${BaseKey}`                                     // e.g., "alt+p"
  | `alt+shift+${BaseKey}`                               // e.g., "alt+shift+p"
  | `ctrl+${BaseKey}`                                    // e.g., "ctrl+c"
  | `ctrl+shift+${BaseKey}`                              // e.g., "ctrl+shift+c"
  | `ctrl+alt+${BaseKey}`                                // e.g., "ctrl+alt+d"
  | `ctrl+alt+shift+${BaseKey}`                          // e.g., "ctrl+alt+shift+d"
  | `cmd+${BaseKey}`                                     // e.g., "cmd+p"
  | `cmd+shift+${BaseKey}`                               // e.g., "cmd+shift+p"
  | `cmd+alt+${BaseKey}`                                 // e.g., "cmd+alt+p"
  | `cmd+alt+shift+${BaseKey}`                           // e.g., "cmd+alt+shift+p"
  | `cmd+ctrl+${BaseKey}`                                // e.g., "cmd+ctrl+p"
  | `cmd+ctrl+shift+${BaseKey}`                          // e.g., "cmd+ctrl+shift+p"
  | `cmd+ctrl+alt+${BaseKey}`                            // e.g., "cmd+ctrl+alt+p"
  | `cmd+ctrl+alt+shift+${BaseKey}`;                     // e.g., "cmd+ctrl+alt+shift+p"

// Handler returns true if event was handled (stops propagation)
type BindingHandler = (event: KeyboardEvent) => boolean | void;

// Record of bindings
type Bindings = Partial<Record<BindingKey, BindingHandler>>;
```

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  RootKeyboardBindings                                           │
│  - Single document keydown listener                             │
│  - Tracks registered binding contexts (ref: array)              │
│  - Dispatches events to contexts in reverse order (last first)  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  useKeyboardBindings('global', { ... })                   │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  useKeyboardBindings('task-focused', { ... })       │  │  │
│  │  │                                                     │  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │  │
│  │  │  │  useKeyboardBindings('diff-view', { ... })    │  │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  useKeyboardBindings('spotlight', { ... })                │  │
│  │  (mounted when spotlight is open - takes priority)        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### formatKeyboardEvent Helper

```ts
function formatKeyboardEvent(event: KeyboardEvent): BindingKey {
  const parts: string[] = [];

  // Order: cmd > ctrl > alt > shift > base
  if (event.metaKey) parts.push('cmd');
  if (event.ctrlKey) parts.push('ctrl');
  if (event.altKey) parts.push('alt');
  if (event.shiftKey) parts.push('shift');

  // Normalize key
  const key = normalizeKey(event.key);
  parts.push(key);

  return parts.join('+') as BindingKey;
}

function normalizeKey(key: string): string {
  const keyMap: Record<string, string> = {
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'Enter': 'enter',
    'Escape': 'escape',
    'Tab': 'tab',
    ' ': 'space',
    'Backspace': 'backspace',
    'Delete': 'delete',
  };
  return keyMap[key] ?? key.toLowerCase();
}
```

### RootKeyboardBindings

```tsx
interface BindingContext {
  id: string;
  bindings: React.RefObject<Bindings>;
}

interface RootKeyboardBindingsContextValue {
  register: (id: string, bindings: React.RefObject<Bindings>) => () => void;
}

export function RootKeyboardBindings({ children }: { children: React.ReactNode }) {
  const contextsRef = useRef<BindingContext[]>([]);

  const register = useCallback((id: string, bindings: React.RefObject<Bindings>) => {
    // Remove existing if re-registering
    contextsRef.current = contextsRef.current.filter(c => c.id !== id);

    // Add to end of list
    contextsRef.current.push({ id, bindings });

    // Return unsubscribe
    return () => {
      contextsRef.current = contextsRef.current.filter(c => c.id !== id);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingInInput(event) && !isGlobalShortcut(event)) return;

      const key = formatKeyboardEvent(event);

      // Loop from end (most recently registered first)
      for (let i = contextsRef.current.length - 1; i >= 0; i--) {
        const context = contextsRef.current[i];
        const handler = context.bindings.current?.[key];
        if (handler) {
          const handled = handler(event);
          if (handled !== false) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const value = useMemo(() => ({ register }), [register]);

  return (
    <RootKeyboardBindingsContext.Provider value={value}>
      {children}
    </RootKeyboardBindingsContext.Provider>
  );
}
```

### useKeyboardBindings Hook

```tsx
export function useKeyboardBindings(id: string, bindings: Bindings) {
  const root = useContext(RootKeyboardBindingsContext);
  if (!root) throw new Error('useKeyboardBindings must be inside RootKeyboardBindings');

  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    return root.register(id, bindingsRef);
  }, [id, root]);
}
```

### Usage Examples

```tsx
// Global bindings
useKeyboardBindings('global', {
  'cmd+p': () => openCommandPalette(),
  'cmd+n': () => openSpotlight(),
  'cmd+,': () => openSettings(),
  'cmd+l': () => focusInputBar(),
  'cmd+1': () => jumpToSession(0),
  'cmd+2': () => jumpToSession(1),
  'cmd+up': () => prevSession(),
  'cmd+down': () => nextSession(),
  'cmd+tab': () => nextProjectFilter(),
  'cmd+shift+tab': () => prevProjectFilter(),
});

// Task-focused bindings
useKeyboardBindings('task-focused', {
  'cmd+d': () => toggleDiffView(),
  'cmd+shift+p': () => createPR(),
  'cmd+shift+c': () => commitChanges(),
  'cmd+shift+s': () => generateSummary(),
  'cmd+r': () => runCommand(),
  'cmd+o': () => openInVSCode(),
  'cmd+.': () => openInTerminal(),
  'escape': () => interruptAgent(),
});

// Spotlight bindings (takes priority when mounted)
useKeyboardBindings('spotlight', {
  'escape': () => dismiss(),
  'cmd+shift+escape': () => discardAndDismiss(),
  'cmd+enter': () => startTask(),
  'cmd+b': () => toggleWorktree(),
  'cmd+tab': () => nextProject(),
  'cmd+shift+tab': () => prevProject(),
  'tab': () => toggleFocus(),
  'shift+tab': () => toggleFocusReverse(),
  'up': () => navigateWorkItems(-1),
  'down': () => navigateWorkItems(1),
  'enter': () => selectWorkItem(),
});
```

---

## Implementation: Command Palette System

A composable command registration system using React Context.

### Types

```ts
interface Command {
  id: string;
  label: string;                    // Display text
  shortcut?: string;                // Optional keyboard shortcut hint
  keywords?: string[];              // Additional search terms
  section?: 'current-task' | 'sessions' | 'commands'; // Grouping
  onSelect: () => void;             // Action when selected
}

interface CommandSource {
  id: string;
  commands: React.RefObject<Command[]>;
}

interface CommandPaletteContextValue {
  registerCommands: (id: string, commands: React.RefObject<Command[]>) => () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  getCommands: () => Command[];
}
```

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  RootCommandPalette                                             │
│  - Tracks registered command sources (ref: array)              │
│  - Provides API to open/close palette                           │
│  - Aggregates commands from all sources when opened             │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  useCommands('global', [...])                             │  │
│  │  [{ id: 'new-task', label: 'New task...', shortcut: '⌘N' }]│  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  useCommands('task-focused', [...])                       │  │
│  │  [{ id: 'view-diff', label: 'View diff', shortcut: '⌘D' }]│  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  useCommands('worktree-commands', [...])                  │  │
│  │  [{ id: 'merge-branch', label: 'Merge branch...' }]       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### RootCommandPalette

```tsx
const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function RootCommandPalette({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const sourcesRef = useRef<CommandSource[]>([]);

  const registerCommands = useCallback((id: string, commands: React.RefObject<Command[]>) => {
    sourcesRef.current = sourcesRef.current.filter(s => s.id !== id);
    sourcesRef.current.push({ id, commands });

    // Return unsubscribe function
    return () => {
      sourcesRef.current = sourcesRef.current.filter(s => s.id !== id);
    };
  }, []);

  const getCommands = useCallback(() => {
    return sourcesRef.current.flatMap(source => source.commands.current ?? []);
  }, []);

  const value = useMemo(() => ({
    registerCommands,
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    getCommands,
  }), [registerCommands, isOpen, getCommands]);

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {isOpen && <CommandPaletteOverlay />}
    </CommandPaletteContext.Provider>
  );
}
```

### useCommands Hook

```tsx
export function useCommands(id: string, commands: Command[]) {
  const palette = useContext(CommandPaletteContext);
  if (!palette) throw new Error('useCommands must be inside RootCommandPalette');

  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  useEffect(() => {
    return palette.registerCommands(id, commandsRef);
  }, [id, palette]);
}

export function useCommandPalette() {
  const palette = useContext(CommandPaletteContext);
  if (!palette) throw new Error('useCommandPalette must be inside RootCommandPalette');
  return palette;
}
```

### Usage Examples

```tsx
// App root
function App() {
  return (
    <RootKeyboardBindings>
      <RootCommandPalette>
        <GlobalCommands />
        <MainLayout />
      </RootCommandPalette>
    </RootKeyboardBindings>
  );
}

// Global commands (always registered)
function GlobalCommands() {
  const { open: openSpotlight } = useSpotlight();
  const navigate = useNavigate();

  useCommands('global', [
    {
      id: 'new-task',
      label: 'New task...',
      shortcut: 'cmd+n',
      section: 'commands',
      keywords: ['create', 'add', 'start'],
      onSelect: openSpotlight,
    },
    {
      id: 'settings',
      label: 'Settings...',
      shortcut: 'cmd+,',
      section: 'commands',
      keywords: ['preferences', 'config'],
      onSelect: () => navigate('/settings'),
    },
  ]);

  return null;
}

// Task view - context-aware commands
function TaskView({ task }: { task: Task }) {
  const commands: Command[] = [
    {
      id: 'view-diff',
      label: 'View diff',
      shortcut: 'cmd+d',
      section: 'current-task',
      onSelect: () => toggleDiffView(),
    },
    {
      id: 'create-pr',
      label: 'Create PR...',
      shortcut: 'cmd+shift+p',
      section: 'current-task',
      onSelect: () => openCreatePRDialog(),
    },
  ];

  // Add worktree-specific commands
  if (task.worktreePath) {
    commands.push({
      id: 'merge-branch',
      label: 'Merge branch...',
      section: 'current-task',
      onSelect: () => openMergeDialog(),
    });
  }

  // Add work item commands
  if (task.workItemId) {
    commands.push({
      id: 'view-work-item',
      label: 'View work item in Azure DevOps',
      section: 'current-task',
      onSelect: () => openWorkItemInBrowser(task.workItemId),
    });
  }

  useCommands('task-focused', commands);

  return <div>...</div>;
}
```

---

## Open Questions

- None currently
