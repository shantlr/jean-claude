# Settings Modal Overlay Design

## Problem

Three separate settings entry points create confusion:
1. Header gear icon → global settings page (`/settings/*`)
2. Sidebar footer "Project Settings" → project details page (`/projects/:id/details`)
3. Task page gear icon → task right-pane overlay

Goal: consolidate global and project settings into a single modal overlay, accessed from one button.

## Design

### Entry Point

Single settings button in the sidebar footer. Uses a distinct icon (`SlidersHorizontal` from lucide-react) to differentiate from the task settings gear. Replaces the current "Project Settings" link and its divider.

### Modal Overlay

Large centered modal (~80% viewport) with dimmed backdrop. Registered in the `overlays` Zustand store as `'settings'`. No route change — URL stays on whatever the user was viewing.

**Dismiss:** Back arrow click, Escape key, or backdrop click. All return to the previous view.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  ←   [ Global ]  [ Project: MyApp ]                     │
│─────────────────────────────────────────────────────────│
│ ┌──────────────┐ ┌────────────────────────────────────┐ │
│ │ Menu items   │ │                                    │ │
│ │ for active   │ │   Content area (scrollable)        │ │
│ │ tab          │ │                                    │ │
│ │              │ │                                    │ │
│ └──────────────┘ └────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

**Top bar:** Back arrow (←) on the left, tab buttons next to it. No close ✕ button — back arrow serves as the sole close action.

**Two tabs:**
- **Global** — always visible
- **Project: {name}** — only visible when a project is currently selected

**Left sidebar menu** changes based on active tab. **Right content area** renders the selected menu item's content.

### Menu Items

**Global tab:**
| Menu Item    | Content (reused from)             |
|-------------|-----------------------------------|
| General      | `/settings/general` components    |
| MCP Servers  | `/settings/mcp-servers` components|
| Tokens       | `/settings/tokens` components     |
| Azure DevOps | `/settings/azure-devops` components|
| Autocomplete | `/settings/autocomplete` components|
| Debug        | `/settings/debug` components      |

**Project tab:**
| Menu Item      | Content (reused from)                        |
|---------------|----------------------------------------------|
| Details        | Project name, path, color, default branch, default backend |
| Integrations   | Repository linking, work items linking        |
| Run Commands   | Shell command config, port monitoring         |
| MCP Overrides  | Per-project MCP template overrides            |
| Danger Zone    | Delete project                                |

### State Management

- **Overlay open/close:** `overlays` Zustand store, new type `'settings'`
- **Active tab + menu item:** Local component state (resets on close/reopen)
- **Default on open:** Global tab → General menu item

### Task Settings — Unchanged

The task settings right-pane (gear icon on task page showing allowed tools, skills, source branch) stays exactly as-is. It remains a per-task in-context panel, not part of the settings modal.

## What Gets Removed

- Header settings gear icon (`src/layout/ui-header/`)
- Sidebar footer "Project Settings" link + divider (`src/features/task/ui-task-list/`)
- All `/settings/*` routes (6 route files + layout)
- `/projects/:projectId/details` route
- Settings-related entries from the `tabs` array in the settings layout

## What Gets Added

- `'settings'` overlay type in `overlays` store
- Settings modal overlay component (`src/features/settings/ui-settings-overlay/`)
- Settings sidebar + content panel components
- `SlidersHorizontal` icon button in sidebar footer
- Keyboard shortcut registration for opening settings (optional, future)

## What Gets Refactored

Settings content components move from route-page wrappers into standalone panels that can be rendered inside the modal. The actual forms/inputs/logic stay the same — only the hosting container changes.
