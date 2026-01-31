# SSH Host Authenticity Prompt Design

## Problem

When cloning an Azure DevOps repository via SSH for the first time, Git prompts the user to verify the host's authenticity:

```
The authenticity of host 'ssh.dev.azure.com' can't be established.
RSA key fingerprint is SHA256:ohD8VZEXGWo6Ez8GSEJQ9modSeoCAN5+yExlNHeji/E.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Currently, `cloneRepository()` in `azure-devops-service.ts` sets stdin to `'ignore'`, so Git hangs indefinitely waiting for input that never comes.

## Solution

Build a **generic global prompt system** that allows the main process to ask the user confirmation questions. This system is independent of the agent's permission system (which has task-specific needs).

### Global Prompt System

**Type definitions** (`shared/global-prompt-types.ts`):

```typescript
export interface GlobalPrompt {
  id: string;              // Unique identifier to match response
  title: string;           // e.g., "Unknown SSH Host"
  message: string;         // Main message to display
  details?: string;        // Additional details (e.g., fingerprint)
  acceptLabel?: string;    // Default: "Accept"
  rejectLabel?: string;    // Default: "Cancel"
}

export interface GlobalPromptResponse {
  id: string;
  accepted: boolean;
}
```

**IPC channels:**
- `globalPrompt:show` - Main → Renderer (show the prompt)
- `globalPrompt:respond` - Renderer → Main (user's response)

**API shape** (`src/lib/api.ts`):
```typescript
globalPrompt: {
  onShow: (callback: (prompt: GlobalPrompt) => void) => () => void;  // returns unsubscribe
  respond: (response: GlobalPromptResponse) => void;
}
```

### UI Component

**Location:** `src/common/ui/global-prompt-modal/index.tsx`

The component manages a queue of prompts locally (no Zustand store needed):

```typescript
const [promptQueue, setPromptQueue] = useState<GlobalPrompt[]>([]);

useEffect(() => {
  const unsubscribe = api.globalPrompt.onShow((prompt) => {
    setPromptQueue((queue) => [...queue, prompt]);
  });
  return unsubscribe;
}, []);

const currentPrompt = promptQueue[0] ?? null;

const handleResponse = (accepted: boolean) => {
  if (currentPrompt) {
    api.globalPrompt.respond({ id: currentPrompt.id, accepted });
    setPromptQueue((queue) => queue.slice(1));
  }
};
```

**Modal displays:**
- Title
- Message
- Details section (monospace, for fingerprints etc.)
- Accept / Reject buttons with customizable labels

**Rendering:** In `src/routes/__root.tsx` alongside `TaskMessageManager`.

### Main Process Service

**Location:** `electron/services/global-prompt-service.ts`

```typescript
import { randomUUID } from 'crypto';
import { BrowserWindow } from 'electron';
import type { GlobalPrompt, GlobalPromptResponse } from '../../shared/global-prompt-types';

// Track pending prompts with their resolve functions
const pendingPrompts = new Map<string, (accepted: boolean) => void>();

export function sendPrompt(
  prompt: Omit<GlobalPrompt, 'id'>
): Promise<boolean> {
  const id = randomUUID();
  const fullPrompt: GlobalPrompt = { ...prompt, id };

  return new Promise((resolve) => {
    pendingPrompts.set(id, resolve);

    // Send to renderer
    const window = BrowserWindow.getAllWindows()[0];
    window?.webContents.send('globalPrompt:show', fullPrompt);
  });
}

export function handleResponse(response: GlobalPromptResponse): void {
  const resolve = pendingPrompts.get(response.id);
  if (resolve) {
    pendingPrompts.delete(response.id);
    resolve(response.accepted);
  }
}
```

### SSH Host Detection Integration

**Location:** `electron/services/azure-devops-service.ts` - `cloneRepository()`

Changes:
1. Change stdio from `['ignore', 'pipe', 'pipe']` to `['pipe', 'pipe', 'pipe']`
2. Accumulate stderr and watch for the authenticity pattern
3. When detected, parse host, key type, and fingerprint
4. Call `sendPrompt()` and wait for response
5. Write `yes\n` or `no\n` to stdin based on user response

**Detection pattern:**
```typescript
const SSH_AUTHENTICITY_PATTERN = /The authenticity of host '([^']+)'/;
const FINGERPRINT_PATTERN = /(\w+) key fingerprint is ([^\s]+)/;
```

**Integration flow:**
```typescript
let stderrBuffer = '';
let promptHandled = false;

gitProcess.stderr.on('data', async (data: Buffer) => {
  stderrBuffer += data.toString();

  if (!promptHandled && SSH_AUTHENTICITY_PATTERN.test(stderrBuffer)) {
    promptHandled = true;

    const hostMatch = stderrBuffer.match(SSH_AUTHENTICITY_PATTERN);
    const fingerprintMatch = stderrBuffer.match(FINGERPRINT_PATTERN);

    const host = hostMatch?.[1] ?? 'unknown';
    const keyType = fingerprintMatch?.[1] ?? 'Unknown';
    const fingerprint = fingerprintMatch?.[2] ?? 'unknown';

    const accepted = await sendPrompt({
      title: 'Unknown SSH Host',
      message: `The authenticity of host '${host}' can't be established.`,
      details: `${keyType} key fingerprint:\n${fingerprint}`,
      acceptLabel: 'Trust & Connect',
      rejectLabel: 'Cancel',
    });

    gitProcess.stdin?.write(accepted ? 'yes\n' : 'no\n');
  }
});
```

**Edge cases:**
- Modal dismiss / Cancel = reject (write `no\n`)
- No timeout - user can take time to verify fingerprint
- Queue handles multiple concurrent clone operations

## File Changes

### New Files

1. `shared/global-prompt-types.ts` - Type definitions
2. `electron/services/global-prompt-service.ts` - Main process service
3. `src/common/ui/global-prompt-modal/index.tsx` - Modal component

### Modified Files

1. `electron/preload.ts` - Expose `globalPrompt.onShow` and `globalPrompt.respond`
2. `electron/ipc/handlers.ts` - Register IPC handler for `globalPrompt:respond`
3. `src/lib/api.ts` - Add TypeScript types for the new API
4. `electron/services/azure-devops-service.ts` - Integrate SSH prompt detection
5. `src/routes/__root.tsx` - Render `GlobalPromptModal`

## Implementation Order

1. Types (`shared/global-prompt-types.ts`)
2. Service (`electron/services/global-prompt-service.ts`)
3. IPC wiring (`preload.ts`, `handlers.ts`, `api.ts`)
4. UI component (`global-prompt-modal/index.tsx`)
5. Mount in root layout (`__root.tsx`)
6. Integrate into `cloneRepository()` in `azure-devops-service.ts`
