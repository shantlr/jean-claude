# Phase 0: SDK Prototype Design

De-risk Agent SDK integration before building UI.

## Authentication

The app assumes the user is already signed into Claude Code CLI with an active subscription. No API key management needed—the SDK inherits the CLI's authentication.

## Installation

```bash
npm install @anthropic-ai/claude-code
```

## SDK Capabilities

### Spawning Sessions

Two APIs available:

- `query()` — One-shot tasks, new session each call
- Streaming input mode — Stateful conversations via async generator

For our use case (long-running tasks with follow-ups), we'll use streaming input mode.

```typescript
import { query } from '@anthropic-ai/claude-code';

const session = query({
  prompt: 'Fix the bug in auth.ts',
  options: {
    allowedTools: ['Read', 'Edit', 'Bash'],
    cwd: '/path/to/project',
  },
});

for await (const message of session) {
  // Handle structured events
}
```

### Streaming Output (Structured Events)

The SDK yields typed `SDKMessage` objects:

| Type                       | Purpose                                 |
| -------------------------- | --------------------------------------- |
| `system` (subtype: `init`) | Contains `session_id` for resume        |
| `assistant`                | Claude's response with content blocks   |
| `user`                     | User input (for replay)                 |
| `result`                   | Final result with cost, usage, duration |

Capture session ID on init:

```typescript
if (message.type === 'system' && message.subtype === 'init') {
  sessionId = message.session_id;
}
```

### Permission Request Handling

The `canUseTool` callback intercepts tool execution:

```typescript
const session = query({
  prompt: 'Edit the config file',
  options: {
    canUseTool: async (toolName, input) => {
      // Surface to UI for approval
      const approved = await showPermissionDialog(toolName, input);

      if (approved) {
        return { behavior: 'allow', updatedInput: input };
      } else {
        return { behavior: 'deny', message: 'User declined' };
      }
    },
  },
});
```

**Constraint:** Callback must respond within 60 seconds.

### Responding to Agent Questions

Claude asks questions via `AskUserQuestion` tool, which triggers `canUseTool`:

```typescript
canUseTool: async (toolName, input) => {
  if (toolName === 'AskUserQuestion') {
    // input.questions contains the question structure
    const answers = await showQuestionDialog(input.questions);

    return {
      behavior: 'allow',
      updatedInput: { questions: input.questions, answers },
    };
  }
  // ... handle other tools
};
```

Question structure:

```typescript
{
  questions: [
    {
      question: 'Which approach should I use?',
      header: 'Approach',
      options: [
        { label: 'Option A', description: '...' },
        { label: 'Option B', description: '...' },
      ],
      multiSelect: false,
    },
  ];
}
```

### Stopping Sessions

Interrupt a running session:

```typescript
await session.interrupt();
```

Works only in streaming mode.

### Resuming Sessions

Pass the captured `session_id` to resume:

```typescript
const resumed = query({
  prompt: 'Now refactor the tests',
  options: {
    resume: sessionId,
    allowedTools: ['Read', 'Edit', 'Bash'],
  },
});
```

Optional: `forkSession: true` creates a branch without modifying original session.

## Data Model Implications

| Our App Stores                       | SDK Stores              |
| ------------------------------------ | ----------------------- |
| Task metadata (name, prompt, status) | Full message history    |
| `sessionId` reference                | Session state & context |
| `worktreePath`, `startCommitHash`    | Tool execution logs     |

We only need to persist the `sessionId`—the SDK handles conversation history server-side.

## Limitations

1. **60-second timeout** on permission callbacks
2. **AskUserQuestion** not available in subagents
3. **Streaming mode required** for interrupts and hooks
4. **1-4 questions** per AskUserQuestion call, 2-4 options each

## Prototype Validation Checklist

- [ ] Spawn agent session with `query()`
- [ ] Stream and parse all message types
- [ ] Capture `session_id` from init message
- [ ] Handle permission request via `canUseTool`
- [ ] Handle agent question via `AskUserQuestion`
- [ ] Interrupt a running session
- [ ] Resume session with captured ID
- [ ] Verify CLI subscription auth works (no API key needed)
