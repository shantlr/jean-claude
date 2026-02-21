# Work Items: Iteration Filter + Board View Toggle

## Problem

The new task overlay's work items panel has two gaps:

1. No iteration/sprint filtering. All work items are returned regardless of sprint, making it hard to focus on current work.
2. Only a list view. No way to see items organized by state (kanban-style), which is how most teams think about their boards.

## Design

### Iteration Filter

#### Backend: New `getIterations` endpoint

Call `GET https://dev.azure.com/{org}/{project}/_apis/work/teamsettings/iterations?api-version=7.0` to fetch the team's iterations.

Returns:

```ts
interface AzureDevOpsIteration {
  id: string;
  name: string;        // e.g., "Sprint 42"
  path: string;        // e.g., "Project\\Sprint 42"
  startDate: string | null;
  finishDate: string | null;
  isCurrent: boolean;  // Computed: today is within [startDate, finishDate]
}
```

`isCurrent` is computed server-side by checking if today falls within the iteration's date range.

> Note: The WIQL `@CurrentIteration` macro only works from the Azure DevOps web portal, not REST API calls. We must resolve the current iteration ourselves via the Iterations API.

#### Backend: WIQL change

Add optional `iterationPath` to `queryWorkItems` filters. When present, adds:

```sql
AND [System.IterationPath] = '{iterationPath}'
```

Also fetch `System.IterationPath` as a field on work items (for potential future use).

#### Hook: `useIterations`

```ts
useIterations({ providerId, projectName }) => AzureDevOpsIteration[]
```

Enabled when both params are truthy. `staleTime: 5 * 60_000` (iterations change infrequently).

#### UI: Iteration dropdown

A `<Select>` component in the `SearchModeContent` header bar, between the "Work Items (N)" label and the view toggle.

Options:

- **All Iterations** (no filter)
- Each iteration from the API, most recent first
- Default selection: the iteration where `isCurrent === true`

The selected iteration's `path` is passed as `iterationPath` to `useWorkItems`.

### Board View

#### New component: `ui-work-item-board`

Path: `src/features/new-task/ui-work-item-board/index.tsx`

A horizontal kanban board where:

- **Columns** = distinct work item states present in the filtered data, ordered by `STATUS_PRIORITY`
- Column header: state name + item count
- **Cards** show: checkbox, type icon, `#id`, title (2-line truncation), assignee avatar
- Clicking a card highlights it (for details panel) and toggles selection
- Highlighted card gets a visible ring/border
- Board scrolls horizontally if columns overflow
- Cards have `data-work-item-id` attributes (same as list) so keyboard navigation works

Props match `WorkItemList`: `workItems`, `highlightedWorkItemId`, `selectedWorkItemIds`, `providerId`, `onToggleSelect`, `onHighlight`.

### View Toggle

A segmented control in the `SearchModeContent` header, between the iteration dropdown and the "Next" button.

Two options:

- **List** (icon: `List`)
- **Board** (icon: `Columns3`)

Stored in `NewTaskDraft` as `workItemsViewMode: 'list' | 'board'`, default `'list'`.

Both views receive the same `filteredWorkItems`, selection state, and callbacks. Only the visual layout differs.

### Header Layout

```
WORK ITEMS (42)  2 selected  │  [Iteration ▾]  │  [☰│☷]  │  [Next ▸ Cmd+Enter]
```

### Data Flow

```
Iterations API ──> useIterations() ──> Iteration Dropdown
                                              |
                                        iterationPath
                                              |
                                              v
queryWorkItems(filters: { iterationPath }) ──> useWorkItems() ──> Fuse.js filter
                                                                       |
                                                              filteredWorkItems
                                                                       |
                                              +------------------------+
                                              v                        v
                                    WorkItemList            WorkItemBoard
                                    (existing)              (new component)
                                              |                        |
                                              +--------+---------------+
                                                       v
                                              WorkItemDetails (right panel)
```

### What Stays the Same

- Work item details panel (right side)
- Selection model (multi-select with checkboxes)
- Keyboard navigation (up/down/enter)
- Fuzzy search with Fuse.js
- Parent-child grouping in list view
- Compose step flow after selection
- All existing keyboard shortcuts
