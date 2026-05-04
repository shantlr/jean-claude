# Fix SSH Passphrase Prompt Not Appearing

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When `git push` requires an SSH passphrase, show a modal in the renderer so the user can enter it.

**Architecture:** Extend the existing `GlobalPrompt` system (used for SSH host authenticity in clone) to support text input responses. Refactor `pushBranch()` from non-interactive `execAsync` to `spawn` with piped stdio, detect passphrase prompts on stderr, and relay them to the renderer via the global prompt system.

**Tech Stack:** Electron IPC, child_process.spawn, React modal with password input

---

### Task 1: Extend GlobalPrompt Types to Support Text Input

**Files:**
- Modify: `shared/global-prompt-types.ts`

**Step 1: Update the types**

Replace the entire file with:

```typescript
export interface GlobalPrompt {
  id: string;
  title: string;
  message: string;
  details?: string;
  acceptLabel?: string;
  rejectLabel?: string;
  /** When set, shows an input field. Value is sent back in response. */
  inputType?: 'text' | 'password';
  inputPlaceholder?: string;
}

export interface GlobalPromptResponse {
  id: string;
  accepted: boolean;
  /** The text value from the input field, if inputType was set */
  inputValue?: string;
}
```

**Step 2: Commit**

```bash
git add shared/global-prompt-types.ts
git commit -m "feat: extend GlobalPrompt types to support text input fields"
```

---

### Task 2: Update Global Prompt Service to Return Input Values

**Files:**
- Modify: `electron/services/global-prompt-service.ts`

**Step 1: Update the service to resolve with the full response**

The service currently resolves with `boolean`. We need it to optionally resolve with the input value too. Add a new overload/function for prompts that expect text input:

```typescript
import { randomUUID } from 'crypto';

import { BrowserWindow } from 'electron';

import type {
  GlobalPrompt,
  GlobalPromptResponse,
} from '@shared/global-prompt-types';

const pendingPrompts = new Map<
  string,
  (response: { accepted: boolean; inputValue?: string }) => void
>();

export function sendGlobalPromptToWindow(
  prompt: Omit<GlobalPrompt, 'id'>,
): Promise<boolean>;
export function sendGlobalPromptToWindow(
  prompt: Omit<GlobalPrompt, 'id'> & { inputType: 'text' | 'password' },
): Promise<{ accepted: boolean; inputValue?: string }>;
export function sendGlobalPromptToWindow(
  prompt: Omit<GlobalPrompt, 'id'>,
): Promise<boolean | { accepted: boolean; inputValue?: string }> {
  const id = randomUUID();
  const fullPrompt: GlobalPrompt = { ...prompt, id };

  return new Promise((resolve) => {
    pendingPrompts.set(id, (response) => {
      if (prompt.inputType) {
        resolve(response);
      } else {
        resolve(response.accepted);
      }
    });

    const window = BrowserWindow.getAllWindows()[0];
    window?.webContents.send('globalPrompt:show', fullPrompt);
  });
}

export function handlePromptResponse(response: GlobalPromptResponse): void {
  const resolve = pendingPrompts.get(response.id);
  if (resolve) {
    pendingPrompts.delete(response.id);
    resolve({ accepted: response.accepted, inputValue: response.inputValue });
  }
}
```

**Step 2: Commit**

```bash
git add electron/services/global-prompt-service.ts
git commit -m "feat: support input value in global prompt service responses"
```

---

### Task 3: Update the Renderer Modal to Show Password Input

**Files:**
- Modify: `src/common/ui/global-prompt-from-back-modal/index.tsx`

**Step 1: Add password input support to the modal**

Update the component to render a password input when `inputType` is set, and include the value in the response:

```tsx
import { AlertTriangle, KeyRound, X } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { Kbd } from '@/common/ui/kbd';
import { api } from '@/lib/api';
import type { GlobalPrompt } from '@shared/global-prompt-types';

export function GlobalPromptFromBackModal() {
  const [promptQueue, setPromptQueue] = useState<GlobalPrompt[]>([]);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    const unsubscribe = api.globalPrompt.onShow((prompt) => {
      setPromptQueue((queue) => [...queue, prompt]);
    });
    return unsubscribe;
  }, []);

  const currentPrompt = promptQueue[0] ?? null;

  // Focus the input when a prompt with inputType appears
  useEffect(() => {
    if (currentPrompt?.inputType) {
      // Small delay to ensure the input is rendered
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [currentPrompt]);

  const handleResponse = useCallback(
    (accepted: boolean) => {
      if (currentPrompt) {
        api.globalPrompt.respond({
          id: currentPrompt.id,
          accepted,
          inputValue: currentPrompt.inputType ? inputValue : undefined,
        });
        setPromptQueue((queue) => queue.slice(1));
        setInputValue('');
      }
    },
    [currentPrompt, inputValue],
  );

  useRegisterKeyboardBindings(
    `global-prompt-modal-${id}`,
    currentPrompt
      ? {
          escape: () => {
            handleResponse(false);
            return true;
          },
          // Only bind cmd+enter for non-input prompts (input uses form submit)
          ...(currentPrompt.inputType
            ? {}
            : {
                'cmd+enter': () => {
                  handleResponse(true);
                  return true;
                },
              }),
        }
      : {},
  );

  if (!currentPrompt) return null;

  const hasInput = !!currentPrompt.inputType;
  const IconComponent = hasInput ? KeyRound : AlertTriangle;
  const iconColorClass = hasInput ? 'text-blue-400 bg-blue-500/20' : 'text-yellow-500 bg-yellow-500/20';

  return (
    <div className="bg-bg-0/50 fixed inset-0 z-50 flex items-center justify-center">
      <div className="bg-bg-1 w-full max-w-md rounded-lg shadow-xl">
        {/* Header */}
        <div className="border-glass-border flex items-center gap-3 border-b px-4 py-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${iconColorClass}`}>
            <IconComponent className="h-4 w-4" aria-hidden />
          </div>
          <h2 className="text-ink-0 flex-1 text-lg font-semibold">
            {currentPrompt.title}
          </h2>
          <button
            onClick={() => handleResponse(false)}
            aria-label="Close dialog"
            className="text-ink-2 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-ink-1 text-sm">{currentPrompt.message}</p>

          {currentPrompt.details && (
            <div className="bg-bg-0 mt-3 rounded-md p-3">
              <pre className="text-ink-2 font-mono text-xs break-all whitespace-pre-wrap">
                {currentPrompt.details}
              </pre>
            </div>
          )}

          {hasInput && (
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleResponse(true);
              }}
            >
              <input
                ref={inputRef}
                type={currentPrompt.inputType}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={currentPrompt.inputPlaceholder ?? ''}
                className="bg-bg-0 border-glass-border text-ink-0 w-full rounded-md border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoComplete="off"
              />
            </form>
          )}
        </div>

        {/* Actions */}
        <div className="border-glass-border flex justify-end gap-3 border-t px-4 py-3">
          <button
            onClick={() => handleResponse(false)}
            className="text-ink-1 hover:bg-glass-medium flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium"
          >
            {currentPrompt.rejectLabel ?? 'Cancel'}
            <Kbd shortcut="escape" className="text-[9px]" />
          </button>
          <button
            onClick={() => handleResponse(true)}
            className="bg-acc text-ink-0 flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-500"
          >
            {currentPrompt.acceptLabel ?? (hasInput ? 'Submit' : 'Accept')}
            {!hasInput && <Kbd shortcut="cmd+enter" className="text-[9px]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/common/ui/global-prompt-from-back-modal/index.tsx
git commit -m "feat: add password input support to global prompt modal"
```

---

### Task 4: Refactor pushBranch to Handle SSH Passphrase Prompts

**Files:**
- Modify: `electron/services/worktree-service.ts`

**Step 1: Add spawn import and passphrase pattern**

At the top of the file, add `spawn` to the existing import:

```typescript
import { exec, execFile, spawn } from 'child_process';
```

**Step 2: Replace the pushBranch function**

Replace the existing `pushBranch` (lines 1176-1187) with a version that uses `spawn` and detects SSH passphrase prompts:

```typescript
// Regex patterns to detect SSH passphrase prompt
const SSH_PASSPHRASE_PATTERN = /Enter passphrase for key/i;
const SSH_PASSWORD_PATTERN = /password:/i;

/**
 * Pushes the current branch to a remote.
 * Handles SSH passphrase prompts by showing a modal to the user.
 */
export async function pushBranch(params: {
  worktreePath: string;
  branchName: string;
  remote?: string;
}): Promise<void> {
  const remote = params.remote ?? 'origin';
  dbg.worktree('pushBranch: %s to %s', params.branchName, remote);

  const { sendGlobalPromptToWindow } = await import(
    './global-prompt-service'
  );

  return new Promise<void>((resolve, reject) => {
    const gitProcess = spawn(
      'git',
      ['push', '-u', remote, params.branchName],
      {
        cwd: params.worktreePath,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // Disable any GUI askpass programs - we handle it ourselves
          SSH_ASKPASS: '',
          GIT_ASKPASS: '',
          // Required to prevent SSH from using the terminal directly
          SSH_ASKPASS_REQUIRE: 'never',
        },
      },
    );

    let stderr = '';
    let promptHandled = false;

    gitProcess.stderr.on('data', async (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      dbg.worktree('pushBranch stderr: %s', chunk.trim());

      // Check for SSH passphrase or password prompt
      if (
        !promptHandled &&
        (SSH_PASSPHRASE_PATTERN.test(chunk) ||
          SSH_PASSWORD_PATTERN.test(chunk))
      ) {
        promptHandled = true;

        const response = await sendGlobalPromptToWindow({
          title: 'SSH Authentication',
          message: chunk.trim(),
          inputType: 'password',
          inputPlaceholder: 'Enter passphrase',
          acceptLabel: 'Authenticate',
          rejectLabel: 'Cancel',
        });

        if (gitProcess.stdin) {
          if (response.accepted && response.inputValue) {
            gitProcess.stdin.write(response.inputValue + '\n');
          } else {
            // User cancelled - kill the process
            gitProcess.kill();
          }
        }
      }
    });

    gitProcess.on('close', (code) => {
      if (code === 0) {
        dbg.worktree('Push successful');
        resolve();
      } else {
        const errorMessage = stderr.trim() || `git push exited with code ${code}`;
        reject(new Error(errorMessage));
      }
    });

    gitProcess.on('error', (err) => {
      reject(new Error(`Failed to run git push: ${err.message}`));
    });
  });
}
```

**Step 3: Commit**

```bash
git add electron/services/worktree-service.ts
git commit -m "feat: handle SSH passphrase prompts in pushBranch via spawn + global prompt"
```

---

### Task 5: Verify TypeScript and Lint

**Step 1: Install dependencies**

```bash
pnpm install
```

**Step 2: Fix lint errors**

```bash
pnpm lint --fix
```

**Step 3: Type check**

```bash
pnpm ts-check
```

**Step 4: Fix any remaining issues and run lint again**

```bash
pnpm lint
```

**Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: lint and type errors from passphrase prompt implementation"
```

---

## Notes

- The `SSH_ASKPASS_REQUIRE=never` env var prevents SSH from trying to use a terminal directly, which would hang in a headless child process context.
- The dynamic `import()` for `global-prompt-service` avoids circular dependency issues since worktree-service is imported early.
- The `cloneRepository` function in `azure-devops-service.ts` already uses the same pattern for SSH host authenticity prompts — this follows that reference implementation but adds text input support.
- Both call sites (`tasks:worktree:pushBranch` IPC handler and `tasks:createPullRequest` handler) will benefit from this fix since they both call the same `pushBranch()` function.
