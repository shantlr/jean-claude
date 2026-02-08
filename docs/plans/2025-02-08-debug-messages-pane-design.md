# Debug Messages Pane Design

## Problem

When debugging message normalization issues, there's no easy way to inspect the raw SDK messages stored in the `raw_messages` table. Developers need to query the database manually to compare raw input with normalized output.

## Solution

Add a debug pane accessible from Task Settings that displays the raw `raw_messages` DB rows for a task, with an interactive collapsible JSON tree for inspecting deeply nested message data.

## Design

### Toggle in Task Settings

A "Debug: Raw Messages" button at the bottom of the existing `TaskSettingsPane`. Clicking it switches the right pane to a new `debugMessages` mode.

### Debug Messages Pane

A new right-pane component that:

1. Fetches all `raw_messages` rows for the task via a new IPC endpoint
2. Displays each row as a card with header metadata (messageIndex, rawFormat, backendSessionId, timestamp)
3. Renders the parsed `rawData` JSON as an interactive collapsible tree

### Data Flow

```
TaskSettingsPane button click
  → navigation store: rightPane = { type: 'debugMessages' }
  → TaskPanel renders DebugMessagesPane
  → useRawMessages(taskId) hook
  → api.agent.getRawMessages(taskId)
  → IPC handler → RawMessageRepository.findByTaskId(taskId)
  → returns rows with rawData parsed from JSON string to object
```

## Implementation Steps

### 1. Backend: New IPC endpoint

- Add `getRawMessages(taskId)` to `agent-service.ts` — calls `RawMessageRepository.findByTaskId(taskId)`, parses `rawData` from JSON string to object
- Add `GET_RAW_MESSAGES` channel constant
- Add IPC handler in `handlers.ts`
- Add `getRawMessages` to preload bridge and `api.ts`

### 2. Navigation store update

- Add `{ type: 'debugMessages' }` variant to `RightPane` union in `navigation.ts`
- Add `openDebugMessages()` helper to `useTaskState`

### 3. Toggle in TaskSettingsPane

- Add a "Debug: Raw Messages" button at bottom of settings pane
- Clicking calls `openDebugMessages()`

### 4. New DebugMessagesPane component

- Location: `src/features/task/ui-debug-messages-pane/`
- React Query hook: `useRawMessages(taskId)`
- Each raw message rendered as a card:
  - Header: messageIndex, rawFormat, backendSessionId (truncated), timestamp
  - Body: Collapsible JSON tree (custom recursive component, no external deps)
- Collapsible tree supports expand/collapse at any level

### 5. Wire into TaskPanel

- Handle `rightPane.type === 'debugMessages'` in `ui-task-panel` to render `DebugMessagesPane`
