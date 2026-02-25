# Mark Stuck Tasks Interrupted on Restart — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the app restarts, tasks stuck in `running`/`waiting` state should be marked `interrupted` AND receive a synthetic "Task interrupted" message so the conversation timeline shows the interruption.

**Architecture:** Extend `recoverStaleTasks()` in `agent-service.ts` to persist a synthetic `result` entry for each recovered task, using `AgentMessageRepository.getMessageCount()` to determine the correct `messageIndex`. No new types, migrations, or dependencies needed.

**Tech Stack:** TypeScript, Kysely (existing), nanoid (existing)

---

### Task 1: Add synthetic interrupted message to `recoverStaleTasks()`

**Files:**
- Modify: `electron/services/agent-service.ts:989-1003`

**Step 1: Update `recoverStaleTasks()` to persist a synthetic entry per recovered task**

Replace the current loop body (line 995-997):

```typescript
for (const task of staleTasks) {
  await TaskRepository.update(task.id, { status: 'interrupted' });
  // Note: No need to emit status here since no UI is connected yet at startup
}
```

With:

```typescript
for (const task of staleTasks) {
  // Get next messageIndex for this task's message stream
  const messageCount = await AgentMessageRepository.getMessageCount(task.id);

  // Persist synthetic interrupted entry so the timeline shows the interruption
  await AgentMessageRepository.create({
    taskId: task.id,
    messageIndex: messageCount,
    entry: {
      id: nanoid(),
      date: new Date().toISOString(),
      isSynthetic: true,
      type: 'result',
      value: 'Task interrupted',
      isError: true,
    },
    rawMessageId: null,
  });

  await TaskRepository.update(task.id, { status: 'interrupted' });
}
```

**Step 2: Run lint and type-check**

Run: `pnpm lint --fix && pnpm ts-check`
Expected: PASS with no errors

**Step 3: Commit**

```bash
git add electron/services/agent-service.ts
git commit -m "feat: add synthetic interrupted message when recovering stuck tasks on restart"
```
