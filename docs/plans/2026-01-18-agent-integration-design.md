# Phase 2.3: Agent Integration Design

Claude Agent SDK integration for task execution with real-time streaming, permissions, and notifications.

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Process                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │ AgentService │───▶│ IPC Emitter  │───▶│ webContents.send │  │
│  │  (SDK call)  │    │              │    │                  │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│         ▲                                         │              │
│         │                                         ▼              │
│  ┌──────────────┐                        ┌──────────────────┐  │
│  │   TaskRepo   │                        │    Renderer      │  │
│  │ (status,     │                        │                  │  │
│  │  sessionId)  │                        │  useAgentStream  │  │
│  └──────────────┘                        │  hook listens    │  │
│                                          └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

- AgentService spawns SDK session, streams messages
- Messages forwarded to renderer via IPC events
- Task status + sessionId persisted to SQLite for resume
- Renderer accumulates messages in React state (not persisted)

## IPC Channels

### Events (Main → Renderer)

| Channel            | Payload                                  | When                                               |
| ------------------ | ---------------------------------------- | -------------------------------------------------- |
| `agent:message`    | `{ taskId, message: SDKMessage }`        | Each streamed message from SDK                     |
| `agent:status`     | `{ taskId, status, error? }`             | Status changes (running/waiting/completed/errored) |
| `agent:permission` | `{ taskId, toolName, input, requestId }` | Tool needs approval                                |
| `agent:question`   | `{ taskId, questions, requestId }`       | AskUserQuestion triggered                          |

### Invoke (Renderer → Main)

| Channel             | Params                            | Returns | Purpose                       |
| ------------------- | --------------------------------- | ------- | ----------------------------- |
| `agent:start`       | `{ taskId }`                      | `void`  | Start agent for task          |
| `agent:stop`        | `{ taskId }`                      | `void`  | Interrupt running agent       |
| `agent:respond`     | `{ taskId, requestId, response }` | `void`  | Answer permission or question |
| `agent:sendMessage` | `{ taskId, message }`             | `void`  | Send follow-up prompt         |

## Agent Service

**Location:** `electron/services/agent-service.ts`

```typescript
interface ActiveSession {
  taskId: string;
  sessionId: string | null;
  abortController: AbortController;
  pendingRequests: Array<{
    requestId: string;
    resolve: (response: PermissionResponse) => void;
    request: PermissionRequest;
  }>;
}
```

### Permission/Question Flow

1. SDK calls `canUseTool` callback
2. Service queues request with unique `requestId`
3. If first in queue, emit `agent:permission` or `agent:question` to renderer
4. User responds in UI, renderer calls `agent:respond`
5. Service resolves pending Promise, emits next request if queued
6. SDK continues

### Session Lifecycle

- On start: create AbortController, call `query()`, store session
- On `init` message: capture `sessionId`, persist to task in DB
- On `result` message: update task status to completed, cleanup
- On error: update task status to errored, cleanup
- On stop: call `abortController.abort()`, cleanup

## Task Panel Layout

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Task Header: [Task Name]                            [Status] [StopBtn] │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────┬───────────────────────────────────┐ │
│ │                                 │                                   │ │
│ │        Message Stream           │       File Preview Pane           │ │
│ │                                 │       (slide-out, optional)       │ │
│ │  - Assistant messages           │                                   │ │
│ │  - Tool calls + results         │       Shows when file path        │ │
│ │  - User messages                │       is clicked                  │ │
│ │                                 │                                   │ │
│ └─────────────────────────────────┴───────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────┤
│ [Permission Bar - shows when waiting for approval]                      │
│  "Bash: rm -rf /tmp/test"                        [Deny] [Allow]        │
├─────────────────────────────────────────────────────────────────────────┤
│ [Question Options - shows when AskUserQuestion is pending]              │
│  ○ Option A   ○ Option B   ○ Option C   ○ Other                        │
├─────────────────────────────────────────────────────────────────────────┤
│ [Input Box]                                              [Send Button] │
│  Type a message... (Shift+Enter for newline)                           │
└─────────────────────────────────────────────────────────────────────────┘
```

## Message Rendering

### SDK Message Types

| Type        | Subtype | Rendering                              |
| ----------- | ------- | -------------------------------------- |
| `system`    | `init`  | Nothing (internal, captures sessionId) |
| `assistant` | -       | Claude's response with content blocks  |
| `user`      | -       | User messages (for replay/display)     |
| `result`    | -       | Final result with cost/usage summary   |

### Content Blocks

| Block type    | Rendering                                  |
| ------------- | ------------------------------------------ |
| `text`        | Markdown with syntax highlighting          |
| `tool_use`    | Collapsible card showing tool name + input |
| `tool_result` | Tool output (code blocks, text, errors)    |

### Libraries

- `react-markdown` - Markdown parsing
- `shiki` - Syntax highlighting
- `remark-gfm` - GitHub Flavored Markdown

### File Path Detection

- Pattern: `[\w\-./]+\.(ts|tsx|js|jsx|py|go|rs|md|json|yaml|yml|toml|sql|sh|css|html)+(:\d+(-\d+)?)?`
- Clickable, opens file preview pane
- Example: `src/lib/api.ts:42-50` → opens preview at line 42

## File Preview Pane

- Hidden by default
- Opens when user clicks a file path
- Shows syntax-highlighted content with line numbers
- Highlights specified line range
- Header: file path + close button + "Open in editor" button

### IPC

| Channel      | Params                  | Returns                 |
| ------------ | ----------------------- | ----------------------- |
| `files:read` | `{ path, projectPath }` | `{ content, language }` |

## Notifications

| Event              | Notification            |
| ------------------ | ----------------------- |
| Permission request | "Task X needs approval" |
| AskUserQuestion    | "Task X has a question" |
| Task completed     | "Task X completed"      |
| Task errored       | "Task X failed"         |

- Only notify when app window is not focused
- Click focuses app and navigates to task

## File Structure

### New Files

```
electron/
  services/
    agent-service.ts        # SDK integration, session management
    notification-service.ts # Desktop notifications

src/
  components/
    agent/
      message-stream.tsx    # Scrollable message list
      agent-message.tsx     # Routes message type to renderer
      markdown-content.tsx  # Markdown + syntax highlighting
      tool-use-card.tsx     # Collapsible tool call display
      tool-result-card.tsx  # Tool output display
      permission-bar.tsx    # Tool approval UI
      question-options.tsx  # AskUserQuestion UI
      message-input.tsx     # Adaptive input box
      file-preview-pane.tsx # Slide-out file viewer

  hooks/
    use-agent-stream.ts     # Subscribe to agent IPC events
    use-agent-controls.ts   # Start/stop/respond actions
```

### Modified Files

```
electron/
  preload.ts               # Add agent IPC bridge
  ipc/handlers.ts          # Add agent handlers

src/
  lib/api.ts               # Add agent API types
  routes/
    projects/$projectId/
      tasks/$taskId.tsx    # Replace placeholder with full UI
```

### Dependencies

```
@anthropic-ai/claude-agent-sdk
react-markdown
remark-gfm
shiki
```

## Implementation Order

1. Agent Service skeleton - Basic start/stop, IPC event emission
2. IPC bridge - Preload + handlers + API types
3. useAgentStream hook - Subscribe to events, accumulate messages
4. Basic message rendering - Text only, no markdown yet
5. Task panel integration - Wire up start button, show messages
6. Permission flow - PermissionBar + respond IPC
7. Question flow - QuestionOptions + respond IPC
8. Rich markdown rendering - Add react-markdown + shiki
9. File preview pane - Click file paths, slide-out panel
10. Notifications - Desktop notifications on status changes
11. Stop button - Interrupt running sessions
