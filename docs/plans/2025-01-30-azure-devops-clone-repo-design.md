# Azure DevOps Repository Cloning with Auto Project Creation

## Overview

Add the ability to clone Azure DevOps repositories and automatically create Jean-Claude projects with all metadata pre-populated.

## User Flows

### Two Entry Points

1. **From Settings → Azure DevOps:** User browses org details pane, clicks "Clone" on a repo
2. **From Add Project page:** User clicks "Clone from Azure DevOps" → slide-out pane with repo browser

### Unified Add Project Form

The existing Add Project page is refactored into a single unified form that works for both local folders AND cloned repos:

1. **Source selection** (existing step):
   - "Local Folder" → folder picker (existing)
   - "Clone from Azure DevOps" → slide-out pane → selects repo → triggers clone → then continues to form

2. **Unified project form** (enhanced):
   - Name (editable, inferred from folder/repo)
   - Path (read-only, shows selected/cloned path)
   - Color picker (pre-selected random)
   - **Optional: Repository settings** (collapsible section)
     - Provider, Project, Repo dropdowns (auto-filled if cloned, manual selection for local)
   - **Optional: Work Item settings** (collapsible section)
     - Provider, Project dropdowns for work item queries

**For cloned repos:** The repo section is pre-filled and expanded
**For local folders:** The repo/work item sections are collapsed but available

## UI Design

### Add Project Page

```
┌─────────────────────────────────────────────────────────────────────┐
│  Add Project                                                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────┐  ┌─────────────────────┐                  │
│  │      📁             │  │      Azure DevOps   │                  │
│  │   Local Folder      │  │   Clone Repository  │                  │
│  └─────────────────────┘  └─────────────────────┘                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

                              ↓ (after source selected)

┌─────────────────────────────────────────────────────────────────────┐
│  ← Back                                                             │
│  Add Project                                                        │
├─────────────────────────────────────────────────────────────────────┤
│  Name         [repo-name_________________]                          │
│  Path         /Users/me/projects/repo-name (read-only)              │
│  Color        [● ● ● ● ● ● ● ●]                                    │
│                                                                     │
│  ▼ Repository (optional)  ─────────────────────────────────────    │
│  │  Provider   [Contoso Org________▼]                              │
│  │  Project    [Backend Team_______▼]                              │
│  │  Repository [api-service________▼]                              │
│                                                                     │
│  ▶ Work Items (optional)  ─────────────────────────────────────    │
│                                                                     │
│  [        Add Project        ]                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Clone Slide-Out Pane

- Reuses the existing org/project/repo hierarchy from `OrganizationDetailsPane`
- Adds "Clone" button next to each repo
- When clicked → shows clone config (folder picker, folder name) inline
- Runs git clone, then populates form with cloned path + Azure metadata

## Clone Process

1. **Clone config UI appears** (inline in the pane):
   - Folder picker button → opens native directory dialog
   - Folder name input (defaults to repo name)
   - "Clone" button

2. **Clone execution:**
   - Show loading spinner with "Cloning repository..."
   - Run `git clone git@ssh.dev.azure.com:v3/{org}/{project}/{repo} {targetPath}`
   - On success: close pane, populate form with data, show form
   - On error: show error message inline (e.g., "SSH key not configured")

3. **Form pre-population (after successful clone):**
   - `name`: repo name
   - `path`: full cloned path
   - `color`: random
   - Repository section: expanded, all fields pre-filled
   - Work Items section: collapsed, provider/project pre-filled (same as repo)

## Backend Changes

### New IPC Method

```typescript
// api.ts - add to azureDevOps namespace
cloneRepository: (params: {
  providerId: string;
  orgName: string;
  projectName: string;
  repoName: string;
  targetPath: string;
}) => Promise<{ success: boolean; error?: string }>;
```

### New Service Function

```typescript
// azure-devops-service.ts
export async function cloneRepository(params: {
  orgName: string;
  projectName: string;
  repoName: string;
  targetPath: string;
}): Promise<{ success: boolean; error?: string }> {
  // Build SSH URL: git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
  // Execute: git clone <url> <targetPath>
  // Return result
}
```

### No Database Changes

We already have all the fields on `Project`:
- `repoProviderId`, `repoProjectId`, `repoProjectName`, `repoId`, `repoName`
- `workItemProviderId`, `workItemProjectId`, `workItemProjectName`

## File Changes

### Files to Modify

1. **`src/routes/projects.new.tsx`** - Refactor to unified form with:
   - Source selection (local folder / Azure clone)
   - Unified project form with collapsible repo/work item sections
   - State management for clone flow

2. **`src/features/settings/ui-azure-devops-tab/organization-details-pane.tsx`** - Add "Clone" button to each repo row

3. **`electron/services/azure-devops-service.ts`** - Add `cloneRepository()` function

4. **`electron/ipc/handlers.ts`** - Add IPC handler for clone

5. **`electron/preload.ts`** - Expose clone method

6. **`src/lib/api.ts`** - Add clone method to API types

### New Files

7. **`src/features/project/ui-clone-repo-pane/index.tsx`** - Slide-out pane for repo browser + clone config (reused from both entry points)

8. **`src/features/project/ui-add-project-form/index.tsx`** - Extract the unified form component for reuse

## Post-Clone Navigation

After successful clone and project creation, navigate to `/projects/$projectId` so users can start working immediately.
