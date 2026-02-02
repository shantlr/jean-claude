# Cleanup Non-Existent Claude Projects - Implementation Plan

## Overview

Add a feature to the General Settings page that scans `~/.claude.json` and `~/.claude/projects/` for project entries whose paths no longer exist on disk, and allows users to remove them.

## Implementation Steps

### Step 1: Add IPC Handlers

**File:** `electron/ipc/handlers.ts`

Add two new handlers:
- `claudeProjects:findNonExistent` - Scans for projects with non-existent paths
- `claudeProjects:cleanup` - Removes selected projects with content hash verification

### Step 2: Update API Types

**File:** `src/lib/api.ts`

Add types and API interface for claude projects cleanup.

### Step 3: Update Preload Bridge

**File:** `electron/preload.ts`

Expose the new IPC methods to the renderer.

### Step 4: Add React Hook

**File:** `src/hooks/use-claude-projects-cleanup.ts`

Create mutations for scanning and cleanup operations.

### Step 5: Update General Settings Page

**File:** `src/routes/settings/general.tsx`

Add the cleanup UI section with scan button, checkbox list, and remove button.

## Technical Details

### Path Encoding/Decoding

`~/.claude/projects/` folder names encode paths:
- `/` → `-`
- Leading `-` added
- Example: `/Users/plin/.idling` → `-Users-plin--idling`

### Safety Mechanism

Use content hash of `~/.claude.json` to detect concurrent modifications:
1. On scan: compute hash, return with results
2. On cleanup: re-read file, verify hash matches
3. If mismatch: abort and return error asking user to retry

### Sources

Projects can exist in:
- `~/.claude.json` (projects object)
- `~/.claude/projects/` (folders)
- Both

Cleanup removes from both sources.
