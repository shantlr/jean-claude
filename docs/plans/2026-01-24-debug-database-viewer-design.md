# Debug Database Viewer Design

## Overview

Add a debug menu in settings that shows database tables and rows. A toggle at the top of settings switches between the normal Settings view and a Debug view with a generic, extensible table browser.

## UI Structure

```
┌─────────────────────────────────────────────────┐
│  [Settings]  [Debug]           ← toggle buttons │
├─────────────────────────────────────────────────┤
│                                                 │
│  (Settings view OR Debug view based on toggle)  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Debug View

```
┌─────────────────────────────────────────────────┐
│  [providers] [projects] [tasks] [agent_messages] [settings]  │
├─────────────────────────────────────────────────┤
│  🔍 [Search across all columns...        ]      │
├─────────────────────────────────────────────────┤
│  id          │ name      │ path     │ type │... │
├──────────────┼───────────┼──────────┼──────┼────┤
│  abc-123     │ My Proj   │ /Users/..│ local│    │
│  def-456     │ Other     │ /home/...│ git  │    │
├─────────────────────────────────────────────────┤
│  Showing 1-20 of 45 rows    [← Prev] [Next →]   │
└─────────────────────────────────────────────────┘
```

- Column headers derived dynamically from table schema
- Search filters rows where any column contains the search text
- Pagination fetches 20 rows at a time (offset-based)
- Cell values truncated with ellipsis, tooltip on hover for full value

## Backend API

### IPC Method

```ts
api.debug.queryTable({
  table: 'projects',      // table name
  search?: 'my-proj',     // optional search string
  limit: 20,              // rows per page
  offset: 0               // for pagination
})
```

### Response

```ts
{
  columns: ['id', 'name', 'path', 'type', ...],  // column names
  rows: [{ id: '...', name: '...', ... }, ...],  // row data
  total: 45                                       // total count for pagination
}
```

### Backend Logic

1. Validate table name against whitelist (providers, projects, tasks, agent_messages, settings)
2. Use Kysely to query table dynamically
3. Apply LIKE search across all text columns if search provided
4. Return column names, paginated rows, and total count

## File Changes

### New Files

- `electron/database/repositories/debug.ts` - Generic table query logic
- `src/features/settings/ui-debug-database/index.tsx` - Debug view component
- `src/hooks/use-debug.ts` - React Query hook for table queries

### Modified Files

- `electron/ipc/handlers.ts` - Add `debug.queryTable` handler
- `electron/preload.ts` - Expose `debug.queryTable` to renderer
- `src/lib/api.ts` - Add typed `api.debug.queryTable` method
- `src/routes/settings.tsx` - Add toggle and conditionally render debug view

## No Migrations Needed

This feature only reads existing tables.
