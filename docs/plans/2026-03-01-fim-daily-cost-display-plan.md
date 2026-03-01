# FIM Daily Cost Display — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track Mistral FIM token usage per-day in the database and display today's cost in the app header when autocomplete is enabled.

**Architecture:** New `completion_usage` table stores daily aggregated token counts. The completion service upserts usage after each FIM request. A new IPC endpoint exposes daily usage to the renderer. A small header chip displays the cost, only when autocomplete is enabled.

**Tech Stack:** SQLite/Kysely migration, Electron IPC, React Query hook, React component with Tooltip.

---

### Task 1: Database Migration — Create `completion_usage` Table

**Files:**
- Create: `electron/database/migrations/032_completion_usage.ts`
- Modify: `electron/database/migrator.ts`
- Modify: `electron/database/schema.ts`

**Step 1: Create the migration file**

Create `electron/database/migrations/032_completion_usage.ts`:

```ts
import { Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable('completion_usage')
    .addColumn('date', 'text', (col) => col.primaryKey())
    .addColumn('promptTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('completionTokens', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('requests', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('completion_usage').execute();
}
```

**Step 2: Register the migration in `electron/database/migrator.ts`**

Add after the m031 import (line 32):

```ts
import * as m032 from './migrations/032_completion_usage';
```

Add to the migrations record after line 64:

```ts
'032_completion_usage': m032,
```

**Step 3: Add table type to schema in `electron/database/schema.ts`**

Add after `ProjectTodoTable` interface (after line 230):

```ts
export interface CompletionUsageTable {
  date: string;
  promptTokens: number;
  completionTokens: number;
  requests: number;
}

export type CompletionUsageRow = Selectable<CompletionUsageTable>;
```

Add `completion_usage: CompletionUsageTable;` to the `Database` interface (after line 37).

**Step 4: Run lint and type check**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 5: Commit**

```bash
git add electron/database/migrations/032_completion_usage.ts electron/database/migrator.ts electron/database/schema.ts
git commit -m "feat: add completion_usage table migration for FIM cost tracking"
```

---

### Task 2: Repository — CompletionUsageRepository

**Files:**
- Create: `electron/database/repositories/completion-usage.ts`
- Modify: `electron/database/repositories/index.ts`

**Step 1: Create the repository**

Create `electron/database/repositories/completion-usage.ts`:

```ts
import { db } from '../index';

export const CompletionUsageRepository = {
  /** Increment today's token counters. Creates the row if it doesn't exist. */
  async recordUsage({
    date,
    promptTokens,
    completionTokens,
  }: {
    date: string;
    promptTokens: number;
    completionTokens: number;
  }): Promise<void> {
    await db
      .insertInto('completion_usage')
      .values({
        date,
        promptTokens,
        completionTokens,
        requests: 1,
      })
      .onConflict((oc) =>
        oc.column('date').doUpdateSet((eb) => ({
          promptTokens: eb('promptTokens', '+', promptTokens),
          completionTokens: eb('completionTokens', '+', completionTokens),
          requests: eb('requests', '+', 1),
        })),
      )
      .execute();
  },

  /** Get usage for a specific date. Returns zeros if no data. */
  async getDailyUsage(date: string) {
    const row = await db
      .selectFrom('completion_usage')
      .selectAll()
      .where('date', '=', date)
      .executeTakeFirst();

    return row ?? { date, promptTokens: 0, completionTokens: 0, requests: 0 };
  },
};
```

**Step 2: Export from `electron/database/repositories/index.ts`**

Add at end:

```ts
export { CompletionUsageRepository } from './completion-usage';
```

**Step 3: Run lint and type check**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 4: Commit**

```bash
git add electron/database/repositories/completion-usage.ts electron/database/repositories/index.ts
git commit -m "feat: add CompletionUsageRepository for daily FIM usage tracking"
```

---

### Task 3: Service — Record Usage on Each FIM Completion

**Files:**
- Modify: `electron/services/completion-service.ts`

**Step 1: Add usage recording to the `complete()` function**

Add import at top of `completion-service.ts` (after existing imports):

```ts
import { CompletionUsageRepository } from '../database/repositories';
```

In the `complete()` function, after `const result = await client.fim.complete(...)` (line 78) and before reading `result.choices`, add usage tracking:

```ts
    // Record token usage for daily cost tracking
    if (result.usage) {
      const today = new Date().toISOString().slice(0, 10);
      CompletionUsageRepository.recordUsage({
        date: today,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
      }).catch((err) => {
        dbg.completion('Failed to record usage: %O', err);
      });
    }
```

Note: We fire-and-forget (`.catch()`) so usage recording never delays the completion response.

**Step 2: Add the `getDailyUsage()` exported function**

Add at the bottom of `completion-service.ts`, before the `resetClient()` function:

```ts
// Codestral pricing per million tokens
const CODESTRAL_INPUT_COST_PER_M = 0.3;
const CODESTRAL_OUTPUT_COST_PER_M = 0.9;

export async function getDailyUsage() {
  const today = new Date().toISOString().slice(0, 10);
  const usage = await CompletionUsageRepository.getDailyUsage(today);

  const costUsd =
    (usage.promptTokens * CODESTRAL_INPUT_COST_PER_M +
      usage.completionTokens * CODESTRAL_OUTPUT_COST_PER_M) /
    1_000_000;

  return { ...usage, costUsd };
}
```

**Step 3: Run lint and type check**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 4: Commit**

```bash
git add electron/services/completion-service.ts
git commit -m "feat: record FIM token usage per request and expose daily cost"
```

---

### Task 4: IPC, Preload Bridge, and API Types

**Files:**
- Modify: `electron/ipc/handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/api.ts`

**Step 1: Add IPC handler in `electron/ipc/handlers.ts`**

Find the completion handlers section (around line 1898, after `completion:generateContext`). Add:

```ts
  ipcMain.handle('completion:getDailyUsage', async () => {
    dbg.ipc('completion:getDailyUsage');
    const { getDailyUsage } = await import('../services/completion-service');
    return getDailyUsage();
  });
```

Also add the `getDailyUsage` import at the top if using static imports. Since other completion functions use static imports, check the import section at the top of `handlers.ts` for the existing completion import. The pattern used is:

```ts
import { complete as completeText, testCompletion, resetClient as resetCompletionClient } from '../services/completion-service';
```

Add `getDailyUsage as getCompletionDailyUsage` to this import, then use it directly:

```ts
  ipcMain.handle('completion:getDailyUsage', async () => {
    dbg.ipc('completion:getDailyUsage');
    return getCompletionDailyUsage();
  });
```

**Step 2: Add to preload bridge in `electron/preload.ts`**

In the `completion` object (around line 464, after `generateContext`), add:

```ts
    getDailyUsage: () => ipcRenderer.invoke('completion:getDailyUsage'),
```

**Step 3: Add type in `src/lib/api.ts`**

In the `completion` type definition (around line 677, after `generateContext`), add:

```ts
    getDailyUsage: () => Promise<{
      date: string;
      promptTokens: number;
      completionTokens: number;
      requests: number;
      costUsd: number;
    }>;
```

**Step 4: Run lint and type check**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat: add completion:getDailyUsage IPC endpoint"
```

---

### Task 5: React Query Hook

**Files:**
- Modify: `src/hooks/use-settings.ts`

**Step 1: Add the hook**

At the bottom of `src/hooks/use-settings.ts`, add:

```ts
// Completion daily usage hook
export function useCompletionDailyUsage() {
  const { data: completionSetting } = useCompletionSetting();
  const enabled = completionSetting?.enabled ?? false;

  return useQuery({
    queryKey: ['completion-daily-usage'],
    queryFn: () => api.completion.getDailyUsage(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
```

**Step 2: Run lint and type check**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 3: Commit**

```bash
git add src/hooks/use-settings.ts
git commit -m "feat: add useCompletionDailyUsage React Query hook"
```

---

### Task 6: Header UI — CompletionCostDisplay Component

**Files:**
- Create: `src/layout/ui-header/completion-cost-display.tsx`
- Modify: `src/layout/ui-header/index.tsx`

**Step 1: Create the component**

Create `src/layout/ui-header/completion-cost-display.tsx`:

```tsx
import { Tooltip } from '@/common/ui/tooltip';
import { useCompletionDailyUsage } from '@/hooks/use-settings';

function formatCost(costUsd: number): string {
  if (costUsd < 0.005) return '$0.00';
  if (costUsd < 0.1) return `$${costUsd.toFixed(3)}`;
  return `$${costUsd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

function TooltipContent({
  promptTokens,
  completionTokens,
  requests,
  costUsd,
}: {
  promptTokens: number;
  completionTokens: number;
  requests: number;
  costUsd: number;
}) {
  const inputCost = (promptTokens * 0.3) / 1_000_000;
  const outputCost = (completionTokens * 0.9) / 1_000_000;

  return (
    <div className="space-y-1.5">
      <div className="font-medium text-neutral-200">
        Autocomplete Usage (Today)
      </div>
      <div className="space-y-0.5 text-neutral-400">
        <div className="flex items-center justify-between gap-6">
          <span>Requests</span>
          <span className="text-neutral-300">{requests.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Input tokens</span>
          <span className="text-neutral-300">
            {formatTokens(promptTokens)} ({formatCost(inputCost)})
          </span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span>Output tokens</span>
          <span className="text-neutral-300">
            {formatTokens(completionTokens)} ({formatCost(outputCost)})
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-6 border-t border-neutral-700 pt-1">
          <span className="font-medium text-neutral-200">Total</span>
          <span className="font-medium text-neutral-200">
            {formatCost(costUsd)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CompletionCostDisplay() {
  const { data: usage } = useCompletionDailyUsage();

  // Don't render if autocomplete is disabled (hook handles this) or no data yet
  if (!usage || usage.requests === 0) return null;

  return (
    <Tooltip
      content={
        <TooltipContent
          promptTokens={usage.promptTokens}
          completionTokens={usage.completionTokens}
          requests={usage.requests}
          costUsd={usage.costUsd}
        />
      }
      side="bottom"
    >
      <div className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-neutral-400">
        <span className="text-xs">FIM {formatCost(usage.costUsd)}</span>
      </div>
    </Tooltip>
  );
}
```

**Step 2: Add to the header in `src/layout/ui-header/index.tsx`**

Add import at top:

```ts
import { CompletionCostDisplay } from './completion-cost-display';
```

In the JSX, add `<CompletionCostDisplay />` next to `<UsageDisplay />`. Find the usage display wrapper div (around line 80-86) and update it:

```tsx
      {/* Usage display */}
      <div
        className="flex items-center gap-1 px-4"
        style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}
      >
        <CompletionCostDisplay />
        <UsageDisplay />
      </div>
```

**Step 3: Run lint and type check**

```bash
pnpm lint --fix && pnpm ts-check
```

**Step 4: Commit**

```bash
git add src/layout/ui-header/completion-cost-display.tsx src/layout/ui-header/index.tsx
git commit -m "feat: display FIM daily cost in app header"
```

---

### Task 7: Final Verification

**Step 1: Run full lint**

```bash
pnpm install && pnpm lint --fix && pnpm ts-check && pnpm lint
```

**Step 2: Visual verification checklist**

- [ ] App starts without migration errors
- [ ] With autocomplete disabled: no FIM cost chip in header
- [ ] With autocomplete enabled: FIM cost chip appears after first completion
- [ ] Tooltip shows breakdown (requests, input/output tokens, costs)
- [ ] Cost resets daily (check by inspecting `completion_usage` table)
