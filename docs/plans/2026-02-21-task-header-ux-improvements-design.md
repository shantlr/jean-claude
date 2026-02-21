# Task Header UX Improvements — Design

## Problem

The task header currently uses two rows and displays up to 10+ elements when a worktree task has PR, work items, and an active session. It feels crowded, and many elements are rarely needed at a glance.

## Goals

- Reduce visual clutter by collapsing to a single header row
- Keep essential information visible (title, branch, PR, work items, run control)
- Move secondary actions and info into an overflow menu
- Relocate context usage to where it's most relevant (message input area)

## Design

### Header Layout — Single Row (~44px)

```
┌──────────────────────────────────────────────────────────────┐
│  Task Title ─────  🌿 branch  PR #42 ↗  #1234  │  ▶ Run │ ⋯│
└──────────────────────────────────────────────────────────────┘
```

#### Left Zone (flex-1, overflow hidden)

- **Task title** — `text-sm font-medium`, truncated with ellipsis

#### Center Zone (flex, shrink, gap-2)

All conditional — only rendered when data exists:

- **Branch chip** — `GitBranch` icon + branch name, `text-xs`, max-width truncated. Shown when `task.worktreePath || task.branchName` exists. Styled as subtle chip (neutral-800 bg, rounded).
- **PR badge** — `PR #42` with external link icon. Shown when `pullRequestId && pullRequestUrl`.
- **Work item badges** — `#1234` styled as clickable chips. Shown when work items are linked.

#### Right Zone (flex, shrink-0, gap-2)

- **Run/Stop button** — green play (idle) / red stop (running). Same as current.
- **Overflow menu** (`⋯`) — `MoreHorizontal` icon button.

For a simple non-worktree task, the header collapses to just:

```
┌──────────────────────────────────────┐
│  Task Title ────────  │ ▶ Run  │  ⋯  │
└──────────────────────────────────────┘
```

### Items Removed from Header

| Item | Reason |
|------|--------|
| Status indicator dot | Redundant — Run/Stop button already communicates state |
| Pending message input | Already present in message stream |
| Open in Editor button | Moved to overflow menu |
| Delete button | Moved to overflow menu |
| Settings toggle | Moved to overflow menu |
| Files toggle | Moved to overflow menu |
| Diff toggle | Moved to overflow menu |
| Model label | Moved to overflow menu |
| Session ID | Moved to overflow menu |
| Entire second row | Eliminated |

### Overflow Menu

Opened via `⋯` button or `Cmd+M` keyboard shortcut (registered via `useCommands` so it also appears in command palette).

Uses existing `<Dropdown>` + `<DropdownItem>` from `src/common/ui/dropdown/`.

```
┌──────────────────────────────┐
│ ✓ Files                      │  ← toggle, checkmark when active
│   Diff                       │  ← toggle, only if worktree
│ ──────────────────────────── │
│ ↗ Open in VS Code            │  ← action, editor name dynamic
│ ⚙ Task Settings              │  ← toggle, checkmark when active
│ 🗑 Delete Task                │  ← variant="danger", hidden while running
│ ──────────────────────────── │
│ Model   claude-sonnet-4      │  ← read-only info
│ Session a3f8c2d1  📋         │  ← click to copy
└──────────────────────────────┘
```

**Group 1 — View toggles:**
- **Files** — toggles file tree pane. Checkmark when active.
- **Diff** — toggles diff view. Only if `task.worktreePath`. Checkmark when active.

**Group 2 — Actions:**
- **Open in {editor}** — opens worktree/project in configured editor. Icon: `ExternalLink`.
- **Task Settings** — toggles settings pane. Checkmark when active.
- **Delete Task** — destructive. `variant="danger"`. Hidden when task is running.

**Group 3 — Info** (only shown when session data exists):
- **Model** — label + value pair, read-only, dimmed styling.
- **Session** — label + truncated ID (first 8 chars). Click to copy with visual feedback.

Menu closes on any action click. Copy action shows ✓ feedback before closing (500ms delay).

### Context Usage — Relocated to Message Input Area

Context usage display moves from the header to the message input/footer area at the bottom of the task view. This is where it's most relevant — when composing a message, you want to know how much context remains.

```
┌───────────────────────────────────────────────────────┐
│  ◔ 45% (1250)  │  Type your message...             ⏎  │
└───────────────────────────────────────────────────────┘
```

Same visual treatment as today (pie chart + percentage + token count, color-coded).

## Component Changes

### Extend `<Dropdown>` (`src/common/ui/dropdown/`)

1. **`DropdownDivider`** — new sub-component, renders a styled `<hr>` separator between groups.
2. **`checked` prop on `DropdownItem`** — optional boolean, renders a checkmark icon on the left when true (for toggle items like Files/Diff/Settings).
3. **`DropdownInfo`** — new sub-component for non-interactive info rows (Model, Session). Supports a `copyValue` prop for copy-to-clipboard behavior.

### New Keyboard Binding

Register `Cmd+M` via `useCommands` in the task panel to open/close the overflow menu. Label: "Task Menu". Section: "Task".

### Move `<ContextUsageDisplay>`

Relocate from task header to the message input footer component.

## Keyboard Shortcut Summary

| Shortcut | Action |
|----------|--------|
| `Cmd+M` | Open task overflow menu |

(Existing shortcuts unchanged: `Cmd+P` palette, `Cmd+,` settings, `Cmd+N` new task, etc.)
