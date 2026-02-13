# Update Work Item Owner on Task Activation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When activating a work item (setting state to Active) during task creation, also assign the current user if the work item is currently unassigned.

**Architecture:** Add a `getWorkItem` helper and an `activateWorkItem` function to `azure-devops-service.ts` that fetches the work item, checks if `System.AssignedTo` is empty, and sends a single PATCH with state + optional assignee. Replace `updateWorkItemState` calls in handlers with `activateWorkItem`.

**Tech Stack:** Azure DevOps REST API v7.0, TypeScript, Electron IPC

---

### Task 1: Add `getWorkItem` helper to azure-devops-service

**Files:**
- Modify: `electron/services/azure-devops-service.ts` (after `updateWorkItemState`, ~line 1301)

**Step 1: Add the `getWorkItem` function**

Add after the existing `updateWorkItemState` function (line 1301):

```typescript
export async function getWorkItem(params: {
  providerId: string;
  workItemId: number;
}): Promise<{ assignedTo?: string }> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  const url = `https://dev.azure.com/${orgName}/_apis/wit/workitems/${params.workItemId}?fields=System.AssignedTo&api-version=7.0`;

  const response = await fetch(url, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch work item ${params.workItemId}: ${error}`);
  }

  const data: {
    fields: { 'System.AssignedTo'?: { displayName: string; uniqueName: string } };
  } = await response.json();

  return {
    assignedTo: data.fields['System.AssignedTo']?.uniqueName,
  };
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

---

### Task 2: Add `activateWorkItem` function to azure-devops-service

**Files:**
- Modify: `electron/services/azure-devops-service.ts` (after `getWorkItem`)

**Step 1: Add the `activateWorkItem` function**

Add immediately after `getWorkItem`:

```typescript
export async function activateWorkItem(params: {
  providerId: string;
  workItemId: number;
}): Promise<void> {
  const { authHeader, orgName } = await getProviderAuth(params.providerId);

  // Check if work item is currently unassigned
  const workItem = await getWorkItem(params);

  // Build patch operations
  const patchOps: Array<{ op: string; path: string; value: string }> = [
    {
      op: 'add',
      path: '/fields/System.State',
      value: 'Active',
    },
  ];

  // Only assign if currently unassigned
  if (!workItem.assignedTo) {
    const currentUser = await getCurrentUser(params.providerId);
    patchOps.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: currentUser.emailAddress,
    });
  }

  const url = `https://dev.azure.com/${orgName}/_apis/wit/workitems/${params.workItemId}?api-version=7.0`;

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json-patch+json',
    },
    body: JSON.stringify(patchOps),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to activate work item ${params.workItemId}: ${error}`);
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No new errors

---

### Task 3: Replace `updateWorkItemState` with `activateWorkItem` in handlers

**Files:**
- Modify: `electron/ipc/handlers.ts` (~lines 190-218 and 294-318)

**Step 1: Update import**

In `electron/ipc/handlers.ts`, change the import from `azure-devops-service` (line 77):

Replace:
```typescript
  updateWorkItemState,
```
With:
```typescript
  activateWorkItem,
```

**Step 2: Update `tasks:create` handler (lines 190-218)**

Replace the work item update block:
```typescript
      // Update associated work items to "Active" state (fire and forget, ignore failures)
      if (task?.workItemIds && task.workItemIds.length > 0) {
        const project = await ProjectRepository.findById(data.projectId);
        if (project?.workItemProviderId) {
          dbg.ipc(
            'Updating %d work items to Active state',
            task.workItemIds.length,
          );
          for (const workItemId of task.workItemIds) {
            updateWorkItemState({
              providerId: project.workItemProviderId,
              workItemId: parseInt(workItemId, 10),
              state: 'Active',
            }).catch((err) => {
              dbg.ipc(
                'Failed to update work item %s to Active: %O',
                workItemId,
                err,
              );
            });
          }
        }
      }
```

With:
```typescript
      // Activate associated work items and assign to current user if unassigned (fire and forget)
      if (task?.workItemIds && task.workItemIds.length > 0) {
        const project = await ProjectRepository.findById(data.projectId);
        if (project?.workItemProviderId) {
          dbg.ipc(
            'Activating %d work items',
            task.workItemIds.length,
          );
          for (const workItemId of task.workItemIds) {
            activateWorkItem({
              providerId: project.workItemProviderId,
              workItemId: parseInt(workItemId, 10),
            }).catch((err) => {
              dbg.ipc(
                'Failed to activate work item %s: %O',
                workItemId,
                err,
              );
            });
          }
        }
      }
```

**Step 3: Update `tasks:createWithWorktree` handler (lines 294-318)**

Replace the identical work item update block with the same pattern as Step 2. Replace:
```typescript
      // Update associated work items to "Active" state (fire and forget, ignore failures)
      if (task?.workItemIds && task.workItemIds.length > 0) {
        const projectForWorkItems = await ProjectRepository.findById(
          taskData.projectId,
        );
        if (projectForWorkItems?.workItemProviderId) {
          dbg.ipc(
            'Updating %d work items to Active state',
            task.workItemIds.length,
          );
          for (const workItemId of task.workItemIds) {
            updateWorkItemState({
              providerId: projectForWorkItems.workItemProviderId,
              workItemId: parseInt(workItemId, 10),
              state: 'Active',
            }).catch((err) => {
              dbg.ipc(
                'Failed to update work item %s to Active: %O',
                workItemId,
                err,
              );
            });
          }
        }
      }
```

With:
```typescript
      // Activate associated work items and assign to current user if unassigned (fire and forget)
      if (task?.workItemIds && task.workItemIds.length > 0) {
        const projectForWorkItems = await ProjectRepository.findById(
          taskData.projectId,
        );
        if (projectForWorkItems?.workItemProviderId) {
          dbg.ipc(
            'Activating %d work items',
            task.workItemIds.length,
          );
          for (const workItemId of task.workItemIds) {
            activateWorkItem({
              providerId: projectForWorkItems.workItemProviderId,
              workItemId: parseInt(workItemId, 10),
            }).catch((err) => {
              dbg.ipc(
                'Failed to activate work item %s: %O',
                workItemId,
                err,
              );
            });
          }
        }
      }
```

**Step 4: Check if `updateWorkItemState` is used anywhere else**

Run: `grep -r "updateWorkItemState" electron/ src/`
Expected: No remaining references (it's safe to leave the function in azure-devops-service.ts — it's generic and may be useful later).

**Step 5: Verify TypeScript compiles**

Run: `pnpm ts-check`
Expected: No errors

**Step 6: Run lint**

Run: `pnpm lint --fix`
Expected: No errors
