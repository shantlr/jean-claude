# Agent Resource Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Track live CPU/RAM usage for agent backend processes per task step, starting with OpenCode dedicated servers.

**Architecture:** Add a main-process resource monitor service keyed by `stepId`. Backends expose root process IDs where possible; `agent-service` registers/unregisters each session and emits resource snapshots through existing agent IPC events. Keep recent samples in memory only.

**Tech Stack:** Electron main IPC, TypeScript, React Query/Zustand-compatible renderer hooks, existing `AgentBackend` abstraction.

---

## Scope

- MVP tracks OpenCode accurately because each OpenCode session now has a dedicated server.
- Codex support follows same PID model once `codex-app-server.ts` exposes PID.
- Claude support can be best-effort later because SDK hides process handles.
- Do not store samples or summaries in SQLite; metrics are live/in-memory only.
- Use `ps`/`pgrep` on macOS/Linux. Return unsupported on Windows initially.

## Data Model

```ts
export type AgentResourceSnapshot = {
  stepId: string;
  taskId: string;
  backend: AgentBackendType;
  rootPid: number | null;
  pids: number[];
  sampledAt: string;
  cpuPercent: number;
  rssBytes: number;
  peakCpuPercent: number;
  peakRssBytes: number;
  sampleCount: number;
  unsupportedReason?: string;
};

export type AgentResourceSummary = {
  id: string;
  taskId: string;
  stepId: string;
  backend: AgentBackendType;
  rootPid: number | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  sampleCount: number;
  avgCpuPercent: number;
  peakCpuPercent: number;
  avgRssBytes: number;
  peakRssBytes: number;
};
```

---

### Task 1: Shared Resource Types

**Files:**
- Create: `shared/agent-resource-types.ts`
- Modify: `src/lib/api.ts`

**Step 1: Write shared types**

Create `shared/agent-resource-types.ts`:

```ts
import type { AgentBackendType } from './agent-backend-types';

export type AgentResourceSnapshot = {
  stepId: string;
  taskId: string;
  backend: AgentBackendType;
  rootPid: number | null;
  pids: number[];
  sampledAt: string;
  cpuPercent: number;
  rssBytes: number;
  peakCpuPercent: number;
  peakRssBytes: number;
  sampleCount: number;
  unsupportedReason?: string;
};

export type AgentResourceSummary = {
  id: string;
  taskId: string;
  stepId: string;
  backend: AgentBackendType;
  rootPid: number | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  sampleCount: number;
  avgCpuPercent: number;
  peakCpuPercent: number;
  avgRssBytes: number;
  peakRssBytes: number;
};
```

**Step 2: Extend API typing**

In `src/lib/api.ts`, import types near other shared imports:

```ts
import type { AgentResourceSnapshot } from '@shared/agent-resource-types';
```

Add under `agent` API interface:

```ts
getResourceSnapshots: () => Promise<AgentResourceSnapshot[]>;
getResourceHistory: () => Promise<Record<string, AgentResourceSnapshot[]>>;
```

**Step 3: Run type check**

Run: `pnpm ts-check`

Expected: FAIL because preload/handlers not implemented.

**Step 4: Commit**

```bash
git add shared/agent-resource-types.ts src/lib/api.ts
git commit -m "feat(agent): add resource tracking types"
```

---

### Task 2: Process Tree Sampler

**Files:**
- Create: `electron/services/process-resource-sampler.ts`
- Test: `electron/services/process-resource-sampler.test.ts`

**Step 1: Write failing tests**

Create `electron/services/process-resource-sampler.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { parsePsRows, sampleProcessTree } from './process-resource-sampler';

describe('parsePsRows', () => {
  it('sums CPU/RSS for root and descendants', () => {
    const result = parsePsRows(
      [
        ' 10   1  1000  2.5 opencode',
        ' 11  10  2000  3.5 node',
        ' 12  11   500  1.0 sh',
        ' 99   1  9000  9.0 other',
      ].join('\n'),
      10,
    );

    expect(result).toEqual({
      pids: [10, 11, 12],
      cpuPercent: 7,
      rssBytes: 3_500 * 1024,
    });
  });
});

describe('sampleProcessTree', () => {
  it('returns unsupported on win32', async () => {
    const result = await sampleProcessTree({
      rootPid: 10,
      platform: 'win32',
      execPs: vi.fn(),
    });

    expect(result.unsupportedReason).toBe('process resource sampling is not supported on win32');
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run electron/services/process-resource-sampler.test.ts`

Expected: FAIL with module missing.

**Step 3: Implement sampler**

Create `electron/services/process-resource-sampler.ts`:

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ProcessTreeSample = {
  pids: number[];
  cpuPercent: number;
  rssBytes: number;
  unsupportedReason?: string;
};

type PsRow = { pid: number; ppid: number; rssKb: number; cpuPercent: number };

export function parsePsRows(stdout: string, rootPid: number): ProcessTreeSample {
  const rows = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line): PsRow | null => {
      const [pidRaw, ppidRaw, rssRaw, cpuRaw] = line.split(/\s+/, 5);
      const pid = Number(pidRaw);
      const ppid = Number(ppidRaw);
      const rssKb = Number(rssRaw);
      const cpuPercent = Number(cpuRaw);
      if (![pid, ppid, rssKb, cpuPercent].every(Number.isFinite)) return null;
      return { pid, ppid, rssKb, cpuPercent };
    })
    .filter((row): row is PsRow => row !== null);

  const childrenByParent = new Map<number, PsRow[]>();
  for (const row of rows) {
    const children = childrenByParent.get(row.ppid) ?? [];
    children.push(row);
    childrenByParent.set(row.ppid, children);
  }

  const root = rows.find((row) => row.pid === rootPid);
  if (!root) return { pids: [], cpuPercent: 0, rssBytes: 0 };

  const selected: PsRow[] = [];
  const visit = (row: PsRow) => {
    selected.push(row);
    for (const child of childrenByParent.get(row.pid) ?? []) visit(child);
  };
  visit(root);

  return {
    pids: selected.map((row) => row.pid),
    cpuPercent: selected.reduce((sum, row) => sum + row.cpuPercent, 0),
    rssBytes: selected.reduce((sum, row) => sum + row.rssKb, 0) * 1024,
  };
}

export async function sampleProcessTree({
  rootPid,
  platform = process.platform,
  execPs = async () => {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,rss=,pcpu=,comm=']);
    return stdout;
  },
}: {
  rootPid: number;
  platform?: NodeJS.Platform;
  execPs?: () => Promise<string>;
}): Promise<ProcessTreeSample> {
  if (platform === 'win32') {
    return {
      pids: [],
      cpuPercent: 0,
      rssBytes: 0,
      unsupportedReason: 'process resource sampling is not supported on win32',
    };
  }

  try {
    return parsePsRows(await execPs(), rootPid);
  } catch (error) {
    return {
      pids: [],
      cpuPercent: 0,
      rssBytes: 0,
      unsupportedReason: error instanceof Error ? error.message : String(error),
    };
  }
}
```

**Step 4: Run tests**

Run: `pnpm vitest run electron/services/process-resource-sampler.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/process-resource-sampler.ts electron/services/process-resource-sampler.test.ts
git commit -m "feat(agent): sample process tree resources"
```

---

### Task 3: Resource Monitor Service

**Files:**
- Create: `electron/services/agent-resource-monitor-service.ts`
- Test: `electron/services/agent-resource-monitor-service.test.ts`

**Step 1: Write failing tests**

Create test covering start/sample/stop summary:

```ts
import { describe, expect, it, vi } from 'vitest';

import { AgentResourceMonitorService } from './agent-resource-monitor-service';

describe('AgentResourceMonitorService', () => {
  it('tracks peaks and averages per step', async () => {
    const samples = [
      { pids: [10], cpuPercent: 2, rssBytes: 100 },
      { pids: [10, 11], cpuPercent: 6, rssBytes: 300 },
    ];
    const onSnapshot = vi.fn();
    const service = new AgentResourceMonitorService({
      intervalMs: 5,
      sampler: async () => samples.shift()!,
      onSnapshot,
    });

    service.start({ taskId: 'task-1', stepId: 'step-1', backend: 'opencode', rootPid: 10 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const summary = await service.stop('step-1');

    expect(onSnapshot).toHaveBeenCalled();
    expect(summary?.peakCpuPercent).toBe(6);
    expect(summary?.peakRssBytes).toBe(300);
    expect(summary?.avgCpuPercent).toBeGreaterThan(0);
  });
});
```

**Step 2: Run failing test**

Run: `pnpm vitest run electron/services/agent-resource-monitor-service.test.ts`

Expected: FAIL with module missing.

**Step 3: Implement service**

Create `electron/services/agent-resource-monitor-service.ts`:

```ts
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { AgentResourceSnapshot, AgentResourceSummary } from '@shared/agent-resource-types';

import { sampleProcessTree, type ProcessTreeSample } from './process-resource-sampler';

type TrackedSession = {
  taskId: string;
  stepId: string;
  backend: AgentBackendType;
  rootPid: number | null;
  startedAt: number;
  timer: ReturnType<typeof setInterval> | null;
  sampleCount: number;
  cpuTotal: number;
  rssTotal: number;
  peakCpuPercent: number;
  peakRssBytes: number;
  latest: AgentResourceSnapshot | null;
};

export class AgentResourceMonitorService {
  private sessions = new Map<string, TrackedSession>();

  constructor(
    private readonly deps: {
      intervalMs?: number;
      sampler?: (rootPid: number) => Promise<ProcessTreeSample>;
      onSnapshot?: (snapshot: AgentResourceSnapshot) => void;
      now?: () => number;
    } = {},
  ) {}

  start(params: {
    taskId: string;
    stepId: string;
    backend: AgentBackendType;
    rootPid: number | null;
  }): void {
    void this.stop(params.stepId);
    const session: TrackedSession = {
      ...params,
      startedAt: this.now(),
      timer: null,
      sampleCount: 0,
      cpuTotal: 0,
      rssTotal: 0,
      peakCpuPercent: 0,
      peakRssBytes: 0,
      latest: null,
    };
    this.sessions.set(params.stepId, session);

    void this.sample(session);
    session.timer = setInterval(() => void this.sample(session), this.deps.intervalMs ?? 2_000);
  }

  getSnapshots(): AgentResourceSnapshot[] {
    return Array.from(this.sessions.values())
      .map((session) => session.latest)
      .filter((snapshot): snapshot is AgentResourceSnapshot => snapshot !== null);
  }

  async stop(stepId: string): Promise<AgentResourceSummary | null> {
    const session = this.sessions.get(stepId);
    if (!session) return null;
    this.sessions.delete(stepId);
    if (session.timer) clearInterval(session.timer);

    const endedAt = this.now();
    const summary: AgentResourceSummary = {
      id: `${session.stepId}:${session.startedAt}`,
      taskId: session.taskId,
      stepId: session.stepId,
      backend: session.backend,
      rootPid: session.rootPid,
      startedAt: new Date(session.startedAt).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      durationMs: endedAt - session.startedAt,
      sampleCount: session.sampleCount,
      avgCpuPercent: session.sampleCount ? session.cpuTotal / session.sampleCount : 0,
      peakCpuPercent: session.peakCpuPercent,
      avgRssBytes: session.sampleCount ? session.rssTotal / session.sampleCount : 0,
      peakRssBytes: session.peakRssBytes,
    };

    return summary;
  }

  private async sample(session: TrackedSession): Promise<void> {
    const sample = session.rootPid === null
      ? { pids: [], cpuPercent: 0, rssBytes: 0, unsupportedReason: 'backend did not expose a root PID' }
      : await (this.deps.sampler ?? sampleProcessTree)(session.rootPid);

    session.sampleCount += 1;
    session.cpuTotal += sample.cpuPercent;
    session.rssTotal += sample.rssBytes;
    session.peakCpuPercent = Math.max(session.peakCpuPercent, sample.cpuPercent);
    session.peakRssBytes = Math.max(session.peakRssBytes, sample.rssBytes);

    const snapshot: AgentResourceSnapshot = {
      stepId: session.stepId,
      taskId: session.taskId,
      backend: session.backend,
      rootPid: session.rootPid,
      pids: sample.pids,
      sampledAt: new Date(this.now()).toISOString(),
      cpuPercent: sample.cpuPercent,
      rssBytes: sample.rssBytes,
      peakCpuPercent: session.peakCpuPercent,
      peakRssBytes: session.peakRssBytes,
      sampleCount: session.sampleCount,
      ...(sample.unsupportedReason ? { unsupportedReason: sample.unsupportedReason } : {}),
    };

    session.latest = snapshot;
    this.deps.onSnapshot?.(snapshot);
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }
}

export const agentResourceMonitorService = new AgentResourceMonitorService();
```

**Step 4: Run tests**

Run: `pnpm vitest run electron/services/agent-resource-monitor-service.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/services/agent-resource-monitor-service.ts electron/services/agent-resource-monitor-service.test.ts
git commit -m "feat(agent): add resource monitor service"
```

---

### Task 4: Expose Backend Root PID

**Files:**
- Modify: `shared/agent-backend-types.ts`
- Modify: `electron/services/agent-backends/opencode/opencode-backend.ts`
- Test: `electron/services/agent-backends/opencode/opencode-backend.test.ts`

**Step 1: Extend `AgentSession`**

In `shared/agent-backend-types.ts`:

```ts
export interface AgentSession {
  sessionId: string;
  events: AsyncIterable<AgentEvent>;
  rootPid?: number;
}
```

**Step 2: Expose OpenCode PID**

Change `ServerHandle` in `opencode-backend.ts`:

```ts
interface ServerHandle {
  client: OpencodeClient;
  server: { url: string; close(): void; process?: { pid?: number } };
}
```

Return PID from `start()`:

```ts
return {
  sessionId: session.id,
  events,
  rootPid: serverHandle.server.process?.pid,
};
```

If SDK type lacks `process`, use safe structural helper:

```ts
function getServerPid(server: ServerHandle['server']): number | undefined {
  const maybeProcess = (server as { process?: { pid?: unknown } }).process;
  return typeof maybeProcess?.pid === 'number' ? maybeProcess.pid : undefined;
}
```

**Step 3: Add test**

In `opencode-backend.test.ts`, mock `createOpencode()` server with `{ process: { pid: 1234 } }` and assert returned `AgentSession.rootPid === 1234`.

**Step 4: Run focused tests**

Run: `pnpm vitest run electron/services/agent-backends/opencode/opencode-backend.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/agent-backend-types.ts electron/services/agent-backends/opencode/opencode-backend.ts electron/services/agent-backends/opencode/opencode-backend.test.ts
git commit -m "feat(agent): expose opencode server pid"
```

---

### Task 5: Wire Monitor Into Agent Service

**Files:**
- Modify: `shared/agent-ui-events.ts`
- Modify: `electron/services/agent-service.ts`
- Test: `electron/services/agent-service.test.ts`

**Step 1: Add UI event variant**

In `shared/agent-ui-events.ts`, add:

```ts
import type { AgentResourceSnapshot } from './agent-resource-types';

| { type: 'resource-snapshot'; snapshot: AgentResourceSnapshot }
```

Match existing union style.

**Step 2: Inject monitor in `agent-service.ts`**

Import:

```ts
import { agentResourceMonitorService } from './agent-resource-monitor-service';
```

After `const agentSession = await session.backend.start(...)` and `session.backendSessionId = agentSession.sessionId`, start monitoring:

```ts
agentResourceMonitorService.start({
  taskId,
  stepId,
  backend: session.backendType,
  rootPid: agentSession.rootPid ?? null,
});
```

In monitor singleton construction, need `onSnapshot` to emit. If singleton cannot import service due cycles, add method on `AgentService`:

```ts
agentResourceMonitorService.setSnapshotListener((snapshot) => {
  this.emitEvent(snapshot.taskId, snapshot.stepId, {
    type: 'resource-snapshot',
    snapshot,
  });
});
```

Prefer adding `setSnapshotListener` to monitor service over injecting BrowserWindow into it.

Stop monitor in `finally` around backend event loop:

```ts
try {
  for await (const event of agentSession.events) { ... }
} finally {
  await agentResourceMonitorService.stop(stepId);
}
```

Also stop in explicit `stop(stepId)` path after `session.backend.stop(...)`.

**Step 3: Add test**

In `agent-service.test.ts`, mock backend returning `rootPid: 1234`; mock monitor service; assert `start()` called with `stepId`, `taskId`, `backend`, `rootPid`.

**Step 4: Run test**

Run: `pnpm vitest run electron/services/agent-service.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add shared/agent-ui-events.ts electron/services/agent-service.ts electron/services/agent-service.test.ts
git commit -m "feat(agent): monitor backend resources during sessions"
```

---

### Task 6: IPC API For Live Snapshots

**Files:**
- Modify: `electron/ipc/handlers.ts:3687-3783`
- Modify: `electron/preload.ts:711-752`
- Modify: `src/lib/api.ts`

**Step 1: Add handlers**

In `handlers.ts`, import monitor service:

```ts
import { agentResourceMonitorService } from '../services/agent-resource-monitor-service';
```

Add near other agent handlers:

```ts
ipcMain.handle('agent:resources:getSnapshots', () => {
  return agentResourceMonitorService.getSnapshots();
});
```

Add history handler so renderer can recover samples gathered while task details were not mounted:

```ts
ipcMain.handle('agent:resources:getHistory', () => {
  return agentResourceMonitorService.getHistory();
});
```

**Step 2: Add preload bridge**

In `electron/preload.ts` under `agent`:

```ts
getResourceSnapshots: () => ipcRenderer.invoke('agent:resources:getSnapshots'),
getResourceHistory: () => ipcRenderer.invoke('agent:resources:getHistory'),
```

**Step 3: Update API interface**

Ensure `src/lib/api.ts` methods match Task 1.

**Step 4: Run type check**

Run: `pnpm ts-check`

Expected: PASS.

**Step 5: Commit**

```bash
git add electron/ipc/handlers.ts electron/preload.ts src/lib/api.ts
git commit -m "feat(agent): expose resource snapshot ipc"
```

---

### Task 7: No Database Persistence

Resource metrics stay in memory. Do not add migrations, repositories, schema tables, or summary IPC backed by SQLite.

The monitor keeps recent samples in a bounded in-memory history so running tasks continue tracking while their task detail panel is not focused.

---

### Task 8: Renderer Hook And Minimal Display

**Files:**
- Create: `src/hooks/use-agent-resource-snapshots.ts`
- Modify: likely `src/features/task/...` or `src/features/agent/...` after locating task detail header component
- Test: optional component test if nearby patterns exist

**Step 1: Add hook**

Create `src/hooks/use-agent-resource-snapshots.ts`:

```ts
import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

export function useAgentResourceSnapshots() {
  return useQuery({
    queryKey: ['agent-resource-snapshots'],
    queryFn: () => api.agent.getResourceSnapshots(),
    refetchInterval: 2_000,
  });
}
```

**Step 2: Add small display component**

Locate task detail or agent header:

Run: `rg "MessageStream|StepFlow|status" src/features/task src/features/agent src/routes -g '*.tsx'`

Recommended target if present: task detail header where current running step status displays.

Create tiny component near target:

```tsx
function formatBytes(bytes: number): string {
  const mb = bytes / 1_048_576;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
}

function AgentResourcePill({ stepId }: { stepId: string }) {
  const { data } = useAgentResourceSnapshots();
  const snapshot = data?.find((item) => item.stepId === stepId);
  if (!snapshot) return null;

  return (
    <div className="text-ink-3 flex items-center gap-2 rounded border border-border-2 px-2 py-1 font-mono text-[11px]">
      <span>CPU {snapshot.cpuPercent.toFixed(1)}%</span>
      <span>RAM {formatBytes(snapshot.rssBytes)}</span>
    </div>
  );
}
```

**Step 3: Avoid broad UI redesign**

Keep one pill only. No charts in MVP. Existing app resource tooltip already has chart pattern if needed later: `src/layout/ui-header/ram-usage-display.tsx`.

**Step 4: Run checks**

Run: `pnpm ts-check`

Run: `pnpm lint`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/hooks/use-agent-resource-snapshots.ts <actual-ui-file>
git commit -m "feat(agent): show live resource usage"
```

---

### Task 9: Required Full Validation

**Files:**
- No source edits unless checks fail

**Step 1: Install**

Run: `pnpm install`

Expected: completes. Node warning acceptable only if suite still passes; prefer Node 20 per repo.

**Step 2: Tests**

Run: `pnpm test`

Expected: all tests pass.

**Step 3: Lint autofix**

Run: `pnpm lint --fix`

Expected: completes.

**Step 4: TypeScript**

Run: `pnpm ts-check`

Expected: no errors.

**Step 5: Final lint**

Run: `pnpm lint`

Expected: no errors.

**Step 6: Inspect diff**

Run: `git status --short`

Run: `git diff --stat`

Expected: only intended files changed. No changelog edits.

**Step 7: Final commit**

```bash
git add <intended files>
git commit -m "feat(agent): track backend resource usage"
```

---

## Follow-Ups

- Codex: expose `proc.pid` from `electron/services/agent-backends/codex/codex-app-server.ts` and return `rootPid` in `CodexBackend.start()`.
- Claude: investigate SDK internals or use process discovery by start-time and command matching.
- Windows: implement sampling with PowerShell/CIM if needed.
- UI: add tooltip sparkline after live numbers are validated.
