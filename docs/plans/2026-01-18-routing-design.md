# Routing Design

TanStack Router for type-safe, fully-nested routing in the Electron app.

## Route Tree

```
/                                           → Redirect to last-used project
/projects/:projectId                        → Project view (layout)
/projects/:projectId/tasks/:taskId          → Task panel (nested)
/projects/:projectId/tasks/:taskId/chat     → Chat tab (default)
/projects/:projectId/tasks/:taskId/diff     → Git diff tab
/settings                                   → Settings page
```

## Layout Hierarchy

```
RootLayout (Header + MainSidebar)
├── ProjectLayout (ProjectSidebar)
│   ├── EmptyState (no task selected)
│   └── TaskPanel (TabBar)
│       ├── ChatTab
│       └── DiffTab
└── SettingsPage
```

Each layout renders an `<Outlet />` for its children.

## Route Files

```
src/routes/
├── __root.tsx              → RootLayout
├── index.tsx               → Redirect to last project
├── settings.tsx            → SettingsPage
└── projects/
    └── $projectId.tsx      → ProjectLayout
        └── tasks/
            └── $taskId.tsx → TaskPanel
                ├── chat.tsx → ChatTab
                └── diff.tsx → DiffTab
```

## Key Behaviors

- `/projects/:projectId` shows task list; no task selected by default
- `/projects/:projectId/tasks/:taskId` defaults to `/chat` tab
- Back/forward navigation works across projects, tasks, and tabs
- Loaders fetch project/task data before render (no loading spinners mid-nav)

## Navigation Patterns

### Programmatic

```tsx
const navigate = useNavigate();

navigate({ to: '/projects/$projectId', params: { projectId } });
navigate({
  to: '/projects/$projectId/tasks/$taskId/chat',
  params: { projectId, taskId },
});
navigate({ to: '/settings' });
```

### Link Components

```tsx
<Link to="/projects/$projectId" params={{ projectId }}>
  Project
</Link>

<Link to="/projects/$projectId/tasks/$taskId/chat" params={{ projectId, taskId }}>
  Chat
</Link>
```

### Active State

TanStack Router adds `data-status="active"` to `<Link>` when matched. Use for highlighting current project/task/tab.

## Dependencies

- `@tanstack/react-router` (~15KB)
- File-based routing via `@tanstack/router-plugin` (Vite plugin)
